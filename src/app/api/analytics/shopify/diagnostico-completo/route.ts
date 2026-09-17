import { NextRequest, NextResponse } from 'next/server';
import { assertDebugAllowed } from '@/lib/debug-guard';
import { requireStore } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SHOPIFY_API_VERSION = '2026-04';
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

function getDateRange(period: string) {
  const nowUTC = new Date();
  const brazilOffset = -3 * 60;
  const brazilTime = new Date(nowUTC.getTime() + (brazilOffset * 60 * 1000) + (nowUTC.getTimezoneOffset() * 60 * 1000));
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
      const yesterday = new Date(brazilTime);
      yesterday.setDate(yesterday.getDate() - 1);
      endDateStr = yesterday.toISOString().split('T')[0];
      break;
    case '7d':
      daysBack = 6;
      endDateStr = todayBrazil;
      break;
    case '30d':
      daysBack = 29;
      endDateStr = todayBrazil;
      break;
    case '90d':
      daysBack = 89;
      endDateStr = todayBrazil;
      break;
    default:
      daysBack = 6;
      endDateStr = todayBrazil;
  }

  const endDate = new Date(endDateStr + 'T12:00:00Z');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);
  const startDateStr = startDate.toISOString().split('T')[0];
  const daysInPeriod = daysBack + 1;

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    startISO: `${startDateStr}T00:00:00${TZ_OFFSET}`,
    endISO: `${endDateStr}T23:59:59${TZ_OFFSET}`,
    daysInPeriod,
  };
}

