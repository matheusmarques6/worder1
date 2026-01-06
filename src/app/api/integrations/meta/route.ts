import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateOAuthState } from '@/lib/oauth-security';

const META_API_VERSION = 'v19.0';
const META_API_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// Helper to make Meta API calls
async function metaFetch(accessToken: string, endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_URL}${endpoint}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  
  const response = await fetch(url.toString());
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'Meta API error');
  }
  
  return data;
}

// GET - Get OAuth URL or fetch data
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const action = request.nextUrl.searchParams.get('action');
  
  // Generate OAuth URL (com state seguro!)
  if (action === 'auth_url') {
    const storeId = request.nextUrl.searchParams.get('store_id');
    
    // Validar que store_id pertence à organização
    if (storeId) {
      const { data: store, error: storeError } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .single();
      
      if (storeError || !store) {
        return NextResponse.json({ 
          error: 'Store not found or access denied' 
        }, { status: 403 });
      }
    }
    
    const clientId = process.env.META_APP_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`;
    
    // GERAR STATE SEGURO (assinado e com expiração) - inclui store_id!
    const state = generateOAuthState(organizationId, user.id, 'meta', storeId || undefined);
    
    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'read_insights'
    ].join(',');
    
    const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${scopes}&` +
      `state=${encodeURIComponent(state)}&` +
      `response_type=code`;
    
    return NextResponse.json({ authUrl });
  }
  
  // Get connected accounts (RLS filtra automaticamente)
  if (action === 'accounts') {
    const storeId = request.nextUrl.searchParams.get('store_id');
    
    let query = supabase
      .from('meta_accounts')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Se store_id foi fornecido, filtrar por loja
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    const { data: accounts } = await query;
    
    return NextResponse.json({ accounts: accounts || [] });
  }
  
  // Get metrics (RLS filtra automaticamente)
  if (action === 'metrics') {
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');
    
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing date params' }, { status: 400 });
    }
    
    const { data: metrics } = await supabase
      .from('meta_insights')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
    
    return NextResponse.json({ metrics: metrics || [] });
  }
  
  // Get campaigns (RLS filtra automaticamente)
  if (action === 'campaigns') {
    const { data: campaigns } = await supabase
      .from('meta_campaigns')
      .select('*')
      .order('created_time', { ascending: false });
    
    return NextResponse.json({ campaigns: campaigns || [] });
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST - Connect account or sync data
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const body = await request.json();
    const { action, adAccountId, accessToken, storeId } = body;
    
    // Connect new ad account
    if (action === 'connect') {
      if (!adAccountId || !accessToken) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      // Se storeId foi fornecido, validar que pertence à organização
      if (storeId) {
        const { data: store, error: storeError } = await supabase
          .from('shopify_stores')
          .select('id')
          .eq('id', storeId)
          .eq('organization_id', organizationId)
          .single();
        
        if (storeError || !store) {
          return NextResponse.json({ error: 'Store not found or access denied' }, { status: 403 });
        }
      }
      
      // Get ad account info
      const accountInfo = await metaFetch(accessToken, `/act_${adAccountId}`, {
        fields: 'id,name,account_id,currency,timezone_name,business'
      });
      
      // Preparar dados para salvar
      const accountData: any = {
        organization_id: organizationId,
        access_token: accessToken,
        ad_account_id: adAccountId,
        ad_account_name: accountInfo.name,
        business_id: accountInfo.business?.id,
        business_name: accountInfo.business?.name,
        currency: accountInfo.currency,
        timezone: accountInfo.timezone_name,
        is_active: true,
        status: 'connected',
        last_sync_at: new Date().toISOString(),
      };
      
      // Adicionar store_id se fornecido
      if (storeId) {
        accountData.store_id = storeId;
      }
      
      // Definir constraint baseado em se tem store_id
      const conflictKey = storeId ? 'store_id,ad_account_id' : 'organization_id,ad_account_id';
      
      // Save to database
      const { error } = await supabase.from('meta_accounts').upsert(
        accountData, 
        { onConflict: conflictKey }
      );
      
      if (error) throw error;
      
      // Trigger initial sync
      await syncMetaData(supabase, organizationId, adAccountId, accessToken, storeId);
      
      return NextResponse.json({ success: true, account: accountInfo });
    }
    
    // Sync data
    if (action === 'sync') {
      const { storeId: syncStoreId } = body;
      
      // Get all connected accounts (RLS filtra automaticamente)
      let accountsQuery = supabase
        .from('meta_accounts')
        .select('*')
        .eq('is_active', true);
      
      // Se store_id fornecido, filtrar por loja
      if (syncStoreId) {
        accountsQuery = accountsQuery.eq('store_id', syncStoreId);
      }
      
      const { data: accounts } = await accountsQuery;
      
      if (!accounts?.length) {
        return NextResponse.json({ error: 'No Meta accounts connected' }, { status: 404 });
      }
      
      // Sync each account
      for (const account of accounts) {
        await syncMetaData(supabase, organizationId, account.ad_account_id, account.access_token, account.store_id);
      }
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Meta API error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// DELETE - Disconnect account
export async function DELETE(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const adAccountId = request.nextUrl.searchParams.get('adAccountId');
  
  try {
    // RLS filtra automaticamente pela organização do usuário
    let query = supabase.from('meta_accounts').delete();
    if (adAccountId) query = query.eq('ad_account_id', adAccountId);
    
    await query;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Sync Meta data
async function syncMetaData(supabase: any, organizationId: string, adAccountId: string, accessToken: string, storeId?: string) {
  try {
    // Sync campaigns
    await syncCampaigns(supabase, organizationId, adAccountId, accessToken, storeId);
    
    // Sync insights for last 30 days
    await syncInsights(supabase, organizationId, adAccountId, accessToken, 30, storeId);
    
    // Update last sync timestamp
    let updateQuery = supabase
      .from('meta_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('ad_account_id', adAccountId);
    
    // Se tiver store_id, filtrar por ele também
    if (storeId) {
      updateQuery = updateQuery.eq('store_id', storeId);
    }
    
    await updateQuery;
  } catch (error) {
    console.error('Meta sync error:', error);
    throw error;
  }
}

async function syncCampaigns(supabase: any, organizationId: string, adAccountId: string, accessToken: string, storeId?: string) {
  const campaigns = await metaFetch(accessToken, `/act_${adAccountId}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
    limit: '500'
  });
  
  for (const campaign of campaigns.data || []) {
    const campaignData: any = {
      organization_id: organizationId,
      campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      daily_budget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
      lifetime_budget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
      start_time: campaign.start_time,
      stop_time: campaign.stop_time,
      created_time: campaign.created_time,
      updated_time: campaign.updated_time,
    };
    
    if (storeId) {
      campaignData.store_id = storeId;
    }
    
    await supabase.from('meta_campaigns').upsert(campaignData, { 
      onConflict: 'organization_id,campaign_id' 
    });
  }
}

async function syncInsights(supabase: any, organizationId: string, adAccountId: string, accessToken: string, days: number, storeId?: string) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const dateRange = {
    since: startDate.toISOString().split('T')[0],
    until: endDate.toISOString().split('T')[0]
  };
  
  // Get account-level insights by day
  const insights = await metaFetch(accessToken, `/act_${adAccountId}/insights`, {
    fields: 'date_start,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values',
    time_increment: '1',
    time_range: JSON.stringify(dateRange),
    level: 'account'
  });
  
  for (const insight of insights.data || []) {
    // Parse conversions from actions
    const conversions = insight.actions?.find((a: any) => 
      a.action_type === 'purchase' || a.action_type === 'omni_purchase'
    )?.value || 0;
    
    const conversionValue = insight.action_values?.find((a: any) => 
      a.action_type === 'purchase' || a.action_type === 'omni_purchase'
    )?.value || 0;
    
    const spend = parseFloat(insight.spend || '0');
    const roas = spend > 0 ? parseFloat(conversionValue) / spend : 0;
    
    const insightData: any = {
      organization_id: organizationId,
      date: insight.date_start,
      level: 'account',
      spend: spend,
      impressions: parseInt(insight.impressions || '0'),
      reach: parseInt(insight.reach || '0'),
      frequency: parseFloat(insight.frequency || '0'),
      clicks: parseInt(insight.clicks || '0'),
      ctr: parseFloat(insight.ctr || '0'),
      cpc: parseFloat(insight.cpc || '0'),
      cpm: parseFloat(insight.cpm || '0'),
      conversions: parseInt(conversions),
      conversion_value: parseFloat(conversionValue),
      cost_per_conversion: parseInt(conversions) > 0 ? spend / parseInt(conversions) : 0,
      roas: roas,
      actions: insight.actions,
    };
    
    if (storeId) {
      insightData.store_id = storeId;
    }
    
    await supabase.from('meta_insights').upsert(insightData, { 
      onConflict: 'organization_id,date,level,campaign_id,adset_id,ad_id' 
    });
  }
  
  // Also get campaign-level insights
  const campaignInsights = await metaFetch(accessToken, `/act_${adAccountId}/insights`, {
    fields: 'campaign_id,campaign_name,date_start,spend,impressions,clicks,actions,action_values',
    time_increment: '1',
    time_range: JSON.stringify(dateRange),
    level: 'campaign'
  });
  
  for (const insight of campaignInsights.data || []) {
    const conversions = insight.actions?.find((a: any) => 
      a.action_type === 'purchase' || a.action_type === 'omni_purchase'
    )?.value || 0;
    
    const conversionValue = insight.action_values?.find((a: any) => 
      a.action_type === 'purchase' || a.action_type === 'omni_purchase'
    )?.value || 0;
    
    const spend = parseFloat(insight.spend || '0');
    
    const campaignInsightData: any = {
      organization_id: organizationId,
      date: insight.date_start,
      campaign_id: insight.campaign_id,
      level: 'campaign',
      spend: spend,
      impressions: parseInt(insight.impressions || '0'),
      clicks: parseInt(insight.clicks || '0'),
      conversions: parseInt(conversions),
      conversion_value: parseFloat(conversionValue),
      roas: spend > 0 ? parseFloat(conversionValue) / spend : 0,
    };
    
    if (storeId) {
      campaignInsightData.store_id = storeId;
    }
    
    await supabase.from('meta_insights').upsert(campaignInsightData, { 
      onConflict: 'organization_id,date,level,campaign_id,adset_id,ad_id' 
    });
  }
}
