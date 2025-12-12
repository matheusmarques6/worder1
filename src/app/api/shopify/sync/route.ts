import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

const SHOPIFY_API_VERSION = '2024-10';

// ============================================
// FETCH COM TIMEOUT
// ============================================
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Timeout após ${timeoutMs/1000}s`);
    }
    throw error;
  }
}

// ============================================
// SHOPIFY API HELPER
// ============================================
async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string): Promise<{
  data: any;
  nextPageUrl: string | null;
}> {
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  
  console.log(`[Shopify] Fetching: ${url.substring(0, 80)}...`);
  
  const response = await fetchWithTimeout(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  }, 15000);

  if (response.status === 429) {
    console.log('[Shopify] Rate limited, waiting 2s...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    return shopifyFetch(shopDomain, accessToken, endpoint);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API (${response.status}): ${error.substring(0, 200)}`);
  }

  const linkHeader = response.headers.get('Link');
  let nextPageUrl: string | null = null;
  
  if (linkHeader) {
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      nextPageUrl = nextMatch[1];
    }
  }

  const data = await response.json();
  return { data, nextPageUrl };
}

// ============================================
// SYNC ORDERS
// ============================================
async function syncOrdersSimple(storeId: string, shopDomain: string, accessToken: string): Promise<{
  count: number;
  revenue: number;
  paidCount: number;
  error?: string;
}> {
  console.log(`[Sync] Starting sync for store: ${shopDomain}`);
  
  let allOrders: any[] = [];
  let nextUrl: string | null = `/orders.json?status=any&limit=250`;
  let pageCount = 0;
  const maxPages = 10; // 2500 pedidos max

  while (nextUrl && pageCount < maxPages) {
    pageCount++;
    console.log(`[Sync] Fetching page ${pageCount}...`);
    
    try {
      const { data, nextPageUrl } = await shopifyFetch(shopDomain, accessToken, nextUrl);
      const orders = data.orders || [];
      
      console.log(`[Sync] Page ${pageCount}: ${orders.length} orders`);
      
      if (orders.length === 0) break;
      
      allOrders = [...allOrders, ...orders];
      nextUrl = nextPageUrl;
      
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error: any) {
      console.error(`[Sync] Error on page ${pageCount}:`, error.message);
      break;
    }
  }

  console.log(`[Sync] Total orders fetched: ${allOrders.length}`);

  if (allOrders.length === 0) {
    return { count: 0, revenue: 0, paidCount: 0, error: 'Nenhum pedido encontrado no Shopify' };
  }

  // Analyze
  let paidCount = 0;
  let paidRevenue = 0;

  allOrders.forEach(order => {
    const price = parseFloat(order.total_price || '0');
    if (['paid', 'partially_paid'].includes(order.financial_status)) {
      paidCount++;
      paidRevenue += price;
    }
  });

  console.log(`[Sync] Analysis: ${paidCount} paid orders, R$ ${paidRevenue.toFixed(2)} revenue`);

  // Clear existing orders
  console.log(`[Sync] Deleting existing orders for store ${storeId}...`);
  const { error: deleteError } = await supabase
    .from('shopify_orders')
    .delete()
    .eq('store_id', storeId);

  if (deleteError) {
    console.error(`[Sync] Delete error:`, deleteError);
    return { count: allOrders.length, revenue: paidRevenue, paidCount, error: `Erro ao limpar pedidos: ${deleteError.message}` };
  }

  // Prepare orders for insert
  const ordersToInsert = allOrders.map((order: any) => ({
    store_id: storeId,
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
    line_items: order.line_items || [],
    shipping_address: order.shipping_address || null,
    billing_address: order.billing_address || null,
    processed_at: order.processed_at || order.created_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
    cancelled_at: order.cancelled_at || null,
    closed_at: order.closed_at || null,
  }));

  // Insert in batches with error handling
  let insertedCount = 0;
  let insertErrors: string[] = [];

  for (let i = 0; i < ordersToInsert.length; i += 100) {
    const batch = ordersToInsert.slice(i, i + 100);
    const batchNum = Math.floor(i / 100) + 1;
    
    console.log(`[Sync] Inserting batch ${batchNum} (${batch.length} orders)...`);
    
    const { data: insertedData, error: insertError } = await supabase
      .from('shopify_orders')
      .insert(batch)
      .select('id');

    if (insertError) {
      console.error(`[Sync] Batch ${batchNum} error:`, insertError.message);
      insertErrors.push(`Batch ${batchNum}: ${insertError.message}`);
      
      // Try inserting one by one to find problematic order
      console.log(`[Sync] Trying individual inserts for batch ${batchNum}...`);
      for (const order of batch) {
        const { error: singleError } = await supabase
          .from('shopify_orders')
          .insert(order);
        
        if (!singleError) {
          insertedCount++;
        } else {
          console.error(`[Sync] Failed order ${order.shopify_order_id}:`, singleError.message);
        }
      }
    } else {
      insertedCount += batch.length;
      console.log(`[Sync] Batch ${batchNum} inserted successfully`);
    }
  }

  console.log(`[Sync] Total inserted: ${insertedCount}/${allOrders.length}`);

  // Verify insertion
  const { count: verifyCount } = await supabase
    .from('shopify_orders')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId);

  console.log(`[Sync] Verified in database: ${verifyCount} orders`);

  if (insertErrors.length > 0) {
    return { 
      count: insertedCount, 
      revenue: paidRevenue, 
      paidCount, 
      error: `Inseridos ${insertedCount}/${allOrders.length}. Erros: ${insertErrors.join('; ')}`
    };
  }

  return { count: insertedCount, revenue: paidRevenue, paidCount };
}

