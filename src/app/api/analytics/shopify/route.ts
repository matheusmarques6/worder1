import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2024-10';
const TZ_OFFSET = '-03:00'; // Fuso horário Brasil

// ===== Utils =====
const toNum = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const normEmail = (e: any): string => String(e || '').trim().toLowerCase();

// ===== Shopify API Client =====
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

// ===== Pagination Helper =====
async function fetchAllOrders(
  shopDomain: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  maxPages: number = 50
): Promise<any[]> {
  const allOrders: any[] = [];
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
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

    // Extract next page from Link header
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

// ===== Fetch Orders with Fulfillments =====
async function fetchOrdersWithFulfillments(
  shopDomain: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  maxPages: number = 50
): Promise<any[]> {
  const allOrders: any[] = [];
  let pageInfo: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    let endpoint: string;
    const fields = 'id,cancelled_at,test,fulfillments,updated_at,customer';
    
    if (pageInfo) {
      endpoint = `/orders.json?page_info=${encodeURIComponent(pageInfo)}&limit=250&fields=${fields}`;
    } else {
      endpoint = `/orders.json?status=any&updated_at_min=${encodeURIComponent(startDate)}&updated_at_max=${encodeURIComponent(endDate)}&order=updated_at+asc&limit=250&fields=${fields}`;
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

// ===== Fetch Customers in Batches =====
async function fetchCustomersBatch(
  shopDomain: string,
  accessToken: string,
  customerIds: number[]
): Promise<Map<number, any>> {
  const customerMap = new Map<number, any>();

  for (let i = 0; i < customerIds.length; i += 250) {
    const batch = customerIds.slice(i, i + 250);
    const idsParam = batch.join(',');

    try {
      const { body } = await shopifyFetch(
        shopDomain,
        accessToken,
        `/customers.json?ids=${idsParam}&fields=id,email,orders_count&limit=250`
      );

      for (const customer of body.customers || []) {
        customerMap.set(customer.id, customer);
      }
    } catch (e) {
      console.error('Error fetching customer batch:', e);
    }
  }

  return customerMap;
}

// ===== Get Date Range =====
// Corrigido para usar timezone do Brasil (UTC-3)
function getDateRange(period: string): { startDate: string; endDate: string; startISO: string; endISO: string } {
  // Calcular a data atual no Brasil (UTC-3)
  const nowUTC = new Date();
  const brazilOffset = -3 * 60; // -3 horas em minutos
  const brazilTime = new Date(nowUTC.getTime() + (brazilOffset * 60 * 1000) + (nowUTC.getTimezoneOffset() * 60 * 1000));
  
  // Extrair apenas a data (YYYY-MM-DD) no horário do Brasil
  const todayBrazil = brazilTime.toISOString().split('T')[0];
  
  let daysBack: number;
  let endDateStr: string;
  
  switch (period) {
    case 'today':
      daysBack = 0;
      endDateStr = todayBrazil;
      break;
    case 'yesterday':
      daysBack = 0;
      // Para "ontem", end é ontem
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      endDateStr = yesterday.toISOString().split('T')[0];
      break;
    case '7d':
      daysBack = 7; // 8 dias total (hoje + 7 anteriores)
      endDateStr = todayBrazil;
      break;
    case '30d':
      daysBack = 30;
      endDateStr = todayBrazil;
      break;
    case '90d':
      daysBack = 90;
      endDateStr = todayBrazil;
      break;
    default:
      daysBack = 7;
      endDateStr = todayBrazil;
  }

  // Calcular data de início
  const endDate = new Date(endDateStr + 'T12:00:00Z'); // Meio-dia para evitar problemas de timezone
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);
  
  const startDateStr = startDate.toISOString().split('T')[0];

  // Format with timezone for Shopify API
  const startISO = `${startDateStr}T00:00:00${TZ_OFFSET}`;
  const endISO = `${endDateStr}T23:59:59${TZ_OFFSET}`;

  console.log(`Period: ${period}, Brazil today: ${todayBrazil}, Range: ${startDateStr} to ${endDateStr}`);

  return { startDate: startDateStr, endDate: endDateStr, startISO, endISO };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not configured' });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '7d';
    const { startDate, endDate, startISO, endISO } = getDateRange(period);

    // Get store credentials
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, access_token, shop_name')
      .eq('is_active', true)
      .limit(1);

    if (storesError || !stores || stores.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhuma loja conectada',
        needsConnection: true,
      });
    }

    const store = stores[0];
    const { shop_domain, access_token } = store;

    if (!access_token) {
      return NextResponse.json({
        success: false,
        error: 'Token de acesso não encontrado',
        needsConnection: true,
      });
    }

    console.log(`Fetching orders from ${startISO} to ${endISO}`);

    // ========================================
    // 1. FETCH ALL ORDERS IN PERIOD
    // ========================================
    const orders = await fetchAllOrders(shop_domain, access_token, startISO, endISO);
    console.log(`Total orders: ${orders.length}`);

    // ========================================
    // 2. FETCH ORDERS WITH FULFILLMENTS
    // ========================================
    const ordersWithFulfillments = await fetchOrdersWithFulfillments(
      shop_domain,
      access_token,
      startISO,
      endISO
    );

    // ========================================
    // 3. COUNT FULFILLED ORDERS IN PERIOD
    // ========================================
    const inicio = new Date(startISO);
    const fim = new Date(endISO);
    const fulfilledOrderIds = new Set<number>();

    for (const order of ordersWithFulfillments) {
      if (order.test || order.cancelled_at) continue;

      if (order.fulfillments && order.fulfillments.length > 0) {
        const hasFulfillmentInPeriod = order.fulfillments.some((f: any) => {
          const created = new Date(f.created_at);
          return created >= inicio && created <= fim && f.status !== 'cancelled';
        });

        if (hasFulfillmentInPeriod) {
          fulfilledOrderIds.add(order.id);
        }
      }
    }

    const pedidosProcessados = fulfilledOrderIds.size;
    console.log(`Fulfilled orders: ${pedidosProcessados}`);

    // ========================================
    // 4. CUSTOMER RECURRENCE ANALYSIS
    // ========================================
    const periodOrders = orders.filter((o: any) => !o.test);
    const emailToIdMap = new Map<string, number>();
    const uniqueCustomerIds = new Set<number>();

    for (const order of periodOrders) {
      const c = order.customer || {};
      if (c.id) {
        uniqueCustomerIds.add(c.id);
        if (c.email) {
          emailToIdMap.set(normEmail(c.email), c.id);
        }
      }
    }

    // Fetch customers
    console.log(`Fetching ${uniqueCustomerIds.size} customers...`);
    const customerMap = await fetchCustomersBatch(
      shop_domain,
      access_token,
      Array.from(uniqueCustomerIds)
    );

    // ========================================
    // 5. CALCULATE RECURRENCE
    // ========================================
    const canonicalKeyOf = (o: any): string | null => {
      const c = o?.customer || {};
      if (c.id) return `id:${c.id}`;
      const em = normEmail(c.email);
      if (em && emailToIdMap.has(em)) return `id:${emailToIdMap.get(em)}`;
      return em ? `em:${em}` : null;
    };

    const inPeriodCount = new Map<string, number>();

    for (const o of periodOrders) {
      const key = canonicalKeyOf(o);
      if (!key) continue;
      inPeriodCount.set(key, (inPeriodCount.get(key) || 0) + 1);
    }

    const uniqueKeys = Array.from(inPeriodCount.keys());
    const clientesTotalPeriodo = uniqueKeys.length;

    const returningKeys = new Set<string>();
    const firstTimeKeys = new Set<string>();

    for (const key of uniqueKeys) {
      const qtyInPeriod = inPeriodCount.get(key) || 0;

      if (key.startsWith('id:')) {
        const id = Number(key.slice(3));
        const customer = customerMap.get(id);
        const ocLifetime = customer ? Number(customer.orders_count || 0) : qtyInPeriod;

        let isReturning = false;

        // Cliente é recorrente se já comprou antes deste período
        if (ocLifetime > qtyInPeriod) {
          isReturning = true;
        } else if (ocLifetime === qtyInPeriod && qtyInPeriod >= 2) {
          // Todos os pedidos do cliente são neste período, mas fez 2+
          isReturning = true;
        }

        if (isReturning) {
          returningKeys.add(key);
        } else {
          firstTimeKeys.add(key);
        }
      } else {
        // Email only (guest checkout) - se comprou 2+ vezes no período
        if (qtyInPeriod >= 2) {
          returningKeys.add(key);
        } else {
          firstTimeKeys.add(key);
        }
      }
    }

    const clientesRecorrentes = returningKeys.size;
    const clientesPrimeiraVez = firstTimeKeys.size;
    const denomRec = clientesRecorrentes + clientesPrimeiraVez;
    const taxaClientesRecorrentes = denomRec > 0 
      ? Number(((clientesRecorrentes / denomRec) * 100).toFixed(2)) 
      : 0;

    console.log(`Customers: total=${clientesTotalPeriodo}, returning=${clientesRecorrentes}, firstTime=${clientesPrimeiraVez}, rate=${taxaClientesRecorrentes}%`);

    // ========================================
    // 6. CALCULATE SALES KPIs
    // ========================================
    const pedidosTotal = periodOrders.length;
    let vendasBrutas = 0;
    let descontos = 0;
    let devolucoes = 0;
    let frete = 0;
    let tributos = 0;
    let pedidosCancelados = 0;

    const produtosMap = new Map<string, {
      product_title: string;
      variant_title: string;
      sku: string;
      quantidade_vendida: number;
      receita_total: number;
      numero_pedidos: number;
    }>();

    const channelMap = new Map<string, number>();

    for (const o of orders) {
      if (o.test) continue;
      if (o.cancelled_at) pedidosCancelados++;

      // Vendas brutas = soma dos itens (antes de descontos)
      vendasBrutas += toNum(o.total_line_items_price);
      descontos += toNum(o.total_discounts || 0);

      // Channel tracking - usar nome legível
      let channelName = o.source_name || 'web';
      // Mapear nomes de canais conhecidos
      if (channelName === 'shopify_draft_order') {
        channelName = 'Draft Orders';
      } else if (channelName === 'web') {
        channelName = 'Online Store';
      } else if (channelName === 'pos') {
        channelName = 'POS';
      } else if (/^\d+$/.test(channelName)) {
        // Se for apenas números (ID de app), tentar usar outro campo
        channelName = o.channel_information?.channel_definition?.handle || 
                      o.processing_method || 
                      `App (${channelName.substring(0, 8)}...)`;
      }
      channelMap.set(channelName, (channelMap.get(channelName) || 0) + toNum(o.total_price || 0));

      // Products
      if (Array.isArray(o.line_items) && !o.cancelled_at) {
        for (const item of o.line_items) {
          const key = `${item.product_id}_${item.variant_id}`;
          if (!produtosMap.has(key)) {
            produtosMap.set(key, {
              product_title: item.title || item.name || 'Sem título',
              variant_title: item.variant_title || '',
              sku: item.sku || '',
              quantidade_vendida: 0,
              receita_total: 0,
              numero_pedidos: 0,
            });
          }
          const p = produtosMap.get(key)!;
          p.quantidade_vendida += toNum(item.quantity || 0);
          p.receita_total += toNum(item.price || 0) * toNum(item.quantity || 0);
          p.numero_pedidos += 1;
        }
      }

      // Shipping
      if (Array.isArray(o.shipping_lines)) {
        for (const sl of o.shipping_lines) {
          let shippingAmount = toNum(sl.price || 0);
          if (Array.isArray(sl.discount_allocations)) {
            for (const da of sl.discount_allocations) {
              shippingAmount -= toNum(da.amount || 0);
            }
          }
          if (sl.discounted_price !== undefined && sl.discounted_price !== null) {
            shippingAmount = toNum(sl.discounted_price);
          }
          frete += Math.max(0, shippingAmount);
        }
      }

      // Taxes
      tributos += toNum(o.total_tax || 0);

      // Refunds
      if (Array.isArray(o.refunds) && o.refunds.length) {
        for (const refund of o.refunds) {
          let mercadoriaRefund = 0;
          let freteRefund = 0;

          if (Array.isArray(refund.refund_line_items)) {
            for (const rli of refund.refund_line_items) {
              if (rli.subtotal_set?.shop_money) {
                mercadoriaRefund += toNum(rli.subtotal_set.shop_money.amount || 0);
              } else {
                mercadoriaRefund += toNum(rli.subtotal || 0);
              }
            }
          }

          if (Array.isArray(refund.order_adjustments)) {
            for (const adj of refund.order_adjustments) {
              if (adj.kind !== 'shipping_refund' && adj.reason !== 'Shipping refund') {
                const adjAmount = Math.abs(toNum(adj.amount || 0));
                const taxAmount = toNum(adj.tax_amount || 0);
                mercadoriaRefund += adjAmount - Math.abs(taxAmount);
              } else {
                freteRefund += Math.abs(toNum(adj.amount || 0));
              }
            }
          }

          if (refund.shipping) {
            freteRefund += toNum(refund.shipping.amount || 0);
          }

          if (mercadoriaRefund === 0 && freteRefund === 0 && Array.isArray(refund.transactions)) {
            let transTotal = 0;
            for (const t of refund.transactions) {
              if (t.kind === 'refund' && t.status === 'success') {
                transTotal += Math.abs(toNum(t.amount));
              }
            }
            if (transTotal > 0) mercadoriaRefund = transTotal;
          }

          devolucoes += mercadoriaRefund;
          if (freteRefund > 0) frete = Math.max(0, frete - freteRefund);
        }
      }
    }

    // ========================================
    // 7. CALCULATE TOTALS
    // ========================================
    const vendasLiquidas = vendasBrutas - descontos - devolucoes;
    const totalVendas = vendasLiquidas + frete + tributos;
    const ticketMedio = pedidosTotal > 0 ? vendasLiquidas / pedidosTotal : 0;

    // Top products by quantity
    const vendasPorProduto = Array.from(produtosMap.values())
      .sort((a, b) => b.quantidade_vendida - a.quantidade_vendida)
      .slice(0, 10)
      .map((p) => ({
        nome: p.product_title,
        variante: p.variant_title,
        quantidade: p.quantidade_vendida,
        vendas: Number(p.receita_total.toFixed(2)),
        pedidos: p.numero_pedidos,
      }));

    // Sales by channel
    const vendasPorCanal = Array.from(channelMap.entries())
      .map(([nome, vendas]) => ({ nome, vendas: Number(vendas.toFixed(2)) }))
      .sort((a, b) => b.vendas - a.vendas);

    // ========================================
    // 8. BUILD CHART DATA
    // ========================================
    const dailySalesMap = new Map<string, number>();
    const dailyOrdersMap = new Map<string, number>();

    for (const o of periodOrders) {
      const date = o.created_at?.split('T')[0];
      if (date) {
        dailySalesMap.set(date, (dailySalesMap.get(date) || 0) + toNum(o.total_price || 0));
        dailyOrdersMap.set(date, (dailyOrdersMap.get(date) || 0) + 1);
      }
    }

    const chartData: Array<{ date: string; value: number; label: string }> = [];
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);

    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      chartData.push({
        date: dateStr,
        value: dailySalesMap.get(dateStr) || 0,
        label: currentDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // ========================================
    // 9. RETURN RESPONSE
    // ========================================
    return NextResponse.json({
      success: true,
      data: {
        // Main KPIs
        vendasBrutas: Number(vendasBrutas.toFixed(2)),
        vendasBrutasChange: 0,

        taxaClientesRecorrentes,
        taxaClientesRecorrentesChange: 0,

        pedidosProcessados,
        pedidosProcessadosChange: 0,

        pedidos: pedidosTotal,
        pedidosChange: 0,

        // Detalhamento
        totalDescontos: Number(descontos.toFixed(2)),
        descontosChange: 0,

        totalDevolucoes: Number(devolucoes.toFixed(2)),
        devolucoesChange: 0,

        vendasLiquidas: Number(vendasLiquidas.toFixed(2)),
        vendasLiquidasChange: 0,

        totalFrete: Number(frete.toFixed(2)),
        freteChange: 0,

        totalTributos: Number(tributos.toFixed(2)),
        tributosChange: 0,

        totalVendas: Number(totalVendas.toFixed(2)),

        // Valor médio
        valorMedioPedido: Number(ticketMedio.toFixed(2)),
        valorMedioPedidoChange: 0,

        // Charts
        chartData,

        // Breakdowns
        vendasPorCanal,
        vendasPorProduto,

        // Customer data
        clientesTotalPeriodo,
        clientesRecorrentes,
        clientesPrimeiraVez,
        clientesNovos: clientesPrimeiraVez, // Alias para o frontend

        // Period info
        periodo: {
          inicio: startDate,
          fim: endDate,
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
      error: error.message,
    });
  }
}
