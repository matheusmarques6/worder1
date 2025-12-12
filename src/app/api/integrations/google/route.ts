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

const GOOGLE_ADS_API_VERSION = 'v16';

// Helper to get access token from refresh token
async function getAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error_description || 'Failed to refresh token');
  return data.access_token;
}

// Helper for Google Ads API calls
async function googleAdsQuery(
  accessToken: string,
  customerId: string,
  query: string,
  managerCustomerId?: string
) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  };
  
  if (managerCustomerId) {
    headers['login-customer-id'] = managerCustomerId.replace(/-/g, '');
  }
  
  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId.replace(/-/g, '')}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Google Ads API error');
  }
  
  const results: any[] = [];
  const data = await response.json();
  
  for (const batch of data) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  
  return results;
}

// GET - Get OAuth URL or fetch data
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  // Generate OAuth URL
  if (action === 'auth_url') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`;
    const state = organizationId;
    
    const scopes = [
      'https://www.googleapis.com/auth/adwords',
    ].join(' ');
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}&` +
      `response_type=code&` +
      `access_type=offline&` +
      `prompt=consent`;
    
    return NextResponse.json({ authUrl });
  }
  
  // Get connected accounts
  if (action === 'accounts') {
    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
    }
    
    const { data: accounts } = await supabase
      .from('google_ads_accounts')
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
      .from('google_ads_metrics')
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
      .from('google_ads_campaigns')
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
    const { action, organizationId, customerId, refreshToken, managerCustomerId } = body;
    
    // Connect new account
    if (action === 'connect') {
      if (!organizationId || !customerId || !refreshToken) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      // Get access token
      const accessToken = await getAccessToken(refreshToken);
      
      // Get customer info
      const query = `
        SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone
        FROM customer
        LIMIT 1
      `;
      
      const results = await googleAdsQuery(accessToken, customerId, query, managerCustomerId);
      const customer = results[0]?.customer;
      
      if (!customer) {
        throw new Error('Could not fetch customer info');
      }
      
      // Save to database
      const { error } = await supabase.from('google_ads_accounts').upsert({
        organization_id: organizationId,
        refresh_token: refreshToken,
        customer_id: customerId,
        customer_name: customer.descriptiveName,
        manager_customer_id: managerCustomerId,
        currency: customer.currencyCode,
        timezone: customer.timeZone,
        is_active: true,
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,customer_id' });
      
      if (error) throw error;
      
      // Trigger initial sync
      await syncGoogleAdsData(organizationId, customerId, refreshToken, managerCustomerId);
      
      return NextResponse.json({ success: true, customer });
    }
    
    // Sync data
    if (action === 'sync') {
      if (!organizationId) {
        return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
      }
      
      const { data: accounts } = await supabase
        .from('google_ads_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      
      if (!accounts?.length) {
        return NextResponse.json({ error: 'No Google Ads accounts connected' }, { status: 404 });
      }
      
      for (const account of accounts) {
        await syncGoogleAdsData(
          organizationId,
          account.customer_id,
          account.refresh_token,
          account.manager_customer_id
        );
      }
      
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Google Ads API error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// DELETE - Disconnect account
export async function DELETE(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const customerId = request.nextUrl.searchParams.get('customerId');
  
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }
  
  try {
    let query = supabase.from('google_ads_accounts').delete().eq('organization_id', organizationId);
    if (customerId) query = query.eq('customer_id', customerId);
    
    await query;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Sync Google Ads data
async function syncGoogleAdsData(
  organizationId: string,
  customerId: string,
  refreshToken: string,
  managerCustomerId?: string
) {
  try {
    const accessToken = await getAccessToken(refreshToken);
    
    // Sync campaigns
    await syncCampaigns(organizationId, customerId, accessToken, managerCustomerId);
    
    // Sync metrics for last 30 days
    await syncMetrics(organizationId, customerId, accessToken, managerCustomerId, 30);
    
    // Update last sync timestamp
    await supabase
      .from('google_ads_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId);
  } catch (error) {
    console.error('Google Ads sync error:', error);
    throw error;
  }
}

async function syncCampaigns(
  organizationId: string,
  customerId: string,
  accessToken: string,
  managerCustomerId?: string
) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      campaign_budget.type,
      campaign.start_date,
      campaign.end_date
    FROM campaign
    WHERE campaign.status != 'REMOVED'
  `;
  
  const results = await googleAdsQuery(accessToken, customerId, query, managerCustomerId);
  
  for (const row of results) {
    const campaign = row.campaign;
    const budget = row.campaignBudget;
    
    await supabase.from('google_ads_campaigns').upsert({
      organization_id: organizationId,
      campaign_id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      campaign_type: campaign.advertisingChannelType,
      bidding_strategy: campaign.biddingStrategyType,
      budget_amount: budget?.amountMicros ? parseInt(budget.amountMicros) / 1000000 : null,
      budget_type: budget?.type,
      start_date: campaign.startDate,
      end_date: campaign.endDate,
    }, { onConflict: 'organization_id,campaign_id' });
  }
}

async function syncMetrics(
  organizationId: string,
  customerId: string,
  accessToken: string,
  managerCustomerId: string | undefined,
  days: number
) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
  
  // Account-level metrics by day
  const accountQuery = `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion,
      metrics.video_views
    FROM customer
    WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
  `;
  
  const accountResults = await googleAdsQuery(accessToken, customerId, accountQuery, managerCustomerId);
  
  for (const row of accountResults) {
    const metrics = row.metrics;
    const date = row.segments?.date;
    
    if (!date) continue;
    
    const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
    const cost = metrics.costMicros ? parseInt(metrics.costMicros) / 1000000 : 0;
    const conversionsValue = parseFloat(metrics.conversionsValue || '0');
    
    await supabase.from('google_ads_metrics').upsert({
      organization_id: organizationId,
      date: formattedDate,
      level: 'account',
      cost: cost,
      impressions: parseInt(metrics.impressions || '0'),
      clicks: parseInt(metrics.clicks || '0'),
      ctr: parseFloat(metrics.ctr || '0'),
      average_cpc: metrics.averageCpc ? parseInt(metrics.averageCpc) / 1000000 : 0,
      conversions: parseFloat(metrics.conversions || '0'),
      conversions_value: conversionsValue,
      cost_per_conversion: parseFloat(metrics.costPerConversion || '0') / 1000000,
      roas: cost > 0 ? conversionsValue / cost : 0,
      video_views: parseInt(metrics.videoViews || '0'),
    }, { onConflict: 'organization_id,date,level,campaign_id,ad_group_id' });
  }
  
  // Campaign-level metrics
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
      AND campaign.status != 'REMOVED'
  `;
  
  const campaignResults = await googleAdsQuery(accessToken, customerId, campaignQuery, managerCustomerId);
  
  for (const row of campaignResults) {
    const campaign = row.campaign;
    const metrics = row.metrics;
    const date = row.segments?.date;
    
    if (!date) continue;
    
    const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
    const cost = metrics.costMicros ? parseInt(metrics.costMicros) / 1000000 : 0;
    const conversionsValue = parseFloat(metrics.conversionsValue || '0');
    
    await supabase.from('google_ads_metrics').upsert({
      organization_id: organizationId,
      date: formattedDate,
      campaign_id: campaign.id,
      level: 'campaign',
      cost: cost,
      impressions: parseInt(metrics.impressions || '0'),
      clicks: parseInt(metrics.clicks || '0'),
      conversions: parseFloat(metrics.conversions || '0'),
      conversions_value: conversionsValue,
      roas: cost > 0 ? conversionsValue / cost : 0,
    }, { onConflict: 'organization_id,date,level,campaign_id,ad_group_id' });
  }
}
