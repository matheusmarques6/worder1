import { NextRequest, NextResponse } from 'next/server';
import { requireStore } from '@/lib/api/guards';

// ===== VERSÃO DO CÓDIGO - ATUALIZAR A CADA DEPLOY =====
const API_VERSION = 'v8-senior-fix-2024-10-14';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';
const TZ_OFFSET = '-03:00'; // Fuso horário Brasil

// ===== Utils =====
const toNum = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const normEmail = (e: any): string => String(e || '').trim().toLowerCase();

// Calcular variação percentual
const calcChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

// ===== ShopifyQL via GraphQL =====
async function shopifyqlQuery(
  shopDomain: string,
  accessToken: string,
  query: string
): Promise<{ data: any; errors?: any }> {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  const graphqlQuery = {
    query: `{
      shopifyqlQuery(query: "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}") {
        tableData {
          columns {
            name
            dataType
            displayName
          }
          rows
        }
        parseErrors
      }
    }`
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ShopifyQL] Error response:', text);
    return { data: null, errors: `HTTP ${response.status}` };
  }

  const result = await response.json();
  return { data: result.data, errors: result.errors };
}

// ===== Buscar métricas de clientes via ShopifyQL =====
async function fetchCustomerMetricsFromShopifyQL(
  shopDomain: string,
  accessToken: string,
  daysBack: number
): Promise<{ newCustomers: number; returningCustomers: number; rate: number } | null> {
  try {
    // Query com formato correto sugerido pelo senior
    // Usando "X days ago" ao invés de datas específicas
    const query = `FROM sales SHOW new_customers, returning_customers SINCE ${daysBack} days ago UNTIL today`;
    
    console.log('[ShopifyQL] Query:', query);
    
    const result = await shopifyqlQuery(shopDomain, accessToken, query);
    
    // Log detalhado para debug
    console.log('[ShopifyQL] Raw result:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('[ShopifyQL] Query errors:', result.errors);
      return null;
    }
    
    if (!result.data?.shopifyqlQuery?.tableData) {
      console.error('[ShopifyQL] No tableData in response');
      // Verificar se há parseErrors
      if (result.data?.shopifyqlQuery?.parseErrors) {
        console.error('[ShopifyQL] Parse errors:', result.data.shopifyqlQuery.parseErrors);
      }
      return null;
    }
    
    const { columns, rows } = result.data.shopifyqlQuery.tableData;
    
    console.log('[ShopifyQL] Columns:', columns);
    console.log('[ShopifyQL] Rows:', rows);
    
    if (!rows || rows.length === 0) {
      console.log('[ShopifyQL] No rows returned');
      return null;
    }
    
    // Encontrar índices das colunas
    const newIdx = columns.findIndex((c: any) => c.name === 'new_customers');
    const retIdx = columns.findIndex((c: any) => c.name === 'returning_customers');
    
    if (newIdx === -1 || retIdx === -1) {
      console.error('[ShopifyQL] Columns not found. Available:', columns.map((c: any) => c.name));
      return null;
    }
    
    // Pegar valores da primeira linha (total)
    const row = rows[0];
    const newCustomers = parseInt(row[newIdx]) || 0;
    const returningCustomers = parseInt(row[retIdx]) || 0;
    const total = newCustomers + returningCustomers;
    const rate = total > 0 ? Number(((returningCustomers / total) * 100).toFixed(2)) : 0;
    
    console.log('[ShopifyQL] Final Results:', { newCustomers, returningCustomers, total, rate });
    
    return { newCustomers, returningCustomers, rate };
  } catch (error) {
    console.error('[ShopifyQL] Exception:', error);
    return null;
  }
}

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
        `/customers.json?ids=${idsParam}&fields=id,email,orders_count,created_at&limit=250`
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
function getDateRange(period: string): { 
  startDate: string; 
  endDate: string; 
  startISO: string; 
  endISO: string;
  prevStartDate: string;
  prevStartISO: string;
  prevEndISO: string;
  daysInPeriod: number;
} {
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
      daysBack = 6; // 7 dias total (hoje + 6 anteriores)
      endDateStr = todayBrazil;
      break;
    case '30d':
      daysBack = 29; // 30 dias total
      endDateStr = todayBrazil;
      break;
    case '90d':
      daysBack = 89; // 90 dias total
      endDateStr = todayBrazil;
      break;
    default:
      daysBack = 6;
      endDateStr = todayBrazil;
  }

  // Calcular data de início do período atual
  const endDate = new Date(endDateStr + 'T12:00:00Z');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);
  
  const startDateStr = startDate.toISOString().split('T')[0];

  // Calcular período anterior (mesmo tamanho)
  const daysInPeriod = daysBack + 1;
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - daysBack);

  const prevStartDateStr = prevStartDate.toISOString().split('T')[0];
  const prevEndDateStr = prevEndDate.toISOString().split('T')[0];

  // Format with timezone for Shopify API
  const startISO = `${startDateStr}T00:00:00${TZ_OFFSET}`;
  const endISO = `${endDateStr}T23:59:59${TZ_OFFSET}`;
  const prevStartISO = `${prevStartDateStr}T00:00:00${TZ_OFFSET}`;
  const prevEndISO = `${prevEndDateStr}T23:59:59${TZ_OFFSET}`;

  console.log(`[Analytics] Period: ${period}`);
  console.log(`[Analytics] Current: ${startDateStr} to ${endDateStr} (${daysInPeriod} days)`);
  console.log(`[Analytics] Previous: ${prevStartDateStr} to ${prevEndDateStr}`);

  return { 
    startDate: startDateStr, 
    endDate: endDateStr, 
    startISO, 
    endISO,
    prevStartDate: prevStartDateStr,
    prevStartISO,
    prevEndISO,
    daysInPeriod,
  };
}

