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

  // Build store query — don't filter is_active when a specific store is requested
  let query = supabase
    .from('shopify_stores')
    .select('*')
    .in('organization_id', orgIds);

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

  // A store is connected to Shopify only if it has a real Shopify domain and token
  const isManualStore = !store.shop_domain || store.shop_domain.endsWith('.worder.local') || store.access_token === 'manual'
  const isShopifyConnected = !isManualStore && !!store.shop_domain && !!store.access_token;

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

  // Count orders — try shopify_orders first, fallback to contact_events
  try {
    const { count } = await supabase
      .from('shopify_orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id);
    if (count && count > ordersCount) ordersCount = count;
  } catch {}
  try {
    const { count } = await supabase
      .from('contact_events')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('event_type', 'placed_order');
    if (count && count > ordersCount) ordersCount = count;
  } catch {}

  // Count products — try shopify_products first, fallback to products
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

  // Calculate revenue from shopify_orders
  let totalRevenue = store.total_revenue || 0;
  try {
    const { data: orderRevenue } = await supabase
      .from('shopify_orders')
      .select('total_price')
      .eq('store_id', store.id)
      .in('financial_status', ['paid', 'partially_paid']);
    if (orderRevenue) {
      const rev = orderRevenue.reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0);
      if (rev > totalRevenue) totalRevenue = rev;
    }
  } catch {}

  // Auto-detect pixel: if we have ANY pixel events, pixel IS installed
  let pixelDetected = store.pixel_installed || false;
  if (!pixelDetected) {
    try {
      const { count: pixelEvents } = await supabase
        .from('contact_events')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .in('event_source', ['worder_pixel', 'shopify_pixel', 'pixel']);
      if (pixelEvents && pixelEvents > 0) pixelDetected = true;
    } catch {}
  }

  // Auto-detect theme extension (app embed): if we have any theme_ext events
  let embedDetected = store.embed_installed || false;
  if (!embedDetected) {
    try {
      const { count: themeEvents } = await supabase
        .from('contact_events')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('event_source', 'theme_ext');
      if (themeEvents && themeEvents > 0) embedDetected = true;
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
      pixelInstalled: pixelDetected,
      embedInstalled: embedDetected,
      installedAt: store.installed_at,
      lastSyncAt: store.last_sync_at,
      totalOrders: ordersCount,
      totalRevenue: totalRevenue,
      totalCustomers: customersCount,
      totalProducts: productsCount,
      settings: store.settings,
    },
  });
}
