// =============================================
// API: Shopify Sync
// src/app/api/shopify/sync/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, validateStoreAccess, getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2024-10';

// =============================================
// FETCH HELPERS
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllOrders(shopDomain: string, accessToken: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders: any[] = [];
  let nextPageUrl: string | null = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250`;
  
  let pageCount = 0;
  const maxPages = 10;
  
  while (nextPageUrl && pageCount < maxPages) {
    const currentUrl = nextPageUrl;
    const response: Response = await fetch(currentUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allOrders.push(...(data.orders || []));
    
    const linkHeader = response.headers.get('Link') || response.headers.get('link');
    nextPageUrl = null;
    
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
    
    pageCount++;
  }
  
  return allOrders;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCustomers(shopDomain: string, accessToken: string): Promise<any[]> {
  const response: Response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return data.customers || [];
}

// =============================================
// METRICS CALCULATION
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMetrics(orders: any[]) {
  const paidOrders = orders.filter(o => 
    ['paid', 'partially_paid', 'refunded', 'partially_refunded'].includes(o.financial_status)
  );
  
  let vendasBrutas = 0;
  let totalDescontos = 0;
  let totalRefunds = 0;
  const customerOrderCount: Record<string, number> = {};

  paidOrders.forEach(order => {
    vendasBrutas += parseFloat(order.total_price || '0');
    totalDescontos += parseFloat(order.total_discounts || '0');
    
    if (order.refunds?.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      order.refunds.forEach((refund: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        refund.refund_line_items?.forEach((item: any) => {
          totalRefunds += parseFloat(item.subtotal || '0');
        });
      });
    }
    
    const email = order.email || order.customer?.email;
    if (email) {
      customerOrderCount[email] = (customerOrderCount[email] || 0) + 1;
    }
  });
  
  const totalCustomers = Object.keys(customerOrderCount).length;
  const recurringCustomers = Object.values(customerOrderCount).filter(count => count > 1).length;
  const taxaClientesRecorrentes = totalCustomers > 0 ? (recurringCustomers / totalCustomers) * 100 : 0;
  const valorMedioPedido = paidOrders.length > 0 ? vendasBrutas / paidOrders.length : 0;

  return {
    vendasBrutas,
    totalDescontos,
    totalRefunds,
    vendasLiquidas: vendasBrutas - totalDescontos - totalRefunds,
    valorMedioPedido,
    totalPedidos: orders.length,
    pedidosPagos: paidOrders.length,
    totalCustomers,
    recurringCustomers,
    taxaClientesRecorrentes,
  };
}

// =============================================
// POST: Sync Orders
// =============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    
    const { supabase, user } = auth;
    const organizationId = user.organization_id;

    let storeId: string | null = null;
    try {
      const body = await request.json();
      storeId = body.storeId || null;
    } catch {
      // Body vazio
    }

    if (!storeId) {
      return NextResponse.json({ 
        success: false, 
        error: 'storeId é obrigatório. Especifique qual loja sincronizar.' 
      }, { status: 400 });
    }

    const validation = await validateStoreAccess(supabase, organizationId, storeId);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      );
    }

    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name, organization_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ 
        success: false, 
        error: 'Loja não encontrada' 
      }, { status: 404 });
    }

    if (!store.access_token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Token de acesso não encontrado. Reconecte a loja.' 
      }, { status: 400 });
    }

    const orders = await fetchAllOrders(store.shop_domain, store.access_token);
    const customers = await fetchCustomers(store.shop_domain, store.access_token);
    const metrics = calculateMetrics(orders);
    
    const supabaseAdmin = getSupabaseClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    await supabaseAdmin
      .from('shopify_orders')
      .delete()
      .eq('store_id', store.id);

    if (orders.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ordersToInsert = orders.map((order: any) => ({
        store_id: store.id,
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
        line_items: order.line_items || [],
        refunds: order.refunds || [],
        shipping_address: order.shipping_address || null,
        billing_address: order.billing_address || null,
        processed_at: order.processed_at || order.created_at,
        created_at: order.created_at,
        updated_at: order.updated_at,
        cancelled_at: order.cancelled_at || null,
        closed_at: order.closed_at || null,
      }));

      for (let i = 0; i < ordersToInsert.length; i += 50) {
        const batch = ordersToInsert.slice(i, i + 50);
        await supabaseAdmin.from('shopify_orders').insert(batch);
      }
    }

    await supabaseAdmin
      .from('shopify_stores')
      .update({
        total_orders: orders.length,
        total_revenue: metrics.vendasBrutas,
        total_customers: metrics.totalCustomers,
        last_sync_at: new Date().toISOString(),
        metrics: metrics,
      })
      .eq('id', store.id);

    const timeSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      message: `Sincronizado! ${orders.length} pedidos, R$ ${metrics.vendasBrutas.toFixed(2)} em vendas.`,
      data: {
        storeId: store.id,
        storeName: store.shop_name,
        totalOrders: orders.length,
        paidOrders: metrics.pedidosPagos,
        vendasBrutas: metrics.vendasBrutas,
        taxaClientesRecorrentes: metrics.taxaClientesRecorrentes,
        timeSeconds: parseFloat(timeSeconds),
      }
    });

  } catch (error) {
    console.error('[Sync] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: errorMessage 
    }, { status: 500 });
  }
}

// =============================================
// GET: Sync Status
// =============================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { supabase } = auth;

    const { data: stores } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, total_orders, total_revenue, last_sync_at, metrics, is_active')
      .order('created_at', { ascending: false });

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
    });
  } catch (error) {
    console.error('[Sync GET] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: errorMessage 
    }, { status: 500 });
  }
}
