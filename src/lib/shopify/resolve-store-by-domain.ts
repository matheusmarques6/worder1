// =============================================
// resolveStoreByDomain
// src/lib/shopify/resolve-store-by-domain.ts
//
// Single source of truth for resolving a shopify_stores row from any
// domain the merchant might be reachable at:
//   - shop_domain (primary, what we record on connection)
//   - shop_domain_aliases[] (canonical myshopifyDomain, secondary
//     myshopify subdomains, custom storefront domains added later)
//
// Required because Shopify webhooks always carry the original/canonical
// myshopifyDomain in X-Shopify-Shop-Domain regardless of admin renames.
// And storefront pixels send the public-facing domain which may also
// differ from what we recorded.
//
// Use this from EVERY place that needs to look up a store by an
// inbound domain. Direct .eq('shop_domain', ...) calls will miss
// aliased entries and silently drop events.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ResolveStoreOptions {
  /** Optional: scope to a single organization (defense in depth on
   *  endpoints that already authed the user). */
  organizationId?: string;
  /** Default: only return rows where is_active = true. Pass false to
   *  also match stores currently disconnected. */
  activeOnly?: boolean;
  /** Columns to select. Defaults to '*' for handlers that need the
   *  full row. Pass a comma list to narrow. */
  select?: string;
}

/**
 * Resolve a shopify_stores row from any domain — primary or alias.
 *
 * Normalizes the input domain (strips https://, trailing slash,
 * leading www.) before matching. Returns null when no row matches
 * (caller decides 404 vs 410 vs other).
 */
export async function resolveStoreByDomain<T = any>(
  supabase: SupabaseClient,
  rawDomain: string | null | undefined,
  opts: ResolveStoreOptions = {}
): Promise<T | null> {
  const domain = normalizeDomain(rawDomain);
  if (!domain) return null;

  const select = opts.select || '*';
  const activeOnly = opts.activeOnly !== false;

  let query = supabase
    .from('shopify_stores')
    .select(select)
    // shop_domain.eq covers the API host; primary_domain.eq covers the
    // public storefront domain the pixel/popup actually runs on
    // (drgroot.com); cs (contains) on the array covers any alias.
    // PostgREST .or() with array contains uses {x} syntax — must be
    // wrapped in braces for a single-value match.
    .or(`shop_domain.eq.${domain},primary_domain.eq.${domain},shop_domain_aliases.cs.{${domain}}`);

  if (activeOnly) query = query.eq('is_active', true);
  if (opts.organizationId) query = query.eq('organization_id', opts.organizationId);

  const { data } = await query.limit(1).maybeSingle();
  return (data as T) || null;
}

// =============================================================
// Loja de um evento público (pixel, identify, tracking)
//
// O tracking.js manda accountId (organização), storeId (muitas vezes
// nulo) e storeDomain juntos. Os quatro endpoints resolviam na ordem
// storeId → accountId → storeDomain, e o ramo accountId era
// "qualquer loja da organização, limit 1" — então TODO evento de uma
// loja sem storeId no script era carimbado com a loja errada, antes
// mesmo de olhar o domínio que veio no payload. Numa organização com
// duas lojas, metade dos eventos ia para a loja irmã: contatos,
// eventos, gatilhos de automação.
//
// Ordem certa: storeId → storeDomain → accountId, e o accountId só
// resolve quando a organização tem UMA loja ativa. Nunca "a primeira".
// =============================================================

export interface TrackingStoreKeys {
  storeId?: string | null;
  storeDomain?: string | null;
  accountId?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveTrackingStore<T = { id: string; organization_id: string }>(
  supabase: SupabaseClient,
  keys: TrackingStoreKeys,
  select: string = 'id, organization_id'
): Promise<T | null> {
  // 1. O id da loja é a chave mais forte.
  if (keys.storeId && UUID_RE.test(keys.storeId)) {
    const { data } = await supabase
      .from('shopify_stores')
      .select(select)
      .eq('id', keys.storeId)
      .maybeSingle();
    if (data) return data as T;
  }

  // 2. O domínio em que o script está rodando (alias-aware, também
  // lojas desconectadas — o evento ainda tem dono).
  if (keys.storeDomain) {
    const byDomain = await resolveStoreByDomain<T>(supabase, keys.storeDomain, { select, activeOnly: false });
    if (byDomain) return byDomain;
  }

  // 3. A organização — só quando não há ambiguidade.
  if (keys.accountId && UUID_RE.test(keys.accountId)) {
    const cols = select === '*' ? '*' : Array.from(new Set(
      select.split(',').map((c) => c.trim()).filter(Boolean).concat(['shop_domain'])
    )).join(', ');
    const { data } = await supabase
      .from('shopify_stores')
      .select(cols)
      .eq('organization_id', keys.accountId)
      .eq('is_active', true);
    const reais = ((data || []) as any[]).filter((s) => !String(s.shop_domain || '').endsWith('.worder.local'));
    if (reais.length === 1) return reais[0] as T;
    if (reais.length > 1) {
      console.warn(`[resolveTrackingStore] organização ${keys.accountId} tem ${reais.length} lojas e o evento não diz qual — descartado`);
    }
  }

  return null;
}

/**
 * Normalize a domain string for store lookups: lowercase, strip
 * protocol, strip path, strip leading www., strip trailing slash.
 *
 * Examples:
 *   "https://sourosa.myshopify.com/"      → "sourosa.myshopify.com"
 *   "https://www.the-basedbodyworks.store" → "the-basedbodyworks.store"
 *   "  LOJALACLODE.MYSHOPIFY.COM  "        → "lojalaclode.myshopify.com"
 */
export function normalizeDomain(input: string | null | undefined): string {
  if (!input) return '';
  let d = String(input).trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/\/.*$/, '');
  d = d.replace(/^www\./, '');
  return d;
}
