// =============================================
// GET /api/integrations/shopify/mergeable-stores?targetStoreId=X
//
// Returns the OTHER active+archived stores in the caller's
// organization that could plausibly be merged into the given target.
// Ordered with the most likely duplicate first (same shopify_shop_id
// → exact duplicate; same shop_name → likely renamed; everything else
// last).
//
// Used by the "Mesclar com loja existente" UI to populate the picker.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const targetStoreId = request.nextUrl.searchParams.get('targetStoreId');
  if (!targetStoreId) {
    return NextResponse.json({ error: 'targetStoreId required' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: target } = await admin
    .from('shopify_stores')
    .select('id, shop_name, shopify_shop_id')
    .eq('id', targetStoreId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Target store not found' }, { status: 404 });

  // Pull every other shopify_stores in this org, including archived
  // ones (so the merchant can merge from a previously-archived row).
  const { data: candidates } = await admin
    .from('shopify_stores')
    .select('id, shop_name, shop_domain, shop_domain_aliases, shopify_shop_id, is_active, installed_at, status')
    .eq('organization_id', orgId)
    .neq('id', targetStoreId)
    .order('installed_at', { ascending: false });

  // Score each candidate by how likely it is to be a duplicate:
  //   - same shopify_shop_id → 100 (exact duplicate)
  //   - same shop_name → 50
  //   - else → 0 (still listed so merchants with naming chaos can pick)
  const scored = (candidates || []).map((c) => {
    let score = 0;
    let reason = 'manual';
    if (target.shopify_shop_id && c.shopify_shop_id && target.shopify_shop_id === c.shopify_shop_id) {
      score = 100;
      reason = 'same_shop_id';
    } else if (target.shop_name && c.shop_name && target.shop_name === c.shop_name) {
      score = 50;
      reason = 'same_shop_name';
    }
    return {
      id: c.id,
      shop_name: c.shop_name,
      shop_domain: c.shop_domain,
      shop_domain_aliases: c.shop_domain_aliases || [],
      shopify_shop_id: c.shopify_shop_id,
      is_active: c.is_active,
      installed_at: c.installed_at,
      status: c.status,
      score,
      reason,
    };
  });

  scored.sort((a, b) => b.score - a.score || (a.shop_name || '').localeCompare(b.shop_name || ''));

  return NextResponse.json({
    target: { id: target.id, shop_name: target.shop_name, shopify_shop_id: target.shopify_shop_id },
    candidates: scored,
  });
}
