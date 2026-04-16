import { NextRequest, NextResponse } from 'next/server';
import { assertDebugAllowed } from '@/lib/debug-guard';
import { getSupabaseClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2024-10';

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

// Testar ShopifyQL
async function testShopifyQL(shopDomain: string, accessToken: string, daysBack: number) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  
  const query = `FROM sales SHOW new_customers, returning_customers SINCE ${daysBack} days ago UNTIL today`;
  
  const graphqlQuery = {
    query: `{
      shopifyqlQuery(query: "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}") {
        tableData {
          columns { name dataType }
          rows
        }
        parseErrors
      }
    }`
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
    });

    const result = await response.json();
    
    return {
      status: response.ok ? 'success' : 'error',
      httpStatus: response.status,
      query,
      result,
      parseErrors: result?.data?.shopifyqlQuery?.parseErrors,
      tableData: result?.data?.shopifyqlQuery?.tableData,
    };
  } catch (error: any) {
    return {
      status: 'exception',
      error: error.message,
      query,
    };
  }
}

export async function GET(request: NextRequest) {
  const blocked = assertDebugAllowed(request); if (blocked) return blocked;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ 
      error: 'Passe ?storeId=XXX',
      exemplo: '/api/analytics/shopify/diagnostico-recorrentes?storeId=123'
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

    // Calcular período "ontem"
    const now = new Date();
    const brazilOffset = -3 * 60;
    const brazilTime = new Date(now.getTime() + (brazilOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
    const yesterday = new Date(brazilTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const startISO = `${dateStr}T00:00:00-03:00`;
    const endISO = `${dateStr}T23:59:59-03:00`;

    // 1. Testar ShopifyQL
    const shopifyqlResult = await testShopifyQL(store.shop_domain, store.access_token, 1);

    // 2. Buscar pedidos do período
    const ordersData = await shopifyFetch(
      store.shop_domain,
      store.access_token,
      `/orders.json?status=any&created_at_min=${encodeURIComponent(startISO)}&created_at_max=${encodeURIComponent(endISO)}&limit=250`
    );

    const orders = ordersData.orders || [];
    const validOrders = orders.filter((o: any) => !o.test && !o.cancelled_at);

    // 3. Buscar dados de cada cliente único
    const customerIds = new Set<string>();
    for (const order of validOrders) {
      if (order.customer?.id) {
        customerIds.add(String(order.customer.id));
      }
    }

    // Buscar detalhes dos clientes
    const customerDetails: any[] = [];
    for (const customerId of customerIds) {
      try {
        const customerData = await shopifyFetch(
          store.shop_domain,
          store.access_token,
          `/customers/${customerId}.json`
        );
        if (customerData.customer) {
          customerDetails.push(customerData.customer);
        }
      } catch (e) {
        // Cliente pode ter sido deletado
      }
    }

    // 4. Classificar clientes
    const customerOrdersInPeriod = new Map<string, number>();
    for (const order of validOrders) {
      if (order.customer?.id) {
        const cid = String(order.customer.id);
        customerOrdersInPeriod.set(cid, (customerOrdersInPeriod.get(cid) || 0) + 1);
      }
    }

    const classification: any[] = [];
    let novos = 0;
    let recorrentes = 0;

    for (const customer of customerDetails) {
      const cid = String(customer.id);
      const ordersInPeriod = customerOrdersInPeriod.get(cid) || 0;
      const totalOrders = customer.orders_count || 0;
      const ordersBeforePeriod = totalOrders - ordersInPeriod;
      const createdAt = customer.created_at;
      
      // Determinar classificação
      // Método 1: Baseado em orders_count
      const isReturningByOrderCount = ordersBeforePeriod > 0;
      
      // Método 2: Baseado em data de criação
      const customerCreatedDate = new Date(createdAt).toISOString().split('T')[0];
      const isReturningByCreationDate = customerCreatedDate < dateStr;

      const finalClassification = isReturningByOrderCount ? 'recorrente' : 'novo';
      
      if (finalClassification === 'recorrente') {
        recorrentes++;
      } else {
        novos++;
      }

      classification.push({
        id: cid,
        email: customer.email,
        orders_count: totalOrders,
        orders_in_period: ordersInPeriod,
        orders_before: ordersBeforePeriod,
        created_at: customerCreatedDate,
        is_returning_by_order_count: isReturningByOrderCount,
        is_returning_by_creation_date: isReturningByCreationDate,
        final_classification: finalClassification,
      });
    }

    const total = novos + recorrentes;
    const taxaCalculada = total > 0 ? Number(((recorrentes / total) * 100).toFixed(2)) : 0;

    // Extrair valores do ShopifyQL se disponível
    let shopifyqlNewCustomers = null;
    let shopifyqlReturningCustomers = null;
    let shopifyqlRate = null;

    if (shopifyqlResult.tableData?.rows?.length > 0) {
      const columns = shopifyqlResult.tableData.columns;
      const row = shopifyqlResult.tableData.rows[0];
      
      const newIdx = columns.findIndex((c: any) => c.name === 'new_customers');
      const retIdx = columns.findIndex((c: any) => c.name === 'returning_customers');
      
      if (newIdx !== -1 && retIdx !== -1) {
        shopifyqlNewCustomers = parseInt(row[newIdx]) || 0;
        shopifyqlReturningCustomers = parseInt(row[retIdx]) || 0;
        const shopifyqlTotal = shopifyqlNewCustomers + shopifyqlReturningCustomers;
        shopifyqlRate = shopifyqlTotal > 0 
          ? Number(((shopifyqlReturningCustomers / shopifyqlTotal) * 100).toFixed(2)) 
          : 0;
      }
    }

    return NextResponse.json({
      success: true,
      periodo: `Ontem (${dateStr})`,
      
      // Resultado do ShopifyQL
      shopifyql: {
        status: shopifyqlResult.status,
        funcionou: shopifyqlResult.tableData?.rows?.length > 0,
        new_customers: shopifyqlNewCustomers,
        returning_customers: shopifyqlReturningCustomers,
        taxa_shopifyql: shopifyqlRate,
        parseErrors: shopifyqlResult.parseErrors,
        raw: shopifyqlResult,
      },
      
      // Cálculo manual
      calculo_manual: {
        total_pedidos: orders.length,
        pedidos_validos: validOrders.length,
        clientes_unicos: customerIds.size,
        clientes_novos: novos,
        clientes_recorrentes: recorrentes,
        taxa_calculada: taxaCalculada,
      },
      
      // Comparação
      comparacao: {
        taxa_shopifyql: shopifyqlRate,
        taxa_manual: taxaCalculada,
        diferenca: shopifyqlRate !== null ? Number((shopifyqlRate - taxaCalculada).toFixed(2)) : null,
        shopify_dashboard: '38.89% (você informou)',
      },
      
      // Detalhes de cada cliente (primeiros 10)
      clientes_detalhes: classification.slice(0, 10),
    });

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