async function analyzeOnePeriod(
  shopDomain: string, 
  accessToken: string, 
  period: string
) {
  const { startDate, endDate, startISO, endISO, daysInPeriod } = getDateRange(period);
  
  // Buscar pedidos
  let allOrders: any[] = [];
  let pageInfo: string | null = null;
  let pages = 0;
  const maxPages = 20;

  while (pages < maxPages) {
    let endpoint = `/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}`;
    if (pageInfo) {
      endpoint = `/orders.json?limit=250&page_info=${pageInfo}`;
    }

    const data = await shopifyFetch(shopDomain, accessToken, endpoint);
    const orders = data.orders || [];
    allOrders = allOrders.concat(orders);

    if (orders.length < 250) break;
    
    // Pagination - simplified
    pages++;
    if (pages >= maxPages) break;
  }

  const validOrders = allOrders.filter((o: any) => !o.test && !o.cancelled_at);
  const allNonTestOrders = allOrders.filter((o: any) => !o.test);

  // Buscar dados de clientes (apenas de pedidos válidos)
  const customerIds = new Set<number>();
  for (const o of validOrders) {
    if (o.customer?.id) customerIds.add(o.customer.id);
  }

  const customerMap = new Map<number, any>();
  const idsArray = Array.from(customerIds);
  
  for (let i = 0; i < idsArray.length; i += 50) {
    const batch = idsArray.slice(i, i + 50);
    for (const cid of batch) {
      try {
        const data = await shopifyFetch(shopDomain, accessToken, `/customers/${cid}.json`);
        if (data.customer) {
          customerMap.set(cid, data.customer);
        }
      } catch (e) {
        // Cliente pode ter sido deletado
      }
    }
  }

  // Calcular clientes novos vs recorrentes
  const customerOrdersInPeriod = new Map<number, number>();
  for (const o of validOrders) {
    if (o.customer?.id) {
      const cid = o.customer.id;
      customerOrdersInPeriod.set(cid, (customerOrdersInPeriod.get(cid) || 0) + 1);
    }
  }

  let novos = 0;
  let recorrentes = 0;
  const customerDetails: any[] = [];

  for (const [customerId, ordersInPeriod] of customerOrdersInPeriod) {
    const customerData = customerMap.get(customerId);
    const totalOrders = customerData?.orders_count || ordersInPeriod;
    const ordersBeforePeriod = totalOrders - ordersInPeriod;
    
    if (ordersBeforePeriod > 0) {
      recorrentes++;
    } else {
      novos++;
    }

    if (customerDetails.length < 5) {
      customerDetails.push({
        id: customerId,
        email: customerData?.email || 'N/A',
        orders_count: totalOrders,
        orders_in_period: ordersInPeriod,
        orders_before: ordersBeforePeriod,
        classification: ordersBeforePeriod > 0 ? 'recorrente' : 'novo',
      });
    }
  }

  const totalClientes = novos + recorrentes;
  const taxaRecorrentes = totalClientes > 0 
    ? Number(((recorrentes / totalClientes) * 100).toFixed(2)) 
    : 0;

  // Calcular produtos (agrupados por product_id apenas)
  const produtosMap = new Map<string, any>();
  
  for (const o of validOrders) {
    if (Array.isArray(o.line_items)) {
      for (const item of o.line_items) {
        const key = `${item.product_id}`;
        const productTitle = item.title || item.name || 'Sem título';
        
        if (!produtosMap.has(key)) {
          produtosMap.set(key, {
            nome: productTitle,
            quantidade: 0,
            receita_bruta: 0,
            descontos: 0,
            receita_liquida: 0,
            pedidos: 0,
          });
        }
        
        const p = produtosMap.get(key)!;
        const qty = toNum(item.quantity || 0);
        const price = toNum(item.price || 0);
        const grossAmount = price * qty;
        
        let discountAmount = 0;
        if (Array.isArray(item.discount_allocations)) {
          for (const alloc of item.discount_allocations) {
            discountAmount += toNum(alloc.amount || 0);
          }
        }
        if (discountAmount === 0 && item.total_discount) {
          discountAmount = toNum(item.total_discount);
        }
        
        p.quantidade += qty;
        p.receita_bruta += grossAmount;
        p.descontos += discountAmount;
        p.receita_liquida += (grossAmount - discountAmount);
        p.pedidos += 1;
      }
    }
  }

  const topProdutos = Array.from(produtosMap.values())
    .sort((a, b) => b.receita_liquida - a.receita_liquida)
    .slice(0, 5)
    .map(p => ({
      nome: p.nome,
      quantidade: p.quantidade,
      vendas: Number(p.receita_liquida.toFixed(2)),
      vendasBrutas: Number(p.receita_bruta.toFixed(2)),
      descontos: Number(p.descontos.toFixed(2)),
    }));

  // Calcular vendas brutas
  let vendasBrutas = 0;
  let descontos = 0;
  for (const o of allNonTestOrders) {
    vendasBrutas += toNum(o.total_line_items_price);
    descontos += toNum(o.total_discounts || 0);
  }

  return {
    periodo: period,
    datas: `${startDate} a ${endDate}`,
    dias: daysInPeriod,
    pedidos: {
      total: allOrders.length,
      nao_teste: allNonTestOrders.length,
      validos: validOrders.length,
    },
    clientes: {
      unicos: totalClientes,
      novos,
      recorrentes,
      taxa_recorrentes: taxaRecorrentes,
    },
    vendas: {
      brutas: Number(vendasBrutas.toFixed(2)),
      descontos: Number(descontos.toFixed(2)),
      liquidas: Number((vendasBrutas - descontos).toFixed(2)),
    },
    top_produtos: topProdutos,
    amostra_clientes: customerDetails,
  };
}

export async function GET(request: NextRequest) {
  // A loja vem pela URL e daqui sai o access_token dela para chamar a
  // Shopify. Sem esta cerca, um id de loja de outra organização bastava.
  const guard = await requireStore(request);
  if (!guard.ok) return guard.response;
  const { supabase, storeId, organizationId } = guard;
  const blocked = assertDebugAllowed(request); if (blocked) return blocked;
  const { searchParams } = new URL(request.url);
  const periodos = searchParams.get('periodos')?.split(',') || ['yesterday', 'today', '7d', '30d'];


  try {
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('shop_domain, access_token')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const resultados: any[] = [];
    
    for (const periodo of periodos) {
      try {
        console.log(`[Diagnostico] Analisando período: ${periodo}`);
        const resultado = await analyzeOnePeriod(store.shop_domain, store.access_token, periodo);
        resultados.push(resultado);
      } catch (error: any) {
        resultados.push({
          periodo,
          erro: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      loja: store.shop_domain,
      gerado_em: new Date().toISOString(),
      nota: 'Compare estes valores com o dashboard da Shopify para cada período',
      resultados,
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
