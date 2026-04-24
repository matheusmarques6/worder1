import { NextRequest, NextResponse } from 'next/server';
import { assertDebugAllowed } from '@/lib/debug-guard';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2025-01';
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

async function fetchAllOrdersDebug(
  shopDomain: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const allOrders: any[] = [];
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < 50) {
    let endpoint: string;
    
    if (pageInfo) {
      endpoint = `/orders.json?page_info=${encodeURIComponent(pageInfo)}&limit=250`;
    } else {
      endpoint = `/orders.json?status=any&created_at_min=${encodeURIComponent(startDate)}&created_at_max=${encodeURIComponent(endDate)}&limit=250&order=created_at+asc`;
    }

    const { body, headers } = await shopifyFetch(shopDomain, accessToken, endpoint);
    const orders = body.orders || [];
    
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
  const blocked = assertDebugAllowed(request); if (blocked) return blocked;
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

    // Calcular período de 7 dias (mesmo que Shopify)
    const now = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(now.getTime() + (brazilOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    
    const todayBrazil = brazilTime.toISOString().split('T')[0];
    
    // 7 dias = hoje + 6 dias anteriores
    const endDate = new Date(todayBrazil + 'T12:00:00Z');
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const startISO = `${startDateStr}T00:00:00${TZ_OFFSET}`;
    const endISO = `${endDateStr}T23:59:59${TZ_OFFSET}`;

    // Buscar TODOS os pedidos
    const allOrders = await fetchAllOrdersDebug(shop_domain, access_token, startISO, endISO);

    // Análise detalhada
    const analysis = {
      total: allOrders.length,
      test: 0,
      cancelled: 0,
      testAndCancelled: 0,
      valid: 0,
      byFinancialStatus: {} as Record<string, number>,
      byFulfillmentStatus: {} as Record<string, number>,
      bySourceName: {} as Record<string, number>,
    };

    let totalVendasBrutas = 0;
    let totalVendasBrutasValidos = 0;

    for (const o of allOrders) {
      // Contar por status
      const fs = o.financial_status || 'unknown';
      analysis.byFinancialStatus[fs] = (analysis.byFinancialStatus[fs] || 0) + 1;

      const ffs = o.fulfillment_status || 'unfulfilled';
      analysis.byFulfillmentStatus[ffs] = (analysis.byFulfillmentStatus[ffs] || 0) + 1;

      const src = o.source_name || 'unknown';
      analysis.bySourceName[src] = (analysis.bySourceName[src] || 0) + 1;

      // Classificar
      if (o.test && o.cancelled_at) {
        analysis.testAndCancelled++;
      } else if (o.test) {
        analysis.test++;
      } else if (o.cancelled_at) {
        analysis.cancelled++;
      } else {
        analysis.valid++;
        totalVendasBrutasValidos += parseFloat(o.total_line_items_price || '0');
      }

      totalVendasBrutas += parseFloat(o.total_line_items_price || '0');
    }

    // Calcular vendas incluindo cancelados (como Shopify faz?)
    let vendasComCancelados = 0;
    let vendasSemCancelados = 0;
    let vendasSemTesteNemCancelados = 0;

    for (const o of allOrders) {
      const valor = parseFloat(o.total_line_items_price || '0');
      
      vendasComCancelados += valor;
      
      if (!o.cancelled_at) {
        vendasSemCancelados += valor;
      }
      
      if (!o.test && !o.cancelled_at) {
        vendasSemTesteNemCancelados += valor;
      }
    }

    // Primeiros e últimos pedidos para verificar período
    const firstOrder = allOrders[0];
    const lastOrder = allOrders[allOrders.length - 1];

    return NextResponse.json({
      success: true,
      debug: {
        periodo: {
          solicitado: `${startDateStr} a ${endDateStr}`,
          startISO,
          endISO,
          brazilToday: todayBrazil,
        },
        pedidos: {
          total: analysis.total,
          teste: analysis.test,
          cancelados: analysis.cancelled,
          testeECancelados: analysis.testAndCancelled,
          validos: analysis.valid,
          formulaWorder: `${analysis.valid} (excluindo teste e cancelados)`,
        },
        vendas: {
          comTudo: vendasComCancelados.toFixed(2),
          semCancelados: vendasSemCancelados.toFixed(2),
          semTesteNemCancelados: vendasSemTesteNemCancelados.toFixed(2),
          nota: 'Shopify provavelmente usa "comTudo" ou "semCancelados"',
        },
        porStatus: {
          financial: analysis.byFinancialStatus,
          fulfillment: analysis.byFulfillmentStatus,
          source: analysis.bySourceName,
        },
        primeiroUltimo: {
          primeiro: firstOrder ? {
            id: firstOrder.id,
            created_at: firstOrder.created_at,
            total: firstOrder.total_line_items_price,
            test: firstOrder.test,
            cancelled: !!firstOrder.cancelled_at,
          } : null,
          ultimo: lastOrder ? {
            id: lastOrder.id,
            created_at: lastOrder.created_at,
            total: lastOrder.total_line_items_price,
            test: lastOrder.test,
            cancelled: !!lastOrder.cancelled_at,
          } : null,
        },
      },
    });
  } catch (error: any) {
    console.error('[Debug] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}
