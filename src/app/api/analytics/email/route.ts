import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

const KLAVIYO_API_URL = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

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

// Klaviyo API helper with timeout
async function klaviyoFetch(apiKey: string, endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = endpoint.startsWith('http') ? endpoint : `${KLAVIYO_API_URL}${endpoint}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'revision': KLAVIYO_REVISION,
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Klaviyo API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    return response.json();
  } catch (e: any) {
    clearTimeout(timeout);
    throw e;
  }
}

async function klaviyoPost(apiKey: string, endpoint: string, body: any): Promise<any> {
  return klaviyoFetch(apiKey, endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Get date range based on period
function getDateRange(period: string): { startDate: Date; endDate: Date; startStr: string; endStr: string } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 6);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 29);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 89);
      break;
    default:
      startDate.setDate(startDate.getDate() - 29);
  }

  const startStr = startDate.toISOString().split('T')[0] + 'T00:00:00';
  const endStr = endDate.toISOString().split('T')[0] + 'T23:59:59';

  return { startDate, endDate, startStr, endStr };
}

// Calculate change percentage
function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Find metric IDs (Placed Order, Opened Email, etc.)
async function findMetricIds(apiKey: string): Promise<{
  openedEmail: string | null;
  clickedEmail: string | null;
  receivedEmail: string | null;
  placedOrder: string | null;
}> {
  try {
    const response = await klaviyoFetch(apiKey, '/metrics');
    const metrics = response?.data || [];
    
    let openedEmail = null;
    let clickedEmail = null;
    let receivedEmail = null;
    let placedOrder = null;
    
    for (const metric of metrics) {
      const name = metric.attributes?.name?.toLowerCase() || '';
      if (name === 'opened email') openedEmail = metric.id;
      else if (name === 'clicked email') clickedEmail = metric.id;
      else if (name === 'received email') receivedEmail = metric.id;
      else if (name === 'placed order') placedOrder = metric.id;
    }
    
    console.log(`[Klaviyo] Found metrics: opened=${openedEmail}, clicked=${clickedEmail}, received=${receivedEmail}, placedOrder=${placedOrder}`);
    return { openedEmail, clickedEmail, receivedEmail, placedOrder };
  } catch (e: any) {
    console.error('[Klaviyo] Error finding metrics:', e.message);
    return { openedEmail: null, clickedEmail: null, receivedEmail: null, placedOrder: null };
  }
}

// ============================================
// REPORTING API - Same approach as N8N
// ============================================

// Get campaign metrics using Campaign Values Report API
// This is the CORRECT way - same as N8N
async function getCampaignMetrics(
  apiKey: string,
  campaignId: string,
  metricId: string,
  startStr: string,
  endStr: string
): Promise<{
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  revenue: number;
  conversions: number;
  openRate: number;
  clickRate: number;
}> {
  try {
    const body = {
      data: {
        type: 'campaign-values-report',
        attributes: {
          timeframe: {
            start: startStr + 'Z',
            end: endStr + 'Z'
          },
          conversion_metric_id: metricId,
          filter: `equals(campaign_id,"${campaignId}")`,
          statistics: [
            'recipients',
            'delivered', 
            'opens_unique',
            'clicks_unique',
            'conversion_value',
            'conversions',
            'open_rate',
            'click_rate'
          ]
        }
      }
    };

    const response = await klaviyoPost(apiKey, '/campaign-values-reports/', body);
    const results = response?.data?.attributes?.results || [];
    
    if (results.length > 0) {
      const stats = results[0].statistics || {};
      return {
        recipients: stats.recipients || 0,
        delivered: stats.delivered || 0,
        opens: stats.opens_unique || 0,
        clicks: stats.clicks_unique || 0,
        revenue: stats.conversion_value || 0,
        conversions: stats.conversions || 0,
        openRate: (stats.open_rate || 0) * 100,
        clickRate: (stats.click_rate || 0) * 100
      };
    }
    
    return { recipients: 0, delivered: 0, opens: 0, clicks: 0, revenue: 0, conversions: 0, openRate: 0, clickRate: 0 };
  } catch (e: any) {
    console.error(`[Klaviyo] Campaign metrics error for ${campaignId}:`, e.message);
    return { recipients: 0, delivered: 0, opens: 0, clicks: 0, revenue: 0, conversions: 0, openRate: 0, clickRate: 0 };
  }
}

// Get flow metrics using Flow Values Report API
async function getFlowMetrics(
  apiKey: string,
  flowId: string,
  metricId: string,
  startStr: string,
  endStr: string
): Promise<{
  recipients: number;
  delivered: number;
  opens: number;
  clicks: number;
  revenue: number;
  conversions: number;
  openRate: number;
  clickRate: number;
}> {
  try {
    const body = {
      data: {
        type: 'flow-values-report',
        attributes: {
          timeframe: {
            start: startStr + 'Z',
            end: endStr + 'Z'
          },
          conversion_metric_id: metricId,
          filter: `equals(flow_id,"${flowId}")`,
          statistics: [
            'recipients',
            'delivered',
            'opens_unique',
            'clicks_unique', 
            'conversion_value',
            'conversions',
            'open_rate',
            'click_rate'
          ]
        }
      }
    };

    const response = await klaviyoPost(apiKey, '/flow-values-reports/', body);
    const results = response?.data?.attributes?.results || [];
    
    if (results.length > 0) {
      const stats = results[0].statistics || {};
      return {
        recipients: stats.recipients || 0,
        delivered: stats.delivered || 0,
        opens: stats.opens_unique || 0,
        clicks: stats.clicks_unique || 0,
        revenue: stats.conversion_value || 0,
        conversions: stats.conversions || 0,
        openRate: (stats.open_rate || 0) * 100,
        clickRate: (stats.click_rate || 0) * 100
      };
    }
    
    return { recipients: 0, delivered: 0, opens: 0, clicks: 0, revenue: 0, conversions: 0, openRate: 0, clickRate: 0 };
  } catch (e: any) {
    console.error(`[Klaviyo] Flow metrics error for ${flowId}:`, e.message);
    return { recipients: 0, delivered: 0, opens: 0, clicks: 0, revenue: 0, conversions: 0, openRate: 0, clickRate: 0 };
  }
}

// Execute queue SEQUENTIALLY with delay to respect rate limits
// Klaviyo Reporting API has 2 requests/minute limit!
async function execQueue<T, R>(
  items: T[],
  delayMs: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      await sleep(delayMs); // Wait between requests to avoid rate limit
    }
    const result = await worker(items[i], i);
    results.push(result);
  }
  
  return results;
}

// Sleep helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || '30d';
  const debug = request.nextUrl.searchParams.get('debug') === 'true';

  try {
    // Get Klaviyo account
    const { data: klaviyoAccount } = await supabase
      .from('klaviyo_accounts')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!klaviyoAccount?.api_key) {
      return NextResponse.json({
        success: true,
        connected: false,
        message: 'Klaviyo not connected'
      });
    }

    const { startStr, endStr } = getDateRange(period);
    
    // Calculate previous period
    const currentStart = new Date(startStr);
    const currentEnd = new Date(endStr);
    const periodMs = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    const prevStartStr = prevStart.toISOString().split('T')[0] + 'T00:00:00';
    const prevEndStr = prevEnd.toISOString().split('T')[0] + 'T23:59:59';

    // Find metric IDs
    const metricIds = await findMetricIds(klaviyoAccount.api_key);
    const placedOrderId = metricIds.placedOrder || 'W8Gk3c'; // Fallback

    // ============================================
    // Get lists from DB
    // ============================================
    const { data: lists } = await supabase
      .from('klaviyo_lists')
      .select('*')
      .eq('organization_id', klaviyoAccount.organization_id)
      .order('profile_count', { ascending: false });

    // ============================================
    // Get flows from DB and fetch metrics
    // ============================================
    const { data: dbFlows } = await supabase
      .from('flow_metrics')
      .select('*')
      .eq('organization_id', klaviyoAccount.organization_id)
      .in('status', ['live', 'manual', 'Live', 'Manual'])
      .order('revenue', { ascending: false });

    // Fetch metrics for each flow (5 flows)
    // Using 400ms delay between requests to respect rate limits
    const flowsToProcess = (dbFlows || []).slice(0, 5);
    const flowMetrics = await execQueue(flowsToProcess, 400, async (flow) => {
      const metrics = await getFlowMetrics(
        klaviyoAccount.api_key,
        flow.klaviyo_flow_id,
        placedOrderId,
        startStr,
        endStr
      );
      return {
        id: flow.klaviyo_flow_id,
        name: flow.name,
        status: flow.status,
        triggered: metrics.recipients,
        opened: metrics.opens,
        clicked: metrics.clicks,
        revenue: metrics.revenue,
        conversions: metrics.conversions,
        open_rate: metrics.openRate,
        click_rate: metrics.clickRate
      };
    });

    // ============================================
    // Get campaigns from DB and fetch metrics
    // ============================================
    const { data: dbCampaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', klaviyoAccount.organization_id)
      .eq('status', 'Sent')
      .order('sent_at', { ascending: false, nullsFirst: false });

    // Fetch metrics for each campaign (10 campaigns)
    // Using 400ms delay between requests to respect rate limits
    const campaignsToProcess = (dbCampaigns || []).slice(0, 10);
    const campaignMetrics = await execQueue(campaignsToProcess, 400, async (campaign) => {
      const metrics = await getCampaignMetrics(
        klaviyoAccount.api_key,
        campaign.klaviyo_campaign_id,
        placedOrderId,
        startStr,
        endStr
      );
      return {
        id: campaign.klaviyo_campaign_id,
        name: campaign.name,
        status: campaign.status,
        sent_at: campaign.sent_at,
        sent: metrics.recipients,
        delivered: metrics.delivered,
        opened: metrics.opens,
        clicked: metrics.clicks,
        revenue: metrics.revenue,
        conversions: metrics.conversions,
        open_rate: metrics.openRate,
        click_rate: metrics.clickRate
      };
    });

    // ============================================
    // Calculate overview totals from fetched data
    // ============================================
    let totalSent = 0;
    let totalOpened = 0;
    let totalClicked = 0;
    let totalRevenue = 0;

    // Sum from campaigns
    for (const c of campaignMetrics) {
      totalSent += c.sent;
      totalOpened += c.opened;
      totalClicked += c.clicked;
      totalRevenue += c.revenue;
    }

    // Sum from flows
    for (const f of flowMetrics) {
      totalSent += f.triggered;
      totalOpened += f.opened;
      totalClicked += f.clicked;
      totalRevenue += f.revenue;
    }

    // Calculate rates
    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;

    // Calculate total subscribers from lists
    const totalSubscribers = (lists || []).reduce((sum, l) => sum + (Number(l.profile_count) || 0), 0);

    // Format response
    const response: any = {
      success: true,
      connected: true,
      account: {
        id: klaviyoAccount.id,
        name: klaviyoAccount.account_name || 'Klaviyo Account',
        lastSync: klaviyoAccount.updated_at || new Date().toISOString(),
        publicKey: klaviyoAccount.public_key || null,
      },
      mode: 'realtime-reporting-api',
      period: {
        label: period,
        current: { start: startStr, end: endStr },
        previous: { start: prevStartStr, end: prevEndStr }
      },
      overview: {
        totalSubscribers: {
          value: totalSubscribers,
          change: 0
        },
        emailsSent: {
          value: totalSent,
          change: 0 // TODO: calculate from previous period
        },
        openRate: {
          value: openRate,
          change: 0
        },
        clickRate: {
          value: clickRate,
          change: 0
        },
        revenue: {
          value: totalRevenue,
          change: 0
        }
      },
      engagement: {
        sent: totalSent,
        opened: totalOpened,
        clicked: totalClicked,
        openRate,
        clickRate
      },
      flows: flowMetrics,
      campaigns: campaignMetrics,
      lists: (lists || []).map(l => ({
        id: l.klaviyo_list_id,
        name: l.name,
        profile_count: l.profile_count || 0,
      })),
    };

    if (debug) {
      response.debug = {
        metricIds,
        placedOrderId,
        flowsProcessed: flowsToProcess.length,
        campaignsProcessed: campaignsToProcess.length,
        totals: { totalSent, totalOpened, totalClicked, totalRevenue }
      };
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
