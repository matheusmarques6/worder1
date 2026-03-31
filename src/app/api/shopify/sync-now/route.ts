// POST /api/shopify/sync-now — trigger sync with GraphQL
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runFullSyncGraphQL } from '@/lib/services/shopify/full-sync-graphql';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  // Multi-org lookup
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  const orgIds = [...new Set([userOrgId, ...(memberships?.map((m: any) => m.organization_id) || [])])];

  let body: any = {};
  try { body = await request.json(); } catch {}

  const syncType = body.syncType || 'all';

  // Find store
  const storeId = body.storeId;
  let storeQuery = supabase
    .from('shopify_stores')
    .select('*')
    .in('organization_id', orgIds)
    .eq('is_active', true);

  if (storeId) {
    storeQuery = storeQuery.eq('id', storeId);
  }

  const { data: store } = await storeQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!store) {
    console.error('[Sync Now] No store found for orgIds:', orgIds);
    return NextResponse.json({ error: 'Nenhuma loja encontrada' }, { status: 404 });
  }

  console.log(`[Sync Now] Found store: ${store.shop_name} (${store.shop_domain}), id: ${store.id}, has_token: ${!!store.access_token}, syncType: ${syncType}`);

  if (!store.access_token) {
    return NextResponse.json({ error: 'Token de acesso não encontrado. Reconecte a loja.' }, { status: 400 });
  }

  try {
    const result = await runFullSyncGraphQL(
      {
        id: store.id,
        organization_id: store.organization_id,
        shop_domain: store.shop_domain,
        shop_name: store.shop_name,
        access_token: store.access_token,
        api_secret: store.api_secret,
        default_pipeline_id: store.default_pipeline_id,
        default_stage_id: store.default_stage_id,
        contact_type: store.contact_type || 'auto',
        auto_tags: store.auto_tags || ['shopify'],
        sync_orders: syncType === 'all' || syncType === 'orders',
        sync_customers: syncType === 'all' || syncType === 'customers',
        sync_checkouts: true,
        sync_refunds: false,
        stage_mapping: store.stage_mapping || {},
        is_configured: true,
        is_active: true,
        connection_status: 'active',
      },
      {
        syncCustomers: syncType === 'all' || syncType === 'customers',
        syncOrders: syncType === 'all' || syncType === 'orders',
        syncProducts: syncType === 'all' || syncType === 'products',
        ordersDaysBack: body.ordersDaysBack || 30,
      }
    );

    console.log(`[Sync Now] Result: success=${result.success}, customers=${result.customersCount}, orders=${result.ordersCount}, products=${result.productsCount}, errors=${result.errors.length}`);
    if (result.errors.length > 0) {
      console.error(`[Sync Now] Errors:`, result.errors.slice(0, 10));
    }

    return NextResponse.json({
      success: result.success,
      data: {
        customersCount: result.customersCount,
        ordersCount: result.ordersCount,
        productsCount: result.productsCount,
        eventsCreated: result.eventsCreated,
        totalRevenue: result.totalRevenue,
        durationMs: result.durationMs,
      },
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error('[Sync Now] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
