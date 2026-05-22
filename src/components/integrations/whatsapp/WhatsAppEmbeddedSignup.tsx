'use client';

/**
 * WhatsApp Embedded Signup (Tech Provider flow, v3 sessionInfo).
 *
 * Renders a Facebook Login button that:
 *   1. Loads connect.facebook.net SDK lazily.
 *   2. Opens FB.login with config_id from NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID.
 *   3. Listens to window.postMessage for the WA_EMBEDDED_SIGNUP event with
 *      { phone_number_id, waba_id, business_id }.
 *   4. On both `code` + WA_EMBEDDED_SIGNUP captured, POSTs to
 *      /api/whatsapp/cloud/embedded-signup which does the heavy lifting.
 *
 * Coexists with the manual form (WhatsAppCloudConnect.tsx). The parent
 * decides which to render based on isFeatureEnabled(orgId, 'whatsapp_embedded_signup').
 *
 * Plan: Sprint 1 / Fase 3.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores';
import { getSupabaseClient } from '@/lib/supabase-client';
import Script from 'next/script';
import { Loader2, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID;

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

type SignupPayload = {
  phone_number_id: string;
  waba_id: string;
  business_id?: string;
};

interface Props {
  onSuccess?: (account: any) => void;
}

export default function WhatsAppEmbeddedSignup({ onSuccess }: Props) {
  const { user } = useAuthStore();
  const [sdkReady, setSdkReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const initFB = useCallback(() => {
    if (typeof window === 'undefined' || !window.FB || !META_APP_ID) return;
    window.FB.init({
      appId: META_APP_ID,
      autoLogAppEvents: true,
      xfbml: false,
      version: 'v22.0',
    });
    setSdkReady(true);
  }, []);

  useEffect(() => {
    window.fbAsyncInit = initFB;
    // If the script already loaded (HMR / repeat mount), wire up directly.
    if (window.FB) initFB();
  }, [initFB]);

  const handleConnect = useCallback(() => {
    if (!META_APP_ID || !META_CONFIG_ID) {
      setError(
        'Configuração ausente: NEXT_PUBLIC_META_APP_ID e NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID precisam estar definidos.'
      );
      return;
    }
    if (!window.FB) {
      setError('SDK do Facebook ainda não carregou. Tente novamente em alguns segundos.');
      return;
    }
    if (window.top !== window.self) {
      setError(
        'Embedded Signup precisa rodar em janela própria. Abra o Worder fora de iframe para conectar via Facebook.'
      );
      return;
    }

    setRunning(true);
    setError(null);
    setSuccess(null);

    let signupData: SignupPayload | null = null;

    const messageHandler = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.type === 'WA_EMBEDDED_SIGNUP' && parsed?.event === 'FINISH') {
          signupData = {
            phone_number_id: parsed.data?.phone_number_id,
            waba_id: parsed.data?.waba_id,
            business_id: parsed.data?.business_id,
          };
        }
      } catch {
        // ignore non-JSON messages from other origins
      }
    };

    window.addEventListener('message', messageHandler);

    window.FB.login(
      async (response: any) => {
        window.removeEventListener('message', messageHandler);

        if (!response?.authResponse) {
          setRunning(false);
          setError('Login cancelado.');
          return;
        }

        const code = response.authResponse.code;
        if (!code) {
          setRunning(false);
          setError('Código de autorização não recebido. Tente novamente.');
          return;
        }
        if (!signupData?.phone_number_id || !signupData?.waba_id) {
          setRunning(false);
          setError(
            'Dados da WABA não recebidos. Verifique se você concluiu todos os passos no popup do Facebook.'
          );
          return;
        }

        try {
          const { data: { session } } = await getSupabaseClient().auth.getSession();
          const token = session?.access_token || '';
          const res = await fetch('/api/whatsapp/cloud/embedded-signup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ code, ...signupData }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Falha ao conectar com a Meta');
            setRunning(false);
            return;
          }
          setSuccess(`Conectado: ${data.account?.verifiedName || data.account?.phoneNumber}`);
          setRunning(false);
          onSuccess?.(data.account);
        } catch (err: any) {
          setError(err?.message || 'Erro inesperado');
          setRunning(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      }
    );
  }, [onSuccess]);

  if (!user) return null;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-zinc-900/60 p-6">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="lazyOnload"
        onLoad={() => initFB()}
      />

      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-emerald-500/10 p-3">
          <MessageCircle className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">Conectar WhatsApp Business</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Use o Embedded Signup do Meta — você se autentica no Facebook,
            seleciona ou cria sua WhatsApp Business Account e o Worder
            cuida do resto. Sem precisar colar tokens.
          </p>

          <button
            type="button"
            disabled={running || !sdkReady}
            onClick={handleConnect}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando Facebook…
              </>
            ) : (
              <>Continuar com Facebook</>
            )}
          </button>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
