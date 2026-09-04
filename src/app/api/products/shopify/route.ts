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

    // Find the store: the requested one, or the ONLY active store of the
    // user's organizations. Never "the newest" — with two stores that
    // listed the wrong catalog.
    const { pickStore } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<{ id: string }>(supabase, { orgIds, storeId, select: 'id' });

    if (!picked.store) {
      return NextResponse.json({ products: [], total: 0, reason: picked.reason });
    }

    const resolvedStoreId = picked.store.id;

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

    // Pull the store's currency so the frontend can render prices
    // in the right format (Dr. Melaxin sells in USD; the products
    // page was hardcoding R$).
    const { data: storeMeta } = await supabase
      .from('shopify_stores')
      .select('currency')
      .eq('id', resolvedStoreId)
      .maybeSingle();
    const currency = (storeMeta?.currency || 'USD').toUpperCase();

    // Format products for the frontend. Three fallbacks to surface
    // data that lives only on variants:
    //  - sku → top-level or first variant's sku
    //  - totalInventory → sum of variant inventory_quantity; null
    //    when none of the variants track inventory (Dr. Melaxin
    //    doesn't enable Shopify inventory tracking on most SKUs)
    //  - productType → vendor as a last-resort label
    const formatted = (products || []).map((p: any) => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const firstVariant = variants[0] || {};
      const sku = p.sku || firstVariant.sku || null;

      // Sum inventory across variants. Shopify returns -1 for
      // "untracked" variants — treat those as null so the UI can
      // show "—" instead of a meaningless 0/negative.
      let invSum = 0;
      let invTracked = false;
      for (const v of variants) {
        const q = v?.inventory_quantity;
        if (q === null || q === undefined || q === -1 || q === '-1') continue;
        const n = typeof q === 'number' ? q : parseInt(String(q), 10);
        if (Number.isFinite(n)) { invSum += n; invTracked = true; }
      }
      const totalInventory = invTracked
        ? invSum
        : (typeof p.inventory_quantity === 'number' && p.inventory_quantity > 0 ? p.inventory_quantity : null);

      return {
        id: p.id,
        shopifyProductId: p.shopify_product_id,
        title: p.title,
        handle: p.handle,
        vendor: p.vendor,
        productType: p.product_type || null,
        status: p.status,
        price: Number(p.price ?? firstVariant.price ?? 0),
        compareAtPrice: p.compare_at_price ? Number(p.compare_at_price) : (firstVariant.compare_at_price ? Number(firstVariant.compare_at_price) : null),
        sku,
        totalInventory,
        tags: p.tags || '',
        variants,
        images: p.images || [],
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });

    return NextResponse.json({
      products: formatted,
      total: count ?? formatted.length,
      storeId: resolvedStoreId,
      currency,
    });
  } catch (error: any) {
    console.error('[Products Shopify GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
