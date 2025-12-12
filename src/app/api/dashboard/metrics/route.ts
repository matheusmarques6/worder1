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

function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      const endYesterday = new Date(startDate);
      endYesterday.setHours(23, 59, 59, 999);
      return { startDate, endDate: endYesterday };
    case '7d':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '30d':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '90d':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 89);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'all':
    default:
      // All time - 5 years
      startDate = new Date(today);
      startDate.setFullYear(startDate.getFullYear() - 5);
      startDate.setHours(0, 0, 0, 0);
      break;
  }

  return { startDate, endDate: today };
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatDateLabel(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  // Default to 'all' to show all data
  const range = request.nextUrl.searchParams.get('range') || 'all';
  const storeId = request.nextUrl.searchParams.get('storeId');

  try {
    const { startDate, endDate } = getDateRange(range);

    // Get stores
    const { data: stores } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true);

    const hasStores = stores && stores.length > 0;

    if (!hasStores) {
      return NextResponse.json({
        metrics: null,
        totals: { pedidos: 0, pedidosPagos: 0, receita: 0 },
        chartData: [],
        stores: [],
        integrations: { shopify: false, klaviyo: false, meta: false, google: false, tiktok: false },
      });
    }

    const storeIds = stores.map(s => s.id);

    // ============================================
    // BUSCAR TODOS OS PEDIDOS (SEM FILTRO DE DATA)
    // ============================================
    let allOrdersQuery = supabase.from('shopify_orders').select('*');
    
    if (storeId) {
      allOrdersQuery = allOrdersQuery.eq('store_id', storeId);
    } else if (storeIds.length > 0) {
      allOrdersQuery = allOrdersQuery.in('store_id', storeIds);
    }

    const { data: allOrders } = await allOrdersQuery;
    const orders = allOrders || [];

    // Calcular métricas de TODOS os pedidos
    let totalReceita = 0;
    let totalImpostos = 0;
    let paidCount = 0;

    orders.forEach(order => {
      const isPaid = ['paid', 'partially_paid'].includes(order.financial_status);
      if (isPaid) {
        totalReceita += parseFloat(order.total_price || '0');
        totalImpostos += parseFloat(order.total_tax || '0');
        paidCount++;
      }
    });

    // Custos estimados (30% da receita)
    const custos = totalReceita * 0.30;
    const lucro = totalReceita - custos - totalImpostos;
    const margem = totalReceita > 0 ? (lucro / totalReceita) * 100 : 0;
    const ticketMedio = paidCount > 0 ? totalReceita / paidCount : 0;

    // ============================================
    // CHART DATA - Últimos 30 dias com dados
    // ============================================
    const chartData: any[] = [];
    
    // Encontrar range de datas dos pedidos
    const orderDates = orders
      .filter(o => ['paid', 'partially_paid'].includes(o.financial_status))
      .map(o => new Date(o.created_at))
      .sort((a, b) => a.getTime() - b.getTime());

    if (orderDates.length > 0) {
      // Pegar últimos 30 dias com dados ou menos
      const minDate = orderDates[0];
      const maxDate = orderDates[orderDates.length - 1];
      
      // Gerar dados por dia
      const dayMs = 24 * 60 * 60 * 1000;
      const chartStart = new Date(Math.max(minDate.getTime(), maxDate.getTime() - 30 * dayMs));
      
      for (let d = new Date(chartStart); d <= maxDate; d = new Date(d.getTime() + dayMs)) {
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);

        const dayOrders = orders.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= dayStart && orderDate <= dayEnd && ['paid', 'partially_paid'].includes(o.financial_status);
        });

        const dayReceita = dayOrders.reduce((acc, o) => acc + parseFloat(o.total_price || '0'), 0);
        const dayImpostos = dayOrders.reduce((acc, o) => acc + parseFloat(o.total_tax || '0'), 0);
        const dayCustos = dayReceita * 0.30;
        const dayLucro = dayReceita - dayCustos - dayImpostos;

        chartData.push({
          date: formatDateLabel(d),
          receita: dayReceita,
          custos: dayCustos,
          marketing: 0,
          impostos: dayImpostos,
          lucro: Math.max(0, dayLucro),
          pedidos: dayOrders.length,
        });
      }
    }

    // Se não tem dados no chart, criar dados vazios para os últimos 7 dias
    if (chartData.length === 0) {
      const dayMs = 24 * 60 * 60 * 1000;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * dayMs);
        chartData.push({
          date: formatDateLabel(d),
          receita: 0,
          custos: 0,
          marketing: 0,
          impostos: 0,
          lucro: 0,
          pedidos: 0,
        });
      }
    }

    // ============================================
    // STORES DATA
    // ============================================
    const storesData = stores.map(store => {
      const storeOrders = orders.filter(o => o.store_id === store.id);
      const paidStoreOrders = storeOrders.filter(o => ['paid', 'partially_paid'].includes(o.financial_status));
      const storeReceita = paidStoreOrders.reduce((acc, o) => acc + parseFloat(o.total_price || '0'), 0);
      const storeCustos = storeReceita * 0.30;
      const storeLucro = storeReceita - storeCustos;
      
      return {
        id: store.id,
        name: store.shop_name,
        domain: store.shop_domain,
        pedidos: storeOrders.length,
        pedidosPagos: paidStoreOrders.length,
        receita: storeReceita,
        custos: storeCustos,
        lucro: storeLucro,
        margem: storeReceita > 0 ? (storeLucro / storeReceita) * 100 : 0,
        lastSync: store.last_sync_at,
      };
    });

    // Check integrations
    const { data: klaviyoAccount } = await supabase
      .from('klaviyo_accounts')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    return NextResponse.json({
      metrics: {
        receita: totalReceita,
        receitaChange: 0,
        custos,
        custosChange: 0,
        marketing: 0,
        marketingChange: 0,
        impostos: totalImpostos,
        impostosChange: 0,
        margem,
        margemChange: 0,
        lucro,
        lucroChange: 0,
        pedidos: orders.length,
        pedidosPagos: paidCount,
        pedidosChange: 0,
        ticketMedio,
        ticketMedioChange: 0,
      },
      totals: {
        pedidos: orders.length,
        pedidosPagos: paidCount,
        receita: totalReceita,
      },
      chartData,
      stores: storesData,
      integrations: {
        shopify: hasStores,
        klaviyo: !!klaviyoAccount,
        meta: false,
        google: false,
        tiktok: false,
      },
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        range,
      },
    });
    
  } catch (error: any) {
    console.error('Dashboard metrics error:', error);
    return NextResponse.json({ 
      error: error.message,
      metrics: null,
      totals: { pedidos: 0, pedidosPagos: 0, receita: 0 },
      chartData: [],
      stores: [],
      integrations: { shopify: false, klaviyo: false, meta: false, google: false, tiktok: false },
    }, { status: 500 });
  }
}
