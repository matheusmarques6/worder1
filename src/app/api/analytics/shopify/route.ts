import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

const SHOPIFY_API_VERSION = '2024-10';

// Helper to make Shopify REST API calls
async function shopifyRest(shopDomain: string, accessToken: string, endpoint: string): Promise<any> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;
  const response: Response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }
  
  return response.json();
}

// Helper to make Shopify GraphQL API calls
async function shopifyGraphQL(shopDomain: string, accessToken: string, query: string, variables?: any): Promise<any> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response: Response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!response.ok) {
    throw new Error(`Shopify GraphQL error: ${response.status}`);
  }
  
  return response.json();
}

// Get date range based on period
function getDateRange(period: string): { start: string; end: string; prevStart: string; prevEnd: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  
  let daysBack: number;
  switch (period) {
    case 'today':
      daysBack = 0;
      break;
    case 'yesterday':
      daysBack = 1;
      break;
    case '7d':
      daysBack = 6;
      break;
    case '30d':
      daysBack = 29;
      break;
    case '90d':
      daysBack = 89;
      break;
    default:
      daysBack = 6;
  }
  
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const start = startDate.toISOString().split('T')[0];
  
  // Previous period for comparison
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevEnd = prevEndDate.toISOString().split('T')[0];
  
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - daysBack);
  const prevStart = prevStartDate.toISOString().split('T')[0];
  
  return { start, end, prevStart, prevEnd };
}

