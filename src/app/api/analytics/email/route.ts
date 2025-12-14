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

// Klaviyo API helper
async function klaviyoFetch(apiKey: string, endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = endpoint.startsWith('http') ? endpoint : `${KLAVIYO_API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'revision': KLAVIYO_REVISION,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Klaviyo API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  return response.json();
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
    case 'yesterday':
      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(endDate.getDate() - 1);
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

  // Format for Klaviyo API: YYYY-MM-DDTHH:MM:SS
  const startStr = startDate.toISOString().split('.')[0];
  const endStr = endDate.toISOString().split('.')[0];

  return { startDate, endDate, startStr, endStr };
}

// Get previous period for comparison
function getPreviousPeriod(period: string): { startStr: string; endStr: string } {
  const { startDate: currentStart, endDate: currentEnd } = getDateRange(period);
  const daysDiff = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const endDate = new Date(currentStart);
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysDiff + 1);
  startDate.setHours(0, 0, 0, 0);
  
  return { 
    startStr: startDate.toISOString().split('.')[0],
    endStr: endDate.toISOString().split('.')[0]
  };
}

// Calculate percentage change
function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// Find metric IDs for email metrics
async function findMetricIds(apiKey: string): Promise<{
  openedEmail: string | null;
  clickedEmail: string | null;
  receivedEmail: string | null;
  placedOrder: string | null;
}> {
  try {
    const response = await klaviyoFetch(apiKey, '/metrics');
    const metrics = response.data || [];
    
    const findMetric = (names: string[]) => {
      for (const name of names) {
        const metric = metrics.find((m: any) => 
          (m.attributes?.name || '').toLowerCase() === name.toLowerCase()
        );
        if (metric) return metric.id;
      }
      return null;
    };

    return {
      openedEmail: findMetric(['Opened Email', 'Email Opened']),
      clickedEmail: findMetric(['Clicked Email', 'Email Clicked']),
      receivedEmail: findMetric(['Received Email', 'Email Received']),
      placedOrder: findMetric(['Placed Order', 'Order Placed', 'Compra Realizada']),
    };
  } catch (e: any) {
    console.error('[Klaviyo] Error finding metrics:', e.message);
    return { openedEmail: null, clickedEmail: null, receivedEmail: null, placedOrder: null };
  }
}

// Query Metric Aggregates - gets data by EVENT DATE (not send date!)
// This is the key difference - it sums events that HAPPENED in the period
async function queryMetricAggregate(
  apiKey: string,
  metricId: string,
  startStr: string,
  endStr: string,
  measurement: 'count' | 'unique' | 'sum_value' = 'count',
  attributionFilter?: 'email' | 'campaign' | 'flow' | 'none'
): Promise<number> {
  if (!metricId) return 0;
  
  try {
    // Build filter array
    const filters: string[] = [
      `greater-or-equal(datetime,${startStr})`,
      `less-than(datetime,${endStr})`
    ];
    
    // Add attribution filter if specified
    // This ensures we only get events ATTRIBUTED to email marketing
    if (attributionFilter === 'email') {
      // Only events attributed to email channel (campaigns + flows)
      filters.push('equals($attributed_channel,"email")');
    } else if (attributionFilter === 'campaign') {
      // Only events attributed to campaigns
      filters.push('not(equals($attributed_message,""))');
    } else if (attributionFilter === 'flow') {
      // Only events attributed to flows
      filters.push('not(equals($attributed_flow,""))');
    }
    // 'none' = no attribution filter (all events)
    
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          measurements: [measurement],
          filter: filters,
          metric_id: metricId,
          timezone: 'America/Sao_Paulo'
        }
      }
    };

    const response = await klaviyoPost(apiKey, '/metric-aggregates', body);
    
    // Sum all values from the response
    const data = response?.data?.attributes?.data || [];
    let total = 0;
    for (const item of data) {
      const values = item.measurements?.[measurement] || [];
      total += values.reduce((sum: number, v: number) => sum + (v || 0), 0);
    }
    
    return total;
  } catch (e: any) {
    console.error(`[Klaviyo] Metric aggregate error for ${metricId}:`, e.message);
    return 0;
  }
}

// Query Metric Aggregates GROUPED BY CAMPAIGN
// Returns a map of message_id -> value
// Only includes events ATTRIBUTED to campaigns
async function queryMetricByMessage(
  apiKey: string,
  metricId: string,
  startStr: string,
  endStr: string,
  measurement: 'count' | 'unique' | 'sum_value' = 'count'
): Promise<Map<string, number>> {
  const resultMap = new Map<string, number>();
  if (!metricId) return resultMap;
  
  try {
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          measurements: [measurement],
          by: ['$message'],  // Group by message (campaign)
          filter: [
            `greater-or-equal(datetime,${startStr})`,
            `less-than(datetime,${endStr})`,
            'not(equals($message,""))' // Only events attributed to a message/campaign
          ],
          metric_id: metricId,
          timezone: 'America/Sao_Paulo'
        }
      }
    };

    const response = await klaviyoPost(apiKey, '/metric-aggregates', body);
    
    // Process grouped results
    const data = response?.data?.attributes?.data || [];
    for (const item of data) {
      const messageId = item.dimensions?.[0];
      if (messageId) {
        const values = item.measurements?.[measurement] || [];
        const total = values.reduce((sum: number, v: number) => sum + (v || 0), 0);
        resultMap.set(messageId, total);
      }
    }
    
    return resultMap;
  } catch (e: any) {
    console.error(`[Klaviyo] Metric by message error for ${metricId}:`, e.message);
    return resultMap;
  }
}

// Query Metric Aggregates GROUPED BY FLOW
// Returns a map of flow_id -> value
async function queryMetricByFlow(
  apiKey: string,
  metricId: string,
  startStr: string,
  endStr: string,
  measurement: 'count' | 'unique' | 'sum_value' = 'count'
): Promise<Map<string, number>> {
  const resultMap = new Map<string, number>();
  if (!metricId) return resultMap;
  
  try {
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          measurements: [measurement],
          by: ['$attributed_flow'],  // Group by attributed flow
          filter: [
            `greater-or-equal(datetime,${startStr})`,
            `less-than(datetime,${endStr})`,
            'not(equals($attributed_flow,""))' // Only include flow-attributed events
          ],
          metric_id: metricId,
          timezone: 'America/Sao_Paulo'
        }
      }
    };

    const response = await klaviyoPost(apiKey, '/metric-aggregates', body);
    
    // Process grouped results
    const data = response?.data?.attributes?.data || [];
    for (const item of data) {
      const flowId = item.dimensions?.[0];
      if (flowId) {
        const values = item.measurements?.[measurement] || [];
        const total = values.reduce((sum: number, v: number) => sum + (v || 0), 0);
        resultMap.set(flowId, total);
      }
    }
    
    return resultMap;
  } catch (e: any) {
    console.error(`[Klaviyo] Metric by flow error for ${metricId}:`, e.message);
    return resultMap;
  }
}

// Get all metrics for a period using Query Metric Aggregates
async function getMetricsForPeriod(
  apiKey: string,
  metricIds: { openedEmail: string | null; clickedEmail: string | null; receivedEmail: string | null; placedOrder: string | null },
  startStr: string,
  endStr: string
): Promise<{ sent: number; opened: number; clicked: number; revenue: number }> {
  
  // Run queries in parallel for speed
  // Note: sent/opened/clicked are email-specific metrics, no attribution filter needed
  // Revenue (Placed Order) needs attribution filter to only count email-attributed orders
  const [sent, opened, clicked, revenue] = await Promise.all([
    metricIds.receivedEmail ? queryMetricAggregate(apiKey, metricIds.receivedEmail, startStr, endStr, 'count', 'none') : Promise.resolve(0),
    metricIds.openedEmail ? queryMetricAggregate(apiKey, metricIds.openedEmail, startStr, endStr, 'unique', 'none') : Promise.resolve(0),
    metricIds.clickedEmail ? queryMetricAggregate(apiKey, metricIds.clickedEmail, startStr, endStr, 'unique', 'none') : Promise.resolve(0),
    // IMPORTANT: Filter revenue to only include orders ATTRIBUTED to email marketing
    metricIds.placedOrder ? queryMetricAggregate(apiKey, metricIds.placedOrder, startStr, endStr, 'sum_value', 'email') : Promise.resolve(0),
  ]);

  return { sent, opened, clicked, revenue };
}

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
        error: 'Klaviyo account not configured'
      });
    }

    const organizationId = klaviyoAccount.organization_id;
    const { startStr, endStr } = getDateRange(period);
    const { startStr: prevStartStr, endStr: prevEndStr } = getPreviousPeriod(period);

    console.log(`[Analytics] Fetching metrics for period ${period} (${startStr} to ${endStr})`);

    // ============================================
    // REALTIME: Query Klaviyo API using Metric Aggregates
    // This gets data by EVENT DATE, not send date!
    // When user selects "7 days", shows events from last 7 days
    // ============================================
    
    // Find metric IDs
    const metricIds = await findMetricIds(klaviyoAccount.api_key);
    console.log('[Analytics] Metric IDs:', metricIds);

    // Get current period metrics
    const currentMetrics = await getMetricsForPeriod(
      klaviyoAccount.api_key, 
      metricIds, 
      startStr, 
      endStr
    );

    // Get previous period metrics for comparison
    const prevMetrics = await getMetricsForPeriod(
      klaviyoAccount.api_key, 
      metricIds, 
      prevStartStr, 
      prevEndStr
    );

    const totalSent = currentMetrics.sent;
    const totalOpened = currentMetrics.opened;
    const totalClicked = currentMetrics.clicked;
    const totalRevenue = currentMetrics.revenue;

    console.log(`[Analytics] Current: sent=${totalSent}, opened=${totalOpened}, clicked=${totalClicked}, revenue=${totalRevenue}`);
    console.log(`[Analytics] Previous: sent=${prevMetrics.sent}, opened=${prevMetrics.opened}, clicked=${prevMetrics.clicked}, revenue=${prevMetrics.revenue}`);

    // ============================================
    // Get lists, flows, campaigns from DB for display
    // ============================================
    const { data: lists } = await supabase
      .from('klaviyo_lists')
      .select('*')
      .eq('organization_id', organizationId)
      .order('profile_count', { ascending: false });

    const { data: flows } = await supabase
      .from('flow_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['live', 'manual', 'Live', 'Manual'])
      .order('revenue', { ascending: false });

    const { data: campaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('sent_at', { ascending: false, nullsFirst: false });

    // ============================================
    // REALTIME: Get per-campaign metrics using Metric Aggregates
    // This enriches campaign data with real-time engagement metrics
    // ============================================
    let campaignSentMap = new Map<string, number>();
    let campaignOpenedMap = new Map<string, number>();
    let campaignClickedMap = new Map<string, number>();
    
    // Maps for flows (using $attributed_flow)
    let flowTriggeredMap = new Map<string, number>();
    let flowOpenedMap = new Map<string, number>();
    let flowClickedMap = new Map<string, number>();
    
    try {
      // Fetch metrics grouped by message/campaign in parallel
      const [sentByMsg, openedByMsg, clickedByMsg] = await Promise.all([
        metricIds.receivedEmail ? queryMetricByMessage(klaviyoAccount.api_key, metricIds.receivedEmail, startStr, endStr, 'count') : Promise.resolve(new Map()),
        metricIds.openedEmail ? queryMetricByMessage(klaviyoAccount.api_key, metricIds.openedEmail, startStr, endStr, 'unique') : Promise.resolve(new Map()),
        metricIds.clickedEmail ? queryMetricByMessage(klaviyoAccount.api_key, metricIds.clickedEmail, startStr, endStr, 'unique') : Promise.resolve(new Map()),
      ]);
      
      campaignSentMap = sentByMsg;
      campaignOpenedMap = openedByMsg;
      campaignClickedMap = clickedByMsg;
      
      console.log(`[Analytics] Got metrics for ${campaignSentMap.size} sent, ${campaignOpenedMap.size} opened, ${campaignClickedMap.size} clicked campaigns`);
    } catch (e: any) {
      console.error('[Analytics] Error fetching per-campaign metrics:', e.message);
    }
    
    // Fetch flow metrics grouped by $attributed_flow
    try {
      const [flowTrig, flowOpen, flowClick] = await Promise.all([
        metricIds.receivedEmail ? queryMetricByFlow(klaviyoAccount.api_key, metricIds.receivedEmail, startStr, endStr, 'count') : Promise.resolve(new Map()),
        metricIds.openedEmail ? queryMetricByFlow(klaviyoAccount.api_key, metricIds.openedEmail, startStr, endStr, 'unique') : Promise.resolve(new Map()),
        metricIds.clickedEmail ? queryMetricByFlow(klaviyoAccount.api_key, metricIds.clickedEmail, startStr, endStr, 'unique') : Promise.resolve(new Map()),
      ]);
      
      flowTriggeredMap = flowTrig;
      flowOpenedMap = flowOpen;
      flowClickedMap = flowClick;
      
      console.log(`[Analytics] Got metrics for ${flowTriggeredMap.size} triggered, ${flowOpenedMap.size} opened, ${flowClickedMap.size} clicked flows`);
    } catch (e: any) {
      console.error('[Analytics] Error fetching per-flow metrics:', e.message);
    }

    // Calculate rates
    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
    const prevOpenRate = prevMetrics.sent > 0 ? (prevMetrics.opened / prevMetrics.sent) * 100 : 0;
    const prevClickRate = prevMetrics.sent > 0 ? (prevMetrics.clicked / prevMetrics.sent) * 100 : 0;

    // Calculate total subscribers from lists
    const totalSubscribers = (lists || []).reduce((sum, l) => sum + (Number(l.profile_count) || 0), 0);

    // Format response
    const response: any = {
      success: true,
      connected: true, // IMPORTANT: This tells the frontend Klaviyo is connected
      account: {
        id: klaviyoAccount.id,
        name: klaviyoAccount.account_name || 'Klaviyo Account',
        lastSync: klaviyoAccount.updated_at || new Date().toISOString(),
        publicKey: klaviyoAccount.public_key || null,
      },
      mode: 'realtime',
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
          change: calculateChange(totalSent, prevMetrics.sent)
        },
        openRate: {
          value: openRate,
          change: calculateChange(openRate, prevOpenRate)
        },
        clickRate: {
          value: clickRate,
          change: calculateChange(clickRate, prevClickRate)
        },
        revenue: {
          value: totalRevenue,
          change: calculateChange(totalRevenue, prevMetrics.revenue)
        }
      },
      engagement: {
        sent: totalSent,
        opened: totalOpened,
        clicked: totalClicked,
        openRate,
        clickRate
      },
      flows: (flows || []).map(f => {
        const flowId = f.klaviyo_flow_id;
        const realtimeTriggered = flowTriggeredMap.get(flowId) || 0;
        const realtimeOpened = flowOpenedMap.get(flowId) || 0;
        const realtimeClicked = flowClickedMap.get(flowId) || 0;
        
        // Use realtime data if available, otherwise fall back to DB
        const triggered = realtimeTriggered || f.triggered || 0;
        const opened = realtimeOpened || f.opened || 0;
        const clicked = realtimeClicked || f.clicked || 0;
        
        // Calculate rates
        const openRateCalc = triggered > 0 ? (opened / triggered) * 100 : 0;
        const clickRateCalc = triggered > 0 ? (clicked / triggered) * 100 : 0;
        
        return {
          id: flowId,
          name: f.name,
          status: f.status,
          triggered,
          opened,
          clicked,
          revenue: f.revenue || 0,
          open_rate: openRateCalc,
          click_rate: clickRateCalc,
        };
      }),
      campaigns: (campaigns || []).slice(0, 20).map(c => {
        // Try to get realtime metrics using campaign_id
        // Note: message_id might be different from campaign_id
        const campaignId = c.klaviyo_campaign_id;
        const realtimeSent = campaignSentMap.get(campaignId) || 0;
        const realtimeOpened = campaignOpenedMap.get(campaignId) || 0;
        const realtimeClicked = campaignClickedMap.get(campaignId) || 0;
        
        // Use realtime data if available, otherwise fall back to DB
        const sent = realtimeSent || c.sent || 0;
        const opened = realtimeOpened || c.opened || 0;
        const clicked = realtimeClicked || c.clicked || 0;
        
        // Calculate rates
        const openRateCalc = sent > 0 ? (opened / sent) * 100 : 0;
        const clickRateCalc = sent > 0 ? (clicked / sent) * 100 : 0;
        
        return {
          id: campaignId,
          name: c.name,
          status: c.status,
          sent_at: c.sent_at,
          sent,
          opened,
          clicked,
          revenue: c.revenue || 0,
          open_rate: openRateCalc,
          click_rate: clickRateCalc,
        };
      }),
      lists: (lists || []).map(l => ({
        id: l.klaviyo_list_id,
        name: l.name,
        profile_count: l.profile_count || 0,
      })),
    };

    if (debug) {
      response.debug = {
        metricIds,
        currentPeriod: currentMetrics,
        previousPeriod: prevMetrics,
        rates: { openRate, clickRate, prevOpenRate, prevClickRate },
        campaignMetrics: {
          sentMapSize: campaignSentMap.size,
          openedMapSize: campaignOpenedMap.size,
          clickedMapSize: campaignClickedMap.size,
          sampleSentIds: Array.from(campaignSentMap.keys()).slice(0, 5),
          sampleOpenedIds: Array.from(campaignOpenedMap.keys()).slice(0, 5),
        },
        flowMetrics: {
          triggeredMapSize: flowTriggeredMap.size,
          openedMapSize: flowOpenedMap.size,
          clickedMapSize: flowClickedMap.size,
          sampleTriggeredIds: Array.from(flowTriggeredMap.keys()).slice(0, 5),
          sampleOpenedIds: Array.from(flowOpenedMap.keys()).slice(0, 5),
        }
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
