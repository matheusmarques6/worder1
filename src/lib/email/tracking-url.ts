// =============================================
// Base URL dos links de tracking (/api/t/c, /api/t/o, unsubscribe).
//
// Por padrão é o domínio do app (app.worder.com.br). Quando a org (ou a
// loja) configura um tracking_domain próprio — ex.: click.worder.email
// ou t.dominio-do-cliente.com — os links do email passam a usar esse
// host, alinhando o domínio dos links com o domínio remetente
// (deliverability) sem depender do tracking do provedor: o subdomínio
// aponta (CNAME) para o próprio app na Vercel, então as MESMAS rotas
// /api/t/* atendem em qualquer host e a troca de provedor de envio não
// muda nada no tracking.
//
// Resolução: shopify_stores.settings.email_settings.tracking_domain →
// organizations.email_settings.tracking_domain → getAppBaseUrl().
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAppBaseUrl } from '@/lib/app-url';

const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

function normalizeTrackingDomain(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v)) return null;
  return `https://${v}`;
}

export async function getTrackingBaseUrl(
  organizationId: string,
  storeId?: string | null
): Promise<string> {
  const key = `${organizationId}::${storeId || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.url;

  let url: string | null = null;
  try {
    if (storeId) {
      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('settings')
        .eq('id', storeId)
        .maybeSingle();
      url = normalizeTrackingDomain((store?.settings as any)?.email_settings?.tracking_domain);
    }
    if (!url) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('email_settings')
        .eq('id', organizationId)
        .maybeSingle();
      url = normalizeTrackingDomain((org?.email_settings as any)?.tracking_domain);
    }
  } catch {
    // Configuração é opcional — qualquer falha cai no domínio do app.
  }

  const finalUrl = url || getAppBaseUrl();
  cache.set(key, { url: finalUrl, ts: Date.now() });
  return finalUrl;
}
