// =============================================
// Shopify Full Sync via GraphQL
// src/lib/services/shopify/full-sync-graphql.ts
//
// GraphQL-based initial sync with cursor pagination.
// Syncs Customers, Orders (90 days), and Products.
// Creates CDP events for historical orders.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  shopifyGraphQL,
  shopifyGraphQLPaginate,
  extractShopifyId,
} from '@/lib/shopify/graphql-client';
import type { ShopifyStoreConfig } from './types';
import {
  CUSTOMERS_QUERY,
  ORDERS_QUERY,
  PRODUCTS_QUERY,
} from '@/lib/shopify/graphql-queries';
import { createEvent } from '@/lib/shopify/event-service';
import { WORDER_SHOPIFY_EVENTS, EVENT_SOURCES } from '@/lib/shopify/event-types';
import { computeProductAvailability, normalizeSyncedVariant } from '@/lib/shopify/product-availability';

// =============================================
// TYPES
// =============================================

export interface GraphQLSyncOptions {
  syncCustomers?: boolean;
  syncOrders?: boolean;
  syncProducts?: boolean;
  ordersDaysBack?: number;
  /** Fetch the entire order history instead of the last ordersDaysBack days.
   *  Use on first sync so the merchant doesn't end up with 360/627 orders. */
  ordersHistorical?: boolean;
  onProgress?: (stage: string, progress: number, message: string) => void;
}

export interface GraphQLSyncResult {
  success: boolean;
  storeId: string;
  organizationId: string;
  customersCount: number;
  ordersCount: number;
  productsCount: number;
  eventsCreated: number;
  totalRevenue: number;
  averageOrderValue: number;
  durationMs: number;
  errors: string[];
}

// =============================================
// MAIN SYNC
// =============================================

export async function runFullSyncGraphQL(
  store: ShopifyStoreConfig,
  options: GraphQLSyncOptions = {}
): Promise<GraphQLSyncResult> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  const {
    syncCustomers = true,
    syncOrders = true,
    syncProducts = true,
    ordersDaysBack = 90,
    ordersHistorical = false,
    onProgress,
  } = options;

  const storeConfig = {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    access_token: store.access_token,
  };

  const result: GraphQLSyncResult = {
    success: false,
    storeId: store.id,
    organizationId: store.organization_id,
    customersCount: 0,
    ordersCount: 0,
    productsCount: 0,
    eventsCreated: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    durationMs: 0,
    errors: [],
  };

  // Create sync log
  const { data: syncLog } = await supabase
    .from('shopify_sync_logs')
    .insert({
      store_id: store.id,
      organization_id: store.organization_id,
      sync_type: 'full_sync_graphql',
      entity_type: 'all',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const logId = syncLog?.id;

  try {
    // ========== CUSTOMERS ==========
    if (syncCustomers) {
      onProgress?.('customers', 0, 'Syncing customers via GraphQL...');
      const customerResult = await syncCustomersGraphQL(storeConfig, store, onProgress);
      result.customersCount = customerResult.count;
      result.errors.push(...customerResult.errors);
      onProgress?.('customers', 100, `${customerResult.count} customers synced`);
    }

    // ========== ORDERS ==========
    if (syncOrders) {
      onProgress?.('orders', 0, ordersHistorical ? 'Syncing entire order history via GraphQL...' : 'Syncing orders via GraphQL...');
      const orderResult = await syncOrdersGraphQL(
        storeConfig, store,
        ordersHistorical ? null : ordersDaysBack,
        onProgress
      );
      result.ordersCount = orderResult.count;
      result.eventsCreated = orderResult.eventsCreated;
      result.totalRevenue = orderResult.totalRevenue;
      result.averageOrderValue = orderResult.count > 0 ? orderResult.totalRevenue / orderResult.count : 0;
      result.errors.push(...orderResult.errors);
      onProgress?.('orders', 100, `${orderResult.count} orders synced`);
    }

    // ========== PRODUCTS ==========
    if (syncProducts) {
      onProgress?.('products', 0, 'Syncing products via GraphQL...');
      const productResult = await syncProductsGraphQL(storeConfig, store, onProgress);
      result.productsCount = productResult.count;
      result.errors.push(...productResult.errors);
      onProgress?.('products', 100, `${productResult.count} products synced`);
    }

    // ========== FINALIZE ==========
    // Roll the store cache via the single recompute helper. Reading
    // COUNT(*) is authoritative — the sum-of-pages counters returned
    // by syncOrdersGraphQL etc. can include duplicates when Shopify
    // pagination retries a cursor.
    const { recomputeStoreTotals } = await import('@/lib/services/shopify/store-totals');
    await recomputeStoreTotals(supabase as any, store.id);
    await supabase
      .from('shopify_stores')
      .update({ initial_sync_completed: true })
      .eq('id', store.id);

    result.success = result.errors.length === 0;
    result.durationMs = Date.now() - startTime;

    // Update sync log FIRST so the merchant always sees the sync
    // finalize, even if the post-sync metric refresh below explodes
    // or times out. Previously updateContactMetrics ran first and
    // could hang for tens of minutes — sync_logs stayed 'running'
    // forever and the merchant thought the sync was stuck.
    if (logId) {
      await supabase
        .from('shopify_sync_logs')
        .update({
          status: result.success ? 'completed' : 'completed_with_errors',
          completed_at: new Date().toISOString(),
          items_processed: result.customersCount + result.ordersCount + result.productsCount,
          items_created: result.customersCount + result.ordersCount + result.productsCount,
          error_message: result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null,
        })
        .eq('id', logId);
    }

    // Best-effort contact aggregate refresh. Now powered by a single
    // SQL pass (refresh_contact_order_metrics RPC), but still wrapped
    // in try/catch and run after the log update so it can never block
    // the sync from being marked done.
    try {
      await updateContactMetrics(store);
    } catch (e) {
      console.warn('[GraphQLSync] updateContactMetrics post-finalize failed:', e);
    }

    onProgress?.('done', 100, 'GraphQL sync completed!');
    console.log(`[GraphQLSync] Completed in ${result.durationMs}ms:`, {
      customers: result.customersCount,
      orders: result.ordersCount,
      products: result.productsCount,
      events: result.eventsCreated,
    });

    return result;
  } catch (error: any) {
    console.error('[GraphQLSync] Fatal error:', error);
    result.success = false;
    result.errors.push(error.message);
    result.durationMs = Date.now() - startTime;

    if (logId) {
      await supabase
        .from('shopify_sync_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message,
        })
        .eq('id', logId);
    }

    return result;
  }
}

