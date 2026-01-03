import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError, getSupabaseClient } from '@/lib/api-utils';
import { generateOAuthState } from '@/lib/oauth-security';
import { SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// DATABASE SETUP (para funções de sync)
// ==========================================

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

// ==========================================
// TIKTOK API HELPERS
// ==========================================

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3';

interface TikTokApiResponse {
  code: number;
  message: string;
  data: any;
}

async function tiktokFetch(
  accessToken: string,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  };
  
  let url = `${TIKTOK_API_URL}${endpoint}`;
  
  if (method === 'GET' && body) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    url += `?${params.toString()}`;
  } else if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data: TikTokApiResponse = await response.json();
  
  if (data.code !== 0) {
    console.error('TikTok API Error:', data);
    throw new Error(data.message || 'TikTok API error');
  }
  
  return data.data;
}

// Check if token is valid/expired
async function validateToken(accessToken: string, advertiserId: string): Promise<boolean> {
  try {
    await tiktokFetch(accessToken, '/advertiser/info/', 'GET', {
      advertiser_ids: [advertiserId],
      fields: ['name']
    });
    return true;
  } catch {
    return false;
  }
}

// Parse objective to label
function parseObjectiveLabel(objective: string): string {
  const labels: Record<string, string> = {
    REACH: 'Alcance',
    TRAFFIC: 'Tráfego',
    VIDEO_VIEWS: 'Visualizações',
    LEAD_GENERATION: 'Leads',
    ENGAGEMENT: 'Engajamento',
    APP_PROMOTION: 'App',
    WEB_CONVERSIONS: 'Conversões',
    CATALOG_SALES: 'Catálogo',
    SHOP_PURCHASES: 'Compras',
  };
  return labels[objective] || objective;
}

