import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2024-10';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

async function getUserOrganization(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return profile?.organization_id || null;
}

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  return { body: await response.json(), headers: response.headers };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const search = searchParams.get('search');
    const withCosts = searchParams.get('withCosts') === 'true';

    // Buscar lojas
    let storesQuery = supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (storeId) {
      storesQuery = storesQuery.eq('id', storeId);
    }

    const { data: stores } = await storesQuery;

    if (!stores || stores.length === 0) {
      return NextResponse.json({ products: [], total: 0, stores: [] });
    }

    // Buscar custos cadastrados
    const { data: costs } = await supabase
      .from('product_costs')
      .select('*')
      .eq('organization_id', organizationId);

    const costsMap = new Map<string, any>();
    (costs || []).forEach(cost => {
      const key = cost.shopify_variant_id
        ? `${cost.shopify_product_id}_${cost.shopify_variant_id}`
        : cost.shopify_product_id;
      costsMap.set(key, cost);
    });

    // Buscar produtos de cada loja
    const allProducts: any[] = [];

    for (const store of stores) {
      if (!store.shop_domain || !store.access_token) continue;

      try {
        let endpoint = '/products.json?limit=250';
        if (search) {
          endpoint += `&title=${encodeURIComponent(search)}`;
        }

        const { body } = await shopifyFetch(store.shop_domain, store.access_token, endpoint);

        const products = (body.products || []).map((product: any) => {
          // Verificar se tem custo cadastrado
          const productCost = costsMap.get(product.id.toString());

          const variants = product.variants?.map((variant: any) => {
            const variantCost = costsMap.get(`${product.id}_${variant.id}`);
            return {
              id: variant.id,
              title: variant.title,
              price: parseFloat(variant.price || 0),
              compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
              sku: variant.sku,
              inventory_quantity: variant.inventory_quantity,
              // Custo
              cost: variantCost?.cost_amount || productCost?.cost_amount || null,
              cost_currency: variantCost?.cost_currency || productCost?.cost_currency || 'BRL',
              cost_id: variantCost?.id || productCost?.id || null,
            };
          }) || [];

          const prices = variants.map((v: any) => v.price);
          const hasCost = productCost || variants.some((v: any) => v.cost !== null);

          return {
            id: product.id,
            title: product.title,
            vendor: product.vendor,
            product_type: product.product_type,
            status: product.status,
            tags: product.tags?.split(',').map((t: string) => t.trim()) || [],
            image: product.image?.src || product.images?.[0]?.src || null,

            // Preços
            price_min: Math.min(...prices),
            price_max: Math.max(...prices),

            // Variantes
            variants,
            variants_count: variants.length,

            // Custo
            has_cost: hasCost,
            cost: productCost?.cost_amount || null,
            cost_currency: productCost?.cost_currency || 'BRL',
            cost_id: productCost?.id || null,

            // Loja
            store_id: store.id,
            store_name: store.shop_name || store.shop_domain,
          };
        });

        // Filtro de custo
        const filteredProducts = withCosts !== undefined
          ? products.filter((p: any) => withCosts ? p.has_cost : !p.has_cost)
          : products;

        allProducts.push(...filteredProducts);

      } catch (err) {
        console.error(`Error fetching products from ${store.shop_domain}:`, err);
      }
    }

    // Ordenar por título
    allProducts.sort((a, b) => a.title.localeCompare(b.title));

    // Estatísticas
    const withCostCount = allProducts.filter(p => p.has_cost).length;
    const withoutCostCount = allProducts.filter(p => !p.has_cost).length;

    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
      stats: {
        withCost: withCostCount,
        withoutCost: withoutCostCount,
        percentage: allProducts.length > 0
          ? Math.round((withCostCount / allProducts.length) * 100)
          : 0,
      },
      stores: stores.map(s => ({ id: s.id, name: s.shop_name, domain: s.shop_domain })),
    });

  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
