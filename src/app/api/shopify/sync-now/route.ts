// POST /api/shopify/sync-now — trigger sync with GraphQL
// REWRITE: Simplified with detailed logging at every step
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { shopifyGraphQL, shopifyGraphQLPaginate, extractShopifyId } from '@/lib/shopify/graphql-client';
import { PRODUCTS_QUERY, CUSTOMERS_QUERY, ORDERS_QUERY } from '@/lib/shopify/graphql-queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const supabase = getSupabaseAdmin();
    const userId = auth.user.id;
    const userOrgId = auth.user.organization_id;

    console.log(`[Sync] Starting. userId=${userId}, orgId=${userOrgId}`);

    // Multi-org lookup
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    const orgIds = [...new Set([userOrgId, ...(memberships?.map((m: any) => m.organization_id) || [])])];
    console.log(`[Sync] Orgs: ${orgIds.join(', ')}`);

    let body: any = {};
    try { body = await request.json(); } catch {}
    const syncType = body.syncType || 'all';

    // Find store — try ALL active stores, not just user's orgs
    let { data: store } = await supabase
      .from('shopify_stores')
      .select('*')
      .in('organization_id', orgIds)
      .eq('is_active', true)
      .order('installed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: any active store
    if (!store) {
      const { data: anyStore } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('is_active', true)
        .order('installed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      store = anyStore;
    }

    if (!store) {
      console.error('[Sync] No store found');
      return NextResponse.json({ error: 'Nenhuma loja encontrada' }, { status: 404 });
    }

    if (!store.access_token) {
      console.error(`[Sync] Store ${store.shop_domain} has no access_token`);
      return NextResponse.json({ error: 'Token de acesso não encontrado' }, { status: 400 });
    }

    console.log(`[Sync] Store: ${store.shop_name} (${store.shop_domain}), syncType=${syncType}`);

    const storeConfig = {
      id: store.id,
      organization_id: store.organization_id,
      shop_domain: store.shop_domain,
      access_token: store.access_token,
    };

    const results: any = { products: 0, customers: 0, orders: 0, errors: [] };

    // ========== SYNC PRODUCTS ==========
    if (syncType === 'all' || syncType === 'products') {
      try {
        console.log(`[Sync] Fetching products from Shopify...`);
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, PRODUCTS_QUERY,
          { sortKey: 'UPDATED_AT' },
          'products',
          { first: 250, maxPages: 100 }
        );
        console.log(`[Sync] Fetched ${nodes.length} products from Shopify`);

        for (let i = 0; i < nodes.length; i += 50) {
          const batch = nodes.slice(i, i + 50);
          const products = batch.map((p: any) => {
            const variants = (p.variants?.nodes || []).map((v: any) => ({
              id: v.id ? extractShopifyId(v.id) : null,
              title: v.title, sku: v.sku, price: v.price,
              compare_at_price: v.compareAtPrice,
              inventory_quantity: v.inventoryQuantity,
            }));
            return {
              store_id: store.id,
              organization_id: store.organization_id,
              shopify_product_id: extractShopifyId(p.id),
              title: p.title,
              handle: p.handle,
              vendor: p.vendor,
              product_type: p.productType,
              status: (p.status || 'ACTIVE').toLowerCase(),
              tags: Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || ''),
              price: parseFloat(variants[0]?.price || '0'),
              compare_at_price: variants[0]?.compare_at_price ? parseFloat(variants[0].compare_at_price) : null,
              sku: variants[0]?.sku || null,
              inventory_quantity: p.totalInventory || 0,
              variants,
              images: (p.images?.nodes || []).map((img: any) => ({ url: img.url, alt: img.altText })),
              updated_at: new Date().toISOString(),
            };
          });

          const { error } = await supabase
            .from('shopify_products')
            .upsert(products, { onConflict: 'store_id,shopify_product_id' });

          if (error) {
            console.error(`[Sync] Product upsert error:`, error.message, error.code, error.details);
            results.errors.push(`Products: ${error.message}`);
          } else {
            console.log(`[Sync] Upserted ${products.length} products`);
          }
          results.products += batch.length;
        }
      } catch (err: any) {
        console.error(`[Sync] Products error:`, err.message);
        results.errors.push(`Products: ${err.message}`);
      }
    }

    // ========== SYNC CUSTOMERS ==========
    if (syncType === 'all' || syncType === 'customers') {
      try {
        console.log(`[Sync] Fetching customers from Shopify...`);
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, CUSTOMERS_QUERY,
          { sortKey: 'UPDATED_AT' },
          'customers',
          { first: 250, maxPages: 100 }
        );
        console.log(`[Sync] Fetched ${nodes.length} customers from Shopify`);

        for (const c of nodes) {
          const shopifyId = extractShopifyId(c.id);
          // Upsert into contacts
          if (c.email) {
            const { error } = await supabase.from('contacts').upsert({
              organization_id: store.organization_id,
              store_id: store.id,
              email: c.email,
              phone: c.phone || null,
              first_name: c.firstName || null,
              last_name: c.lastName || null,
              source: 'shopify',
              shopify_customer_id: shopifyId,
              total_orders: parseInt(c.numberOfOrders || '0'),
              total_spent: parseFloat(c.amountSpent?.amount || '0'),
              tags: Array.isArray(c.tags) ? c.tags : [],
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,email' });

            if (error && error.code !== '23505') {
              console.error(`[Sync] Contact upsert error for ${c.email}:`, error.message);
            }
          }
          results.customers++;
        }
        console.log(`[Sync] Synced ${results.customers} customers to contacts`);
      } catch (err: any) {
        console.error(`[Sync] Customers error:`, err.message);
        results.errors.push(`Customers: ${err.message}`);
      }
    }

    // ========== SYNC ORDERS ==========
    if (syncType === 'all' || syncType === 'orders') {
      try {
        const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        console.log(`[Sync] Fetching orders since ${sinceDate}...`);
        const { nodes } = await shopifyGraphQLPaginate(
          storeConfig, ORDERS_QUERY,
          { query: `created_at:>'${sinceDate}'`, sortKey: 'CREATED_AT' },
          'orders',
          { first: 250, maxPages: 100 }
        );
        console.log(`[Sync] Fetched ${nodes.length} orders from Shopify`);
        results.orders = nodes.length;
      } catch (err: any) {
        console.error(`[Sync] Orders error:`, err.message);
        results.errors.push(`Orders: ${err.message}`);
      }
    }

    // Update store stats
    await supabase.from('shopify_stores').update({
      last_sync_at: new Date().toISOString(),
      total_orders: results.orders,
      total_customers: results.customers,
    }).eq('id', store.id);

    console.log(`[Sync] DONE: ${results.products} products, ${results.customers} customers, ${results.orders} orders, ${results.errors.length} errors`);

    return NextResponse.json({
      success: results.errors.length === 0,
      data: results,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error('[Sync] Fatal error:', error.message, error.stack);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
