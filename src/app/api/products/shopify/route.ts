import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const supabase = getSupabaseAdmin();

    // Multi-org lookup
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = [...new Set([
      user.organization_id,
      ...(memberships?.map((m: any) => m.organization_id) || []),
    ])];

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    // Find the store
    let storeQuery = supabase
      .from('shopify_stores')
      .select('id')
      .in('organization_id', orgIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (storeId) {
      storeQuery = supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', storeId)
        .in('organization_id', orgIds)
        .limit(1);
    }

    const { data: stores, error: storeError } = await storeQuery;

    if (storeError || !stores || stores.length === 0) {
      return NextResponse.json({ products: [], total: 0 });
    }

    const resolvedStoreId = stores[0].id;

    // Fetch products
    const { data: products, error, count } = await supabase
      .from('shopify_products')
      .select('*', { count: 'exact' })
      .eq('store_id', resolvedStoreId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format products for the frontend
    const formatted = (products || []).map((p: any) => ({
      id: p.id,
      shopifyProductId: p.shopify_product_id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor,
      productType: p.product_type,
      status: p.status,
      price: p.price,
      compareAtPrice: p.compare_at_price,
      sku: p.sku,
      totalInventory: p.inventory_quantity ?? 0,
      tags: p.tags || '',
      variants: p.variants || [],
      images: p.images || [],
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return NextResponse.json({
      products: formatted,
      total: count ?? formatted.length,
      storeId: resolvedStoreId,
    });
  } catch (error: any) {
    console.error('[Products Shopify GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
