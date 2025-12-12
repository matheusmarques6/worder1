import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';

const SHOPIFY_API_VERSION = '2024-10';

export async function GET(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  const log = (step: string, data: any) => {
    results.steps.push({ step, data });
  };

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured', results });
    }

    // Step 1: Get store from database
    log('1. Buscando loja no banco', 'Iniciando...');
    
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (storesError) {
      log('1. Buscando loja no banco', { error: storesError.message });
      return NextResponse.json({ error: 'Database error', results });
    }

    if (!stores || stores.length === 0) {
      log('1. Buscando loja no banco', { error: 'Nenhuma loja encontrada' });
      return NextResponse.json({ error: 'No store found', results });
    }

    const store = stores[0];
    log('1. Buscando loja no banco', {
      id: store.id,
      domain: store.shop_domain,
      name: store.shop_name,
      hasToken: !!store.access_token,
      tokenLength: store.access_token?.length || 0,
      tokenPreview: store.access_token ? `${store.access_token.substring(0, 20)}...` : 'N/A',
    });

    // Step 2: Test shop.json endpoint (basic connection test)
    log('2. Testando conexão básica (shop.json)', 'Chamando API...');
    
    const shopUrl = `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`;
    const shopResponse = await fetch(shopUrl, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!shopResponse.ok) {
      const errorText = await shopResponse.text();
      log('2. Testando conexão básica (shop.json)', {
        status: shopResponse.status,
        error: errorText.substring(0, 500),
      });
      return NextResponse.json({ 
        error: `Shop API failed: ${shopResponse.status}`, 
        results 
      });
    }

    const shopData = await shopResponse.json();
    log('2. Testando conexão básica (shop.json)', {
      status: shopResponse.status,
      shopName: shopData.shop?.name,
      shopEmail: shopData.shop?.email,
      plan: shopData.shop?.plan_name,
    });

    // Step 3: Test orders count endpoint
    log('3. Contando pedidos (orders/count.json)', 'Chamando API...');
    
    const countUrl = `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/orders/count.json?status=any`;
    const countResponse = await fetch(countUrl, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      log('3. Contando pedidos (orders/count.json)', {
        status: countResponse.status,
        error: errorText.substring(0, 500),
        message: 'TOKEN SEM PERMISSÃO read_orders!',
      });
    } else {
      const countData = await countResponse.json();
      log('3. Contando pedidos (orders/count.json)', {
        status: countResponse.status,
        totalOrders: countData.count,
      });
    }

    // Step 4: Fetch actual orders
    log('4. Buscando pedidos (orders.json)', 'Chamando API...');
    
    const ordersUrl = `https://${store.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=10`;
    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      log('4. Buscando pedidos (orders.json)', {
        status: ordersResponse.status,
        error: errorText.substring(0, 500),
      });
    } else {
      const ordersData = await ordersResponse.json();
      const orders = ordersData.orders || [];
      log('4. Buscando pedidos (orders.json)', {
        status: ordersResponse.status,
        ordersReturned: orders.length,
        firstOrder: orders.length > 0 ? {
          id: orders[0].id,
          number: orders[0].order_number,
          total: orders[0].total_price,
          created: orders[0].created_at,
          status: orders[0].financial_status,
        } : null,
      });
    }

    // Step 5: Check access scopes
    log('5. Verificando permissões do token', 'Chamando API...');
    
    const scopesUrl = `https://${store.shop_domain}/admin/oauth/access_scopes.json`;
    const scopesResponse = await fetch(scopesUrl, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
    });

    if (!scopesResponse.ok) {
      const errorText = await scopesResponse.text();
      log('5. Verificando permissões do token', {
        status: scopesResponse.status,
        error: errorText.substring(0, 200),
      });
    } else {
      const scopesData = await scopesResponse.json();
      log('5. Verificando permissões do token', {
        status: scopesResponse.status,
        scopes: scopesData.access_scopes?.map((s: any) => s.handle) || [],
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Diagnóstico completo',
      results,
    });

  } catch (error: any) {
    log('ERRO FATAL', { message: error.message });
    return NextResponse.json({ 
      error: error.message, 
      results 
    });
  }
}