// Calculate percentage change
function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const { start, end, prevStart, prevEnd } = getDateRange(period);

    // Get store credentials from database
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name')
      .eq('is_active', true)
      .limit(1);

    if (storesError || !stores || stores.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Nenhuma loja conectada',
        needsConnection: true
      });
    }

    const store = stores[0];
    const { shop_domain, access_token } = store;

    if (!access_token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Token de acesso não encontrado. Reconecte a loja.',
        needsConnection: true
      });
    }

    // ========================================
    // FETCH ALL DATA FROM SHOPIFY API
    // ========================================
    
    // 1. Get orders for current period
    const ordersCurrentUrl = `orders.json?status=any&created_at_min=${start}T00:00:00Z&created_at_max=${end}T23:59:59Z&limit=250`;
    const ordersCurrentData = await shopifyRest(shop_domain, access_token, ordersCurrentUrl);
    const ordersCurrent = ordersCurrentData.orders || [];

    // 2. Get orders for previous period (for comparison)
    const ordersPrevUrl = `orders.json?status=any&created_at_min=${prevStart}T00:00:00Z&created_at_max=${prevEnd}T23:59:59Z&limit=250`;
    const ordersPrevData = await shopifyRest(shop_domain, access_token, ordersPrevUrl);
    const ordersPrev = ordersPrevData.orders || [];

    // 3. Get all customers
    const customersData = await shopifyRest(shop_domain, access_token, 'customers.json?limit=250');
    const customers = customersData.customers || [];

    // 4. Get products
    const productsData = await shopifyRest(shop_domain, access_token, 'products.json?limit=100');
    const products = productsData.products || [];

    // ========================================
    // PROCESS CURRENT PERIOD DATA
    // ========================================
    
    let vendasBrutas = 0;
    let totalDescontos = 0;
    let totalFrete = 0;
    let totalTax = 0;
    let totalRefunds = 0;
    let pedidosPagos = 0;
    let pedidosProcessados = 0;
    
    const productSalesMap: Record<string, { name: string; revenue: number; quantity: number }> = {};
    const channelSalesMap: Record<string, number> = {};
    const customerEmails: Record<string, number> = {};
    const dailySalesMap: Record<string, number> = {};
    const dailyAvgMap: Record<string, { total: number; count: number }> = {};

    ordersCurrent.forEach((order: any) => {
      const totalPrice = parseFloat(order.total_price || '0');
      const discounts = parseFloat(order.total_discounts || '0');
      const shipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0');
      const tax = parseFloat(order.total_tax || '0');
      
      // Count paid orders
      if (['paid', 'partially_paid'].includes(order.financial_status)) {
        vendasBrutas += totalPrice;
        pedidosPagos++;
      }
      
      totalDescontos += discounts;
      totalFrete += shipping;
      totalTax += tax;
      
      // Fulfilled = processed
      if (order.fulfillment_status === 'fulfilled') {
        pedidosProcessados++;
      }
      
      // Refunds
      if (order.refunds?.length > 0) {
        order.refunds.forEach((refund: any) => {
          refund.refund_line_items?.forEach((item: any) => {
            totalRefunds += parseFloat(item.subtotal || '0');
          });
        });
      }
      
      // Product sales
      (order.line_items || []).forEach((item: any) => {
        const name = item.title || 'Unknown';
        if (!productSalesMap[name]) {
          productSalesMap[name] = { name, revenue: 0, quantity: 0 };
        }
        productSalesMap[name].revenue += parseFloat(item.price || '0') * (item.quantity || 1);
        productSalesMap[name].quantity += item.quantity || 1;
      });
      
      // Channel sales
      const channel = order.source_name || 'web';
      channelSalesMap[channel] = (channelSalesMap[channel] || 0) + totalPrice;
      
      // Customer tracking for recurrence
      const email = order.email || order.customer?.email;
      if (email) {
        customerEmails[email] = (customerEmails[email] || 0) + 1;
      }
      
      // Daily aggregation
      const date = order.created_at?.split('T')[0];
      if (date) {
        dailySalesMap[date] = (dailySalesMap[date] || 0) + totalPrice;
        if (!dailyAvgMap[date]) {
          dailyAvgMap[date] = { total: 0, count: 0 };
        }
        dailyAvgMap[date].total += totalPrice;
        dailyAvgMap[date].count += 1;
      }
    });

    // ========================================
    // PROCESS PREVIOUS PERIOD DATA
    // ========================================
    
    let vendasBrutasPrev = 0;
    let totalDescontosPrev = 0;
    let totalFretePrev = 0;
    let totalRefundsPrev = 0;
    let pedidosPagosPrev = 0;
    let pedidosProcessadosPrev = 0;
    const customerEmailsPrev: Record<string, number> = {};

    ordersPrev.forEach((order: any) => {
      const totalPrice = parseFloat(order.total_price || '0');
      
      if (['paid', 'partially_paid'].includes(order.financial_status)) {
        vendasBrutasPrev += totalPrice;
        pedidosPagosPrev++;
      }
      
      totalDescontosPrev += parseFloat(order.total_discounts || '0');
      totalFretePrev += parseFloat(order.total_shipping_price_set?.shop_money?.amount || '0');
      
      if (order.fulfillment_status === 'fulfilled') {
        pedidosProcessadosPrev++;
      }
      
      if (order.refunds?.length > 0) {
        order.refunds.forEach((refund: any) => {
          refund.refund_line_items?.forEach((item: any) => {
            totalRefundsPrev += parseFloat(item.subtotal || '0');
          });
        });
      }
      
      const email = order.email || order.customer?.email;
      if (email) {
        customerEmailsPrev[email] = (customerEmailsPrev[email] || 0) + 1;
      }
    });

    // ========================================
    // CALCULATE METRICS
    // ========================================
    
    // Recurring customers
    const totalCustomers = Object.keys(customerEmails).length;
    const recurringCustomers = Object.values(customerEmails).filter(c => c > 1).length;
    const taxaClientesRecorrentes = totalCustomers > 0 ? (recurringCustomers / totalCustomers) * 100 : 0;

    const totalCustomersPrev = Object.keys(customerEmailsPrev).length;
    const recurringCustomersPrev = Object.values(customerEmailsPrev).filter(c => c > 1).length;
    const taxaClientesRecorrentesPrev = totalCustomersPrev > 0 ? (recurringCustomersPrev / totalCustomersPrev) * 100 : 0;

    // Calculated values
    const vendasLiquidas = vendasBrutas - totalDescontos - totalRefunds;
    const vendasLiquidasPrev = vendasBrutasPrev - totalDescontosPrev - totalRefundsPrev;
    
    const valorMedioPedido = pedidosPagos > 0 ? vendasBrutas / pedidosPagos : 0;
    const valorMedioPedidoPrev = pedidosPagosPrev > 0 ? vendasBrutasPrev / pedidosPagosPrev : 0;

    // Top products
    const vendasPorProduto = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({
        nome: p.name,
        vendas: p.revenue,
        quantidade: p.quantity,
      }));

    // Channel breakdown
    const vendasPorCanal = Object.entries(channelSalesMap)
      .map(([nome, vendas]) => ({ nome, vendas }))
      .sort((a, b) => b.vendas - a.vendas);

    // Chart data - fill in missing days
    const chartData: Array<{ date: string; value: number; label: string }> = [];
    const currentDate = new Date(start);
    const endDate = new Date(end);
    
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      chartData.push({
        date: dateStr,
        value: dailySalesMap[dateStr] || 0,
        label: currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Average order value chart
    const valorMedioChartData = chartData.map(d => ({
      date: d.date,
      label: d.label,
      value: dailyAvgMap[d.date] ? dailyAvgMap[d.date].total / dailyAvgMap[d.date].count : 0,
    }));

    // ========================================
    // RETURN RESPONSE
    // ========================================
    
    return NextResponse.json({
      success: true,
      data: {
        // Main KPIs
        vendasBrutas,
        vendasBrutasChange: calcChange(vendasBrutas, vendasBrutasPrev),
        
        taxaClientesRecorrentes,
        taxaClientesRecorrentesChange: calcChange(taxaClientesRecorrentes, taxaClientesRecorrentesPrev),
        
        pedidosProcessados,
        pedidosProcessadosChange: calcChange(pedidosProcessados, pedidosProcessadosPrev),
        
        pedidos: ordersCurrent.length,
        pedidosChange: calcChange(ordersCurrent.length, ordersPrev.length),
        
        // Detalhamento
        totalDescontos,
        descontosChange: calcChange(totalDescontos, totalDescontosPrev),
        
        totalDevolucoes: totalRefunds,
        devolucoesChange: calcChange(totalRefunds, totalRefundsPrev),
        
        vendasLiquidas,
        vendasLiquidasChange: calcChange(vendasLiquidas, vendasLiquidasPrev),
        
        totalFrete,
        freteChange: calcChange(totalFrete, totalFretePrev),
        
        totalTributos: totalTax,
        tributosChange: 0,
        
        // Valor médio
        valorMedioPedido,
        valorMedioPedidoChange: calcChange(valorMedioPedido, valorMedioPedidoPrev),
        
        // Charts
        chartData,
        valorMedioChartData,
        
        // Breakdowns
        vendasPorCanal,
        vendasPorProduto,
        
        // Period info
        periodo: {
          inicio: start,
          fim: end,
          label: period,
        },
        
        // Store info
        loja: {
          nome: store.shop_name,
          dominio: store.shop_domain,
        },
      },
    });

  } catch (error: any) {
    console.error('Shopify Analytics API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    });
  }
}
