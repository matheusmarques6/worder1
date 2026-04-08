// =============================================
// Internal: Trigger Initial Sync
// POST /api/shopify/trigger-sync
//
// Called internally by the OAuth callback to start
// the initial historical data import after store connection.
// Authenticated via CRON_SECRET or X-Internal-Request header.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runFullSyncGraphQL } from '@/lib/services/shopify/full-sync-graphql';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    // Auth: internal request or CRON_SECRET
    const isInternal = request.headers.get('X-Internal-Request') === 'true';
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      isInternal ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Fetch store
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('is_active', true)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    console.log(`[TriggerSync] Starting initial sync for store ${store.shop_domain}`);

    // Run the GraphQL full sync
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
        sync_orders: true,
        sync_customers: true,
        sync_checkouts: true,
        sync_refunds: false,
        stage_mapping: store.stage_mapping || {},
        is_configured: true,
        is_active: true,
        connection_status: 'active',
      },
      {
        syncCustomers: true,
        syncOrders: true,
        syncProducts: true,
        ordersDaysBack: 90,
      }
    );

    console.log(`[TriggerSync] Completed: ${result.customersCount} customers, ${result.ordersCount} orders, ${result.productsCount} products`);

    return NextResponse.json({
      success: result.success,
      customers: result.customersCount,
      orders: result.ordersCount,
      products: result.productsCount,
      events: result.eventsCreated,
    });
  } catch (error: any) {
    console.error('[TriggerSync] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
