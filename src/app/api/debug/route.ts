import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
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

    // 5. Check Klaviyo account
    let klaviyoDebug: any = { found: false };
    try {
      const { data: klaviyoAccounts, error: klaviyoError } = await supabase
        .from('klaviyo_accounts')
        .select('*');
      
      if (klaviyoError) {
        klaviyoDebug = { 
          found: false, 
          error: klaviyoError.message,
          code: klaviyoError.code,
          hint: 'Tabela klaviyo_accounts pode não existir. Execute o SQL de schema.'
        };
      } else {
        klaviyoDebug = {
          found: true,
          totalAccounts: klaviyoAccounts?.length || 0,
          accounts: klaviyoAccounts?.map(k => ({
            id: k.id,
            organization_id: k.organization_id,
            account_id: k.account_id,
            account_name: k.account_name,
            is_active: k.is_active,
            total_profiles: k.total_profiles,
            total_campaigns: k.total_campaigns,
            total_flows: k.total_flows,
            last_sync_at: k.last_sync_at,
            hasApiKey: !!k.api_key,
          })) || [],
          activeAccounts: klaviyoAccounts?.filter(k => k.is_active).length || 0,
        };
      }
    } catch (e: any) {
      klaviyoDebug = { 
        found: false, 
        error: e.message,
        hint: 'Erro ao consultar tabela klaviyo_accounts'
      };
    }

    // 6. Check WhatsApp data
    let whatsappDebug: any = { found: false };
    try {
      // Check organizations
      const { data: organizations, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .limit(5);
      
      // Check whatsapp_conversations
      const { data: conversations, count: convCount, error: convError } = await supabase
        .from('whatsapp_conversations')
        .select('*', { count: 'exact' })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(5);
      
      // Check whatsapp_accounts (configs)
      const { data: waAccounts, error: waAccError } = await supabase
        .from('whatsapp_accounts')
        .select('id, organization_id, phone_number, phone_number_id, business_name, is_connected')
        .limit(5);
      
      // Check whatsapp_configs (alternative config table)
      let waConfigs = null;
      try {
        const { data } = await supabase
          .from('whatsapp_configs')
          .select('id, organization_id, phone_number_id')
          .limit(5);
        waConfigs = data;
      } catch (e) {
        // Table might not exist
      }
      
      whatsappDebug = {
        found: true,
        organizations: {
          total: organizations?.length || 0,
          items: organizations || [],
          error: orgError?.message,
        },
        conversations: {
          total: convCount || 0,
          items: conversations?.map(c => ({
            id: c.id,
            organization_id: c.organization_id,
            phone_number: c.phone_number,
            contact_name: c.contact_name,
            status: c.status,
            unread_count: c.unread_count,
            last_message_at: c.last_message_at,
            last_message_preview: c.last_message_preview?.substring(0, 50),
          })) || [],
          error: convError?.message,
        },
        whatsappAccounts: {
          total: waAccounts?.length || 0,
          items: waAccounts || [],
          error: waAccError?.message,
        },
        whatsappConfigs: waConfigs,
      };
    } catch (e: any) {
      whatsappDebug = { 
        found: false, 
        error: e.message 
      };
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalStores: stores?.length || 0,
        connectedStores,
        totalOrdersInDb: ordersCount || 0,
        ordersError: ordersError?.message || null,
        klaviyoConnected: klaviyoDebug.activeAccounts > 0,
        whatsappConversations: whatsappDebug?.conversations?.total || 0,
      },
      whatsapp: whatsappDebug,
      klaviyo: klaviyoDebug,
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
