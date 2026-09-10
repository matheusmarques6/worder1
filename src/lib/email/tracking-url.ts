// =============================================
// De qual host saem os links do e-mail.
//
// Cliques, aberturas, descadastro, central de preferências e o link de
// confirmação de opt-in: todos precisam sair do MESMO host, e esse host
// deve ser um domínio de rastreamento — não o domínio do painel.
//
// Por que isso importa: o host dos links é lido pelos filtros junto do
// remetente. Uma campanha que sai de `loja@dominio-da-loja.com` com todos
// os links apontando para o painel de outra empresa é exatamente o padrão
// de e-mail encaminhado por intermediário, e é assim que se ganha
// reputação ruim. Alinhar o host dos links com o remetente é o mesmo
// motivo de existir o domínio de envio próprio.
//
// A ordem de resolução, do mais específico ao mais genérico:
//
//   1. shopify_stores.settings.email_settings.tracking_domain
//        o domínio do lojista (ex.: links.sualoja.com.br)
//   2. organizations.email_settings.tracking_domain
//        o mesmo, quando vale para a organização inteira
//   3. EMAIL_TRACKING_DOMAIN
//        o padrão da plataforma (click.worder.com.br). É o que atende
//        quem ainda não configurou nada — antes disto, TODO link caía no
//        host do painel (app.worder.com.br), que é justamente o que não
//        deve aparecer no e-mail de ninguém.
//   4. getAppBaseUrl()
//        último recurso, para o link nunca sair relativo (Gmail descarta).
//
// Todos os hosts são CNAME para o próprio app, então as MESMAS rotas
// /api/t/* e /api/public/* atendem em qualquer um deles: trocar de host
// não muda uma linha de servidor.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAppBaseUrl } from '@/lib/app-url';

const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL_MS = 60_000;

export function normalizeTrackingDomain(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v)) return null;
  return `https://${v}`;
}

/** O padrão da plataforma, quando configurado no ambiente. */
export function platformTrackingBaseUrl(): string | null {
  return normalizeTrackingDomain(process.env.EMAIL_TRACKING_DOMAIN);
}

/**
 * A regra, sem banco: a primeira das quatro fontes que existir.
 * Separada para ser testável — a ordem aqui é o contrato.
 */
export function resolveTrackingBaseUrl(input: {
  storeDomain?: unknown;
  orgDomain?: unknown;
  platformDomain?: string | null;
  appBaseUrl: string;
}): { url: string; source: 'store' | 'organization' | 'platform' | 'app' } {
  const store = normalizeTrackingDomain(input.storeDomain);
  if (store) return { url: store, source: 'store' };
  const org = normalizeTrackingDomain(input.orgDomain);
  if (org) return { url: org, source: 'organization' };
  const platform = input.platformDomain || null;
  if (platform) return { url: platform, source: 'platform' };
  return { url: input.appBaseUrl, source: 'app' };
}

export async function getTrackingBaseUrl(
  organizationId: string,
  storeId?: string | null
): Promise<string> {
  const key = `${organizationId}::${storeId || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.url;

  let storeDomain: unknown = null;
  let orgDomain: unknown = null;
  try {
    if (storeId) {
      // A loja tem de ser DESTA organização: sem o filtro, um id de outra
      // organização traria a configuração dela para os links daqui.
      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('settings')
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      storeDomain = (store?.settings as any)?.email_settings?.tracking_domain ?? null;
    }
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('email_settings')
      .eq('id', organizationId)
      .maybeSingle();
    orgDomain = (org?.email_settings as any)?.tracking_domain ?? null;
  } catch {
    // Configuração é opcional — qualquer falha cai no padrão da plataforma.
  }

  const { url } = resolveTrackingBaseUrl({
    storeDomain,
    orgDomain,
    platformDomain: platformTrackingBaseUrl(),
    appBaseUrl: getAppBaseUrl(),
  });
  cache.set(key, { url, ts: Date.now() });
  return url;
}

/** Só para os testes: o cache guarda por organização e loja. */
export function __resetTrackingUrlCache(): void {
  cache.clear();
}
