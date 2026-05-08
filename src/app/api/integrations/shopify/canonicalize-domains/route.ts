// =============================================
// POST /api/integrations/shopify/canonicalize-domains
//
// One-shot maintenance for existing shopify_stores rows where the
// primary shop_domain ISN'T the canonical Shopify myshopifyDomain.
//
// Background: Shopify always sends webhooks with the canonical
// myshopifyDomain in X-Shopify-Shop-Domain (the permanent internal
// identifier assigned at shop creation). When the merchant later
// renames their admin slug — e.g. from `lojalaclode.myshopify.com`
// to `sourosa.myshopify.com` — the canonical NEVER changes. If the
// merchant connected Worder using the renamed slug, our webhook
// resolution falls back to alias scan instead of O(1) primary match.
//
// This endpoint walks every active store, queries shop GraphQL to
// find the true myshopifyDomain, and swaps shop_domain ↔ aliases
// when they differ. Idempotent (no-op when already canonical).
//
// Body: { storeId?: string }   // omit to scan all active stores
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeIdFilter = body?.storeId;

  const admin = getSupabaseAdmin();

  // Multi-org users see all orgs they belong to.
  const { data: memberships } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', auth.user.id);
  const orgIds = [...new Set([
    orgId,
    ...(memberships?.map((m: any) => m.organization_id) || []),
  ])];

  let q = admin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, shop_domain_aliases, access_token, api_version')
    .in('organization_id', orgIds)
    .eq('is_active', true)
    .not('access_token', 'is', null);
  if (storeIdFilter) q = q.eq('id', storeIdFilter);

  const { data: stores } = await q;
  if (!stores || stores.length === 0) {
    return NextResponse.json({ success: true, scanned: 0, swapped: 0, results: [] });
  }

  const results: Array<{
    storeId: string
    typed_domain: string
    canonical_domain: string | null
    action: 'no-op' | 'swapped' | 'graphql_failed' | 'update_failed'
    error?: string
  }> = [];

  for (const store of stores) {
    const apiVersion = store.api_version || SHOPIFY_API_VERSION;
    const typed = String(store.shop_domain || '').toLowerCase();
    let canonical: string | null = null;

    try {
      const res = await fetch(
        `https://${store.shop_domain}/admin/api/${apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': store.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: `{ shop { myshopifyDomain } }` }),
        }
      );
      if (res.ok) {
        const json = await res.json();
        canonical = (json.data?.shop?.myshopifyDomain || '').toLowerCase() || null;
      }
    } catch { /* fall through */ }

    if (!canonical) {
      results.push({ storeId: store.id, typed_domain: typed, canonical_domain: null, action: 'graphql_failed' });
      continue;
    }

    if (canonical === typed) {
      results.push({ storeId: store.id, typed_domain: typed, canonical_domain: canonical, action: 'no-op' });
      continue;
    }

    // Swap: canonical becomes primary, typed becomes alias
    const existingAliases: string[] = Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [];
    const aliases = new Set(existingAliases.map(a => String(a).toLowerCase()));
    aliases.add(typed);
    aliases.delete(canonical);
    const aliasArr = Array.from(aliases);

    const { error } = await admin
      .from('shopify_stores')
      .update({
        shop_domain: canonical,
        shop_domain_aliases: aliasArr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', store.id);

    if (error) {
      results.push({ storeId: store.id, typed_domain: typed, canonical_domain: canonical, action: 'update_failed', error: error.message });
    } else {
      results.push({ storeId: store.id, typed_domain: typed, canonical_domain: canonical, action: 'swapped' });
    }
  }

  return NextResponse.json({
    success: true,
    scanned: stores.length,
    swapped: results.filter(r => r.action === 'swapped').length,
    noop: results.filter(r => r.action === 'no-op').length,
    failed: results.filter(r => r.action === 'graphql_failed' || r.action === 'update_failed').length,
    results,
  });
}
