import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

const SHOPIFY_API_VERSION = '2024-10';

export const maxDuration = 60;

// Fetch all orders with pagination
async function fetchAllOrders(shopDomain: string, accessToken: string): Promise<any[]> {
  const allOrders: any[] = [];
  let nextPageUrl: string | null = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250`;
  
  let pageCount = 0;
  const maxPages = 10; // Safety limit - 2500 orders max
  
  while (nextPageUrl && pageCount < maxPages) {
    const response = await fetch(nextPageUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allOrders.push(...(data.orders || []));
    
    // Check for next page
    const linkHeader = response.headers.get('Link');
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

// Fetch customers
async function fetchCustomers(shopDomain: string, accessToken: string): Promise<any[]> {
  const response = await fetch(
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

// Calculate all metrics from orders
function calculateMetrics(orders: any[], customers: any[]) {
  // Filter by financial status
  const paidOrders = orders.filter(o => 
    ['paid', 'partially_paid', 'refunded', 'partially_refunded'].includes(o.financial_status)
  );
  
  // Basic metrics
  let vendasBrutas = 0;
  let totalDescontos = 0;
  let totalFrete = 0;
  let totalTax = 0;
  let totalRefunds = 0;
  
  // Product sales
  const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
  
  // Channel sales
  const channelSales: Record<string, number> = {};
  
  // Daily sales for chart
  const dailySales: Record<string, number> = {};
  const dailyOrders: Record<string, number> = {};
  
  // Customer emails for recurrence calculation
  const customerOrderCount: Record<string, number> = {};

  paidOrders.forEach(order => {
    const totalPrice = parseFloat(order.total_price || '0');
    const discounts = parseFloat(order.total_discounts || '0');
    const shipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0');
    const tax = parseFloat(order.total_tax || '0');
    
    vendasBrutas += totalPrice;
    totalDescontos += discounts;
    totalFrete += shipping;
    totalTax += tax;
    
    // Refunds
    if (order.refunds?.length > 0) {
      order.refunds.forEach((refund: any) => {
        refund.refund_line_items?.forEach((item: any) => {
          totalRefunds += parseFloat(item.subtotal || '0');
        });
      });
    }
    
    // Product sales
    order.line_items?.forEach((item: any) => {
      const productName = item.title || 'Unknown';
      if (!productSales[productName]) {
        productSales[productName] = { name: productName, quantity: 0, revenue: 0 };
      }
      productSales[productName].quantity += item.quantity || 1;
      productSales[productName].revenue += parseFloat(item.price || '0') * (item.quantity || 1);
    });
    
    // Channel sales
    const channel = order.source_name || 'web';
    channelSales[channel] = (channelSales[channel] || 0) + totalPrice;
    
    // Daily aggregation
    const date = order.created_at?.split('T')[0];
    if (date) {
      dailySales[date] = (dailySales[date] || 0) + totalPrice;
      dailyOrders[date] = (dailyOrders[date] || 0) + 1;
    }
    
    // Customer recurrence
    const email = order.email || order.customer?.email;
    if (email) {
      customerOrderCount[email] = (customerOrderCount[email] || 0) + 1;
    }
  });
  
  // Calculate recurring customer rate
  const totalCustomers = Object.keys(customerOrderCount).length;
  const recurringCustomers = Object.values(customerOrderCount).filter(count => count > 1).length;
  const taxaClientesRecorrentes = totalCustomers > 0 ? (recurringCustomers / totalCustomers) * 100 : 0;
  
  // Vendas líquidas
  const vendasLiquidas = vendasBrutas - totalDescontos - totalRefunds;
  
  // Valor médio do pedido
  const valorMedioPedido = paidOrders.length > 0 ? vendasBrutas / paidOrders.length : 0;
  
  // Top products
  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  
  // Channel breakdown
  const channels = Object.entries(channelSales).map(([name, value]) => ({
    name,
    value,
  }));
  
  // Daily chart data (last 30 days)
  const chartData = Object.entries(dailySales)
    .map(([date, value]) => ({
      date,
      value,
      orders: dailyOrders[date] || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    // Summary
    vendasBrutas,
    totalDescontos,
    totalRefunds,
    vendasLiquidas,
    totalFrete,
    totalTax,
    valorMedioPedido,
    
    // Orders
    totalPedidos: orders.length,
    pedidosPagos: paidOrders.length,
    
    // Customers
    totalCustomers,
    recurringCustomers,
    taxaClientesRecorrentes,
    
    // Breakdown
    topProducts,
    channels,
    chartData,
    
    // Raw daily data for flexible queries
    dailySales,
    dailyOrders,
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' });
    }

    // Get store
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name')
      .eq('is_active', true)
      .limit(1);

    if (storesError || !stores || stores.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nenhuma loja conectada' 
      });
    }

    const store = stores[0];

    if (!store.access_token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Token de acesso não encontrado. Reconecte a loja.' 
      });
    }

    // Fetch all orders
    const orders = await fetchAllOrders(store.shop_domain, store.access_token);
    
    // Fetch customers
    const customers = await fetchCustomers(store.shop_domain, store.access_token);
    
    // Calculate all metrics
    const metrics = calculateMetrics(orders, customers);
    
    // Clear existing orders
    await supabase
      .from('shopify_orders')
      .delete()
      .eq('store_id', store.id);

    // Insert orders
    if (orders.length > 0) {
      const ordersToInsert = orders.map((order: any) => ({
        store_id: store.id,
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

      // Insert in batches
      for (let i = 0; i < ordersToInsert.length; i += 50) {
        const batch = ordersToInsert.slice(i, i + 50);
        await supabase.from('shopify_orders').insert(batch);
      }
    }

    // Update store with metrics
    await supabase
      .from('shopify_stores')
      .update({
        total_orders: orders.length,
        total_revenue: metrics.vendasBrutas,
        last_sync_at: new Date().toISOString(),
        metrics: metrics, // Store all calculated metrics
      })
      .eq('id', store.id);

    const timeSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      message: `Sincronizado! ${orders.length} pedidos, R$ ${metrics.vendasBrutas.toFixed(2)} em vendas.`,
      data: {
        totalOrders: orders.length,
        paidOrders: metrics.pedidosPagos,
        vendasBrutas: metrics.vendasBrutas,
        taxaClientesRecorrentes: metrics.taxaClientesRecorrentes,
        timeSeconds: parseFloat(timeSeconds),
      }
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' });
    }

    const { data: stores } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, total_orders, total_revenue, last_sync_at, metrics')
      .eq('is_active', true);

    return NextResponse.json({ 
      success: true, 
      stores: stores || [],
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
