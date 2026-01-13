// =============================================
// API: Shopify Full Sync
// src/app/api/shopify/full-sync/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils';
import { runFullSync, runIncrementalSync } from '@/lib/services/shopify/full-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// =============================================
// POST: Execute Full Sync
// =============================================

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase, user } = auth;
    const organizationId = user.organization_id;

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
      const { data: stores } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('is_active', true)
        .limit(1);
      
      if (!stores || stores.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Nenhuma loja conectada' },
          { status: 404 }
        );
      }
      storeId = stores[0].id;
    }

    // TypeScript guard
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId não encontrado' },
        { status: 400 }
      );
    }

    const validation = await validateStoreAccess(supabase, organizationId, storeId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      );
    }

    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
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
    if (options.incremental) {
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

    const { supabase } = auth;

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    let query = supabase
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
