import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2025-01';

// Admin client para queries
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !url.includes('placeholder')) {
    return createClient(url, key);
  }
  return null;
}

// Buscar organization_id do usuário logado
async function getUserOrganization(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return profile?.organization_id || null;
}

// Shopify API fetch
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

// Fetch orders with pagination
async function fetchAllOrders(
  shopDomain: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  maxPages: number = 20
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

function getDateRange(period: string): { startISO: string; endISO: string; daysInPeriod: number } {
  const TZ_OFFSET = '-03:00';
  const nowUTC = new Date();
  const brazilOffset = -3 * 60;
  const brazilTime = new Date(nowUTC.getTime() + (brazilOffset * 60 * 1000) + (nowUTC.getTimezoneOffset() * 60 * 1000));
  const todayBrazil = brazilTime.toISOString().split('T')[0];

  let daysBack: number;
  let endDateStr: string = todayBrazil;

  switch (period) {
    case 'today':
      daysBack = 0;
      break;
    case 'yesterday':
      daysBack = 0;
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      endDateStr = yesterday.toISOString().split('T')[0];
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
    case 'all':
    default:
      daysBack = 365; // 1 ano de dados
      break;
  }

  const endDate = new Date(endDateStr + 'T12:00:00Z');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  const startDateStr = startDate.toISOString().split('T')[0];
  const daysInPeriod = daysBack + 1;

  return {
    startISO: `${startDateStr}T00:00:00${TZ_OFFSET}`,
    endISO: `${endDateStr}T23:59:59${TZ_OFFSET}`,
    daysInPeriod,
  };
}

function formatDateLabel(date: Date): string {
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

const toNum = (v: any): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Types for costs and settings
interface ProductCost {
  shopify_product_id: string;
  shopify_variant_id: string | null;
  cost_in_brl: number;
}

interface TaxSettings {
  default_cost_percentage: number;
  default_cost_currency: string;
  payment_gateway_fee: number;
  payment_fixed_fee: number;
  sales_tax_percentage: number;
  marketplace_fee: number;
}

interface CustomFee {
  id: string;
  name: string;
  fee_type: 'percentage' | 'fixed';
  fee_value: number;
  applies_to: 'revenue' | 'profit' | 'cost';
  per_order: boolean;
  is_active: boolean;
}

// Fetch product costs for organization
async function getProductCosts(
  supabase: any,
  organizationId: string,
  storeId?: string
): Promise<Map<string, number>> {
  const costsMap = new Map<string, number>();

  let query = supabase
    .from('product_costs')
    .select('shopify_product_id, shopify_variant_id, cost_in_brl')
    .eq('organization_id', organizationId);

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  const { data: costs } = await query;

  if (costs) {
    for (const cost of costs) {
      // Key: product_id or product_id:variant_id
      const key = cost.shopify_variant_id
        ? `${cost.shopify_product_id}:${cost.shopify_variant_id}`
        : cost.shopify_product_id;
      costsMap.set(key, cost.cost_in_brl || 0);
    }
  }

  return costsMap;
}

// Fetch tax settings for organization
async function getTaxSettings(
  supabase: any,
  organizationId: string
): Promise<TaxSettings> {
  const { data: settings } = await supabase
    .from('organization_tax_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  return {
    default_cost_percentage: settings?.default_cost_percentage ?? 35,
    default_cost_currency: settings?.default_cost_currency ?? 'BRL',
    payment_gateway_fee: settings?.payment_gateway_fee ?? 0,
    payment_fixed_fee: settings?.payment_fixed_fee ?? 0,
    sales_tax_percentage: settings?.sales_tax_percentage ?? 0,
    marketplace_fee: settings?.marketplace_fee ?? 0,
  };
}

// Fetch custom fees for organization
async function getCustomFees(
  supabase: any,
  organizationId: string
): Promise<CustomFee[]> {
  const { data: fees } = await supabase
    .from('custom_fees')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  return fees || [];
}

// Calculate order cost
function calculateOrderCost(
  order: any,
  costsMap: Map<string, number>,
  taxSettings: TaxSettings,
  customFees: CustomFee[]
): { productCost: number; fees: number; totalCost: number } {
  let productCost = 0;
  let fees = 0;

  const totalPrice = toNum(order.total_price);

  // Calculate product costs from line items
  if (Array.isArray(order.line_items)) {
    for (const item of order.line_items) {
      const productId = item.product_id?.toString();
      const variantId = item.variant_id?.toString();
      const quantity = item.quantity || 1;
      const itemPrice = toNum(item.price) * quantity;

      // Try to find specific variant cost first
      let itemCost = 0;
      if (variantId && costsMap.has(`${productId}:${variantId}`)) {
        itemCost = costsMap.get(`${productId}:${variantId}`)! * quantity;
      } else if (productId && costsMap.has(productId)) {
        itemCost = costsMap.get(productId)! * quantity;
      } else {
        // Use default cost percentage
        itemCost = itemPrice * (taxSettings.default_cost_percentage / 100);
      }

      productCost += itemCost;
    }
  } else {
    // Fallback if no line items
    productCost = totalPrice * (taxSettings.default_cost_percentage / 100);
  }

  // Add payment gateway fees
  if (taxSettings.payment_gateway_fee > 0) {
    fees += totalPrice * (taxSettings.payment_gateway_fee / 100);
  }
  if (taxSettings.payment_fixed_fee > 0) {
    fees += taxSettings.payment_fixed_fee;
  }

  // Add marketplace fee
  if (taxSettings.marketplace_fee > 0) {
    fees += totalPrice * (taxSettings.marketplace_fee / 100);
  }

  // Add custom fees
  for (const fee of customFees) {
    if (!fee.is_active) continue;

    let feeBase = 0;
    switch (fee.applies_to) {
      case 'revenue':
        feeBase = totalPrice;
        break;
      case 'cost':
        feeBase = productCost;
        break;
      case 'profit':
        feeBase = totalPrice - productCost;
        break;
    }

    if (fee.fee_type === 'percentage') {
      fees += feeBase * (fee.fee_value / 100);
    } else {
      fees += fee.fee_value;
    }
  }

  return {
    productCost,
    fees,
    totalCost: productCost + fees,
  };
}

// Fetch product images from Shopify
async function fetchProductImages(
  shopDomain: string,
  accessToken: string,
  productIds: string[]
): Promise<Map<string, string>> {
  const imagesMap = new Map<string, string>();

  if (productIds.length === 0) return imagesMap;

  // Fetch up to 50 products at a time
  const idsToFetch = productIds.slice(0, 50);

  try {
    const idsParam = idsToFetch.join(',');
    const { body } = await shopifyFetch(
      shopDomain,
      accessToken,
      `/products.json?ids=${idsParam}&fields=id,image`
    );

    if (body.products) {
      for (const product of body.products) {
        if (product.image?.src) {
          imagesMap.set(product.id.toString(), product.image.src);
        }
      }
    }
  } catch (err) {
    console.error('[metrics] Error fetching product images:', err);
  }

  return imagesMap;
}

// Detect payment method from order
function detectPaymentMethod(order: any): 'credit_card' | 'pix' | 'boleto' | 'debit' | 'other' {
  // Check payment_gateway_names array first (more reliable)
  const gateways = order.payment_gateway_names || [];
  const gateway = (order.gateway || '').toLowerCase();
  const allGateways = [...gateways.map((g: string) => g.toLowerCase()), gateway].join(' ');

  // Check for processing method in transactions
  const transactions = order.transactions || [];
  for (const tx of transactions) {
    const paymentMethod = (tx.payment_method || '').toLowerCase();
    const kind = (tx.kind || '').toLowerCase();

    if (paymentMethod.includes('pix') || tx.gateway?.toLowerCase().includes('pix')) {
      return 'pix';
    }
    if (paymentMethod.includes('boleto') || paymentMethod.includes('bank_slip')) {
      return 'boleto';
    }
    if (paymentMethod.includes('debit') || paymentMethod.includes('debito')) {
      return 'debit';
    }
  }

  // Check gateway names
  if (allGateways.includes('pix')) {
    return 'pix';
  }

  if (allGateways.includes('boleto') || allGateways.includes('bank_slip') || allGateways.includes('bankslip')) {
    return 'boleto';
  }

  if (allGateways.includes('debit') || allGateways.includes('debito')) {
    return 'debit';
  }

  // Credit card detection - check various payment processors
  if (
    allGateways.includes('credit') ||
    allGateways.includes('card') ||
    allGateways.includes('cartao') ||
    allGateways.includes('cielo') ||
    allGateways.includes('rede') ||
    allGateways.includes('stone') ||
    allGateways.includes('getnet') ||
    allGateways.includes('pagseguro') ||
    allGateways.includes('mercadopago') ||
    allGateways.includes('stripe') ||
    allGateways.includes('pagarme') ||
    allGateways.includes('iugu') ||
    allGateways.includes('juno') ||
    allGateways.includes('wirecard') ||
    allGateways.includes('paypal') ||
    allGateways.includes('adyen') ||
    allGateways.includes('braintree') ||
    allGateways.includes('shopify_payments')
  ) {
    return 'credit_card';
  }

  return 'other';
}

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') || '7d';
  const storeId = request.nextUrl.searchParams.get('storeId');

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const organizationId = await getUserOrganization(request);

    if (!organizationId) {
      console.log('[metrics] No organization found for user');
      return NextResponse.json({
        metrics: null,
        totals: { pedidos: 0, pedidosPagos: 0, receita: 0 },
        chartData: [],
        stores: [],
        integrations: { shopify: false, klaviyo: false, meta: false, google: false, tiktok: false },
      });
    }

    console.log('[metrics] Fetching data for organization:', organizationId);

    const { startISO, endISO, daysInPeriod } = getDateRange(range);

    // Buscar lojas da organização
    let storesQuery = supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (storeId) {
      storesQuery = storesQuery.eq('id', storeId);
    }

    const { data: stores } = await storesQuery;

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

    // Fetch tax settings and custom fees for the organization
    const taxSettings = await getTaxSettings(supabase, organizationId);
    const customFees = await getCustomFees(supabase, organizationId);

    console.log('[metrics] Tax settings:', taxSettings);
    console.log('[metrics] Custom fees:', customFees.length);

    // Buscar pedidos de TODAS as lojas diretamente da Shopify API
    let allOrders: any[] = [];
    const storesData: any[] = [];

    for (const store of stores) {
      if (!store.shop_domain || !store.access_token) continue;

      try {
        console.log(`[metrics] Fetching orders from ${store.shop_domain}...`);
        const orders = await fetchAllOrders(
          store.shop_domain,
          store.access_token,
          startISO,
          endISO
        );

        // Fetch product costs for this store
        const costsMap = await getProductCosts(supabase, organizationId, store.id);
        console.log(`[metrics] ${store.shop_domain}: ${costsMap.size} product costs loaded`);

        // Filtrar pedidos válidos (não teste, não cancelado)
        const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);
        const paidOrders = validOrders.filter((o: any) =>
          ['paid', 'partially_paid'].includes(o.financial_status)
        );

        // Calcular métricas da loja com custos REAIS
        let storeReceita = 0;
        let storeImpostos = 0;
        let storeCustos = 0;
        let storeFees = 0;

        for (const o of paidOrders) {
          storeReceita += toNum(o.total_price);
          storeImpostos += toNum(o.total_tax);

          // Calculate real costs for this order
          const orderCosts = calculateOrderCost(o, costsMap, taxSettings, customFees);
          storeCustos += orderCosts.productCost;
          storeFees += orderCosts.fees;
        }

        const totalCosts = storeCustos + storeFees;
        const storeLucro = storeReceita - totalCosts - storeImpostos;

        storesData.push({
          id: store.id,
          name: store.shop_name || store.shop_domain,
          domain: store.shop_domain,
          pedidos: validOrders.length,
          pedidosPagos: paidOrders.length,
          receita: storeReceita,
          custos: totalCosts,
          productCosts: storeCustos,
          fees: storeFees,
          lucro: storeLucro,
          margem: storeReceita > 0 ? (storeLucro / storeReceita) * 100 : 0,
          lastSync: new Date().toISOString(),
          costsLoaded: costsMap.size,
        });

        // Adicionar pedidos ao total com referência da loja e custos
        allOrders.push(...paidOrders.map(o => ({
          ...o,
          store_id: store.id,
          _costsMap: costsMap,
        })));

        console.log(`[metrics] ${store.shop_domain}: ${validOrders.length} orders, R$ ${storeReceita.toFixed(2)}, costs: R$ ${totalCosts.toFixed(2)}`);

      } catch (err) {
        console.error(`[metrics] Error fetching from ${store.shop_domain}:`, err);
        storesData.push({
          id: store.id,
          name: store.shop_name || store.shop_domain,
          domain: store.shop_domain,
          pedidos: 0,
          pedidosPagos: 0,
          receita: 0,
          custos: 0,
          lucro: 0,
          margem: 0,
          error: true,
        });
      }
    }

    // Calcular métricas totais com custos REAIS
    let totalReceita = 0;
    let totalImpostos = 0;
    let totalDescontos = 0;
    let totalFrete = 0;
    let totalProductCosts = 0;
    let totalFees = 0;
    let totalUnits = 0;
    let totalSubtotal = 0;

    // Payment methods breakdown
    const paymentMethods: Record<string, { count: number; value: number }> = {
      credit_card: { count: 0, value: 0 },
      debit: { count: 0, value: 0 },
      pix: { count: 0, value: 0 },
      boleto: { count: 0, value: 0 },
      other: { count: 0, value: 0 },
    };

    // Product profit ranking
    const productProfits = new Map<string, {
      productId: string;
      title: string;
      image: string | null;
      quantity: number;
      revenue: number;
      cost: number;
      profit: number;
    }>();

    // Customer tracking for recurring rate
    const customerOrders = new Map<string, number>();

    // Pending orders tracking
    let pendingOrdersCount = 0;
    let pendingOrdersValue = 0;

    // Global costs map (all stores)
    const globalCostsMap = await getProductCosts(supabase, organizationId);

    // Process ALL orders (including pending) for some stats
    for (const store of stores) {
      if (!store.shop_domain || !store.access_token) continue;

      try {
        const orders = await fetchAllOrders(
          store.shop_domain,
          store.access_token,
          startISO,
          endISO
        );

        const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);

        for (const o of validOrders) {
          // Track pending orders
          if (o.financial_status === 'pending' || o.financial_status === 'authorized') {
            pendingOrdersCount++;
            pendingOrdersValue += toNum(o.total_price);
          }
        }
      } catch (err) {
        console.error(`[metrics] Error processing orders from ${store.shop_domain}:`, err);
      }
    }

    for (const o of allOrders) {
      totalReceita += toNum(o.total_price);
      totalImpostos += toNum(o.total_tax);
      totalDescontos += toNum(o.total_discounts);
      totalSubtotal += toNum(o.subtotal_price);

      if (Array.isArray(o.shipping_lines)) {
        for (const sl of o.shipping_lines) {
          totalFrete += toNum(sl.price);
        }
      }

      // Track customer orders for recurring rate
      const customerId = o.customer?.id?.toString() || o.customer?.email;
      if (customerId) {
        customerOrders.set(customerId, (customerOrders.get(customerId) || 0) + 1);
      }

      // Calculate real costs for this order
      const costsMap = o._costsMap || globalCostsMap;
      const orderCosts = calculateOrderCost(o, costsMap, taxSettings, customFees);
      totalProductCosts += orderCosts.productCost;
      totalFees += orderCosts.fees;

      // Count units sold
      if (Array.isArray(o.line_items)) {
        for (const item of o.line_items) {
          totalUnits += item.quantity || 1;
        }
      }

      // Track payment methods using improved detection
      const paymentMethod = detectPaymentMethod(o);
      const orderValue = toNum(o.total_price);

      paymentMethods[paymentMethod].count++;
      paymentMethods[paymentMethod].value += orderValue;

      // Track product profits
      if (Array.isArray(o.line_items)) {
        for (const item of o.line_items) {
          const productId = item.product_id?.toString();
          if (!productId) continue;

          const quantity = item.quantity || 1;
          const itemPrice = toNum(item.price) * quantity;
          const variantId = item.variant_id?.toString();

          // Calculate item cost
          let itemCost = 0;
          if (variantId && costsMap.has(`${productId}:${variantId}`)) {
            itemCost = costsMap.get(`${productId}:${variantId}`)! * quantity;
          } else if (costsMap.has(productId)) {
            itemCost = costsMap.get(productId)! * quantity;
          } else {
            itemCost = itemPrice * (taxSettings.default_cost_percentage / 100);
          }

          const existing = productProfits.get(productId) || {
            productId,
            title: item.title || item.name || 'Produto',
            image: null,
            quantity: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };

          productProfits.set(productId, {
            ...existing,
            quantity: existing.quantity + quantity,
            revenue: existing.revenue + itemPrice,
            cost: existing.cost + itemCost,
            profit: existing.profit + (itemPrice - itemCost),
          });
        }
      }
    }

    // Calculate recurring customers rate
    const totalCustomers = customerOrders.size;
    const recurringCustomers = Array.from(customerOrders.values()).filter(count => count > 1).length;
    const recurringRate = totalCustomers > 0 ? (recurringCustomers / totalCustomers) * 100 : 0;

    // Fetch product images for top products
    const topProductsList = Array.from(productProfits.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    // Get images from first active store
    let productImages = new Map<string, string>();
    const firstStore = stores.find((s: any) => s.shop_domain && s.access_token);
    if (firstStore && topProductsList.length > 0) {
      productImages = await fetchProductImages(
        firstStore.shop_domain,
        firstStore.access_token,
        topProductsList.map(p => p.productId)
      );
    }

    // Build top products with images
    const topProducts = topProductsList.map((p, index) => ({
      ...p,
      image: productImages.get(p.productId) || null,
      rank: index + 1,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
    }));

    // Sales breakdown
    const salesBreakdown = {
      subtotal: totalSubtotal,
      shipping: totalFrete,
      taxes: totalImpostos,
      discounts: totalDescontos,
      total: totalReceita,
    };

    const totalCustos = totalProductCosts + totalFees;
    const totalLucro = totalReceita - totalCustos - totalImpostos;
    const margem = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0;
    const ticketMedio = allOrders.length > 0 ? totalReceita / allOrders.length : 0;

    // Agrupar por dia para o gráfico com custos REAIS
    const ordersByDate = new Map<string, { receita: number; custos: number; fees: number; impostos: number; lucro: number; pedidos: number }>();

    for (const o of allOrders) {
      const dateStr = o.created_at?.split('T')[0];
      if (!dateStr) continue;

      const existing = ordersByDate.get(dateStr) || { receita: 0, custos: 0, fees: 0, impostos: 0, lucro: 0, pedidos: 0 };
      const orderReceita = toNum(o.total_price);
      const orderImpostos = toNum(o.total_tax);

      // Calculate real costs for chart
      const costsMap = o._costsMap || globalCostsMap;
      const orderCosts = calculateOrderCost(o, costsMap, taxSettings, customFees);
      const orderTotalCosts = orderCosts.productCost + orderCosts.fees;
      const orderLucro = orderReceita - orderTotalCosts - orderImpostos;

      ordersByDate.set(dateStr, {
        receita: existing.receita + orderReceita,
        custos: existing.custos + orderCosts.productCost,
        fees: existing.fees + orderCosts.fees,
        impostos: existing.impostos + orderImpostos,
        lucro: existing.lucro + orderLucro,
        pedidos: existing.pedidos + 1,
      });
    }

    // Criar chartData ordenado por data
    const chartData = Array.from(ordersByDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30) // Últimos 30 dias
      .map(([dateStr, data]) => ({
        date: formatDateLabel(new Date(dateStr + 'T12:00:00Z')),
        receita: data.receita,
        custos: data.custos + data.fees, // Product costs + fees
        marketing: 0,
        impostos: data.impostos,
        lucro: Math.max(0, data.lucro),
        pedidos: data.pedidos,
      }));

    // Se não há dados, criar array vazio com últimos 7 dias
    if (chartData.length === 0) {
      const dayMs = 24 * 60 * 60 * 1000;
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * dayMs);
        chartData.push({
          date: formatDateLabel(d),
          receita: 0, custos: 0, marketing: 0, impostos: 0, lucro: 0, pedidos: 0,
        });
      }
    }

    // Verificar integrações
    const { data: klaviyoAccount } = await supabase
      .from('klaviyo_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { data: metaAccounts } = await supabase
      .from('meta_accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    // Calculate CAC (Cost per Acquisition) - placeholder, needs marketing spend
    const marketingSpend = 0; // TODO: integrate with ad platforms
    const cac = allOrders.length > 0 ? marketingSpend / allOrders.length : 0;

    // Calculate ROI
    const roi = marketingSpend > 0 ? ((totalReceita - marketingSpend) / marketingSpend) * 100 : 0;

    return NextResponse.json({
      metrics: {
        receita: totalReceita,
        receitaChange: 0,
        custos: totalCustos,
        custosChange: 0,
        productCosts: totalProductCosts,
        fees: totalFees,
        marketing: marketingSpend,
        marketingChange: 0,
        impostos: totalImpostos,
        impostosChange: 0,
        margem,
        margemChange: 0,
        lucro: totalLucro,
        lucroChange: 0,
        pedidos: allOrders.length,
        pedidosPagos: allOrders.length,
        pedidosChange: 0,
        ticketMedio,
        ticketMedioChange: 0,
        descontos: totalDescontos,
        frete: totalFrete,
        unidadesVendidas: totalUnits,
        cac,
        roi,
        pedidosPendentes: pendingOrdersCount,
        valorPendente: pendingOrdersValue,
        recurringRate,
        totalCustomers,
        recurringCustomers,
      },
      totals: {
        pedidos: allOrders.length,
        pedidosPagos: allOrders.length,
        receita: totalReceita,
        pendentes: pendingOrdersCount,
        valorPendente: pendingOrdersValue,
      },
      chartData,
      stores: storesData,
      topProducts,
      paymentMethods: {
        credit_card: paymentMethods.credit_card,
        debit: paymentMethods.debit,
        pix: paymentMethods.pix,
        boleto: paymentMethods.boleto,
        other: paymentMethods.other,
      },
      salesBreakdown,
      integrations: {
        shopify: hasStores,
        klaviyo: !!klaviyoAccount,
        meta: !!metaAccounts,
        google: false,
        tiktok: false,
      },
      period: {
        start: startISO,
        end: endISO,
        range,
        days: daysInPeriod,
      },
      costConfig: {
        defaultCostPercentage: taxSettings.default_cost_percentage,
        paymentGatewayFee: taxSettings.payment_gateway_fee,
        paymentFixedFee: taxSettings.payment_fixed_fee,
        marketplaceFee: taxSettings.marketplace_fee,
        customFeesCount: customFees.length,
        productsWithCosts: globalCostsMap.size,
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
