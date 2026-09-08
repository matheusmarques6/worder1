// =============================================
// API: Shopify Full Sync
// src/app/api/shopify/full-sync/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runFullSync, runIncrementalSync } from '@/lib/services/shopify/full-sync';
import { runFullSyncGraphQL } from '@/lib/services/shopify/full-sync-graphql';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// =============================================
// POST: Execute Full Sync
// =============================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const userId = user.id;
    const userOrgId = user.organization_id;
    const supabaseAdmin = getSupabaseAdmin();

    // Multi-org lookup
    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    const orgIds = [...new Set([
      userOrgId,
      ...(memberships?.map((m: any) => m.organization_id) || []),
    ])];

    let storeId: string | null = null;
    let options = {
      syncProducts: true,
      syncCustomers: true,
      syncOrders: true,
      syncCheckouts: true,
      syncLocations: true,
      incremental: false,
    };

    try {
      const body = await request.json();
      storeId = body.storeId || null;
      options = { ...options, ...body };
    } catch {
      // Body vazio
    }

    if (!storeId) {
      // Sem storeId só serve a ÚNICA loja ativa — uma sincronização
      // completa na loja errada é cara e confunde o lojista.
      const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
      const picked = await pickStore<{ id: string }>(supabaseAdmin, { orgIds, select: 'id' });
      if (!picked.store) {
        const err = pickStoreError(picked.reason);
        return NextResponse.json({ success: false, error: err.error, code: err.code }, { status: err.status });
      }
      storeId = picked.store.id;
    }

    // TypeScript guard
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId não encontrado' },
        { status: 400 }
      );
    }

    // Validate store access via multi-org
    const { data: store, error: storeError } = await supabaseAdmin
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .in('organization_id', orgIds)
      .single();

    if (storeError || !store) {
      return NextResponse.json(
        { success: false, error: 'Loja não encontrada' },
        { status: 404 }
      );
    }

    if (!store.access_token) {
      return NextResponse.json(
        { success: false, error: 'Token de acesso não encontrado. Reconecte a loja.' },
        { status: 400 }
      );
    }

    // Executar sync - chamar funções separadamente
    const syncOptions = {
      syncProducts: options.syncProducts,
      syncCustomers: options.syncCustomers,
      syncOrders: options.syncOrders,
      syncCheckouts: options.syncCheckouts,
      syncLocations: options.syncLocations,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    const useGraphQL = (options as any).useGraphQL === true;

    if (useGraphQL) {
      // New GraphQL-based sync. historical=true and full=true are aliases
      // for "fetch every order ever placed", which is the right default
      // on a brand-new connection — the 90-day window was leaving stores
      // with 360 of 627 orders synced and the merchant thinking the
      // initial import was broken.
      const wantHistorical =
        (options as any).historical === true ||
        (options as any).full === true ||
        (options as any).ordersHistorical === true;
      result = await runFullSyncGraphQL(store, {
        syncCustomers: options.syncCustomers,
        syncOrders: options.syncOrders,
        syncProducts: options.syncProducts,
        ordersDaysBack: (options as any).ordersDaysBack || 90,
        ordersHistorical: wantHistorical,
      });
    } else if (options.incremental) {
      const since = new Date();
      since.setDate(since.getDate() - 1); // Last 24 hours
      result = await runIncrementalSync(store, since, syncOptions);
    } else {
      result = await runFullSync(store, syncOptions);
    }

    if (!result.success) {
      return NextResponse.json({
        success: false,
        errors: result.errors,
        partial: {
          ordersCount: result.ordersCount,
          customersCount: result.customersCount,
          productsCount: result.productsCount,
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Sync completo em ${(result.durationMs / 1000).toFixed(1)}s`,
      data: {
        storeId: store.id,
        storeName: store.shop_name,
        ordersCount: result.ordersCount,
        customersCount: result.customersCount,
        productsCount: result.productsCount,
        checkoutsCount: result.checkoutsCount,
        locationsCount: result.locationsCount,
        totalRevenue: result.metrics?.totalRevenue || result.totalRevenue,
        averageOrderValue: result.metrics?.averageOrderValue || result.averageOrderValue,
        recurringCustomerRate: result.metrics?.recurringCustomerRate || result.recurringCustomerRate,
        durationMs: result.durationMs,
        syncedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Full Sync POST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// =============================================
// GET: Sync Status
// =============================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const adminDb = getSupabaseAdmin();

    // Multi-org lookup
    const { data: memberships } = await adminDb
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = [...new Set([
      user.organization_id,
      ...(memberships?.map((m: any) => m.organization_id) || []),
    ])];

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    let query = adminDb
      .from('shopify_stores')
      .select(`
        id,
        shop_name,
        shop_domain,
        is_active,
        total_orders,
        total_revenue,
        total_customers,
        last_sync_at,
        metrics
      `);

    query = query.in('organization_id', orgIds);

    if (storeId) {
      query = query.eq('id', storeId);
    }

    const { data: stores, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (storeId && stores && stores.length > 0) {
      return NextResponse.json({
        success: true,
        store: stores[0],
      });
    }

    return NextResponse.json({
      success: true,
      stores: stores || [],
    });

  } catch (error) {
    console.error('[Full Sync GET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
