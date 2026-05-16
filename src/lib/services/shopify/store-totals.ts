// Single source of truth for shopify_stores aggregate columns.
//
// Every place that imports orders/customers/products into Worder must
// call recomputeStoreTotals after the write — never set total_orders /
// total_revenue / total_customers / total_products directly from a
// sync-loop counter, because those counters drift (sum-of-pages
// duplication, partial pages, cancelled bulks, deletes).
//
// The integrations card already reads count(*) live from the child
// tables, so the cache row exists only for fast list views, exports,
// and admin dashboards. Klaviyo's model: ingest writes data, a
// downstream aggregator pass rolls up the cache. This is that
// aggregator pass.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StoreTotals {
  total_orders: number;
  total_customers: number;
  total_products: number;
  total_revenue: number;
}

export async function recomputeStoreTotals(
  supabase: SupabaseClient,
  storeId: string,
): Promise<StoreTotals | null> {
  if (!storeId) return null;

  const [ordersRes, customersRes, productsRes, revenueRows] = await Promise.all([
    supabase.from('shopify_orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    supabase.from('shopify_customers').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    supabase.from('shopify_products').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
    supabase
      .from('shopify_orders')
      .select('total_price, total_refunded')
      .eq('store_id', storeId)
      .in('financial_status', ['paid', 'partially_paid', 'partially_refunded']),
  ]);

  const totalOrders = ordersRes.count ?? 0;
  const totalCustomers = customersRes.count ?? 0;
  const totalProducts = productsRes.count ?? 0;

  // Net revenue: paid + partially-paid + partially-refunded order
  // totals minus refunds. The financial_status filter already
  // excludes 'voided' and fully 'refunded' (which net to zero), so
  // we just subtract the partial refunds from the gross.
  let totalRevenue = 0;
  for (const row of (revenueRows.data || []) as Array<{
    total_price: string | number | null;
    total_refunded: string | number | null;
  }>) {
    const gross = Number(row.total_price) || 0;
    const refunded = Number(row.total_refunded) || 0;
    totalRevenue += Math.max(0, gross - refunded);
  }
  totalRevenue = Math.round(totalRevenue * 100) / 100;

  const update = {
    total_orders: totalOrders,
    total_customers: totalCustomers,
    total_products: totalProducts,
    total_revenue: totalRevenue,
    last_sync_at: new Date().toISOString(),
  };

  await supabase.from('shopify_stores').update(update).eq('id', storeId);

  return {
    total_orders: totalOrders,
    total_customers: totalCustomers,
    total_products: totalProducts,
    total_revenue: totalRevenue,
  };
}

// Fire-and-forget variant for webhook hot paths. Webhooks fire in
// bursts (orders/create + orders/paid + orders/fulfilled within a few
// seconds), so we never want to block the 200 OK on a recompute. The
// caller awaits the actual write; this just nudges the cache.
export function scheduleRecomputeStoreTotals(
  supabase: SupabaseClient,
  storeId: string,
): void {
  if (!storeId) return;
  void recomputeStoreTotals(supabase, storeId).catch((err) => {
    console.warn('[store-totals] recompute failed:', storeId, err?.message);
  });
}