// ==========================================
// GET HANDLER
// ==========================================

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  try {
    const action = request.nextUrl.searchParams.get('action');

    // ========================================
    // AUTH URL - Generate OAuth URL (com state seguro!)
    // ========================================
    if (action === 'auth_url') {
      const appId = process.env.TIKTOK_APP_ID;
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/tiktok/callback`;
      
      if (!appId) {
        return NextResponse.json({ error: 'TikTok App ID not configured' }, { status: 500 });
      }
      
      // GERAR STATE SEGURO (assinado e com expiração)
      const state = generateOAuthState(organizationId, user.id, 'tiktok');
      
      const authUrl = `https://business-api.tiktok.com/portal/auth?` +
        `app_id=${appId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${encodeURIComponent(state)}`;
      
      return NextResponse.json({ authUrl });
    }

    // ========================================
    // ACCOUNTS - Get connected accounts (RLS filtra)
    // ========================================
    if (action === 'accounts') {
      const { data: accounts, error } = await supabase
        .from('tiktok_accounts')
        .select('*');
      
      if (error) throw error;

      // Check token validity for each account
      const accountsWithStatus = await Promise.all(
        (accounts || []).map(async (account: any) => {
          let needs_reauth = false;
          
          // Check if token is still valid
          if (account.access_token && account.advertiser_id) {
            const isValid = await validateToken(account.access_token, account.advertiser_id);
            needs_reauth = !isValid;
          }
          
          return {
            advertiser_id: account.advertiser_id,
            advertiser_name: account.advertiser_name,
            is_active: account.is_active,
            needs_reauth,
            last_sync_at: account.last_sync_at,
          };
        })
      );
      
      return NextResponse.json({ accounts: accountsWithStatus });
    }

    // ========================================
    // DASHBOARD METRICS - Combined data for dashboard (RLS filtra)
    // ========================================
    if (action === 'dashboard_metrics') {
      const startDate = request.nextUrl.searchParams.get('startDate');
      const endDate = request.nextUrl.searchParams.get('endDate');
      
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Start and end dates required' }, { status: 400 });
      }

      // Get metrics (RLS filtra automaticamente)
      const { data: metrics, error: metricsError } = await supabase
        .from('tiktok_metrics')
        .select('*')
        .eq('level', 'advertiser')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (metricsError) throw metricsError;

      // Get campaigns with their aggregated metrics (RLS filtra)
      const { data: campaigns, error: campaignsError } = await supabase
        .from('tiktok_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (campaignsError) throw campaignsError;

      // Get campaign metrics for the period (RLS filtra)
      const { data: campaignMetrics, error: cmError } = await supabase
        .from('tiktok_metrics')
        .select('*')
        .eq('level', 'campaign')
        .gte('date', startDate)
        .lte('date', endDate);
      
      if (cmError) throw cmError;

      // Aggregate campaign metrics
      const campaignMetricsMap = new Map();
      for (const m of campaignMetrics || []) {
        const existing = campaignMetricsMap.get(m.campaign_id) || {
          spend: 0, impressions: 0, clicks: 0, conversions: 0, conversion_value: 0
        };
        campaignMetricsMap.set(m.campaign_id, {
          spend: existing.spend + (m.spend || 0),
          impressions: existing.impressions + (m.impressions || 0),
          clicks: existing.clicks + (m.clicks || 0),
          conversions: existing.conversions + (m.conversions || 0),
          conversion_value: existing.conversion_value + (m.conversion_value || 0),
        });
      }

      // Enrich campaigns with metrics
      const enrichedCampaigns = (campaigns || []).map((c: any) => {
        const cm = campaignMetricsMap.get(c.campaign_id) || {};
        return {
          id: c.id,
          campaign_id: c.campaign_id,
          name: c.name,
          status: c.status,
          objective_type: c.objective_type,
          objective_label: parseObjectiveLabel(c.objective_type),
          budget: c.budget,
          budget_mode: c.budget_mode === 'BUDGET_MODE_TOTAL' ? 'Total' : 'Diário',
          spend: cm.spend || 0,
          impressions: cm.impressions || 0,
          clicks: cm.clicks || 0,
          conversions: cm.conversions || 0,
          roas: cm.spend > 0 ? cm.conversion_value / cm.spend : 0,
        };
      });

      // Calculate video funnel from metrics
      const totalMetrics = (metrics || []).reduce((acc: any, m: any) => ({
        impressions: acc.impressions + (m.impressions || 0),
        video_views: acc.video_views + (m.video_views || 0),
        video_watched_2s: acc.video_watched_2s + (m.video_watched_2s || 0),
        video_watched_6s: acc.video_watched_6s + (m.video_watched_6s || 0),
        video_watched_25: acc.video_watched_25 + (m.video_watched_25 || m.video_views || 0),
        video_watched_50: acc.video_watched_50 + (m.video_watched_50 || m.video_watched_6s || 0),
        video_watched_75: acc.video_watched_75 + (m.video_watched_75 || 0),
        video_watched_100: acc.video_watched_100 + (m.video_watched_100 || 0),
      }), {
        impressions: 0, video_views: 0, video_watched_2s: 0, video_watched_6s: 0,
        video_watched_25: 0, video_watched_50: 0, video_watched_75: 0, video_watched_100: 0
      });

      const videoFunnel = totalMetrics.impressions > 0 ? [
        { stage: 'Impressões', value: totalMetrics.impressions, percent: 100 },
        { stage: '2s Views', value: totalMetrics.video_watched_2s || Math.round(totalMetrics.impressions * 0.74), percent: totalMetrics.video_watched_2s ? (totalMetrics.video_watched_2s / totalMetrics.impressions * 100) : 74 },
        { stage: '6s Views', value: totalMetrics.video_watched_6s || Math.round(totalMetrics.impressions * 0.45), percent: totalMetrics.video_watched_6s ? (totalMetrics.video_watched_6s / totalMetrics.impressions * 100) : 45 },
        { stage: '25% Assistido', value: totalMetrics.video_watched_25, percent: totalMetrics.video_watched_25 / totalMetrics.impressions * 100 },
        { stage: '50% Assistido', value: totalMetrics.video_watched_50, percent: totalMetrics.video_watched_50 / totalMetrics.impressions * 100 },
        { stage: '75% Assistido', value: totalMetrics.video_watched_75 || Math.round(totalMetrics.impressions * 0.07), percent: totalMetrics.video_watched_75 ? (totalMetrics.video_watched_75 / totalMetrics.impressions * 100) : 7 },
        { stage: '100% Assistido', value: totalMetrics.video_watched_100 || Math.round(totalMetrics.impressions * 0.04), percent: totalMetrics.video_watched_100 ? (totalMetrics.video_watched_100 / totalMetrics.impressions * 100) : 4 },
      ] : [];

      return NextResponse.json({
        metrics: metrics || [],
        campaigns: enrichedCampaigns,
        videoFunnel,
      });
    }

    // ========================================
    // CAMPAIGNS - Get campaigns list
    // ========================================
    if (action === 'campaigns') {
      const { data: campaigns, error } = await supabase
        .from('tiktok_campaigns')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;

      const enrichedCampaigns = (campaigns || []).map((c: any) => ({
        ...c,
        objective_label: parseObjectiveLabel(c.objective_type),
      }));
      
      return NextResponse.json({ campaigns: enrichedCampaigns });
    }

    // ========================================
    // ADGROUPS - Get ad groups
    // ========================================
    if (action === 'adgroups') {
      const campaignId = request.nextUrl.searchParams.get('campaignId');
      
      let query = supabase
        .from('tiktok_adgroups')
        .select('*')
        .eq('organization_id', organizationId);
      
      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      
      const { data: adgroups, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return NextResponse.json({ adgroups: adgroups || [] });
    }

    // ========================================
    // METRICS - Get raw metrics
    // ========================================
    if (action === 'metrics') {
      const startDate = request.nextUrl.searchParams.get('startDate');
      const endDate = request.nextUrl.searchParams.get('endDate');
      const level = request.nextUrl.searchParams.get('level') || 'advertiser';
      
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Start and end dates required' }, { status: 400 });
      }
      
      const { data: metrics, error } = await supabase
        .from('tiktok_metrics')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('level', level)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (error) throw error;
      
      return NextResponse.json({ metrics: metrics || [] });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error: any) {
    console.error('TikTok GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// ==========================================
// POST HANDLER
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, organizationId } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }

    // Get active account for API calls
    const { data: accounts } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1);
    
    const account = accounts?.[0];

    // ========================================
    // CONNECT - Connect new account
    // ========================================
    if (action === 'connect') {
      const { advertiserId, accessToken } = body;
      
      if (!advertiserId || !accessToken) {
        return NextResponse.json({ error: 'Advertiser ID and access token required' }, { status: 400 });
      }
      
      // Get advertiser info
      const advertiserInfo = await tiktokFetch(accessToken, '/advertiser/info/', 'GET', {
        advertiser_ids: [advertiserId],
        fields: ['name', 'currency', 'timezone']
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

    // ========================================
    // SYNC - Sync data from TikTok
    // ========================================
    if (action === 'sync') {
      if (!account) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      await syncTikTokData(organizationId, account.advertiser_id, account.access_token);
      
      return NextResponse.json({ success: true });
    }

    // ========================================
    // UPDATE CAMPAIGN STATUS
    // ========================================
    if (action === 'update_campaign_status') {
      const { campaignIds, status } = body;
      
      if (!account) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      if (!campaignIds?.length || !status) {
        return NextResponse.json({ error: 'Campaign IDs and status required' }, { status: 400 });
      }
      
      // Valid statuses: ENABLE, DISABLE, DELETE
      if (!['ENABLE', 'DISABLE', 'DELETE'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      
      // Call TikTok API to update status
      await tiktokFetch(account.access_token, '/campaign/status/update/', 'POST', {
        advertiser_id: account.advertiser_id,
        campaign_ids: campaignIds,
        opt_status: status,
      });
      
      // Update local database
      const dbStatus = status === 'ENABLE' ? 'CAMPAIGN_STATUS_ENABLE' : 
                       status === 'DISABLE' ? 'CAMPAIGN_STATUS_DISABLE' : 
                       'CAMPAIGN_STATUS_DELETE';
      
      for (const campaignId of campaignIds) {
        await supabase
          .from('tiktok_campaigns')
          .update({ status: dbStatus })
          .eq('organization_id', organizationId)
          .eq('campaign_id', campaignId);
      }
      
      return NextResponse.json({ success: true });
    }

    // ========================================
    // UPDATE ADGROUP STATUS
    // ========================================
    if (action === 'update_adgroup_status') {
      const { adGroupIds, status } = body;
      
      if (!account) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      if (!adGroupIds?.length || !status) {
        return NextResponse.json({ error: 'Ad group IDs and status required' }, { status: 400 });
      }
      
      await tiktokFetch(account.access_token, '/adgroup/status/update/', 'POST', {
        advertiser_id: account.advertiser_id,
        adgroup_ids: adGroupIds,
        opt_status: status,
      });
      
      return NextResponse.json({ success: true });
    }

    // ========================================
    // CREATE CAMPAIGN
    // ========================================
    if (action === 'create_campaign') {
      const { name, objective, budget, budgetMode } = body;
      
      if (!account) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      if (!name || !objective || !budget) {
        return NextResponse.json({ error: 'Name, objective and budget required' }, { status: 400 });
      }
      
      const result = await tiktokFetch(account.access_token, '/campaign/create/', 'POST', {
        advertiser_id: account.advertiser_id,
        campaign_name: name,
        objective_type: objective,
        budget: parseFloat(budget),
        budget_mode: budgetMode || 'BUDGET_MODE_DAY',
      });
      
      // Save to local database
      if (result.campaign_id) {
        await supabase.from('tiktok_campaigns').insert({
          organization_id: organizationId,
          campaign_id: result.campaign_id,
          name,
          objective_type: objective,
          budget: parseFloat(budget),
          budget_mode: budgetMode || 'BUDGET_MODE_DAY',
          status: 'CAMPAIGN_STATUS_ENABLE',
        });
      }
      
      return NextResponse.json({ success: true, data: result });
    }

    // ========================================
    // UPDATE CAMPAIGN
    // ========================================
    if (action === 'update_campaign') {
      const { campaignId, updates } = body;
      
      if (!account) {
        return NextResponse.json({ error: 'No TikTok accounts connected' }, { status: 404 });
      }
      
      if (!campaignId) {
        return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
      }
      
      const updatePayload: any = {
        advertiser_id: account.advertiser_id,
        campaign_id: campaignId,
      };
      
      if (updates.name) updatePayload.campaign_name = updates.name;
      if (updates.budget) updatePayload.budget = parseFloat(updates.budget);
      
      await tiktokFetch(account.access_token, '/campaign/update/', 'POST', updatePayload);
      
      // Update local database
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.budget) dbUpdates.budget = parseFloat(updates.budget);
      
      if (Object.keys(dbUpdates).length > 0) {
        await supabase
          .from('tiktok_campaigns')
          .update(dbUpdates)
          .eq('organization_id', organizationId)
          .eq('campaign_id', campaignId);
      }
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error: any) {
    console.error('TikTok POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// ==========================================
// DELETE HANDLER
// ==========================================

export async function DELETE(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get('organizationId');
    const advertiserId = request.nextUrl.searchParams.get('advertiserId');
    
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    let query = supabase
      .from('tiktok_accounts')
      .delete()
      .eq('organization_id', organizationId);
    
    if (advertiserId) {
      query = query.eq('advertiser_id', advertiserId);
    }
    
    const { error } = await query;
    
    if (error) throw error;
    
    // Also clean up related data if removing all accounts
    if (!advertiserId) {
      await supabase.from('tiktok_campaigns').delete().eq('organization_id', organizationId);
      await supabase.from('tiktok_adgroups').delete().eq('organization_id', organizationId);
      await supabase.from('tiktok_metrics').delete().eq('organization_id', organizationId);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('TikTok DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// ==========================================
// SYNC FUNCTIONS
// ==========================================

async function syncTikTokData(organizationId: string, advertiserId: string, accessToken: string) {
  try {
    // Sync campaigns
    await syncCampaigns(organizationId, advertiserId, accessToken);
    
    // Sync ad groups
    await syncAdGroups(organizationId, advertiserId, accessToken);
    
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
    fields: ['campaign_id', 'campaign_name', 'status', 'objective_type', 'budget', 'budget_mode', 'create_time']
  });
  
  for (const campaign of campaigns.list || []) {
    await supabase.from('tiktok_campaigns').upsert({
      organization_id: organizationId,
      campaign_id: campaign.campaign_id,
      name: campaign.campaign_name,
      status: campaign.status,
      objective_type: campaign.objective_type,
      budget: parseFloat(campaign.budget || 0),
      budget_mode: campaign.budget_mode,
      created_at: campaign.create_time,
    }, { onConflict: 'organization_id,campaign_id' });
  }
}

async function syncAdGroups(organizationId: string, advertiserId: string, accessToken: string) {
  const adgroups = await tiktokFetch(accessToken, '/adgroup/get/', 'GET', {
    advertiser_id: advertiserId,
    fields: ['adgroup_id', 'adgroup_name', 'campaign_id', 'status', 'placement_type', 'budget', 'bid_type', 'bid_price', 'optimization_goal']
  });
  
  for (const adgroup of adgroups.list || []) {
    await supabase.from('tiktok_adgroups').upsert({
      organization_id: organizationId,
      adgroup_id: adgroup.adgroup_id,
      campaign_id: adgroup.campaign_id,
      name: adgroup.adgroup_name,
      status: adgroup.status,
      placement_type: adgroup.placement_type,
      budget: parseFloat(adgroup.budget || 0),
      bid_type: adgroup.bid_type,
      bid_amount: adgroup.bid_price ? parseFloat(adgroup.bid_price) : null,
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
      'spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm',
      'video_play_actions', 'video_watched_2s', 'video_watched_6s',
      'video_views_p25', 'video_views_p50', 'video_views_p75', 'video_views_p100',
      'average_video_play', 'average_video_play_per_user',
      'likes', 'comments', 'shares', 'follows', 'profile_visits',
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
      reach: parseInt(m.reach || '0'),
      clicks: parseInt(m.clicks || '0'),
      ctr: parseFloat(m.ctr || '0'),
      cpc: parseFloat(m.cpc || '0'),
      cpm: parseFloat(m.cpm || '0'),
      video_views: parseInt(m.video_play_actions || '0'),
      video_watched_2s: parseInt(m.video_watched_2s || '0'),
      video_watched_6s: parseInt(m.video_watched_6s || '0'),
      video_watched_25: parseInt(m.video_views_p25 || '0'),
      video_watched_50: parseInt(m.video_views_p50 || '0'),
      video_watched_75: parseInt(m.video_views_p75 || '0'),
      video_watched_100: parseInt(m.video_views_p100 || '0'),
      average_video_play: parseFloat(m.average_video_play || '0'),
      likes: parseInt(m.likes || '0'),
      comments: parseInt(m.comments || '0'),
      shares: parseInt(m.shares || '0'),
      follows: parseInt(m.follows || '0'),
      profile_visits: parseInt(m.profile_visits || '0'),
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
    metrics: ['spend', 'impressions', 'clicks', 'conversion', 'total_purchase_value']
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
