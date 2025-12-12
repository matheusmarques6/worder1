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

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3';

// Helper for TikTok API calls
async function tiktokFetch(
  accessToken: string,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
) {
  const options: RequestInit = {
    method,
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  };
  
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }
  
  const url = method === 'GET' && body
    ? `${TIKTOK_API_URL}${endpoint}?${new URLSearchParams(body).toString()}`
    : `${TIKTOK_API_URL}${endpoint}`;
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || 'TikTok API error');
  }
  
  return data.data;
}

// GET - Get OAuth URL or fetch data
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  // Generate OAuth URL
  if (action === 'auth_url') {
    const appId = process.env.TIKTOK_APP_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/tiktok/callback`;
    const state = organizationId;
    
    const authUrl = `https://business-api.tiktok.com/portal/auth?` +
      `app_id=${appId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${state}`;
    
    return NextResponse.json({ authUrl });
  }
  
  // Get connected accounts
  if (action === 'accounts') {
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    const { data: accounts } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('organization_id', organizationId);
    
    return NextResponse.json({ accounts: accounts || [] });
  }
  
  // Get metrics
  if (action === 'metrics') {
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');
    
    if (!organizationId || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
    }
    
    const { data: metrics } = await supabase
      .from('tiktok_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });
    
    return NextResponse.json({ metrics: metrics || [] });
  }
  
  // Get campaigns
  if (action === 'campaigns') {
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    const { data: campaigns } = await supabase
      .from('tiktok_campaigns')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    
    return NextResponse.json({ campaigns: campaigns || [] });
  }
  
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST - Connect account or sync data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, organizationId, advertiserId, accessToken } = body;
    
    // Connect new account
    if (action === 'connect') {
      if (!organizationId || !advertiserId || !accessToken) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      // Get advertiser info
      const advertiserInfo = await tiktokFetch(accessToken, '/advertiser/info/', 'GET', {
        advertiser_ids: JSON.stringify([advertiserId]),
        fields: JSON.stringify(['name', 'currency', 'timezone'])
      });
      
      const advertiser = advertiserInfo.list?.[0];
      
      if (!advertiser) {
        throw new Error('Could not fetch advertiser info');
      }
      
      // Save to database
      const { error } = await supabase.from('tiktok_accounts').upsert({
        organization_id: organizationId,
        access_token: accessToken,
        advertiser_id: advertiserId,
        advertiser_name: advertiser.name,
        currency: advertiser.currency,
        timezone: advertiser.timezone,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,advertiser_id' });
      
      if (error) throw error;
      
      // Trigger initial sync
      await syncTikTokData(organizationId, advertiserId, accessToken);
      
      return NextResponse.json({ success: true, advertiser });
    }
    
    // Sync data
    if (action === 'sync') {
      if (!organizationId) {
        return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
      }
      
      const { data: accounts } = await supabase
        .from('tiktok_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      
      if (!accounts?.length) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      for (const account of accounts) {
        await syncTikTokData(organizationId, account.advertiser_id, account.access_token);
      }
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('TikTok API error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// DELETE - Disconnect account
export async function DELETE(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const advertiserId = request.nextUrl.searchParams.get('advertiserId');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }
  
  try {
    let query = supabase.from('tiktok_accounts').delete().eq('organization_id', organizationId);
    if (advertiserId) query = query.eq('advertiser_id', advertiserId);
    
    await query;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Sync TikTok data
async function syncTikTokData(organizationId: string, advertiserId: string, accessToken: string) {
  try {
    // Sync campaigns
    await syncCampaigns(organizationId, advertiserId, accessToken);
    
    // Sync metrics for last 30 days
    await syncMetrics(organizationId, advertiserId, accessToken, 30);
    
    // Update last sync timestamp
    await supabase
      .from('tiktok_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('advertiser_id', advertiserId);
  } catch (error) {
    console.error('TikTok sync error:', error);
    throw error;
  }
}

async function syncCampaigns(organizationId: string, advertiserId: string, accessToken: string) {
  const campaigns = await tiktokFetch(accessToken, '/campaign/get/', 'GET', {
    advertiser_id: advertiserId,
    fields: JSON.stringify([
      'campaign_id', 'campaign_name', 'status', 'objective_type',
      'budget', 'budget_mode'
    ])
  });
  
  for (const campaign of campaigns.list || []) {
    await supabase.from('tiktok_campaigns').upsert({
      organization_id: organizationId,
      campaign_id: campaign.campaign_id,
      name: campaign.campaign_name,
      status: campaign.status,
      objective_type: campaign.objective_type,
      budget: campaign.budget,
      budget_mode: campaign.budget_mode,
    }, { onConflict: 'organization_id,campaign_id' });
  }
  
  // Sync ad groups
  const adgroups = await tiktokFetch(accessToken, '/adgroup/get/', 'GET', {
    advertiser_id: advertiserId,
    fields: JSON.stringify([
      'adgroup_id', 'adgroup_name', 'campaign_id', 'status',
      'placement_type', 'budget', 'bid_type', 'bid_price', 'optimization_goal'
    ])
  });
  
  for (const adgroup of adgroups.list || []) {
    // Get campaign UUID
    const { data: campaign } = await supabase
      .from('tiktok_campaigns')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('campaign_id', adgroup.campaign_id)
      .single();
    
    await supabase.from('tiktok_adgroups').upsert({
      organization_id: organizationId,
      campaign_id: campaign?.id,
      adgroup_id: adgroup.adgroup_id,
      name: adgroup.adgroup_name,
      status: adgroup.status,
      placement_type: adgroup.placement_type,
      budget: adgroup.budget,
      bid_type: adgroup.bid_type,
      bid_amount: adgroup.bid_price,
      optimization_goal: adgroup.optimization_goal,
    }, { onConflict: 'organization_id,adgroup_id' });
  }
}

async function syncMetrics(organizationId: string, advertiserId: string, accessToken: string, days: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  
  // Get advertiser-level metrics by day
  const metrics = await tiktokFetch(accessToken, '/report/integrated/get/', 'POST', {
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    dimensions: ['stat_time_day'],
    data_level: 'AUCTION_ADVERTISER',
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    metrics: [
      'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
      'video_views_p25', 'video_views_p50', 'video_views_p75', 'video_views_p100',
      'likes', 'comments', 'shares', 'follows',
      'conversion', 'total_complete_payment_rate', 'total_purchase_value', 'cost_per_conversion'
    ]
  });
  
  for (const row of metrics.list || []) {
    const date = row.dimensions.stat_time_day;
    const m = row.metrics;
    
    const spend = parseFloat(m.spend || '0');
    const conversionValue = parseFloat(m.total_purchase_value || '0');
    
    await supabase.from('tiktok_metrics').upsert({
      organization_id: organizationId,
      date: date,
      level: 'advertiser',
      spend: spend,
      impressions: parseInt(m.impressions || '0'),
      clicks: parseInt(m.clicks || '0'),
      ctr: parseFloat(m.ctr || '0'),
      cpc: parseFloat(m.cpc || '0'),
      cpm: parseFloat(m.cpm || '0'),
      video_views: parseInt(m.video_views_p25 || '0'),
      video_watched_2s: parseInt(m.video_views_p25 || '0'),
      video_watched_6s: parseInt(m.video_views_p50 || '0'),
      likes: parseInt(m.likes || '0'),
      comments: parseInt(m.comments || '0'),
      shares: parseInt(m.shares || '0'),
      follows: parseInt(m.follows || '0'),
      conversions: parseInt(m.conversion || '0'),
      conversion_value: conversionValue,
      cost_per_conversion: parseFloat(m.cost_per_conversion || '0'),
      roas: spend > 0 ? conversionValue / spend : 0,
    }, { onConflict: 'organization_id,date,level,campaign_id,adgroup_id,ad_id' });
  }
  
  // Get campaign-level metrics
  const campaignMetrics = await tiktokFetch(accessToken, '/report/integrated/get/', 'POST', {
    advertiser_id: advertiserId,
    report_type: 'BASIC',
    dimensions: ['stat_time_day', 'campaign_id'],
    data_level: 'AUCTION_CAMPAIGN',
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
    metrics: [
      'spend', 'impressions', 'clicks', 'conversion', 'total_purchase_value'
    ]
  });
  
  for (const row of campaignMetrics.list || []) {
    const date = row.dimensions.stat_time_day;
    const campaignId = row.dimensions.campaign_id;
    const m = row.metrics;
    
    const spend = parseFloat(m.spend || '0');
    const conversionValue = parseFloat(m.total_purchase_value || '0');
    
    await supabase.from('tiktok_metrics').upsert({
      organization_id: organizationId,
      date: date,
      campaign_id: campaignId,
      level: 'campaign',
      spend: spend,
      impressions: parseInt(m.impressions || '0'),
      clicks: parseInt(m.clicks || '0'),
      conversions: parseInt(m.conversion || '0'),
      conversion_value: conversionValue,
      roas: spend > 0 ? conversionValue / spend : 0,
    }, { onConflict: 'organization_id,date,level,campaign_id,adgroup_id,ad_id' });
  }
}
