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

  // A store is connected to Shopify only if it has a real Shopify domain,
  // a valid access token, AND is currently is_active. Without the
  // is_active check, a store the merchant just disconnected (which keeps
  // the credentials in the row for audit/restore) would still surface as
  // "connected" — and the dashboard would block them from re-entering
  // credentials, jumping straight to the connected view on every reload.
  const isManualStore = !store.shop_domain || store.shop_domain.endsWith('.worder.local') || store.access_token === 'manual'
  const isShopifyConnected = !isManualStore && !!store.shop_domain && !!store.access_token && store.is_active === true;

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

  // Count real data from tables.
  //
  // CHANGED: the counts are now the ACTUAL row counts in each
  // Shopify table — no fallbacks to contact_events or org-wide
  // contacts. The merchant kept seeing the orders number bounce
  // between 989 and 800 because:
  //  - shopify_orders has 800 real rows
  //  - contact_events.placed_order had 530 leftover events from
  //    earlier failed syncs, and the MAX() fallback briefly let an
  //    older orphan value (~989) win until contact_events caught up
  //  - shopify_stores.total_orders was being written from a sum-of-
  //    page-sizes counter (with duplicates), not the actual table
  //    count
  // Same fix for customers: the previous code took MAX with org-wide
  // contacts (22.689 — including every WhatsApp lead and form
  // signup) instead of the Shopify-only customer count (1.266).
  const [ordersResult, customersResult, productsResult] = await Promise.all([
    supabase.from('shopify_orders').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    supabase.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
    supabase.from('shopify_products').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
  ]);
  const ordersCount = ordersResult.count ?? store.total_orders ?? 0;
  const customersCount = customersResult.count ?? store.total_customers ?? 0;
  const productsCount = productsResult.count ?? store.total_products ?? 0;

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
      connectionType: store.connection_type || 'oauth',
      tokenExpiresAt: store.token_expires_at,
      initialSyncCompleted: store.initial_sync_completed,
      pixelInstalled: pixelDetected,
      embedInstalled: embedDetected,
      // True when our popup loader script is auto-installed via Shopify
      // ScriptTag API. Frontend uses this to decide whether to show the
      // "paste in theme.liquid" fallback or hide it. The id is persisted in
      // the existing settings jsonb (no schema migration needed).
      loaderInstalled: !!(store.settings?.script_tag_id),
      scopes: Array.isArray(store.scopes) ? store.scopes : [],
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
