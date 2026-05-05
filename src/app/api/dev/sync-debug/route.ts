// =============================================
// GET /api/dev/sync-debug?store_id=X
//
// Runs the EXACT ORDERS_QUERY used by sync-now and returns the
// raw response so we can see what fails.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL } from '@/lib/shopify/graphql-client';
import { ORDERS_QUERY, CUSTOMERS_QUERY, PRODUCTS_QUERY } from '@/lib/shopify/graphql-queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('id', storeId)
    .single();

  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

  const cfg = { shop_domain: store.shop_domain, access_token: store.access_token };

  // Test ORDERS_QUERY with a small first
  const sinceDateStr = new Date(Date.now() - 90 * 86400 * 1000).toISOString().split('T')[0];

  let ordersResult: any;
  try {
    const result = await shopifyGraphQL(cfg as any, ORDERS_QUERY, {
      first: 5,
      query: `created_at:>=${sinceDateStr}`,
      sortKey: 'CREATED_AT',
    });
    ordersResult = {
      ok: true,
      ordersCount: result.data?.orders?.nodes?.length || 0,
      errors: result.errors,
      sample: result.data?.orders?.nodes?.[0] || null,
    };
  } catch (err: any) {
    ordersResult = { ok: false, error: err.message };
  }

  // Test CUSTOMERS_QUERY
  let customersResult: any;
  try {
    const result = await shopifyGraphQL(cfg as any, CUSTOMERS_QUERY, {
      first: 3,
      sortKey: 'UPDATED_AT',
    });
    customersResult = {
      ok: true,
      customersCount: result.data?.customers?.nodes?.length || 0,
      errors: result.errors,
      sample: result.data?.customers?.nodes?.[0] || null,
    };
  } catch (err: any) {
    customersResult = { ok: false, error: err.message };
  }

  // Test PRODUCTS_QUERY
  let productsResult: any;
  try {
    const result = await shopifyGraphQL(cfg as any, PRODUCTS_QUERY, {
      first: 3,
      sortKey: 'UPDATED_AT',
    });
    productsResult = {
      ok: true,
      productsCount: result.data?.products?.nodes?.length || 0,
      errors: result.errors,
      sample: result.data?.products?.nodes?.[0] || null,
    };
  } catch (err: any) {
    productsResult = { ok: false, error: err.message };
  }

  return NextResponse.json({
    store: {
      id: store.id,
      shop_domain: store.shop_domain,
      api_version: store.api_version,
      connection_type: store.connection_type,
      token_expires_at: store.token_expires_at,
      tokenExpired: store.token_expires_at ? new Date(store.token_expires_at) < new Date() : null,
    },
    queryDate: sinceDateStr,
    orders: ordersResult,
    customers: customersResult,
    products: productsResult,
  });
}
