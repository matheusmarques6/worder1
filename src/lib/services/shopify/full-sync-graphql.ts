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

// =============================================
// TYPES
// =============================================

export interface GraphQLSyncOptions {
  syncCustomers?: boolean;
  syncOrders?: boolean;
  syncProducts?: boolean;
  ordersDaysBack?: number;
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
      onProgress?.('orders', 0, 'Syncing orders via GraphQL...');
      const orderResult = await syncOrdersGraphQL(storeConfig, store, ordersDaysBack, onProgress);
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
    // Update store
    await supabase
      .from('shopify_stores')
      .update({
        initial_sync_completed: true,
        total_orders: result.ordersCount,
        total_revenue: result.totalRevenue,
        total_customers: result.customersCount,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', store.id);

    // Update contact metrics
    await updateContactMetrics(store);

    result.success = result.errors.length === 0;
    result.durationMs = Date.now() - startTime;

    // Update sync log
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
        first: 50,
        maxPages: 100,
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

async function syncOrdersGraphQL(
  storeConfig: { id: string; organization_id: string; shop_domain: string; access_token: string },
  store: ShopifyStoreConfig,
  daysBack: number,
  onProgress?: (stage: string, progress: number, message: string) => void
): Promise<{ count: number; eventsCreated: number; totalRevenue: number; errors: string[] }> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let count = 0;
  let eventsCreated = 0;
  let totalRevenue = 0;

  try {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    const { nodes } = await shopifyGraphQLPaginate(
      storeConfig,
      ORDERS_QUERY,
      { query: `created_at:>'${sinceDate}'`, sortKey: 'CREATED_AT' },
      'orders',
      {
        first: 50,
        maxPages: 200,
        onPage: (page, total) => {
          onProgress?.('orders', Math.min(page * 3, 90), `${total} orders fetched...`);
        },
      }
    );

    for (const order of nodes) {
      const orderId = extractShopifyId(order.id);
      const orderValue = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
      const currency = order.totalPriceSet?.shopMoney?.currencyCode || 'BRL';
      totalRevenue += orderValue;

      // Transform line items
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

      // Upsert order
      const { error } = await supabase
        .from('shopify_orders')
        .upsert({
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
          currency,
          financial_status: (order.financialStatus || 'pending').toLowerCase(),
          fulfillment_status: order.fulfillmentStatus ? order.fulfillmentStatus.toLowerCase() : null,
          customer_id: order.customer?.id ? extractShopifyId(order.customer.id) : null,
          line_items: lineItems,
          shipping_address: order.shippingAddress || null,
          billing_address: order.billingAddress || null,
          created_at: order.createdAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'store_id,shopify_order_id' });

      if (error) {
        errors.push(`Order ${orderId}: ${error.message}`);
      }

      // Find contact for this order
      let contactId: string | null = null;
      if (order.email) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', store.organization_id)
          .ilike('email', order.email)
          .maybeSingle();
        contactId = contact?.id || null;
      }

      // Create CDP event for historical order
      try {
        await createEvent({
          organization_id: store.organization_id,
          contact_id: contactId,
          store_id: store.id,
          event_type: WORDER_SHOPIFY_EVENTS.PLACED_ORDER,
          event_source: EVENT_SOURCES.GRAPHQL_SYNC,
          properties: {
            order_id: orderId,
            order_number: order.name || orderId,
            total_price: orderValue,
            currency,
            financial_status: (order.financialStatus || 'pending').toLowerCase(),
            fulfillment_status: order.fulfillmentStatus?.toLowerCase() || null,
            item_count: lineItems.length,
            items: lineItems.map((li: any) => ({
              product_id: li.product_id,
              title: li.title,
              quantity: li.quantity,
              price: parseFloat(li.price || '0'),
              sku: li.sku,
            })),
          },
          monetary_value: orderValue,
          currency,
          shopify_resource_id: orderId,
          shopify_resource_type: 'order',
          occurred_at: order.createdAt,
          idempotency_key: `placed_order:${orderId}`,
        });
        eventsCreated++;
      } catch {
        // Idempotency — event may already exist
      }

      count++;
    }
  } catch (error: any) {
    errors.push(`Order sync: ${error.message}`);
  }

  return { count, eventsCreated, totalRevenue, errors };
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
        first: 50,
        maxPages: 100,
        onPage: (page, total) => {
          onProgress?.('products', Math.min(page * 5, 90), `${total} products fetched...`);
        },
      }
    );

    for (let i = 0; i < nodes.length; i += 50) {
      const batch = nodes.slice(i, i + 50);

      const products = batch.map((p: any) => {
        const variants = (p.variants?.nodes || []).map((v: any) => ({
          id: extractShopifyId(v.id),
          title: v.title,
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compareAtPrice,
          inventory_quantity: v.inventoryQuantity,
          barcode: v.barcode,
        }));

        const mainVariant = variants[0] || {};

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
          inventory_quantity: p.totalInventory || 0,
          variants,
          images: (p.images?.nodes || []).map((img: any) => ({ url: img.url, alt: img.altText })),
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        };
      });

      const { error } = await supabase
        .from('shopify_products')
        .upsert(products, { onConflict: 'store_id,shopify_product_id' });

      if (error) errors.push(`Product batch ${i}: ${error.message}`);
      count += batch.length;
    }
  } catch (error: any) {
    errors.push(`Product sync: ${error.message}`);
  }

  return { count, errors };
}

// =============================================
// UPDATE CONTACT METRICS
// =============================================

async function updateContactMetrics(store: ShopifyStoreConfig): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // Get all contacts with orders for this org
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('organization_id', store.organization_id)
      .not('shopify_customer_id', 'is', null);

    if (!contacts?.length) return;

    for (const contact of contacts) {
      if (!contact.email) continue;

      // Calculate metrics from orders
      const { data: orders } = await supabase
        .from('shopify_orders')
        .select('total_price, created_at, financial_status')
        .eq('store_id', store.id)
        .ilike('email', contact.email);

      if (!orders?.length) continue;

      const paidOrders = orders.filter((o) =>
        ['paid', 'partially_paid', 'refunded', 'partially_refunded'].includes(o.financial_status || '')
      );

      const totalOrders = paidOrders.length;
      const totalSpent = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      // Sort by date to find first and last order
      const sortedOrders = orders.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const firstOrderAt = sortedOrders[0]?.created_at;
      const lastOrderAt = sortedOrders[sortedOrders.length - 1]?.created_at;
      const daysSinceLastOrder = lastOrderAt
        ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / (24 * 60 * 60 * 1000))
        : null;

      // Determine lifecycle stage
      let lifecycleStage = 'subscriber';
      if (totalOrders >= 5) lifecycleStage = 'vip';
      else if (totalOrders >= 2) lifecycleStage = 'repeat_customer';
      else if (totalOrders >= 1) lifecycleStage = 'customer';

      await supabase
        .from('contacts')
        .update({
          total_orders: totalOrders,
          total_spent: totalSpent,
          average_order_value: avgOrderValue,
          first_order_at: firstOrderAt,
          last_order_at: lastOrderAt,
          days_since_last_order: daysSinceLastOrder,
          lifecycle_stage: lifecycleStage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id);
    }

    console.log(`[GraphQLSync] Updated metrics for ${contacts.length} contacts`);
  } catch (error) {
    console.error('[GraphQLSync] Failed to update contact metrics:', error);
  }
}