// ===== Calculate KPIs from orders =====
interface KPIResult {
  vendasBrutas: number;
  descontos: number;
  devolucoes: number;
  frete: number;
  tributos: number;
  pedidosTotal: number;
  pedidosCancelados: number;
  pedidosValidos: number;
  vendasLiquidas: number;
  totalVendas: number;
  ticketMedio: number;
  clientesUnicos: number;
  clientesRecorrentes: number;
  clientesPrimeiraVez: number;
  taxaRecorrentes: number;
}

function calculateKPIsFromOrders(
  orders: any[],
  customerMap: Map<number, any>,
  periodStartDate?: string
): KPIResult {
  // Filtrar pedidos (excluindo apenas teste)
  // IMPORTANTE: Shopify INCLUI pedidos cancelados nas vendas brutas!
  const allNonTestOrders = orders.filter((o: any) => !o.test);
  const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);
  const cancelledOrders = orders.filter((o: any) => !o.test && o.cancelled_at);
  
  let vendasBrutas = 0;
  let descontos = 0;
  let devolucoes = 0;
  let frete = 0;
  let tributos = 0;

  // Tracking de clientes
  const uniqueCustomerIds = new Set<number>();
  const returningCustomerIds = new Set<number>();
  const firstTimeCustomerIds = new Set<number>();
  const customerOrdersInPeriod = new Map<number, number>();
  
  // Data de início do período para comparar (não mais necessário com nova lógica)
  // const periodStart = periodStartDate ? new Date(periodStartDate) : null;

  // VENDAS BRUTAS: Inclui TODOS os pedidos (inclusive cancelados), como Shopify faz
  for (const o of allNonTestOrders) {
    vendasBrutas += toNum(o.total_line_items_price);
    descontos += toNum(o.total_discounts || 0);

    // Shipping
    if (Array.isArray(o.shipping_lines)) {
      for (const sl of o.shipping_lines) {
        let shippingAmount = toNum(sl.price || 0);
        if (Array.isArray(sl.discount_allocations)) {
          for (const da of sl.discount_allocations) {
            shippingAmount -= toNum(da.amount || 0);
          }
        }
        frete += shippingAmount;
      }
    }

    // Taxes
    if (Array.isArray(o.tax_lines)) {
      for (const tl of o.tax_lines) {
        tributos += toNum(tl.price || 0);
      }
    }

    // Refunds
    if (Array.isArray(o.refunds)) {
      for (const refund of o.refunds) {
        let mercadoriaRefund = 0;
        let freteRefund = 0;

        if (Array.isArray(refund.refund_line_items)) {
          for (const rli of refund.refund_line_items) {
            mercadoriaRefund += toNum(rli.subtotal || 0);
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

  // Contar pedidos por cliente no período
  // IMPORTANTE: Usar apenas pedidos VÁLIDOS (não cancelados) para taxa de recorrentes
  // A Shopify não conta pedidos cancelados na métrica de clientes novos/recorrentes
  for (const o of validOrders) {
    const customer = o.customer;
    if (customer?.id) {
      if (!customerOrdersInPeriod.has(customer.id)) {
        customerOrdersInPeriod.set(customer.id, 0);
      }
      customerOrdersInPeriod.set(customer.id, customerOrdersInPeriod.get(customer.id)! + 1);
    }
  }

  // Agora calcular clientes novos vs recorrentes
  // Lógica Shopify:
  // - Recorrente = cliente que já tinha pedidos ANTES do período
  // - Novo = cliente cujo primeiro pedido foi DURANTE o período
  for (const [customerId, ordersInPeriod] of customerOrdersInPeriod) {
    uniqueCustomerIds.add(customerId);
    
    const customerData = customerMap.get(customerId);
    const totalOrdersCount = customerData?.orders_count || ordersInPeriod;
    
    // Se total de pedidos do cliente > pedidos no período → tinha pedidos antes → recorrente
    // Se total de pedidos do cliente == pedidos no período → todos são do período → novo
    const ordersBeforePeriod = totalOrdersCount - ordersInPeriod;
    
    if (ordersBeforePeriod > 0) {
      returningCustomerIds.add(customerId);
    } else {
      firstTimeCustomerIds.add(customerId);
    }
  }

  const vendasLiquidas = vendasBrutas - descontos - devolucoes;
  const totalVendas = vendasLiquidas + frete + tributos;
  
  // IMPORTANTE: Shopify conta TODOS os pedidos (inclusive cancelados) no KPI "Pedidos"
  const pedidosTotal = allNonTestOrders.length;
  const ticketMedio = pedidosTotal > 0 ? vendasLiquidas / pedidosTotal : 0;

  const clientesUnicos = uniqueCustomerIds.size;
  const clientesRecorrentes = returningCustomerIds.size;
  const clientesPrimeiraVez = firstTimeCustomerIds.size;
  const denomRec = clientesRecorrentes + clientesPrimeiraVez;
  const taxaRecorrentes = denomRec > 0 
    ? Number(((clientesRecorrentes / denomRec) * 100).toFixed(2)) 
    : 0;

  return {
    vendasBrutas,
    descontos,
    devolucoes,
    frete,
    tributos,
    pedidosTotal,
    pedidosCancelados: cancelledOrders.length,
    pedidosValidos: validOrders.length,
    vendasLiquidas,
    totalVendas,
    ticketMedio,
    clientesUnicos,
    clientesRecorrentes,
    clientesPrimeiraVez,
    taxaRecorrentes,
  };
}

export async function GET(request: NextRequest) {
  // A loja vem pela URL e daqui sai o access_token dela para chamar a
  // Shopify. Sem esta cerca, um id de loja de outra organização bastava.
  const guard = await requireStore(request);
  if (!guard.ok) return guard.response;
  const { supabase, storeId, organizationId } = guard;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';

    // Get store from database
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ success: false, error: 'Store not found' });
    }

    const { shop_domain, access_token } = store;

    if (!shop_domain || !access_token) {
      return NextResponse.json({ success: false, error: 'Store credentials missing' });
    }

    // Get date ranges (current + previous period)
    const { 
      startDate, 
      endDate, 
      startISO, 
      endISO, 
      prevStartDate,
      prevStartISO, 
      prevEndISO,
      daysInPeriod,
    } = getDateRange(period);

    // ========================================
    // 1. FETCH CURRENT PERIOD ORDERS
    // ========================================
    console.log(`[Analytics] Fetching current period orders: ${startISO} to ${endISO}`);
    const currentOrders = await fetchAllOrders(shop_domain, access_token, startISO, endISO);
    console.log(`[Analytics] Current period orders: ${currentOrders.length}`);

    // ========================================
    // 2. FETCH PREVIOUS PERIOD ORDERS (for comparison)
    // ========================================
    console.log(`[Analytics] Fetching previous period orders: ${prevStartISO} to ${prevEndISO}`);
    const previousOrders = await fetchAllOrders(shop_domain, access_token, prevStartISO, prevEndISO);
    console.log(`[Analytics] Previous period orders: ${previousOrders.length}`);

    // ========================================
    // 3. FETCH ORDERS WITH FULFILLMENTS
    // ========================================
    const ordersWithFulfillments = await fetchOrdersWithFulfillments(
      shop_domain,
      access_token,
      startISO,
      endISO
    );

    // ========================================
    // 4. COUNT FULFILLED ORDERS IN PERIOD
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
    console.log(`[Analytics] Fulfilled orders: ${pedidosProcessados}`);

    // ========================================
    // 5. FETCH CUSTOMER DATA
    // ========================================
    const validOrders = currentOrders.filter((o: any) => !o.test && !o.cancelled_at);
    const uniqueCustomerIds = new Set<number>();

    for (const order of validOrders) {
      const c = order.customer || {};
      if (c.id) {
        uniqueCustomerIds.add(c.id);
      }
    }

    console.log(`[Analytics] Fetching ${uniqueCustomerIds.size} customers...`);
    const customerMap = await fetchCustomersBatch(
      shop_domain,
      access_token,
      Array.from(uniqueCustomerIds)
    );

    // Also fetch customers from previous period
    const prevValidOrders = previousOrders.filter((o: any) => !o.test && !o.cancelled_at);
    const prevUniqueCustomerIds = new Set<number>();
    for (const order of prevValidOrders) {
      const c = order.customer || {};
      if (c.id) prevUniqueCustomerIds.add(c.id);
    }
    
    const prevCustomerMap = await fetchCustomersBatch(
      shop_domain,
      access_token,
      Array.from(prevUniqueCustomerIds)
    );

    // ========================================
    // 6. CALCULATE KPIs FOR BOTH PERIODS
    // ========================================
    const currentKPIs = calculateKPIsFromOrders(currentOrders, customerMap, startDate);
    const previousKPIs = calculateKPIsFromOrders(previousOrders, prevCustomerMap, prevStartDate);

    // ========================================
    // 6.5 BUSCAR TAXA DE RECORRENTES VIA SHOPIFYQL (direto da Shopify!)
    // ========================================
    let shopifyqlCurrentRate: number | null = null;
    let shopifyqlPreviousRate: number | null = null;
    
    try {
      console.log('[ShopifyQL] Fetching customer metrics...');
      console.log('[ShopifyQL] Period days:', daysInPeriod);
      
      // Buscar métricas do período atual
      // Para período anterior, dobramos o daysInPeriod e depois calculamos
      const currentMetrics = await fetchCustomerMetricsFromShopifyQL(
        shop_domain, 
        access_token, 
        daysInPeriod
      );
      
      // Para o período anterior, buscamos o dobro e subtraímos
      const doubleMetrics = await fetchCustomerMetricsFromShopifyQL(
        shop_domain, 
        access_token, 
        daysInPeriod * 2
      );
      
      if (currentMetrics) {
        shopifyqlCurrentRate = currentMetrics.rate;
        console.log('[ShopifyQL] Current rate from Shopify:', shopifyqlCurrentRate);
      }
      
      // Calcular taxa do período anterior (se temos os dois dados)
      if (doubleMetrics && currentMetrics) {
        const prevNew = doubleMetrics.newCustomers - currentMetrics.newCustomers;
        const prevRet = doubleMetrics.returningCustomers - currentMetrics.returningCustomers;
        const prevTotal = prevNew + prevRet;
        shopifyqlPreviousRate = prevTotal > 0 ? Number(((prevRet / prevTotal) * 100).toFixed(2)) : 0;
        console.log('[ShopifyQL] Previous rate calculated:', shopifyqlPreviousRate);
      }
    } catch (error) {
      console.error('[ShopifyQL] Failed to fetch metrics, using calculated values:', error);
    }
    
    // Usar valores do ShopifyQL se disponíveis, senão usar calculados
    const finalCurrentRate = shopifyqlCurrentRate !== null ? shopifyqlCurrentRate : currentKPIs.taxaRecorrentes;
    const finalPreviousRate = shopifyqlPreviousRate !== null ? shopifyqlPreviousRate : previousKPIs.taxaRecorrentes;

    console.log(`[Analytics] Current KPIs:`, {
      vendasBrutas: currentKPIs.vendasBrutas,
      pedidos: currentKPIs.pedidosTotal,
      taxaRecorrentes: currentKPIs.taxaRecorrentes,
      taxaRecorrentesShopifyQL: shopifyqlCurrentRate,
      taxaRecorrentesFinal: finalCurrentRate,
    });
    console.log(`[Analytics] Previous KPIs:`, {
      vendasBrutas: previousKPIs.vendasBrutas,
      pedidos: previousKPIs.pedidosTotal,
      taxaRecorrentes: previousKPIs.taxaRecorrentes,
      taxaRecorrentesShopifyQL: shopifyqlPreviousRate,
      taxaRecorrentesFinal: finalPreviousRate,
    });

    // ========================================
    // 7. CALCULATE VARIATIONS
    // ========================================
    const vendasBrutasChange = calcChange(currentKPIs.vendasBrutas, previousKPIs.vendasBrutas);
    const pedidosChange = calcChange(currentKPIs.pedidosTotal, previousKPIs.pedidosTotal);
    // Usar valores do ShopifyQL para taxa de recorrentes
    const taxaRecorrentesChange = calcChange(finalCurrentRate, finalPreviousRate);
    const descontosChange = calcChange(currentKPIs.descontos, previousKPIs.descontos);
    const devolucoesChange = calcChange(currentKPIs.devolucoes, previousKPIs.devolucoes);
    const vendasLiquidasChange = calcChange(currentKPIs.vendasLiquidas, previousKPIs.vendasLiquidas);
    const freteChange = calcChange(currentKPIs.frete, previousKPIs.frete);
    const tributosChange = calcChange(currentKPIs.tributos, previousKPIs.tributos);
    const ticketMedioChange = calcChange(currentKPIs.ticketMedio, previousKPIs.ticketMedio);

    console.log(`[Analytics] Variations:`, {
      vendasBrutasChange,
      pedidosChange,
      taxaRecorrentesChange,
      taxaRecorrentesFinal: finalCurrentRate,
    });

    // ========================================
    // 8. BUILD PRODUCTS AND CHANNELS DATA
    // ========================================
    const produtosMap = new Map<string, {
      product_title: string;
      variant_title: string;
      sku: string;
      quantidade_vendida: number;
      receita_bruta: number;      // Gross: price * quantity
      descontos_aplicados: number; // Discount allocations
      receita_liquida: number;    // Net: gross - discounts
      numero_pedidos: number;
    }>();

    const channelMap = new Map<string, number>();

    for (const o of validOrders) {
      // Channel tracking
      let channelName = o.source_name || 'web';
      if (channelName === 'shopify_draft_order') {
        channelName = 'Draft Orders';
      } else if (channelName === 'web') {
        channelName = 'Online Store';
      } else if (channelName === 'pos') {
        channelName = 'POS';
      } else if (/^\d+$/.test(channelName)) {
        const appName = o.app_title || o.source_identifier || null;
        if (appName) {
          channelName = appName;
        } else {
          channelName = `App (${channelName.substring(0, 8)}...)`;
        }
      }
      channelMap.set(channelName, (channelMap.get(channelName) || 0) + toNum(o.total_price || 0));

      // Products - calcular NET SALES como Shopify faz
      // IMPORTANTE: Shopify agrupa por PRODUTO (todas as variantes juntas), não por variante
      if (Array.isArray(o.line_items)) {
        for (const item of o.line_items) {
          // Agrupar por product_id apenas (não por variant_id)
          // Isso soma todas as variantes do mesmo produto
          const key = `${item.product_id}`;
          const productTitle = item.title || item.name || 'Sem título';
          
          if (!produtosMap.has(key)) {
            produtosMap.set(key, {
              product_title: productTitle,
              variant_title: '', // Não usado quando agrupado por produto
              sku: item.sku || '',
              quantidade_vendida: 0,
              receita_bruta: 0,
              descontos_aplicados: 0,
              receita_liquida: 0,
              numero_pedidos: 0,
            });
          }
          const p = produtosMap.get(key)!;
          
          const qty = toNum(item.quantity || 0);
          const price = toNum(item.price || 0);
          const grossAmount = price * qty;
          
          // Desconto alocado a este item (pode vir de cupom de pedido distribuído)
          let discountAmount = 0;
          if (Array.isArray(item.discount_allocations)) {
            for (const alloc of item.discount_allocations) {
              discountAmount += toNum(alloc.amount || 0);
            }
          }
          // Fallback: usar total_discount do item se não tiver allocations
          if (discountAmount === 0 && item.total_discount) {
            discountAmount = toNum(item.total_discount);
          }
          
          const netAmount = grossAmount - discountAmount;
          
          p.quantidade_vendida += qty;
          p.receita_bruta += grossAmount;
          p.descontos_aplicados += discountAmount;
          p.receita_liquida += netAmount;
          p.numero_pedidos += 1;
        }
      }
    }

    // Log debug para produtos
    console.log('[Analytics] Products debug - Total unique products:', produtosMap.size);
    const topProduct = Array.from(produtosMap.values()).sort((a, b) => b.receita_liquida - a.receita_liquida)[0];
    if (topProduct) {
      console.log('[Analytics] Top product:', {
        nome: topProduct.product_title,
        receita_bruta: topProduct.receita_bruta,
        descontos: topProduct.descontos_aplicados,
        receita_liquida: topProduct.receita_liquida,
      });
    }

    // Top products by NET revenue (como Shopify faz em "Total de vendas por produto")
    const vendasPorProduto = Array.from(produtosMap.values())
      .sort((a, b) => b.receita_liquida - a.receita_liquida)
      .slice(0, 10)
      .map((p) => ({
        nome: p.product_title,
        variante: p.variant_title,
        quantidade: p.quantidade_vendida,
        vendas: Number(p.receita_liquida.toFixed(2)),  // NET sales
        vendasBrutas: Number(p.receita_bruta.toFixed(2)),
        descontos: Number(p.descontos_aplicados.toFixed(2)),
        pedidos: p.numero_pedidos,
      }));

    // Sales by channel
    const vendasPorCanal = Array.from(channelMap.entries())
      .map(([nome, vendas]) => ({ nome, vendas: Number(vendas.toFixed(2)) }))
      .sort((a, b) => b.vendas - a.vendas);

    // ========================================
    // 9. BUILD CHART DATA
    // ========================================
    const dailySalesMap = new Map<string, number>();
    const dailyOrdersMap = new Map<string, number>();

    for (const o of validOrders) {
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
        label: dateStr,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // ========================================
    // 10. RETURN RESPONSE
    // ========================================
    return NextResponse.json({
      success: true,
      _api_version: API_VERSION, // Para debug - remover depois
      data: {
        // Main KPIs
        vendasBrutas: Number(currentKPIs.vendasBrutas.toFixed(2)),
        vendasBrutasChange,

        // Usar valor do ShopifyQL se disponível
        taxaClientesRecorrentes: finalCurrentRate,
        taxaClientesRecorrentesChange: taxaRecorrentesChange,

        pedidosProcessados,
        pedidosProcessadosChange: 0, // Não temos histórico de fulfillments

        pedidos: currentKPIs.pedidosTotal,
        pedidosChange,

        // Detalhamento
        totalDescontos: Number(currentKPIs.descontos.toFixed(2)),
        descontosChange,

        totalDevolucoes: Number(currentKPIs.devolucoes.toFixed(2)),
        devolucoesChange,

        vendasLiquidas: Number(currentKPIs.vendasLiquidas.toFixed(2)),
        vendasLiquidasChange,

        totalFrete: Number(currentKPIs.frete.toFixed(2)),
        freteChange,

        totalTributos: Number(currentKPIs.tributos.toFixed(2)),
        tributosChange,

        totalVendas: Number(currentKPIs.totalVendas.toFixed(2)),

        // Valor médio
        valorMedioPedido: Number(currentKPIs.ticketMedio.toFixed(2)),
        valorMedioPedidoChange: ticketMedioChange,

        // Charts
        chartData,

        // Breakdowns
        vendasPorCanal,
        vendasPorProduto,

        // Customer data
        clientesTotalPeriodo: currentKPIs.clientesUnicos,
        clientesRecorrentes: currentKPIs.clientesRecorrentes,
        clientesPrimeiraVez: currentKPIs.clientesPrimeiraVez,
        clientesNovos: currentKPIs.clientesPrimeiraVez,

        // Period info
        periodo: {
          inicio: startDate,
          fim: endDate,
          label: period,
          dias: daysInPeriod,
        },

        // Store info
        loja: {
          nome: store.shop_name,
          dominio: store.shop_domain,
        },

        // Debug info
        debug: {
          currentPeriodOrders: currentOrders.length,
          previousPeriodOrders: previousOrders.length,
          validOrders: validOrders.length,
          customersFound: customerMap.size,
        },
      },
    });
  } catch (error: any) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}
