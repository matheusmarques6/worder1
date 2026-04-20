// =============================================
// Shopify Full Sync Service
// src/lib/services/shopify/full-sync.ts
//
// Orquestrador de sincronização completa:
// - Products → Customers → Orders → Checkouts
// - Batch upserts
// - Logs de progresso
// - Métricas calculadas
// =============================================

import { createClient } from '@supabase/supabase-js';
import { ShopifyAPIClient, createShopifyClient, ShopifyStore } from './api-client';

// =============================================
// TYPES
// =============================================

export interface SyncOptions {
  syncProducts?: boolean;
  syncCustomers?: boolean;
  syncOrders?: boolean;
  syncCheckouts?: boolean;
  syncLocations?: boolean;
  onProgress?: (stage: string, progress: number, message: string) => void;
}

export interface SyncResult {
  success: boolean;
  storeId: string;
  organizationId: string;
  
  // Counts
  ordersCount: number;
  customersCount: number;
  productsCount: number;
  checkoutsCount: number;
  locationsCount: number;
  
  // Metrics
  totalRevenue: number;
  paidOrdersCount: number;
  averageOrderValue: number;
  recurringCustomerRate: number;
  
  // Performance
  durationMs: number;
  rateLimitHits: number;
  
  // Errors
  errors: string[];
}

interface SyncLogEntry {
  store_id: string;
  organization_id: string;
  sync_type: string;
  entity_type: string;
  status: string;
  started_at: string;
  items_processed: number;
  items_created: number;
  items_updated: number;
  error_message?: string;
}

// =============================================
// SUPABASE CLIENT (Service Role)
// =============================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// =============================================
// BATCH UPSERT HELPER
// =============================================

async function batchUpsert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  data: any[],
  conflictColumn: string,
  batchSize: number = 50
): Promise<{ created: number; updated: number; errors: string[] }> {
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from(table)
      .upsert(batch, { 
        onConflict: conflictColumn,
        ignoreDuplicates: false 
      });

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`);
    } else {
      // Upsert doesn't tell us created vs updated, assume all are updates for existing
      updated += batch.length;
    }
  }

  return { created, updated, errors };
}

// =============================================
// SYNC LOG HELPERS
// =============================================

async function createSyncLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  storeId: string,
  organizationId: string,
  syncType: string,
  entityType: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('shopify_sync_logs')
    .insert({
      store_id: storeId,
      organization_id: organizationId,
      sync_type: syncType,
      entity_type: entityType,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Sync] Error creating log:', error);
    return null;
  }

  return data?.id || null;
}

async function updateSyncLog(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  logId: string,
  updates: Partial<SyncLogEntry> & { 
    completed_at?: string; 
    items_failed?: number;
    error_details?: any;
  }
): Promise<void> {
  await supabase
    .from('shopify_sync_logs')
    .update(updates)
    .eq('id', logId);
}

// =============================================
// TRANSFORM FUNCTIONS
// =============================================

function transformOrder(order: any, storeId: string, organizationId: string) {
  return {
    store_id: storeId,
    organization_id: organizationId,
    shopify_order_id: order.id.toString(),
    order_number: order.order_number || 0,
    name: order.name || `#${order.order_number}`,
    email: order.email || order.contact_email || null,
    phone: order.phone || null,
    total_price: parseFloat(order.total_price || '0'),
    subtotal_price: parseFloat(order.subtotal_price || '0'),
    total_tax: parseFloat(order.total_tax || '0'),
    total_discounts: parseFloat(order.total_discounts || '0'),
    total_shipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0'),
    currency: order.currency || 'BRL',
    financial_status: order.financial_status || 'pending',
    fulfillment_status: order.fulfillment_status || null,
    customer_id: order.customer?.id?.toString() || null,
    customer_email: order.customer?.email || null,
    customer_first_name: order.customer?.first_name || null,
    customer_last_name: order.customer?.last_name || null,
    source_name: order.source_name || 'web',
    payment_gateway_names: order.payment_gateway_names || [],
    line_items: order.line_items || [],
    refunds: order.refunds || [],
    shipping_address: order.shipping_address || null,
    billing_address: order.billing_address || null,
    processed_at: order.processed_at || order.created_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
    cancelled_at: order.cancelled_at || null,
    closed_at: order.closed_at || null,
  };
}

