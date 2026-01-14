import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2024-10';
const TZ_OFFSET = '-03:00';

const toNum = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }
  return response.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const period = searchParams.get('period') || 'today';

  if (!storeId) {
    return NextResponse.json({ 
      error: 'Passe ?storeId=XXX',
      exemplo: '/api/analytics/shopify/diagnostico-clientes?storeId=123&period=today'
    });
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const { data: store } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token')
      .eq('id', storeId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Calcular datas
    const nowUTC = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(nowUTC.getTime() + (brazilOffset * 60 * 1000) + (nowUTC.getTimezoneOffset() * 60 * 1000));
    const todayBrazil = brazilTime.toISOString().split('T')[0];
    
    let dateStr: string;
    if (period === 'yesterday') {
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
    } else {
      dateStr = todayBrazil;
    }

    const startISO = `${dateStr}T00:00:00${TZ_OFFSET}`;
    const endISO = `${dateStr}T23:59:59${TZ_OFFSET}`;

    // Buscar pedidos do período
    const ordersData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=250`
    );

    const orders = ordersData.orders || [];
    const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);

    // Mapear pedidos por cliente
    const customerOrdersInPeriod = new Map<number, { count: number; orderIds: number[] }>();
    
    for (const o of validOrders) {
      if (o.customer?.id) {
        const cid = o.customer.id;
        if (!customerOrdersInPeriod.has(cid)) {
          customerOrdersInPeriod.set(cid, { count: 0, orderIds: [] });
        }
        const entry = customerOrdersInPeriod.get(cid)!;
        entry.count++;
        entry.orderIds.push(o.id);
      }
    }

    // Buscar detalhes de TODOS os clientes
    const allCustomerDetails: any[] = [];
    
    for (const [customerId, periodData] of customerOrdersInPeriod) {
      try {
        const customerData = await shopifyFetch(
          store.shop_domain,
          store.access_token,
          `/customers/${customerId}.json`
        );
        
        if (customerData.customer) {
          const c = customerData.customer;
          const totalOrders = c.orders_count || 0;
          const ordersInPeriod = periodData.count;
          const ordersBeforePeriod = totalOrders - ordersInPeriod;
          
          // Nossa classificação atual
          const nossaClassificacao = ordersBeforePeriod > 0 ? 'recorrente' : 'novo';
          
          // Verificar data de criação do cliente
          const customerCreatedDate = c.created_at ? c.created_at.split('T')[0] : null;
          const criadoAntesDoPeriodo = customerCreatedDate && customerCreatedDate < dateStr;
          
          // Possível classificação alternativa (baseada na data de criação)
          const classificacaoPorData = criadoAntesDoPeriodo ? 'recorrente' : 'novo';
          
          allCustomerDetails.push({
            id: customerId,
            email: c.email,
            nome: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'N/A',
            created_at: customerCreatedDate,
            orders_count_total: totalOrders,
            orders_in_period: ordersInPeriod,
            orders_before_period: ordersBeforePeriod,
            order_ids_no_periodo: periodData.orderIds,
            
            // Classificações
            nossa_classificacao: nossaClassificacao,
            classificacao_por_data: classificacaoPorData,
            
            // Flags de análise
            criado_antes_do_periodo: criadoAntesDoPeriodo,
            tem_pedidos_anteriores: ordersBeforePeriod > 0,
            
            // Discrepância?
            discrepancia: nossaClassificacao !== classificacaoPorData,
          });
        }
      } catch (e) {
        allCustomerDetails.push({
          id: customerId,
          erro: 'Cliente não encontrado',
        });
      }
    }

    // Ordenar por email para facilitar comparação
    allCustomerDetails.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    // Calcular totais
    const totalClientes = allCustomerDetails.filter(c => !c.erro).length;
    const recorrentesPorOrders = allCustomerDetails.filter(c => c.nossa_classificacao === 'recorrente').length;
    const novosPorOrders = allCustomerDetails.filter(c => c.nossa_classificacao === 'novo').length;
    const taxaPorOrders = totalClientes > 0 ? Number(((recorrentesPorOrders / totalClientes) * 100).toFixed(2)) : 0;

    const recorrentesPorData = allCustomerDetails.filter(c => c.classificacao_por_data === 'recorrente').length;
    const novosPorData = allCustomerDetails.filter(c => c.classificacao_por_data === 'novo').length;
    const taxaPorData = totalClientes > 0 ? Number(((recorrentesPorData / totalClientes) * 100).toFixed(2)) : 0;

    // Clientes com discrepância
    const clientesComDiscrepancia = allCustomerDetails.filter(c => c.discrepancia);

    return NextResponse.json({
      success: true,
      periodo: `${period} (${dateStr})`,
      
      resumo: {
        total_pedidos: orders.length,
        pedidos_validos: validOrders.length,
        total_clientes: totalClientes,
      },
      
      metodo_por_orders_count: {
        descricao: 'Baseado em orders_count - ordersInPeriod > 0',
        novos: novosPorOrders,
        recorrentes: recorrentesPorOrders,
        taxa: taxaPorOrders,
      },
      
      metodo_por_data_criacao: {
        descricao: 'Baseado em created_at < inicio do período',
        novos: novosPorData,
        recorrentes: recorrentesPorData,
        taxa: taxaPorData,
      },
      
      clientes_com_discrepancia: clientesComDiscrepancia,
      
      todos_clientes: allCustomerDetails,
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
