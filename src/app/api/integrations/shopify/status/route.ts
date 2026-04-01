import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const userId = auth.user.id;
  const userOrgId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const requestedStoreId = searchParams.get('store_id');

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  let orgIds = [userOrgId];
  if (memberships?.length) {
    orgIds = [...new Set([...orgIds, ...memberships.map((m: any) => m.organization_id)])];
  }

  // Build store query
  let query = supabase
    .from('shopify_stores')
    .select('*')
    .in('organization_id', orgIds)
    .eq('is_active', true);

  // If specific store requested, filter by it
  if (requestedStoreId) {
    query = query.eq('id', requestedStoreId);
  }

  const { data: store } = await query
    .order('installed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!store) {
    return NextResponse.json({ connected: false, store: null });
  }

  // A store without shop_domain is NOT connected to Shopify
  const isShopifyConnected = !!store.shop_domain && store.shop_domain.length > 0 && !!store.access_token;

  if (!isShopifyConnected) {
    return NextResponse.json({
      connected: false,
      store: {
        id: store.id,
        shopName: store.shop_name,
        status: store.status || 'pending',
        isActive: store.is_active,
        installedAt: store.installed_at,
      },
    });
  }

  // Count real data from tables
  let ordersCount = store.total_orders || 0;
  let customersCount = store.total_customers || 0;
  let productsCount = store.total_products || 0;

  // Count contacts for THIS store's organization only
  try {
    const { count } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', store.organization_id);
    if (count && count > customersCount) customersCount = count;
  } catch {}

  // Count orders from contact_events for THIS store
  try {
    const { count } = await supabase
      .from('contact_events')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('event_type', 'placed_order');
    if (count && count > ordersCount) ordersCount = count;
  } catch {}

  // Count products for THIS store
  try {
    const { count } = await supabase
      .from('shopify_products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id);
    if (count && count > productsCount) productsCount = count;
  } catch {}
  if (productsCount === 0) {
    try {
      const { count } = await supabase
        .from('shopify_products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', store.organization_id);
      if (count) productsCount = count;
    } catch {}
  }

  return NextResponse.json({
    connected: true,
    store: {
      id: store.id,
      shopDomain: store.shop_domain,
      shopName: store.shop_name,
      shopEmail: store.shop_email,
      currency: store.currency,
      planName: store.plan_name,
      apiVersion: store.api_version,
      isActive: store.is_active,
      status: store.status,
      initialSyncCompleted: store.initial_sync_completed,
      pixelInstalled: store.pixel_installed,
      embedInstalled: store.embed_installed,
      installedAt: store.installed_at,
      lastSyncAt: store.last_sync_at,
      totalOrders: ordersCount,
      totalRevenue: store.total_revenue || 0,
      totalCustomers: customersCount,
      totalProducts: productsCount,
      settings: store.settings,
    },
  });
}
