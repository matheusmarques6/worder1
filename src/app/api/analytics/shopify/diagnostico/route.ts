import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SHOPIFY_API_VERSION = '2024-10';
const TZ_OFFSET = '-03:00';

async function shopifyFetch(
  shopDomain: string,
  accessToken: string,
  endpoint: string
): Promise<{ body: any; headers: Headers }> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  
  const response: Response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const body = await response.json();
  return { body, headers: response.headers };
}

async function fetchAllOrdersWithPagination(
  shopDomain: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const allOrders: any[] = [];
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < 100) {
    let endpoint: string;
    
    if (pageInfo) {
      endpoint = `/orders.json?page_info=${encodeURIComponent(pageInfo)}&limit=250`;
    } else {
      // IMPORTANTE: status=any traz TODOS os pedidos (open, closed, cancelled, any)
      endpoint = `/orders.json?status=any&created_at_min=${encodeURIComponent(startDate)}&created_at_max=${encodeURIComponent(endDate)}&limit=250&order=created_at+asc`;
    }

    console.log(`[Diagnostico] Fetching page ${pages + 1}: ${endpoint}`);
    
    const { body, headers } = await shopifyFetch(shopDomain, accessToken, endpoint);
    const orders = body.orders || [];
    
    console.log(`[Diagnostico] Page ${pages + 1}: ${orders.length} orders`);
    
    if (!orders.length) break;
    allOrders.push(...orders);

    const linkHeader = headers.get('link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    
    if (!nextMatch) break;
    
    const pageMatch = nextMatch[1].match(/page_info=([^&]+)/);
    pageInfo = pageMatch ? pageMatch[1] : null;
    
    if (!pageInfo) break;
    pages++;
  }

  return allOrders;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json({ success: false, error: 'storeId is required' });
    }

    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ success: false, error: 'Store not found' });
    }

    const { shop_domain, access_token } = store;

    // Calcular período de 7 dias (EXATAMENTE como Shopify faz)
    // Shopify usa: hoje 00:00 até hoje 23:59:59 = 1 dia
    // 7 dias = hoje + 6 dias anteriores
    const now = new Date();
    
    // Converter para horário de Brasília
    const brazilOffset = -3 * 60; // -3 horas em minutos
    const brazilTime = new Date(now.getTime() + (brazilOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    
    const todayBrazil = brazilTime.toISOString().split('T')[0];
    
    // Calcular datas
    const endDate = new Date(todayBrazil + 'T12:00:00Z');
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6); // 7 dias = hoje + 6 anteriores
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Formato ISO com timezone Brasil
    const startISO = `${startDateStr}T00:00:00${TZ_OFFSET}`;
    const endISO = `${endDateStr}T23:59:59${TZ_OFFSET}`;

    console.log(`[Diagnostico] Período: ${startDateStr} a ${endDateStr}`);
    console.log(`[Diagnostico] Start ISO: ${startISO}`);
    console.log(`[Diagnostico] End ISO: ${endISO}`);

    // Buscar TODOS os pedidos
    const allOrders = await fetchAllOrdersWithPagination(shop_domain, access_token, startISO, endISO);

    console.log(`[Diagnostico] Total de pedidos recebidos: ${allOrders.length}`);

    // =====================================================
    // ANÁLISE DETALHADA
    // =====================================================
    
    interface OrderAnalysis {
      id: number;
      name: string;
      created_at: string;
      financial_status: string;
      fulfillment_status: string | null;
      cancelled_at: string | null;
      test: boolean;
      source_name: string;
      total_line_items_price: number;
      subtotal_price: number;
      total_price: number;
      total_discounts: number;
      // Calculado manualmente
      gross_sales_calculated: number;
    }

    const orderDetails: OrderAnalysis[] = [];
    
    // Contadores
    const stats = {
      total: 0,
      test: 0,
      cancelled: 0,
      deleted: 0,
      valid: 0,
      
      // Por financial_status
      byFinancialStatus: {} as Record<string, { count: number; value: number }>,
      
      // Por fulfillment_status
      byFulfillmentStatus: {} as Record<string, { count: number; value: number }>,
      
      // Por source_name
      bySourceName: {} as Record<string, { count: number; value: number }>,
      
      // Valores
      values: {
        // Usando total_line_items_price
        totalLineItemsPrice_all: 0,
        totalLineItemsPrice_nonTest: 0,
        totalLineItemsPrice_valid: 0,
        
        // Calculando manualmente (price * quantity de cada line_item)
        grossSalesCalculated_all: 0,
        grossSalesCalculated_nonTest: 0,
        grossSalesCalculated_valid: 0,
        
        // Subtotal (após descontos de linha)
        subtotal_all: 0,
        subtotal_nonTest: 0,
        subtotal_valid: 0,
        
        // Total price
        totalPrice_all: 0,
        totalPrice_nonTest: 0,
        totalPrice_valid: 0,
        
        // Descontos
        totalDiscounts_all: 0,
        totalDiscounts_nonTest: 0,
        totalDiscounts_valid: 0,
      }
    };

    for (const order of allOrders) {
      stats.total++;
      
      const isTest = order.test === true;
      const isCancelled = !!order.cancelled_at;
      const isValid = !isTest && !isCancelled;
      
      if (isTest) stats.test++;
      if (isCancelled) stats.cancelled++;
      if (isValid) stats.valid++;
      
      // Valores do pedido
      const totalLineItemsPrice = parseFloat(order.total_line_items_price || '0');
      const subtotalPrice = parseFloat(order.subtotal_price || '0');
      const totalPrice = parseFloat(order.total_price || '0');
      const totalDiscounts = parseFloat(order.total_discounts || '0');
      
      // Calcular gross sales manualmente (price * quantity de cada line_item)
      let grossSalesCalculated = 0;
      if (Array.isArray(order.line_items)) {
        for (const item of order.line_items) {
          const price = parseFloat(item.price || '0');
          const quantity = parseInt(item.quantity || '0', 10);
          grossSalesCalculated += price * quantity;
        }
      }
      
      // Acumular valores - TODOS
      stats.values.totalLineItemsPrice_all += totalLineItemsPrice;
      stats.values.grossSalesCalculated_all += grossSalesCalculated;
      stats.values.subtotal_all += subtotalPrice;
      stats.values.totalPrice_all += totalPrice;
      stats.values.totalDiscounts_all += totalDiscounts;
      
      // Acumular valores - Não teste
      if (!isTest) {
        stats.values.totalLineItemsPrice_nonTest += totalLineItemsPrice;
        stats.values.grossSalesCalculated_nonTest += grossSalesCalculated;
        stats.values.subtotal_nonTest += subtotalPrice;
        stats.values.totalPrice_nonTest += totalPrice;
        stats.values.totalDiscounts_nonTest += totalDiscounts;
      }
      
      // Acumular valores - Válidos (não teste e não cancelado)
      if (isValid) {
        stats.values.totalLineItemsPrice_valid += totalLineItemsPrice;
        stats.values.grossSalesCalculated_valid += grossSalesCalculated;
        stats.values.subtotal_valid += subtotalPrice;
        stats.values.totalPrice_valid += totalPrice;
        stats.values.totalDiscounts_valid += totalDiscounts;
      }
      
      // Por financial_status
      const fs = order.financial_status || 'null';
      if (!stats.byFinancialStatus[fs]) {
        stats.byFinancialStatus[fs] = { count: 0, value: 0 };
      }
      stats.byFinancialStatus[fs].count++;
      stats.byFinancialStatus[fs].value += totalLineItemsPrice;
      
      // Por fulfillment_status
      const ffs = order.fulfillment_status || 'null';
      if (!stats.byFulfillmentStatus[ffs]) {
        stats.byFulfillmentStatus[ffs] = { count: 0, value: 0 };
      }
      stats.byFulfillmentStatus[ffs].count++;
      stats.byFulfillmentStatus[ffs].value += totalLineItemsPrice;
      
      // Por source_name
      const src = order.source_name || 'unknown';
      if (!stats.bySourceName[src]) {
        stats.bySourceName[src] = { count: 0, value: 0 };
      }
      stats.bySourceName[src].count++;
      stats.bySourceName[src].value += totalLineItemsPrice;
      
      // Guardar detalhes do pedido (para debug)
      orderDetails.push({
        id: order.id,
        name: order.name,
        created_at: order.created_at,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        cancelled_at: order.cancelled_at,
        test: order.test,
        source_name: order.source_name,
        total_line_items_price: totalLineItemsPrice,
        subtotal_price: subtotalPrice,
        total_price: totalPrice,
        total_discounts: totalDiscounts,
        gross_sales_calculated: grossSalesCalculated,
      });
    }

    // Primeiro e último pedido para verificar período
    const firstOrder = orderDetails[0];
    const lastOrder = orderDetails[orderDetails.length - 1];

    // Formatar valores para exibição
    const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

    return NextResponse.json({
      success: true,
      diagnostico: {
        periodo: {
          solicitado: `${startDateStr} a ${endDateStr}`,
          startISO,
          endISO,
          brazilToday: todayBrazil,
        },
        
        contagem: {
          total: stats.total,
          teste: stats.test,
          cancelados: stats.cancelled,
          validos: stats.valid,
          
          shopifyDeveMostrar: {
            pedidos: stats.total - stats.test, // Shopify mostra todos exceto teste
            nota: 'Shopify inclui cancelados, pending, unpaid. Exclui apenas test.'
          }
        },
        
        vendasBrutas: {
          // Definição Shopify: product price × quantity, includes cancelled/pending/unpaid, excludes test
          metodo1_totalLineItemsPrice: {
            todos: formatBRL(stats.values.totalLineItemsPrice_all),
            semTeste: formatBRL(stats.values.totalLineItemsPrice_nonTest),
            semTesteNemCancelado: formatBRL(stats.values.totalLineItemsPrice_valid),
          },
          metodo2_calculoManual: {
            todos: formatBRL(stats.values.grossSalesCalculated_all),
            semTeste: formatBRL(stats.values.grossSalesCalculated_nonTest),
            semTesteNemCancelado: formatBRL(stats.values.grossSalesCalculated_valid),
          },
          
          conclusao: {
            valorCorretoParaShopify: formatBRL(stats.values.totalLineItemsPrice_nonTest),
            nota: 'Shopify Gross Sales = total_line_items_price de pedidos não-teste (inclui cancelados)'
          }
        },
        
        outrosValores: {
          subtotal: {
            semTeste: formatBRL(stats.values.subtotal_nonTest),
            nota: 'Subtotal = Gross Sales - Descontos de linha'
          },
          totalPrice: {
            semTeste: formatBRL(stats.values.totalPrice_nonTest),
            nota: 'Total = Subtotal + Frete + Impostos'
          },
          descontos: {
            semTeste: formatBRL(stats.values.totalDiscounts_nonTest),
          }
        },
        
        porStatus: {
          financial: stats.byFinancialStatus,
          fulfillment: stats.byFulfillmentStatus,
          source: stats.bySourceName,
        },
        
        primeiroUltimoPedido: {
          primeiro: firstOrder ? {
            id: firstOrder.id,
            name: firstOrder.name,
            created_at: firstOrder.created_at,
            total_line_items_price: formatBRL(firstOrder.total_line_items_price),
            test: firstOrder.test,
            cancelled: !!firstOrder.cancelled_at,
          } : null,
          ultimo: lastOrder ? {
            id: lastOrder.id,
            name: lastOrder.name,
            created_at: lastOrder.created_at,
            total_line_items_price: formatBRL(lastOrder.total_line_items_price),
            test: lastOrder.test,
            cancelled: !!lastOrder.cancelled_at,
          } : null,
        },
        
        // Lista de pedidos cancelados para verificação
        pedidosCancelados: orderDetails
          .filter(o => o.cancelled_at !== null && !o.test)
          .map(o => ({
            id: o.id,
            name: o.name,
            created_at: o.created_at,
            total_line_items_price: formatBRL(o.total_line_items_price),
            financial_status: o.financial_status,
          })),
          
        // Lista de pedidos de teste
        pedidosTeste: orderDetails
          .filter(o => o.test)
          .map(o => ({
            id: o.id,
            name: o.name,
            total_line_items_price: formatBRL(o.total_line_items_price),
          })),
      },
      
      // Resumo comparativo
      comparativo: {
        shopifyEsperado: {
          vendasBrutas: 'R$ 62.868,60',
          pedidos: 339,
        },
        worderCalculado: {
          vendasBrutas_metodoAtual: formatBRL(stats.values.totalLineItemsPrice_valid),
          vendasBrutas_metodoCorreto: formatBRL(stats.values.totalLineItemsPrice_nonTest),
          pedidos_metodoAtual: stats.valid,
          pedidos_metodoCorreto: stats.total - stats.test,
        },
        diferencas: {
          vendasBrutas: formatBRL(62868.60 - stats.values.totalLineItemsPrice_nonTest),
          pedidos: 339 - (stats.total - stats.test),
        }
      }
    });
  } catch (error: any) {
    console.error('[Diagnostico] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}
