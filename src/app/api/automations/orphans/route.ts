// =============================================
// GET /api/automations/orphans?currentStoreId=X
//
// Lists automations that belong to this organization but are NOT in
// the current store — either assigned to a different store_id or
// with store_id = null (legacy automations created before strict
// store filtering was added).
//
// Used by the dashboard to surface "lost" flows so the merchant can
// re-attribute them to the active store via /move-to-store.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const currentStoreId = searchParams.get('currentStoreId') || searchParams.get('storeId');

  const admin = getSupabaseAdmin();

  // Pull every automation in this org. We do the filtering in JS rather
  // than .neq() on store_id because Postgres .neq() treats NULL specially
  // (NULL != X is NULL, not true), and we want to include both
  // store_id != currentStoreId AND store_id IS NULL in the orphan list.
  const { data: automations, error } = await admin
    .from('automations')
    .select('id, name, description, status, store_id, trigger_type, created_at, updated_at')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message, orphans: [] }, { status: 500 });
  }

  const orphans = (automations || []).filter(a =>
    !currentStoreId || a.store_id !== currentStoreId
  );

  // Resolve the store name for each orphan that has a store_id, in one
  // batch query. Orphans with store_id=null are labeled "sem loja".
  const storeIds = Array.from(new Set(orphans.map(o => o.store_id).filter(Boolean) as string[]));
  let storeMap: Record<string, { name: string; is_active: boolean }> = {};
  if (storeIds.length > 0) {
    const { data: stores } = await admin
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, is_active')
      .eq('organization_id', organizationId)
      .in('id', storeIds);
    storeMap = Object.fromEntries(
      (stores || []).map(s => [s.id, { name: s.shop_name || s.shop_domain || 'Loja', is_active: !!s.is_active }])
    );
  }

  return NextResponse.json({
    orphans: orphans.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      trigger_type: a.trigger_type,
      store_id: a.store_id,
      store_name: a.store_id ? (storeMap[a.store_id]?.name || 'Loja desconhecida') : null,
      store_active: a.store_id ? (storeMap[a.store_id]?.is_active ?? false) : null,
      updated_at: a.updated_at,
      created_at: a.created_at,
    })),
    total: orphans.length,
  });
}
