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
    // shop_domain.eq covers the primary; cs (contains) on the array
    // covers any alias. PostgREST .or() with array contains uses {x}
    // syntax — must be wrapped in braces for a single-value match.
    .or(`shop_domain.eq.${domain},shop_domain_aliases.cs.{${domain}}`);

  if (activeOnly) query = query.eq('is_active', true);
  if (opts.organizationId) query = query.eq('organization_id', opts.organizationId);

  const { data } = await query.limit(1).maybeSingle();
  return (data as T) || null;
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
