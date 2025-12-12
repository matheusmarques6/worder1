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

function getDateRange(period: string): { startDate: Date; endDate: Date; prevStartDate: Date; prevEndDate: Date } {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  let startDate: Date;
  let days: number;

  switch (period) {
    case 'today':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      days = 1;
      break;
    case 'yesterday':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      const endYesterday = new Date(startDate);
      endYesterday.setHours(23, 59, 59, 999);
      const prevStart = new Date(startDate);
      prevStart.setDate(prevStart.getDate() - 1);
      return { 
        startDate, 
        endDate: endYesterday, 
        prevStartDate: prevStart,
        prevEndDate: new Date(startDate.getTime() - 1)
      };
    case '7d':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      days = 7;
      break;
    case '30d':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      days = 30;
      break;
    case '90d':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      days = 90;
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      days = 7;
  }

  // Previous period
  const prevEndDate = new Date(startDate.getTime() - 1);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - days + 1);
  prevStartDate.setHours(0, 0, 0, 0);

  return { startDate, endDate: now, prevStartDate, prevEndDate };
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatDateLabel(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || '7d';

  try {
    const { startDate, endDate, prevStartDate, prevEndDate } = getDateRange(period);

    // Get stores
    const { data: stores } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('is_active', true);

    if (!stores || stores.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhuma loja conectada',
      });
    }

    const storeIds = stores.map(s => s.id);

    // Fetch current period orders
    const { data: currentOrders } = await supabase
      .from('shopify_orders')
      .select('*')
      .in('store_id', storeIds)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    // Fetch previous period orders
    const { data: prevOrders } = await supabase
      .from('shopify_orders')
      .select('*')
      .in('store_id', storeIds)
      .gte('created_at', prevStartDate.toISOString())
      .lte('created_at', prevEndDate.toISOString());

    const orders = currentOrders || [];
    const previousOrders = prevOrders || [];

    // ============================================
    // CALCULATE CURRENT PERIOD METRICS
    // ============================================
    let vendasBrutas = 0;
    let descontos = 0;
    let devolucoes = 0;
    let cobrancasFrete = 0;
    let tributos = 0;
    let pedidosProcessados = 0;
    const customerIds = new Set<string>();
    const returningCustomerIds = new Set<string>();
    const productSales: Record<string, { nome: string; vendas: number; quantidade: number }> = {};
    const salesByDay: Record<string, number> = {};
    const salesByChannel: Record<string, number> = {};

    orders.forEach(order => {
      const totalPrice = parseFloat(order.total_price || '0');
      const totalDiscount = parseFloat(order.total_discounts || '0');
      const totalTax = parseFloat(order.total_tax || '0');
      const totalShipping = parseFloat(order.total_shipping || '0');

      // Vendas brutas (todos os pedidos, não só pagos)
      vendasBrutas += totalPrice + totalDiscount;
      descontos += totalDiscount;
      tributos += totalTax;
      cobrancasFrete += totalShipping;

      // Devoluções
      if (order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') {
        devolucoes += totalPrice;
      }

      // Pedidos processados (fulfilled)
      if (order.fulfillment_status === 'fulfilled') {
        pedidosProcessados++;
      }

      // Clientes
      if (order.customer_id) {
        if (customerIds.has(order.customer_id)) {
          returningCustomerIds.add(order.customer_id);
        }
        customerIds.add(order.customer_id);
      }

      // Vendas por produto
      const lineItems = order.line_items || [];
      lineItems.forEach((item: any) => {
        const productName = item.title || item.name || 'Produto sem nome';
        const productId = item.product_id?.toString() || productName;
        if (!productSales[productId]) {
          productSales[productId] = { nome: productName, vendas: 0, quantidade: 0 };
        }
        productSales[productId].vendas += parseFloat(item.price || '0') * (item.quantity || 1);
        productSales[productId].quantidade += item.quantity || 1;
      });

      // Vendas por dia
      const orderDate = new Date(order.created_at);
      const dayKey = formatDateLabel(orderDate);
      salesByDay[dayKey] = (salesByDay[dayKey] || 0) + totalPrice;

      // Vendas por canal (usando a loja como canal ou source_name se disponível)
      const channel = order.source_name || 'Online Store';
      salesByChannel[channel] = (salesByChannel[channel] || 0) + totalPrice;
    });

    // ============================================
    // CALCULATE PREVIOUS PERIOD METRICS
    // ============================================
    let prevVendasBrutas = 0;
    let prevDescontos = 0;
    let prevDevolucoes = 0;
    let prevCobrancasFrete = 0;
    let prevTributos = 0;
    let prevPedidosProcessados = 0;
    const prevCustomerIds = new Set<string>();
    const prevReturningCustomerIds = new Set<string>();
    const prevSalesByDay: Record<string, number> = {};
    const prevProductSales: Record<string, number> = {};

    previousOrders.forEach(order => {
      const totalPrice = parseFloat(order.total_price || '0');
      const totalDiscount = parseFloat(order.total_discounts || '0');
      const totalTax = parseFloat(order.total_tax || '0');
      const totalShipping = parseFloat(order.total_shipping || '0');

      prevVendasBrutas += totalPrice + totalDiscount;
      prevDescontos += totalDiscount;
      prevTributos += totalTax;
      prevCobrancasFrete += totalShipping;

      if (order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') {
        prevDevolucoes += totalPrice;
      }

      if (order.fulfillment_status === 'fulfilled') {
        prevPedidosProcessados++;
      }

      if (order.customer_id) {
        if (prevCustomerIds.has(order.customer_id)) {
          prevReturningCustomerIds.add(order.customer_id);
        }
        prevCustomerIds.add(order.customer_id);
      }

      // Vendas por dia (para comparação no gráfico)
      const orderDate = new Date(order.created_at);
      const dayKey = formatDateLabel(orderDate);
      prevSalesByDay[dayKey] = (prevSalesByDay[dayKey] || 0) + totalPrice;

      // Vendas por produto anterior
      const lineItems = order.line_items || [];
      lineItems.forEach((item: any) => {
        const productId = item.product_id?.toString() || item.title || 'unknown';
        prevProductSales[productId] = (prevProductSales[productId] || 0) + parseFloat(item.price || '0') * (item.quantity || 1);
      });
    });

    // ============================================
    // BUILD RESPONSE
    // ============================================
    const vendasLiquidas = vendasBrutas - descontos - devolucoes;
    const prevVendasLiquidas = prevVendasBrutas - prevDescontos - prevDevolucoes;
    const totalVendas = vendasLiquidas + cobrancasFrete;
    const prevTotalVendas = prevVendasLiquidas + prevCobrancasFrete;

    const taxaClientesRecorrentes = customerIds.size > 0 
      ? (returningCustomerIds.size / customerIds.size) * 100 
      : 0;
    const prevTaxaClientesRecorrentes = prevCustomerIds.size > 0 
      ? (prevReturningCustomerIds.size / prevCustomerIds.size) * 100 
      : 0;

    const ticketMedio = orders.length > 0 ? totalVendas / orders.length : 0;
    const prevTicketMedio = previousOrders.length > 0 ? prevTotalVendas / previousOrders.length : 0;

    // Build sales by day array for chart
    const dayMs = 24 * 60 * 60 * 1000;
    const vendasPorDia = [];
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + dayMs)) {
      const dayKey = formatDateLabel(d);
      vendasPorDia.push({
        date: dayKey,
        vendas: salesByDay[dayKey] || 0,
        anterior: prevSalesByDay[dayKey] || 0,
      });
    }

    // Build products array
    const vendasPorProduto = Object.entries(productSales)
      .map(([id, data]) => ({
        nome: data.nome,
        vendas: data.vendas,
        quantidade: data.quantidade,
        change: calcChange(data.vendas, prevProductSales[id] || 0),
      }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 10);

    // Build channels array
    const vendasPorCanal = Object.entries(salesByChannel)
      .map(([nome, vendas]) => ({ nome, vendas }))
      .sort((a, b) => b.vendas - a.vendas);

    return NextResponse.json({
      success: true,
      data: {
        // Main KPIs
        vendasBrutas,
        vendasBrutasChange: calcChange(vendasBrutas, prevVendasBrutas),
        taxaClientesRecorrentes,
        taxaClientesRecorrentesChange: taxaClientesRecorrentes - prevTaxaClientesRecorrentes,
        pedidosProcessados,
        pedidosProcessadosChange: calcChange(pedidosProcessados, prevPedidosProcessados),
        pedidos: orders.length,
        pedidosChange: calcChange(orders.length, previousOrders.length),

        // Detalhamento
        descontos,
        descontosChange: calcChange(descontos, prevDescontos),
        devolucoes,
        devolucoesChange: calcChange(devolucoes, prevDevolucoes),
        vendasLiquidas,
        vendasLiquidasChange: calcChange(vendasLiquidas, prevVendasLiquidas),
        cobrancasFrete,
        cobrancasFreteChange: calcChange(cobrancasFrete, prevCobrancasFrete),
        tributos,
        tributosChange: calcChange(tributos, prevTributos),
        totalVendas,
        totalVendasChange: calcChange(totalVendas, prevTotalVendas),

        // Ticket médio
        ticketMedio,
        ticketMedioChange: calcChange(ticketMedio, prevTicketMedio),

        // Clientes
        clientesNovos: customerIds.size - returningCustomerIds.size,
        clientesRecorrentes: returningCustomerIds.size,

        // Dados para gráficos
        vendasPorDia,
        vendasPorProduto,
        vendasPorCanal,
      },
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        prevStart: prevStartDate.toISOString(),
        prevEnd: prevEndDate.toISOString(),
      },
    });

  } catch (error: any) {
    console.error('Shopify Analytics error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
