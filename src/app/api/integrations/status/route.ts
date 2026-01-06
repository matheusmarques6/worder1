import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Interfaces para tipos
interface ShopifyStoreRow {
  id: string;
  shop_name: string | null;
  shop_domain: string;
  status: string | null;
  connection_status: string | null;
  status_message: string | null;
  health_checked_at: string | null;
  total_orders: number | null;
  total_customers: number | null;
  total_products: number | null;
  total_revenue: number | null;
  last_sync_at: string | null;
  created_at: string;
}

interface WhatsAppConfigRow {
  id: string;
  phone_number: string;
  phone_number_id: string | null;
  business_name: string | null;
  is_active: boolean;
  connection_status: string | null;
  status_message: string | null;
  health_checked_at: string | null;
  created_at: string;
}

interface KlaviyoAccountRow {
  id: string;
  account_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  total_profiles: number | null;
  total_campaigns: number | null;
  total_flows: number | null;
}

interface AdAccountRow {
  id: string;
  account_name?: string;
  advertiser_name?: string;
  is_active: boolean;
  last_sync_at: string | null;
}

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_, prop) { return (getDb() as any)[prop]; }
});

// Helper para converter connection_status em health status
function getHealthStatus(connectionStatus: string | null): string {
  if (!connectionStatus) return 'unknown';
  
  switch (connectionStatus) {
    case 'active':
      return 'healthy';
    case 'warning':
      return 'degraded';
    case 'error':
    case 'expired':
    case 'reconnect_required':
      return 'unhealthy';
    case 'disconnected':
    case 'pending':
      return 'disconnected';
    default:
      return 'unknown';
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const storeId = searchParams.get('storeId'); // ✅ NOVO: Filtrar por loja

    // Check Shopify stores - ✅ MODIFICADO: Filtrar por storeId
    let shopifyQuery = supabase
      .from('shopify_stores')
      .select(`
        id, 
        shop_name, 
        shop_domain, 
        status,
        connection_status,
        status_message,
        health_checked_at,
        total_orders, 
        total_customers, 
        total_products, 
        total_revenue, 
        last_sync_at, 
        created_at
      `);
    
    // ✅ NOVO: Se storeId fornecido, buscar apenas essa loja
    if (storeId) {
      shopifyQuery = shopifyQuery.eq('id', storeId);
    } else {
      shopifyQuery = shopifyQuery.or('status.eq.active,status.is.null');
    }
    
    const { data: shopifyStores } = await shopifyQuery as { data: ShopifyStoreRow[] | null };

    // Check Klaviyo - ✅ MODIFICADO: Filtrar por store_id
    let klaviyoAccount: KlaviyoAccountRow | null = null;
    try {
      let klaviyoQuery = supabase
        .from('klaviyo_accounts')
        .select('*')
        .eq('is_active', true);
      
      // ✅ NOVO: Filtrar por store_id se fornecido
      if (storeId) {
        klaviyoQuery = klaviyoQuery.eq('store_id', storeId);
      }
      
      const { data: klaviyoAccounts } = await klaviyoQuery.limit(1) as { data: KlaviyoAccountRow[] | null };
      
      klaviyoAccount = klaviyoAccounts && klaviyoAccounts.length > 0 ? klaviyoAccounts[0] : null;
    } catch (e) {
      console.error('[Integration Status] Klaviyo error:', e);
    }

    // Check Meta (Facebook) - ✅ MODIFICADO: Filtrar por store_id
    let metaQuery = supabase
      .from('meta_ad_accounts')
      .select('id, account_name, is_active, last_sync_at')
      .eq('is_active', true);
    
    if (storeId) {
      metaQuery = metaQuery.eq('store_id', storeId);
    }
    
    const { data: metaAccounts } = await metaQuery.limit(1) as { data: AdAccountRow[] | null };
    
    const metaAccount = metaAccounts && metaAccounts.length > 0 ? metaAccounts[0] : null;

    // Check Google - ✅ MODIFICADO: Filtrar por store_id
    let googleQuery = supabase
      .from('google_ad_accounts')
      .select('id, account_name, is_active, last_sync_at')
      .eq('is_active', true);
    
    if (storeId) {
      googleQuery = googleQuery.eq('store_id', storeId);
    }
    
    const { data: googleAccounts } = await googleQuery.limit(1) as { data: AdAccountRow[] | null };
    
    const googleAccount = googleAccounts && googleAccounts.length > 0 ? googleAccounts[0] : null;

    // Check TikTok - ✅ MODIFICADO: Filtrar por store_id
    let tiktokQuery = supabase
      .from('tiktok_ad_accounts')
      .select('id, advertiser_name, is_active, last_sync_at')
      .eq('is_active', true);
    
    if (storeId) {
      tiktokQuery = tiktokQuery.eq('store_id', storeId);
    }
    
    const { data: tiktokAccounts } = await tiktokQuery.limit(1) as { data: AdAccountRow[] | null };
    
    const tiktokAccount = tiktokAccounts && tiktokAccounts.length > 0 ? tiktokAccounts[0] : null;

    // Check WhatsApp - ✅ MODIFICADO: Filtrar por store_id
    let whatsappConfig: WhatsAppConfigRow | null = null;
    try {
      let whatsappQuery = supabase
        .from('whatsapp_configs')
        .select(`
          id, 
          phone_number, 
          phone_number_id, 
          business_name, 
          is_active, 
          connection_status,
          status_message,
          health_checked_at,
          created_at
        `)
        .eq('is_active', true);
      
      // ✅ NOVO: Filtrar por store_id se fornecido
      if (storeId) {
        whatsappQuery = whatsappQuery.eq('store_id', storeId);
      }
      
      const { data: whatsappConfigs } = await whatsappQuery.limit(1) as { data: WhatsAppConfigRow[] | null };
      
      whatsappConfig = whatsappConfigs && whatsappConfigs.length > 0 ? whatsappConfigs[0] : null;
    } catch (e) {
      // Tabela pode não existir, tentar whatsapp_accounts
      let whatsappAccountsQuery = supabase
        .from('whatsapp_accounts')
        .select('id, phone_number, is_active, created_at')
        .eq('is_active', true);
      
      // ✅ NOVO: Filtrar por store_id se fornecido
      if (storeId) {
        whatsappAccountsQuery = whatsappAccountsQuery.eq('store_id', storeId);
      }
      
      const { data: whatsappAccounts } = await whatsappAccountsQuery.limit(1) as { data: WhatsAppConfigRow[] | null };
      
      whatsappConfig = whatsappAccounts && whatsappAccounts.length > 0 ? whatsappAccounts[0] : null;
    }

    // Format last sync time
    const formatLastSync = (dateStr: string | null): string | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Agora';
      if (diffMins < 60) return `${diffMins} min atrás`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hora${diffHours > 1 ? 's' : ''} atrás`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} dia${diffDays > 1 ? 's' : ''} atrás`;
    };

    // Calculate Shopify stats - CORRIGIDO: tipos explícitos
    const shopifyStats = shopifyStores && shopifyStores.length > 0 ? {
      Orders: shopifyStores.reduce((sum: number, s: ShopifyStoreRow) => sum + (s.total_orders || 0), 0).toLocaleString(),
      Customers: shopifyStores.reduce((sum: number, s: ShopifyStoreRow) => sum + (s.total_customers || 0), 0).toLocaleString(),
      Products: shopifyStores.reduce((sum: number, s: ShopifyStoreRow) => sum + (s.total_products || 0), 0).toLocaleString(),
    } : null;

    // Calculate Klaviyo stats
    const klaviyoStats = klaviyoAccount ? {
      Profiles: (klaviyoAccount.total_profiles || 0).toLocaleString(),
      Campaigns: (klaviyoAccount.total_campaigns || 0).toString(),
      Flows: (klaviyoAccount.total_flows || 0).toString(),
    } : null;

    // CORRIGIDO: Usa connection_status do health check
    const shopifyStore = shopifyStores?.[0];
    const shopifyHealthStatus = shopifyStore 
      ? getHealthStatus(shopifyStore.connection_status)
      : 'disconnected';

    const whatsappHealthStatus = whatsappConfig 
      ? getHealthStatus(whatsappConfig.connection_status)
      : 'disconnected';

    const integrations = {
      shopify: {
        connected: shopifyStores && shopifyStores.length > 0,
        status: shopifyHealthStatus,
        connectionStatus: shopifyStore?.connection_status || null,
        statusMessage: shopifyStore?.status_message || null,
        lastHealthCheck: shopifyStore?.health_checked_at ? formatLastSync(shopifyStore.health_checked_at) : null,
        lastSync: shopifyStore?.last_sync_at ? formatLastSync(shopifyStore.last_sync_at) : null,
        stats: shopifyStats,
        stores: shopifyStores?.map((s: ShopifyStoreRow) => ({
          id: s.id,
          name: s.shop_name,
          domain: s.shop_domain,
          connectionStatus: s.connection_status,
          statusMessage: s.status_message,
          orders: s.total_orders,
          customers: s.total_customers,
          products: s.total_products,
          revenue: s.total_revenue,
        })) || [],
      },
      klaviyo: {
        connected: !!klaviyoAccount,
        status: klaviyoAccount ? 'healthy' : 'disconnected',
        lastSync: klaviyoAccount?.last_sync_at ? formatLastSync(klaviyoAccount.last_sync_at) : null,
        accountName: klaviyoAccount?.account_name || null,
        stats: klaviyoStats,
      },
      meta: {
        connected: !!metaAccount,
        status: metaAccount ? 'healthy' : 'disconnected',
        lastSync: metaAccount?.last_sync_at ? formatLastSync(metaAccount.last_sync_at) : null,
        accountName: metaAccount?.account_name || null,
      },
      google: {
        connected: !!googleAccount,
        status: googleAccount ? 'healthy' : 'disconnected',
        lastSync: googleAccount?.last_sync_at ? formatLastSync(googleAccount.last_sync_at) : null,
        accountName: googleAccount?.account_name || null,
      },
      tiktok: {
        connected: !!tiktokAccount,
        status: tiktokAccount ? 'healthy' : 'disconnected',
        lastSync: tiktokAccount?.last_sync_at ? formatLastSync(tiktokAccount.last_sync_at) : null,
        accountName: tiktokAccount?.advertiser_name || null,
      },
      whatsapp: {
        connected: !!whatsappConfig,
        status: whatsappHealthStatus,
        connectionStatus: whatsappConfig?.connection_status || null,
        statusMessage: whatsappConfig?.status_message || null,
        lastHealthCheck: whatsappConfig?.health_checked_at ? formatLastSync(whatsappConfig.health_checked_at) : null,
        lastSync: whatsappConfig?.created_at ? formatLastSync(whatsappConfig.created_at) : null,
        phoneNumber: whatsappConfig?.phone_number || null,
        businessName: whatsappConfig?.business_name || null,
      },
    };

    return NextResponse.json({ integrations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Integration status error:', message);
    return NextResponse.json({ 
      error: message,
      integrations: {
        shopify: { connected: false, status: 'disconnected' },
        klaviyo: { connected: false, status: 'disconnected' },
        meta: { connected: false, status: 'disconnected' },
        google: { connected: false, status: 'disconnected' },
        tiktok: { connected: false, status: 'disconnected' },
        whatsapp: { connected: false, status: 'disconnected' },
      }
    }, { status: 500 });
  }
}