// =============================================
// SYNC CUSTOMERS
// =============================================

async function syncCustomersGraphQL(
  storeConfig: { id: string; organization_id: string; shop_domain: string; access_token: string },
  store: ShopifyStoreConfig,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{ count: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let count = 0;

  try {
    const { nodes } = await shopifyGraphQLPaginate(
      storeConfig,
      CUSTOMERS_QUERY,
      { sortKey: 'UPDATED_AT' },
      'customers',
      {
        first: 250,
        maxPages: 200,
        onPage: (page, total) => {
          onProgress?.('customers', Math.min(page * 5, 90), `${total} customers fetched...`);
        },
      }
    );

    // Batch process customers
    for (let i = 0; i < nodes.length; i += 50) {
      const batch = nodes.slice(i, i + 50);

      // Upsert into shopify_customers
      const shopifyCustomers = batch.map((c: any) => ({
        store_id: store.id,
        organization_id: store.organization_id,
        shopify_customer_id: extractShopifyId(c.id),
        email: c.email || null,
        phone: c.phone || null,
        first_name: c.firstName || null,
        last_name: c.lastName || null,
        orders_count: parseInt(c.numberOfOrders || '0'),
        total_spent: parseFloat(c.amountSpent?.amount || '0'),
        currency: c.amountSpent?.currencyCode || 'BRL',
        tags: Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags || ''),
        accepts_marketing: c.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
        verified_email: c.verifiedEmail || false,
        default_address: c.defaultAddress || null,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      }));

      const { error } = await supabase
        .from('shopify_customers')
        .upsert(shopifyCustomers, { onConflict: 'store_id,shopify_customer_id' });

      if (error) errors.push(`Customer batch ${i}: ${error.message}`);

      // Also upsert into contacts
      for (const customer of batch) {
        if (!customer.email) continue;
        const shopifyId = extractShopifyId(customer.id);

        const { error: contactError } = await supabase
          .from('contacts')
          .upsert({
            organization_id: store.organization_id,
            store_id: store.id,
            email: customer.email,
            phone: customer.phone || null,
            first_name: customer.firstName || null,
            last_name: customer.lastName || null,
            source: 'shopify',
            shopify_customer_id: shopifyId,
            total_orders: parseInt(customer.numberOfOrders || '0'),
            total_spent: parseFloat(customer.amountSpent?.amount || '0'),
            tags: Array.isArray(customer.tags) ? customer.tags : [],
            email_consent: customer.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
            email_consent_at: customer.emailMarketingConsent?.consentUpdatedAt || null,
            sms_consent: customer.smsMarketingConsent?.marketingState === 'SUBSCRIBED',
            lifecycle_stage: parseInt(customer.numberOfOrders || '0') > 0 ? 'customer' : 'subscriber',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,email' })
          .select('id')
          .single();

        if (contactError && contactError.code !== '23505') {
          // Ignore unique constraint errors, log others
          errors.push(`Contact upsert ${customer.email}: ${contactError.message}`);
        }
      }

      count += batch.length;
    }
  } catch (error: any) {
    errors.push(`Customer sync: ${error.message}`);
  }

  return { count, errors };
}

// =============================================
// SYNC ORDERS
// =============================================

/**
 * daysBack = null → fetch the entire backlog (no date filter).
 * daysBack = number → fetch orders created within the last N days.
 */
async function syncOrdersGraphQL(
  storeConfig: { id: string; organization_id: string; shop_domain: string; access_token: string },
  store: ShopifyStoreConfig,
  daysBack: number | null,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{ count: number; eventsCreated: number; totalRevenue: number; errors: string[]; resumeCursor: string | null }> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let count = 0;
  let eventsCreated = 0;
  let totalRevenue = 0;
  let resumeCursor: string | null = null;

  try {
    // Build the Shopify search query. Two things matter here:
    //
    // 1. `status:any` — by default the orders connection filters to
    //    status:open (= open + cancelled). Closed and archived orders
    //    are HIDDEN. Shopify auto-archives fulfilled orders after a
    //    while, so a healthy store routinely has hundreds of orders
    //    that disappear from this connection unless we explicitly
    //    ask for "any" status. That's why Dr. Melaxin stuck at 530 of
    //    627: the missing 97 are archived. Without this flag every
    //    "Sincronizar tudo" plateaus the same way regardless of how
    //    many times the merchant clicks.
    //
    // 2. `created_at:>=YYYY-MM-DD` — only applied on incremental
    //    syncs (daysBack > 0). When daysBack is null we want every
    //    order ever placed.
    const variables: Record<string, any> = { sortKey: 'CREATED_AT' };
    const queryParts: string[] = ['status:any'];
    if (typeof daysBack === 'number' && daysBack > 0) {
      const sinceDateStr = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];
      queryParts.push(`created_at:>=${sinceDateStr}`);
    }
    variables.query = queryParts.join(' ');

    // Pick up where we left off if a previous run was interrupted before
    // walking every page. The job row keeps last_cursor across attempts;
    // upserting on (store_id, sync_type) keeps things idempotent across
    // re-runs.
    const syncType = daysBack === null ? 'orders_historical' : `orders_${daysBack}d`;
    const { data: existingJob } = await supabase
      .from('shopify_import_jobs')
      .select('id, last_cursor, processed_count, status, config')
      .eq('store_id', store.id)
      .eq('organization_id', store.organization_id)
      .contains('config', { sync_type: syncType })
      .in('status', ['running', 'pending', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let jobId = existingJob?.id || null;
    let startCursor: string | null = existingJob?.last_cursor || null;
    count = existingJob?.processed_count || 0;
    if (startCursor) {
      console.log(`[Sync] Resuming orders sync from cursor=${startCursor.slice(0, 16)}... (${count} already processed)`);
    }

    if (!jobId) {
      const { data: newJob } = await supabase
        .from('shopify_import_jobs')
        .insert({
          store_id: store.id,
          organization_id: store.organization_id,
          status: 'running',
          config: { sync_type: syncType, days_back: daysBack },
          started_at: new Date().toISOString(),
          processed_count: 0,
        })
        .select('id')
        .single();
      jobId = newJob?.id || null;
    } else {
      await supabase
        .from('shopify_import_jobs')
        .update({ status: 'running', last_processed_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    // Pagination budget. 270s leaves a ~30s tail for the finalize
    // writes. The hot loop (Shopify fetch + per-page batch upsert)
    // runs inside onPage, so each page commits before the next
    // network round-trip — a wall-clock kill mid-walk just leaves
    // the cursor at the last fully-committed page.
    const PAGE_BUDGET_MS = 270_000;

    const { lastCursor, reachedDeadline } = await shopifyGraphQLPaginate(
      storeConfig,
      ORDERS_QUERY,
      variables,
      'orders',
      {
        first: 250,
        maxPages: 500,
        startCursor,
        deadlineMs: PAGE_BUDGET_MS,
        onPage: async (page, total, cursor, pageNodes) => {
          onProgress?.('orders', Math.min(page * 3, 90), `${total} orders fetched...`);
          if (pageNodes.length === 0) return;

          // Batch-build the order rows for this page. The previous
          // version upserted one row at a time AFTER paginate
          // returned, so an 804-order sync would do 804 sequential
          // round-trips — Vercel killed it at ~365 every time, and
          // because the job was already marked 'completed' the rest
          // were silently dropped. Now: one upsert per page (≤250
          // rows), inside onPage, BEFORE we advance the cursor.
          const ordersRows = pageNodes.map((order: any) => {
            const orderId = extractShopifyId(order.id);
            const orderValue = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
            const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'BRL';
            totalRevenue += orderValue;
            const lineItems = (order.lineItems?.nodes || []).map((li: any) => ({
              id: li.id ? extractShopifyId(li.id) : null,
              title: li.title,
              quantity: li.quantity,
              price: li.originalUnitPriceSet?.shopMoney?.amount || '0',
              sku: li.sku,
              variant_title: li.variantTitle,
              product_id: li.product?.id ? extractShopifyId(li.product.id) : null,
              variant_id: li.variant?.id ? extractShopifyId(li.variant.id) : null,
            }));
            return {
              store_id: store.id,
              organization_id: store.organization_id,
              shopify_order_id: orderId,
              order_number: order.name?.replace('#', '') || orderId,
              name: order.name,
              email: order.email,
              phone: order.phone,
              total_price: orderValue,
              subtotal_price: parseFloat(order.subtotalPriceSet?.shopMoney?.amount || '0'),
              total_tax: parseFloat(order.totalTaxSet?.shopMoney?.amount || '0'),
              total_discounts: parseFloat(order.totalDiscountsSet?.shopMoney?.amount || '0'),
              total_refunded: parseFloat(order.totalRefundedSet?.shopMoney?.amount || '0'),
              currency,
              financial_status: (order.displayFinancialStatus || 'pending').toLowerCase(),
              fulfillment_status: order.displayFulfillmentStatus ? order.displayFulfillmentStatus.toLowerCase() : null,
              payment_gateway_names: order.paymentGatewayNames || [],
              customer_id: order.customer?.id ? extractShopifyId(order.customer.id) : null,
              line_items: lineItems,
              shipping_address: order.shippingAddress || null,
              billing_address: order.billingAddress || null,
              created_at: order.createdAt,
              updated_at: new Date().toISOString(),
            };
          });

          const { error: upErr } = await supabase
            .from('shopify_orders')
            .upsert(ordersRows, { onConflict: 'store_id,shopify_order_id' });
          if (upErr) {
            errors.push(`Page ${page} upsert: ${upErr.message}`);
            console.error(`[Sync] Order page ${page} upsert failed:`, upErr.message);
            return;
          }

          count += pageNodes.length;

          // Persist cursor + processed_count AFTER the upsert
          // succeeded. If we crash here, the cursor still points at
          // the page we just successfully committed, and the next
          // run picks up from there.
          if (jobId) {
            await supabase
              .from('shopify_import_jobs')
              .update({
                last_cursor: cursor,
                processed_count: count,
                current_page: page,
                last_processed_at: new Date().toISOString(),
              })
              .eq('id', jobId);
          }
        },
      }
    );

    // Final job state: completed if we reached the end of the
    // connection, paused if we hit the deadline. By the time we get
    // here every order pulled from Shopify is already in
    // shopify_orders — so processed_count and total_orders both
    // reflect the same number.
    if (jobId) {
      await supabase
        .from('shopify_import_jobs')
        .update({
          status: reachedDeadline ? 'paused' : 'completed',
          last_cursor: lastCursor,
          completed_at: reachedDeadline ? null : new Date().toISOString(),
          processed_count: count,
        })
        .eq('id', jobId);
    }
    if (reachedDeadline) {
      console.warn(`[Sync] Orders sync paused at ${count} cumulative, cursor=${lastCursor?.slice(0, 16)}... Next run will resume.`);
      resumeCursor = lastCursor;
    }

    // CDP placed_order events are intentionally NOT created during
    // historical backfill. They added one createEvent() round-trip
    // per order on top of the upsert — the slow path that made the
    // function time out before all orders were committed. Live
    // orders still get the event via the orders/create webhook
    // (with the same `placed_order:${orderId}` idempotency key, so
    // there's no duplication if we ever add a historical-events
    // backfill later).
  } catch (error: any) {
    errors.push(`Order sync: ${error.message}`);
  }

  return { count, eventsCreated, totalRevenue, errors, resumeCursor };
}

// =============================================
// SYNC PRODUCTS
// =============================================

async function syncProductsGraphQL(
  storeConfig: { id: string; organization_id: string; shop_domain: string; access_token: string },
  store: ShopifyStoreConfig,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{ count: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let count = 0;

  try {
    const { nodes } = await shopifyGraphQLPaginate(
      storeConfig,
      PRODUCTS_QUERY,
      { sortKey: 'UPDATED_AT' },
      'products',
      {
        first: 250,
        maxPages: 200,
        onPage: (page, total) => {
          onProgress?.('products', Math.min(page * 5, 90), `${total} products fetched...`);
        },
      }
    );

    console.log(`[GraphQLSync] Products fetched from Shopify: ${nodes.length}`);

    for (let i = 0; i < nodes.length; i += 50) {
      const batch = nodes.slice(i, i + 50);

      const products = batch.map((p: any) => {
        // Variantes na forma que a disponibilidade e o webhook de
        // estoque leem (política, controle, inventory_item_id).
        const variants = (p.variants?.nodes || []).map(normalizeSyncedVariant);

        const mainVariant = variants[0] || {};
        // `available` é o que os feeds usam para não oferecer produto
        // esgotado; `inventory_quantity` soma só as variantes controladas.
        const availability = computeProductAvailability(variants);

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
          price: parseFloat(mainVariant.price || '0'),
          compare_at_price: mainVariant.compare_at_price ? parseFloat(mainVariant.compare_at_price) : null,
          sku: mainVariant.sku || null,
          inventory_quantity: availability.inventoryQuantity ?? (p.totalInventory || 0),
          available: availability.available,
          variants,
          images: (p.images?.nodes || []).map((img: any) => ({ url: img.url, alt: img.altText })),
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        };
      });

      console.log(`[GraphQLSync] Upserting ${products.length} products (batch ${i})...`);

      const { error } = await supabase
        .from('shopify_products')
        .upsert(products, { onConflict: 'store_id,shopify_product_id' });

      if (error) {
        console.error(`[GraphQLSync] Product upsert error:`, error.message, error.code);
        errors.push(`Product batch ${i}: ${error.message}`);
      } else {
        console.log(`[GraphQLSync] Product batch ${i} upserted successfully`);
      }
      count += batch.length;
    }
  } catch (error: any) {
    console.error(`[GraphQLSync] Product sync fatal error:`, error.message);
    errors.push(`Product sync: ${error.message}`);
  }

  return { count, errors };
}

// =============================================
// UPDATE CONTACT METRICS
// =============================================

async function updateContactMetrics(store: ShopifyStoreConfig): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Original implementation iterated every contact and did one
  // SELECT + one UPDATE serially. On Dr. Melaxin (22k contacts) that
  // was 44k round-trips and Vercel killed the function every time —
  // before reaching the sync_logs completion write, so the merchant
  // saw "running" forever and the orders sync looked successful
  // (lines wrote shopify_stores.last_sync_at before this function
  // ran). Single SQL pass via a Postgres RPC: aggregate
  // shopify_orders per email, join contacts in the same statement,
  // update in one query. The RPC fallback path keeps something
  // running even on projects that haven't applied the migration yet.
  try {
    const { error: rpcErr } = await supabase.rpc('refresh_contact_order_metrics', {
      p_store_id: store.id,
      p_organization_id: store.organization_id,
    });
    if (rpcErr) {
      // RPC not yet deployed → log and skip. The sync itself still
      // succeeded; only the contact-side aggregates are stale. Next
      // run of the daily sync-financials cron will fill them.
      console.warn('[GraphQLSync] refresh_contact_order_metrics RPC unavailable:', rpcErr.message);
      return;
    }
    console.log('[GraphQLSync] Refreshed contact metrics for store', store.id);
  } catch (error: any) {
    console.error('[GraphQLSync] Failed to refresh contact metrics:', error?.message);
  }
}
