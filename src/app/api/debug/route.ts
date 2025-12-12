import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

export async function GET(request: NextRequest) {
  try {
    // 1. Check stores in database
    const { data: stores, error: storesError } = await supabase
      .from('shopify_stores')
      .select('*');

    if (storesError) {
      return NextResponse.json({
        success: false,
        error: 'Erro ao buscar lojas: ' + storesError.message,
        hint: 'Verifique se a tabela shopify_stores existe no Supabase',
      });
    }

    // 2. Check orders in database
    const { count: ordersCount, error: ordersError } = await supabase
      .from('shopify_orders')
      .select('*', { count: 'exact', head: true });

    // 3. Get sample orders
    const { data: sampleOrders } = await supabase
      .from('shopify_orders')
      .select('shopify_order_id, name, total_price, financial_status, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    // 4. Test Shopify API for each store
    const storeTests = await Promise.all((stores || []).map(async (store) => {
      if (!store.access_token) {
        return {
          id: store.id,
          domain: store.shop_domain,
          name: store.shop_name,
          status: '❌ SEM TOKEN',
          error: 'access_token está vazio ou null',
        };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const testUrl = `https://${store.shop_domain}/admin/api/2024-10/shop.json`;
        const response = await fetch(testUrl, {
          headers: {
            'X-Shopify-Access-Token': store.access_token,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          return {
            id: store.id,
            domain: store.shop_domain,
            name: store.shop_name,
            status: '✅ CONECTADO',
            shopInfo: {
              name: data.shop?.name,
              email: data.shop?.email,
              plan: data.shop?.plan_name,
            },
          };
        } else {
          const errorText = await response.text();
          return {
            id: store.id,
            domain: store.shop_domain,
            name: store.shop_name,
            status: `❌ ERRO ${response.status}`,
            error: errorText.substring(0, 200),
          };
        }
      } catch (err: any) {
        return {
          id: store.id,
          domain: store.shop_domain,
          name: store.shop_name,
          status: '❌ FALHA',
          error: err.message,
        };
      }
    }));

    // Build summary
    const connectedStores = storeTests.filter(s => s.status.includes('CONECTADO')).length;
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalStores: stores?.length || 0,
        connectedStores,
        totalOrdersInDb: ordersCount || 0,
        ordersError: ordersError?.message || null,
      },
      stores: storeTests,
      sampleOrders: sampleOrders || [],
      rawStoreData: stores?.map(s => ({
        id: s.id,
        domain: s.shop_domain,
        name: s.shop_name,
        isActive: s.is_active,
        hasToken: !!s.access_token,
        tokenPreview: s.access_token ? `${s.access_token.substring(0, 10)}...` : null,
        lastSync: s.last_sync_at,
      })),
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack?.substring(0, 500),
    }, { status: 500 });
  }
}
