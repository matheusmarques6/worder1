'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase-client';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID;
const DEV_FAKE = process.env.NEXT_PUBLIC_DEV_FAKE_FB === '1';
const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

type SignupPayload = {
  phone_number_id: string;
  waba_id: string;
  business_id?: string;
};

export interface UseFacebookEmbeddedSignupResult {
  sdkReady: boolean;
  running: boolean;
  error: string | null;
  success: string | null;
  configured: boolean;
  start: () => void;
  reset: () => void;
}

interface UseFacebookEmbeddedSignupOpts {
  onSuccess?: (account: any) => void;
  storeId?: string | null;
}

/**
 * Encapsulates the WhatsApp Embedded Signup (v3 sessionInfo) flow:
 *  - Loads the FB SDK once per tab (idempotent — checks window.FB before injecting).
 *  - Calls FB.login with the configured `config_id` and `response_type: 'code'`.
 *  - Listens to window.postMessage for the WA_EMBEDDED_SIGNUP FINISH event.
 *  - On both code + signup data captured, POSTs to /api/whatsapp/cloud/embedded-signup.
 */
export function useFacebookEmbeddedSignup(
  opts: UseFacebookEmbeddedSignupOpts = {},
): UseFacebookEmbeddedSignupResult {
  const { onSuccess, storeId } = opts;
  const [sdkReady, setSdkReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const configured = !!(META_APP_ID && META_CONFIG_ID) || DEV_FAKE;

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
    if (typeof window === 'undefined') return;
    if (DEV_FAKE) {
      setSdkReady(true);
      return;
    }
    if (!META_APP_ID) return;
    if (window.FB) {
      initFB();
      return;
    }
    window.fbAsyncInit = initFB;
    if (!document.querySelector(`script[src="${FB_SDK_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    }
  }, [initFB]);

  const postToBackend = useCallback(
    async (code: string, signupData: SignupPayload) => {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const token = session?.access_token || '';
      const res = await fetch('/api/whatsapp/cloud/embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, store_id: storeId || undefined, ...signupData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao conectar com a Meta');
      return data;
    },
    [storeId],
  );

  const start = useCallback(() => {
    if (!configured) {
      setError(
        'Embedded Signup não configurado. Defina NEXT_PUBLIC_META_APP_ID e NEXT_PUBLIC_META_WA_EMBEDDED_SIGNUP_CONFIG_ID.',
      );
      return;
    }
    if (typeof window !== 'undefined' && window.top !== window.self) {
      setError('Embedded Signup precisa rodar em janela própria. Abra o Worder fora de iframe.');
      return;
    }
    setRunning(true);
    setError(null);
    setSuccess(null);

    if (DEV_FAKE) {
      const fakeData: SignupPayload = {
        phone_number_id: 'dev-phone-id',
        waba_id: 'dev-waba-id',
        business_id: 'dev-business-id',
      };
      postToBackend('dev-code', fakeData)
        .then((data) => {
          setSuccess(`Conectado: ${data.account?.verifiedName || data.account?.phoneNumber || 'dev'}`);
          setRunning(false);
          onSuccessRef.current?.(data.account);
        })
        .catch((err) => {
          setError(err?.message || 'Erro no fluxo dev');
          setRunning(false);
        });
      return;
    }

    if (!window.FB) {
      setError('SDK do Facebook ainda não carregou. Tente novamente em alguns segundos.');
      setRunning(false);
      return;
    }

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
        // ignore non-JSON cross-origin messages
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
            'Dados da WABA não recebidos. Verifique se concluiu todos os passos no popup do Facebook.',
          );
          return;
        }
        try {
          const data = await postToBackend(code, signupData);
          setSuccess(`Conectado: ${data.account?.verifiedName || data.account?.phoneNumber || ''}`);
          setRunning(false);
          onSuccessRef.current?.(data.account);
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
      },
    );
  }, [configured, postToBackend]);

  const reset = useCallback(() => {
    setRunning(false);
    setError(null);
    setSuccess(null);
  }, []);

  return { sdkReady, running, error, success, configured, start, reset };
}

export default useFacebookEmbeddedSignup;