// ============================================
// POST - Sync endpoint
// ============================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('\n========== SHOPIFY SYNC STARTED ==========\n');
    
    // Get stores
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name')
      .eq('is_active', true);

    if (storesError) {
      console.error('[Sync] Error fetching stores:', storesError);
      return NextResponse.json({ success: false, error: storesError.message }, { status: 500 });
    }
    
    if (!stores || stores.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nenhuma loja conectada. Vá em Configurações > Integrações.' 
      }, { status: 404 });
    }

    console.log(`[Sync] Found ${stores.length} store(s)`);

    const results = [];

    for (const store of stores) {
      try {
        if (!store.access_token) {
          throw new Error('Token de acesso não encontrado');
        }

        console.log(`\n[Sync] Processing: ${store.shop_name} (${store.shop_domain})`);
        
        const ordersResult = await syncOrdersSimple(store.id, store.shop_domain, store.access_token);

        // Update store stats
        await supabase
          .from('shopify_stores')
          .update({
            total_orders: ordersResult.count,
            total_revenue: ordersResult.revenue,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', store.id);

        results.push({
          storeId: store.id,
          storeName: store.shop_name,
          success: !ordersResult.error,
          orders: ordersResult.count,
          paidOrders: ordersResult.paidCount,
          revenue: ordersResult.revenue,
          error: ordersResult.error,
        });
        
      } catch (err: any) {
        console.error(`[Sync] Store error:`, err.message);
        results.push({
          storeId: store.id,
          storeName: store.shop_name,
          success: false,
          error: err.message,
        });
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalOrders = results.reduce((sum, r) => sum + (r.orders || 0), 0);
    const totalRevenue = results.reduce((sum, r) => sum + (r.revenue || 0), 0);
    const successCount = results.filter(r => r.success).length;

    console.log('\n========== SYNC COMPLETED ==========');
    console.log(`Time: ${totalTime}s`);
    console.log(`Orders: ${totalOrders}`);
    console.log(`Revenue: R$ ${totalRevenue.toFixed(2)}`);
    console.log('=====================================\n');

    return NextResponse.json({
      success: successCount > 0,
      message: successCount > 0 
        ? `Sincronização concluída! ${totalOrders} pedidos importados.`
        : `Erro na sincronização: ${results[0]?.error || 'Erro desconhecido'}`,
      totalOrders,
      totalRevenue,
      timeSeconds: parseFloat(totalTime),
      results,
    });
    
  } catch (error: any) {
    console.error('[Sync] Fatal error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ============================================
// GET - Status
// ============================================
export async function GET(request: NextRequest) {
  try {
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, shop_name, total_orders, total_revenue, last_sync_at, is_active')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    if (!stores || stores.length === 0) {
      return NextResponse.json({ success: true, stores: [], hasStores: false });
    }

    const storeStats = await Promise.all(stores.map(async (store) => {
      const { count } = await supabase
        .from('shopify_orders')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id);

      const { data: revenueData } = await supabase
        .from('shopify_orders')
        .select('total_price')
        .eq('store_id', store.id)
        .in('financial_status', ['paid', 'partially_paid']);

      const dbRevenue = (revenueData || []).reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);

      return {
        id: store.id,
        name: store.shop_name,
        domain: store.shop_domain,
        ordersInDb: count || 0,
        revenueInDb: dbRevenue,
        lastSync: store.last_sync_at,
      };
    }));

    return NextResponse.json({ success: true, stores: storeStats, hasStores: true });
    
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
