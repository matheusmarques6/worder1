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
    // Check Shopify stores
    const { data: shopifyStores, error: shopifyError } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, is_active, total_orders, total_customers, total_products, total_revenue, last_sync_at, created_at')
      .eq('is_active', true);

    // Check Klaviyo
    const { data: klaviyoAccount, error: klaviyoError } = await supabase
      .from('klaviyo_accounts')
      .select('id, account_name, is_active, last_sync_at, total_profiles, total_campaigns, total_flows')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Check Meta (Facebook)
    const { data: metaAccount } = await supabase
      .from('meta_ad_accounts')
      .select('id, account_name, is_active, last_sync_at')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Check Google
    const { data: googleAccount } = await supabase
      .from('google_ad_accounts')
      .select('id, account_name, is_active, last_sync_at')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Check TikTok
    const { data: tiktokAccount } = await supabase
      .from('tiktok_ad_accounts')
      .select('id, advertiser_name, is_active, last_sync_at')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Check WhatsApp
    const { data: whatsappAccount } = await supabase
      .from('whatsapp_accounts')
      .select('id, phone_number, is_active, created_at')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Format last sync time
    const formatLastSync = (dateStr: string | null) => {
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

    // Calculate Shopify stats
    const shopifyStats = shopifyStores && shopifyStores.length > 0 ? {
      Orders: shopifyStores.reduce((sum, s) => sum + (s.total_orders || 0), 0).toLocaleString(),
      Customers: shopifyStores.reduce((sum, s) => sum + (s.total_customers || 0), 0).toLocaleString(),
      Products: shopifyStores.reduce((sum, s) => sum + (s.total_products || 0), 0).toLocaleString(),
    } : null;

    // Calculate Klaviyo stats
    const klaviyoStats = klaviyoAccount ? {
      Profiles: (klaviyoAccount.total_profiles || 0).toLocaleString(),
      Campaigns: (klaviyoAccount.total_campaigns || 0).toString(),
      Flows: (klaviyoAccount.total_flows || 0).toString(),
    } : null;

    const integrations = {
      shopify: {
        connected: shopifyStores && shopifyStores.length > 0,
        status: shopifyStores && shopifyStores.length > 0 ? 'healthy' : 'disconnected',
        lastSync: shopifyStores?.[0]?.last_sync_at ? formatLastSync(shopifyStores[0].last_sync_at) : null,
        stats: shopifyStats,
        stores: shopifyStores?.map(s => ({
          id: s.id,
          name: s.shop_name,
          domain: s.shop_domain,
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
        connected: !!whatsappAccount,
        status: whatsappAccount ? 'healthy' : 'disconnected',
        lastSync: whatsappAccount?.created_at ? formatLastSync(whatsappAccount.created_at) : null,
        phoneNumber: whatsappAccount?.phone_number || null,
      },
    };

    return NextResponse.json({ integrations });
  } catch (error: any) {
    console.error('Integration status error:', error);
    return NextResponse.json({ 
      error: error.message,
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
