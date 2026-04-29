import { NextRequest, NextResponse } from 'next/server';
import { assertDebugAllowed } from '@/lib/debug-guard';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOPIFY_API_VERSION = '2026-04';
const TZ_OFFSET = '-03:00';

async function shopifyFetch(shopDomain: string, accessToken: string, endpoint: string) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }
  return response.json();
}

export async function GET(request: NextRequest) {
  const blocked = assertDebugAllowed(request); if (blocked) return blocked;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const period = searchParams.get('period') || 'today';

  if (!storeId) {
    return NextResponse.json({ error: 'Passe ?storeId=XXX' });
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

    // Calcular data do período
    const nowUTC = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(nowUTC.getTime() + (brazilOffset * 60 * 1000) + (nowUTC.getTimezoneOffset() * 60 * 1000));
    const todayBrazil = brazilTime.toISOString().split('T')[0];
    
    let periodStartStr: string;
    if (period === 'yesterday') {
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      periodStartStr = yesterday.toISOString().split('T')[0];
    } else {
      periodStartStr = todayBrazil;
    }

    const startISO = `${periodStartStr}T00:00:00${TZ_OFFSET}`;
    const endISO = `${periodStartStr}T23:59:59${TZ_OFFSET}`;
    const periodStartDate = new Date(periodStartStr);

    // Buscar pedidos
    const ordersData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=250`
    );

    const orders = ordersData.orders || [];
    const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);

    // Mapear clientes
    const customerOrdersInPeriod = new Map<number, number>();
    for (const o of validOrders) {
      if (o.customer?.id) {
        const cid = o.customer.id;
        customerOrdersInPeriod.set(cid, (customerOrdersInPeriod.get(cid) || 0) + 1);
      }
    }

    // Buscar dados dos clientes
    const customerDetails: any[] = [];
    for (const [customerId, ordersInPeriod] of customerOrdersInPeriod) {
      try {
        const data = await shopifyFetch(store.shop_domain, store.access_token, `/customers/${customerId}.json`);
        if (data.customer) {
          const c = data.customer;
          const createdDate = new Date(c.created_at.split('T')[0]);
          const daysSinceCreation = Math.floor((periodStartDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          
          customerDetails.push({
            id: customerId,
            email: c.email,
            created_at: c.created_at.split('T')[0],
            orders_count: c.orders_count || 0,
            orders_in_period: ordersInPeriod,
            orders_before: (c.orders_count || 0) - ordersInPeriod,
            days_since_creation: daysSinceCreation,
          });
        }
      } catch (e) {}
    }

    const totalClientes = customerDetails.length;

    // Testar diferentes thresholds
    const thresholds = [0, 1, 3, 5, 7, 10, 14, 30];
    const resultados: any[] = [];

    for (const threshold of thresholds) {
      let recorrentes = 0;
      const recorrentesLista: string[] = [];

      for (const c of customerDetails) {
        // Método híbrido:
        // É recorrente se:
        // 1. Tem pedidos anteriores ao período, OU
        // 2. Foi criado há mais de X dias (threshold) antes do início do período
        const temPedidosAnteriores = c.orders_before > 0;
        const criadoHaMuitoTempo = c.days_since_creation > threshold;
        
        if (temPedidosAnteriores || criadoHaMuitoTempo) {
          recorrentes++;
          recorrentesLista.push(`${c.email} (dias: ${c.days_since_creation}, orders_before: ${c.orders_before})`);
        }
      }

      const taxa = totalClientes > 0 ? Number(((recorrentes / totalClientes) * 100).toFixed(2)) : 0;

      resultados.push({
        threshold_dias: threshold,
        recorrentes,
        novos: totalClientes - recorrentes,
        taxa,
        taxa_formatada: `${taxa}%`,
        match_shopify_20: taxa === 20,
        clientes_recorrentes: recorrentesLista,
      });
    }

    // Encontrar o threshold que dá 20%
    const matchExato = resultados.find(r => r.taxa === 20);

    return NextResponse.json({
      success: true,
      periodo: `${period} (${periodStartStr})`,
      total_clientes: totalClientes,
      shopify_mostra: '20%',
      
      resultado_ideal: matchExato || 'Nenhum threshold exato encontrou 20%',
      
      todos_thresholds: resultados,
      
      clientes_detalhes: customerDetails.map(c => ({
        email: c.email,
        created_at: c.created_at,
        days_since_creation: c.days_since_creation,
        orders_before: c.orders_before,
      })),
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