function transformCustomer(customer: any, storeId: string, organizationId: string) {
  return {
    store_id: storeId,
    organization_id: organizationId,
    shopify_customer_id: customer.id.toString(),
    email: customer.email || null,
    phone: customer.phone || null,
    first_name: customer.first_name || null,
    last_name: customer.last_name || null,
    orders_count: customer.orders_count || 0,
    total_spent: parseFloat(customer.total_spent || '0'),
    currency: customer.currency || 'BRL',
    tags: customer.tags || '',
    accepts_marketing: customer.accepts_marketing || false,
    verified_email: customer.verified_email || false,
    default_address: customer.default_address || null,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
  };
}

function transformProduct(product: any, storeId: string, organizationId: string) {
  const mainVariant = product.variants?.[0] || {};
  
  return {
    store_id: storeId,
    organization_id: organizationId,
    shopify_product_id: product.id.toString(),
    title: product.title || 'Untitled',
    handle: product.handle || null,
    vendor: product.vendor || null,
    product_type: product.product_type || null,
    status: product.status || 'active',
    tags: product.tags || '',
    price: parseFloat(mainVariant.price || '0'),
    compare_at_price: mainVariant.compare_at_price ? parseFloat(mainVariant.compare_at_price) : null,
    sku: mainVariant.sku || null,
    inventory_quantity: mainVariant.inventory_quantity || 0,
    variants: product.variants || [],
    images: product.images || [],
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

function transformCheckout(checkout: any, storeId: string, organizationId: string) {
  return {
    store_id: storeId,
    organization_id: organizationId,
    shopify_checkout_id: checkout.id?.toString() || checkout.token,
    shopify_checkout_token: checkout.token || null,
    email: checkout.email || null,
    phone: checkout.phone || null,
    customer_shopify_id: checkout.customer?.id?.toString() || null,
    total_price: parseFloat(checkout.total_price || '0'),
    subtotal_price: parseFloat(checkout.subtotal_price || '0'),
    total_tax: parseFloat(checkout.total_tax || '0'),
    total_discounts: parseFloat(checkout.total_discounts || '0'),
    currency: checkout.currency || 'BRL',
    line_items: checkout.line_items || [],
    recovery_url: checkout.abandoned_checkout_url || null,
    status: 'abandoned', // Checkouts from API are abandoned
    shopify_created_at: checkout.created_at,
    abandoned_at: checkout.created_at, // Use created_at as abandoned_at
  };
}

function transformLocation(location: any, storeId: string, organizationId: string) {
  return {
    store_id: storeId,
    organization_id: organizationId,
    shopify_location_id: location.id.toString(),
    name: location.name || 'Unknown',
    address1: location.address1 || null,
    address2: location.address2 || null,
    city: location.city || null,
    province: location.province || null,
    country: location.country || null,
    zip: location.zip || null,
    phone: location.phone || null,
    is_active: location.active !== false,
    is_primary: location.legacy === false,
    legacy: location.legacy || false,
  };
}

// =============================================
// METRICS CALCULATION
// =============================================

function calculateMetrics(orders: any[]) {
  // Filter paid orders
  const paidOrders = orders.filter(o => 
    ['paid', 'partially_paid', 'refunded', 'partially_refunded'].includes(o.financial_status)
  );

  // Calculate totals
  let totalRevenue = 0;
  const customerOrderCount: Record<string, number> = {};

  paidOrders.forEach(order => {
    totalRevenue += parseFloat(order.total_price || '0');
    
    const email = order.email || order.customer?.email;
    if (email) {
      customerOrderCount[email] = (customerOrderCount[email] || 0) + 1;
    }
  });

  // Recurring customers
  const totalCustomers = Object.keys(customerOrderCount).length;
  const recurringCustomers = Object.values(customerOrderCount).filter(count => count > 1).length;
  const recurringCustomerRate = totalCustomers > 0 ? (recurringCustomers / totalCustomers) * 100 : 0;

  // Average order value
  const averageOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

  return {
    totalRevenue,
    paidOrdersCount: paidOrders.length,
    averageOrderValue,
    recurringCustomerRate,
    totalCustomers,
    recurringCustomers,
  };
}

// =============================================
// MAIN SYNC FUNCTION
// =============================================

export async function runFullSync(
  store: ShopifyStore,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  
  const {
    syncProducts = true,
    syncCustomers = true,
    syncOrders = true,
    syncCheckouts = true,
    syncLocations = true,
    onProgress,
  } = options;

  const supabase = getSupabaseAdmin();
  const client = createShopifyClient(store);
  const { storeId, organizationId } = client.getStoreInfo();

  // Create main sync log
  const mainLogId = await createSyncLog(supabase, storeId, organizationId, 'full_sync', 'all');

  const result: SyncResult = {
    success: false,
    storeId,
    organizationId,
    ordersCount: 0,
    customersCount: 0,
    productsCount: 0,
    checkoutsCount: 0,
    locationsCount: 0,
    totalRevenue: 0,
    paidOrdersCount: 0,
    averageOrderValue: 0,
    recurringCustomerRate: 0,
    durationMs: 0,
    rateLimitHits: 0,
    errors: [],
  };

  try {
    // ========== LOCATIONS ==========
    if (syncLocations) {
      onProgress?.('locations', 0, 'Sincronizando localizações...');
      
      const { data: locations } = await client.fetchLocations();
      
      if (locations.length > 0) {
        const transformedLocations = locations.map(l => transformLocation(l, storeId, organizationId));
        const { errors: locErrors } = await batchUpsert(
          supabase, 
          'shopify_locations', 
          transformedLocations, 
          'store_id,shopify_location_id'
        );
        errors.push(...locErrors);
        result.locationsCount = locations.length;
      }
      
      onProgress?.('locations', 100, `${locations.length} localizações sincronizadas`);
    }

    // ========== PRODUCTS ==========
    if (syncProducts) {
      onProgress?.('products', 0, 'Sincronizando produtos...');
      
      const { data: products } = await client.fetchProducts(
        { status: 'active' },
        {
          onProgress: (page, count) => {
            onProgress?.('products', Math.min(page * 10, 90), `${count} produtos...`);
          },
        }
      );
      
      if (products.length > 0) {
        const transformedProducts = products.map(p => transformProduct(p, storeId, organizationId));
        const { errors: prodErrors } = await batchUpsert(
          supabase, 
          'shopify_products', 
          transformedProducts, 
          'store_id,shopify_product_id'
        );
        errors.push(...prodErrors);
        result.productsCount = products.length;
      }
      
      onProgress?.('products', 100, `${products.length} produtos sincronizados`);
    }

    // ========== CUSTOMERS ==========
    if (syncCustomers) {
      onProgress?.('customers', 0, 'Sincronizando clientes...');
      
      const { data: customers } = await client.fetchCustomers(
        undefined,
        {
          onProgress: (page, count) => {
            onProgress?.('customers', Math.min(page * 10, 90), `${count} clientes...`);
          },
        }
      );
      
      if (customers.length > 0) {
        const transformedCustomers = customers.map(c => transformCustomer(c, storeId, organizationId));
        const { errors: custErrors } = await batchUpsert(
          supabase, 
          'shopify_customers', 
          transformedCustomers, 
          'store_id,shopify_customer_id'
        );
        errors.push(...custErrors);
        result.customersCount = customers.length;
      }
      
      onProgress?.('customers', 100, `${customers.length} clientes sincronizados`);
    }

    // ========== ORDERS ==========
    if (syncOrders) {
      onProgress?.('orders', 0, 'Sincronizando pedidos...');
      
      const { data: orders } = await client.fetchOrders(
        undefined,
        {
          onProgress: (page, count) => {
            onProgress?.('orders', Math.min(page * 10, 90), `${count} pedidos...`);
          },
        }
      );
      
      if (orders.length > 0) {
        const transformedOrders = orders.map(o => transformOrder(o, storeId, organizationId));
        const { errors: orderErrors } = await batchUpsert(
          supabase, 
          'shopify_orders', 
          transformedOrders, 
          'store_id,shopify_order_id'
        );
        errors.push(...orderErrors);
        result.ordersCount = orders.length;

        // Calculate metrics
        const metrics = calculateMetrics(orders);
        result.totalRevenue = metrics.totalRevenue;
        result.paidOrdersCount = metrics.paidOrdersCount;
        result.averageOrderValue = metrics.averageOrderValue;
        result.recurringCustomerRate = metrics.recurringCustomerRate;
      }
      
      onProgress?.('orders', 100, `${orders.length} pedidos sincronizados`);
    }

    // ========== CHECKOUTS ==========
    if (syncCheckouts) {
      onProgress?.('checkouts', 0, 'Sincronizando checkouts abandonados...');
      
      const { data: checkouts } = await client.fetchAbandonedCheckouts(
        undefined,
        { maxPages: 10 }
      );
      
      if (checkouts.length > 0) {
        const transformedCheckouts = checkouts.map(c => transformCheckout(c, storeId, organizationId));
        const { errors: checkErrors } = await batchUpsert(
          supabase, 
          'shopify_checkouts', 
          transformedCheckouts, 
          'store_id,shopify_checkout_id'
        );
        errors.push(...checkErrors);
        result.checkoutsCount = checkouts.length;
      }
      
      onProgress?.('checkouts', 100, `${checkouts.length} checkouts sincronizados`);
    }

    // ========== UPDATE STORE STATS ==========
    onProgress?.('finalizing', 90, 'Atualizando estatísticas da loja...');

    await supabase
      .from('shopify_stores')
      .update({
        total_orders: result.ordersCount,
        total_revenue: result.totalRevenue,
        total_customers: result.customersCount,
        last_sync_at: new Date().toISOString(),
        metrics: {
          paidOrdersCount: result.paidOrdersCount,
          averageOrderValue: result.averageOrderValue,
          recurringCustomerRate: result.recurringCustomerRate,
          productsCount: result.productsCount,
          checkoutsCount: result.checkoutsCount,
          locationsCount: result.locationsCount,
        },
      })
      .eq('id', storeId);

    // ========== FINALIZE ==========
    result.success = errors.length === 0;
    result.errors = errors;
    result.durationMs = Date.now() - startTime;
    result.rateLimitHits = client.getRateLimitHits();

    // Update sync log
    if (mainLogId) {
      await updateSyncLog(supabase, mainLogId, {
        status: result.success ? 'completed' : 'completed_with_errors',
        completed_at: new Date().toISOString(),
        items_processed: result.ordersCount + result.customersCount + result.productsCount,
        items_created: 0,
        items_updated: result.ordersCount + result.customersCount + result.productsCount,
        items_failed: errors.length,
        error_message: errors.length > 0 ? errors.join('; ') : undefined,
      });
    }

    onProgress?.('done', 100, 'Sincronização concluída!');

    return result;

  } catch (error: any) {
    console.error('[FullSync] Error:', error);
    
    result.success = false;
    result.errors = [error.message];
    result.durationMs = Date.now() - startTime;
    result.rateLimitHits = client.getRateLimitHits();

    // Update sync log with error
    if (mainLogId) {
      await updateSyncLog(supabase, mainLogId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message,
        error_details: { stack: error.stack },
      });
    }

    return result;
  }
}

// =============================================
// INCREMENTAL SYNC (for cron jobs)
// =============================================

export async function runIncrementalSync(
  store: ShopifyStore,
  since: Date,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const sinceIso = since.toISOString();
  
  // Modify fetch params to only get recent data
  const client = createShopifyClient(store);
  
  return runFullSync(store, {
    ...options,
    syncLocations: false, // Locations don't change often
    syncProducts: false, // Products sync separately
  });
}
