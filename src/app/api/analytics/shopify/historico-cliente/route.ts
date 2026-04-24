import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2025-01';

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
  const customerIds = searchParams.get('customerIds')?.split(',') || [];

  if (!storeId) {
    return NextResponse.json({ 
      error: 'Passe ?storeId=XXX&customerIds=123,456',
      exemplo: '/api/analytics/shopify/historico-cliente?storeId=123&customerIds=8167905525943,8202510467255'
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

    const resultados: any[] = [];

    for (const customerId of customerIds) {
      if (!customerId) continue;

      try {
        // 1. Buscar dados do cliente
        const customerData = await shopifyFetch(
          store.shop_domain,
          store.access_token,
          `/customers/${customerId}.json`
        );

        const customer = customerData.customer;

        // 2. Buscar TODOS os pedidos desse cliente (incluindo cancelados)
        const ordersData = await shopifyFetch(
          store.shop_domain,
          store.access_token,
          `/orders.json?customer_id=${customerId}&status=any&limit=250`
        );

        const allOrders = ordersData.orders || [];

        // Classificar pedidos
        const pedidosDetalhes = allOrders.map((o: any) => ({
          id: o.id,
          number: o.order_number,
          created_at: o.created_at,
          financial_status: o.financial_status,
          fulfillment_status: o.fulfillment_status,
          cancelled_at: o.cancelled_at,
          cancel_reason: o.cancel_reason,
          total_price: o.total_price,
          test: o.test,
          status_resumo: o.cancelled_at ? 'CANCELADO' : (o.test ? 'TESTE' : 'VÁLIDO'),
        }));

        // Contar por status
        const totalPedidos = allOrders.length;
        const pedidosCancelados = allOrders.filter((o: any) => o.cancelled_at).length;
        const pedidosTeste = allOrders.filter((o: any) => o.test).length;
        const pedidosValidos = allOrders.filter((o: any) => !o.cancelled_at && !o.test).length;

        // Verificar se teve pedido antes de hoje
        const hoje = new Date().toISOString().split('T')[0];
        const pedidosAntesDeHoje = allOrders.filter((o: any) => {
          const orderDate = o.created_at.split('T')[0];
          return orderDate < hoje;
        });

        const pedidosValidosAntesDeHoje = pedidosAntesDeHoje.filter((o: any) => !o.cancelled_at && !o.test);
        const pedidosCanceladosAntesDeHoje = pedidosAntesDeHoje.filter((o: any) => o.cancelled_at);

        resultados.push({
          customer_id: customerId,
          email: customer?.email,
          nome: `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
          created_at: customer?.created_at?.split('T')[0],
          orders_count_api: customer?.orders_count,
          
          historico: {
            total_pedidos_encontrados: totalPedidos,
            pedidos_validos: pedidosValidos,
            pedidos_cancelados: pedidosCancelados,
            pedidos_teste: pedidosTeste,
          },
          
          analise_antes_de_hoje: {
            total_pedidos_antes_de_hoje: pedidosAntesDeHoje.length,
            pedidos_validos_antes_de_hoje: pedidosValidosAntesDeHoje.length,
            pedidos_cancelados_antes_de_hoje: pedidosCanceladosAntesDeHoje.length,
            teve_interacao_anterior: pedidosAntesDeHoje.length > 0,
          },
          
          conclusao: {
            shopify_considera_recorrente: pedidosAntesDeHoje.length > 0 ? 'POSSÍVEL (teve pedido/tentativa anterior)' : 'NÃO (primeiro contato)',
            motivo: pedidosCanceladosAntesDeHoje.length > 0 
              ? `Teve ${pedidosCanceladosAntesDeHoje.length} pedido(s) CANCELADO(S) antes de hoje`
              : (pedidosValidosAntesDeHoje.length > 0 
                  ? `Teve ${pedidosValidosAntesDeHoje.length} pedido(s) válido(s) antes de hoje`
                  : 'Nenhum pedido anterior encontrado'),
          },
          
          todos_pedidos: pedidosDetalhes,
        });

      } catch (error: any) {
        resultados.push({
          customer_id: customerId,
          erro: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      nota: 'Este endpoint mostra o histórico COMPLETO de pedidos (incluindo cancelados) para cada cliente',
      clientes_analisados: resultados,
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
