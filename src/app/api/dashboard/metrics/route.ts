import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2024-10';

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

        // Filtrar pedidos válidos (não teste, não cancelado)
        const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);
        const paidOrders = validOrders.filter((o: any) =>
          ['paid', 'partially_paid'].includes(o.financial_status)
        );

        // Calcular métricas da loja
        let storeReceita = 0;
        let storeImpostos = 0;

        for (const o of paidOrders) {
          storeReceita += toNum(o.total_price);
          storeImpostos += toNum(o.total_tax);
        }

        const storeCustos = storeReceita * 0.30; // Estimativa de custo
        const storeLucro = storeReceita - storeCustos - storeImpostos;

        storesData.push({
          id: store.id,
          name: store.shop_name || store.shop_domain,
          domain: store.shop_domain,
          pedidos: validOrders.length,
          pedidosPagos: paidOrders.length,
          receita: storeReceita,
          custos: storeCustos,
          lucro: storeLucro,
          margem: storeReceita > 0 ? (storeLucro / storeReceita) * 100 : 0,
          lastSync: new Date().toISOString(),
        });

        // Adicionar pedidos ao total com referência da loja
        allOrders.push(...paidOrders.map(o => ({ ...o, store_id: store.id })));

        console.log(`[metrics] ${store.shop_domain}: ${validOrders.length} orders, R$ ${storeReceita.toFixed(2)}`);

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

    // Calcular métricas totais
    let totalReceita = 0;
    let totalImpostos = 0;
    let totalDescontos = 0;
    let totalFrete = 0;

    for (const o of allOrders) {
      totalReceita += toNum(o.total_price);
      totalImpostos += toNum(o.total_tax);
      totalDescontos += toNum(o.total_discounts);

      if (Array.isArray(o.shipping_lines)) {
        for (const sl of o.shipping_lines) {
          totalFrete += toNum(sl.price);
        }
      }
    }

    const totalCustos = totalReceita * 0.30; // Estimativa
    const totalLucro = totalReceita - totalCustos - totalImpostos;
    const margem = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0;
    const ticketMedio = allOrders.length > 0 ? totalReceita / allOrders.length : 0;

    // Agrupar por dia para o gráfico
    const ordersByDate = new Map<string, { receita: number; custos: number; impostos: number; lucro: number; pedidos: number }>();

    for (const o of allOrders) {
      const dateStr = o.created_at?.split('T')[0];
      if (!dateStr) continue;

      const existing = ordersByDate.get(dateStr) || { receita: 0, custos: 0, impostos: 0, lucro: 0, pedidos: 0 };
      const orderReceita = toNum(o.total_price);
      const orderImpostos = toNum(o.total_tax);
      const orderCustos = orderReceita * 0.30;
      const orderLucro = orderReceita - orderCustos - orderImpostos;

      ordersByDate.set(dateStr, {
        receita: existing.receita + orderReceita,
        custos: existing.custos + orderCustos,
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
        custos: data.custos,
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

    return NextResponse.json({
      metrics: {
        receita: totalReceita,
        receitaChange: 0,
        custos: totalCustos,
        custosChange: 0,
        marketing: 0,
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
      },
      totals: {
        pedidos: allOrders.length,
        pedidosPagos: allOrders.length,
        receita: totalReceita,
      },
      chartData,
      stores: storesData,
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
