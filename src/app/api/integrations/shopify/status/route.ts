import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const supabase = getSupabaseAdmin();

  const { data: store } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .eq('is_active', true)
    .order('installed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
    },
  });
}
