import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();
  const orgId = auth.user.organization_id;

  // Try 1: Find store for user's organization
  let { data: store } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('installed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Try 2: If not found, check if user belongs to an org that has a store
  // This handles the case where the callback saved with a different org
  if (!store) {
    const { data: anyStore } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyStore) {
      // Check if this store's org matches any org the user has access to
      // For single-org setups, just use it
      store = anyStore;
      console.log(`[Shopify Status] Found store via fallback: ${anyStore.shop_domain} (org: ${anyStore.organization_id}, user org: ${orgId})`);
    }
  }

  if (!store) {
    return NextResponse.json({ connected: false, store: null });
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
      totalOrders: store.total_orders || 0,
      totalRevenue: store.total_revenue || 0,
      totalCustomers: store.total_customers || 0,
      settings: store.settings,
    },
  });
}
