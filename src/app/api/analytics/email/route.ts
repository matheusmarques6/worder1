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

// Get date range based on period
function getDateRange(period: string): { startDate: Date; endDate: Date } {
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

  return { startDate, endDate };
}

// Get previous period for comparison
function getPreviousPeriod(period: string): { startDate: Date; endDate: Date } {
  const { startDate: currentStart, endDate: currentEnd } = getDateRange(period);
  const daysDiff = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const endDate = new Date(currentStart);
  endDate.setDate(endDate.getDate() - 1);
  endDate.setHours(23, 59, 59, 999);
  
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysDiff + 1);
  startDate.setHours(0, 0, 0, 0);
  
  return { startDate, endDate };
}

// Calculate percentage change
function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || '30d';

  try {
    // Get Klaviyo account
    const { data: klaviyoAccount } = await supabase
      .from('klaviyo_accounts')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!klaviyoAccount) {
      return NextResponse.json({
        connected: false,
        message: 'Klaviyo não conectado',
      });
    }

    const organizationId = klaviyoAccount.organization_id;
    const { startDate, endDate } = getDateRange(period);
    const { startDate: prevStart, endDate: prevEnd } = getPreviousPeriod(period);

    // Fetch campaigns from database (current period)
    const { data: campaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('sent_at', startDate.toISOString())
      .lte('sent_at', endDate.toISOString())
      .order('sent_at', { ascending: false });

    // Fetch campaigns from previous period for comparison
    const { data: prevCampaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('sent_at', prevStart.toISOString())
      .lte('sent_at', prevEnd.toISOString());

    // Fetch flows from database (all active flows)
    const { data: flows } = await supabase
      .from('flow_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('revenue', { ascending: false });

    // Fetch lists
    const { data: lists } = await supabase
      .from('klaviyo_lists')
      .select('*')
      .eq('organization_id', organizationId)
      .order('profile_count', { ascending: false });

    // Calculate aggregated metrics
    const allCampaigns = campaigns || [];
    const allPrevCampaigns = prevCampaigns || [];
    const allFlows = flows || [];
    const allLists = lists || [];

    // ============================================
    // CURRENT PERIOD - CAMPAIGN METRICS
    // ============================================
    const totalSent = allCampaigns.reduce((sum, c) => sum + (c.sent || c.recipients || 0), 0);
    const totalDelivered = allCampaigns.reduce((sum, c) => sum + (c.delivered || 0), 0);
    const totalOpened = allCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
    const totalClicked = allCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0);
    const totalBounced = allCampaigns.reduce((sum, c) => sum + (c.bounced || 0), 0);
    const totalUnsubscribed = allCampaigns.reduce((sum, c) => sum + (c.unsubscribed || 0), 0);
    const totalCampaignRevenue = allCampaigns.reduce((sum, c) => sum + parseFloat(c.revenue || '0'), 0);
    const totalCampaignConversions = allCampaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

    // ============================================
    // PREVIOUS PERIOD - CAMPAIGN METRICS
    // ============================================
    const prevTotalSent = allPrevCampaigns.reduce((sum, c) => sum + (c.sent || c.recipients || 0), 0);
    const prevTotalDelivered = allPrevCampaigns.reduce((sum, c) => sum + (c.delivered || 0), 0);
    const prevTotalOpened = allPrevCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
    const prevTotalClicked = allPrevCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0);
    const prevTotalBounced = allPrevCampaigns.reduce((sum, c) => sum + (c.bounced || 0), 0);
    const prevTotalUnsubscribed = allPrevCampaigns.reduce((sum, c) => sum + (c.unsubscribed || 0), 0);
    const prevCampaignRevenue = allPrevCampaigns.reduce((sum, c) => sum + parseFloat(c.revenue || '0'), 0);
    const prevCampaignConversions = allPrevCampaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

    // ============================================
    // FLOW METRICS
    // ============================================
    const flowTriggered = allFlows.reduce((sum, f) => sum + (f.triggered || 0), 0);
    const flowOpened = allFlows.reduce((sum, f) => sum + (f.opened || 0), 0);
    const flowClicked = allFlows.reduce((sum, f) => sum + (f.clicked || 0), 0);
    const flowRevenue = allFlows.reduce((sum, f) => sum + parseFloat(f.revenue || '0'), 0);
    const flowConversions = allFlows.reduce((sum, f) => sum + (f.conversions || 0), 0);

    // ============================================
    // LIST METRICS
    // ============================================
    const totalSubscribers = allLists.reduce((sum, l) => sum + (l.profile_count || 0), 0);

    // ============================================
    // CALCULATE RATES - CURRENT PERIOD
    // ============================================
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const unsubscribeRate = totalDelivered > 0 ? (totalUnsubscribed / totalDelivered) * 100 : 0;
    const conversionRate = totalClicked > 0 ? (totalCampaignConversions / totalClicked) * 100 : 0;

    // ============================================
    // CALCULATE RATES - PREVIOUS PERIOD
    // ============================================
    const prevOpenRate = prevTotalDelivered > 0 ? (prevTotalOpened / prevTotalDelivered) * 100 : 0;
    const prevClickRate = prevTotalDelivered > 0 ? (prevTotalClicked / prevTotalDelivered) * 100 : 0;
    const prevBounceRate = prevTotalSent > 0 ? (prevTotalBounced / prevTotalSent) * 100 : 0;
    const prevUnsubscribeRate = prevTotalDelivered > 0 ? (prevTotalUnsubscribed / prevTotalDelivered) * 100 : 0;
    const prevConversionRate = prevTotalClicked > 0 ? (prevCampaignConversions / prevTotalClicked) * 100 : 0;

    // ============================================
    // TOTAL REVENUE (campaigns + flows)
    // ============================================
    const totalRevenue = totalCampaignRevenue + flowRevenue;
    const prevTotalRevenue = prevCampaignRevenue;
    const totalConversions = totalCampaignConversions + flowConversions;

    // ============================================
    // ROI CALCULATION
    // ============================================
    const emailCost = totalSent * 0.01; // Assuming $0.01 per email
    const roi = emailCost > 0 ? totalRevenue / emailCost : 0;

    // ============================================
    // FUNNEL DATA
    // ============================================
    const funnelData = [
      { stage: 'Enviados', value: totalSent, percent: 100 },
      { stage: 'Entregues', value: totalDelivered, percent: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0 },
      { stage: 'Abertos', value: totalOpened, percent: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0 },
      { stage: 'Clicados', value: totalClicked, percent: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0 },
      { stage: 'Convertidos', value: totalConversions, percent: totalSent > 0 ? (totalConversions / totalSent) * 100 : 0 },
    ];

    // ============================================
    // BUILD RESPONSE
    // ============================================
    return NextResponse.json({
      connected: true,
      account: {
        id: klaviyoAccount.account_id,
        name: klaviyoAccount.account_name,
        lastSync: klaviyoAccount.last_sync_at,
      },
      kpis: {
        openRate: {
          value: openRate.toFixed(1),
          change: parseFloat(calculateChange(openRate, prevOpenRate).toFixed(1)),
        },
        clickRate: {
          value: clickRate.toFixed(1),
          change: parseFloat(calculateChange(clickRate, prevClickRate).toFixed(1)),
        },
        conversionRate: {
          value: conversionRate.toFixed(1),
          change: parseFloat(calculateChange(conversionRate, prevConversionRate).toFixed(1)),
        },
        revenue: {
          value: totalRevenue,
          change: parseFloat(calculateChange(totalRevenue, prevTotalRevenue).toFixed(1)),
        },
        roi: {
          value: roi.toFixed(1),
          change: 0,
        },
        subscribers: {
          value: totalSubscribers || klaviyoAccount.total_profiles || 0,
          change: 0,
        },
        bounceRate: {
          value: bounceRate.toFixed(1),
          change: parseFloat(calculateChange(bounceRate, prevBounceRate).toFixed(1)),
        },
        unsubscribeRate: {
          value: unsubscribeRate.toFixed(1),
          change: parseFloat(calculateChange(unsubscribeRate, prevUnsubscribeRate).toFixed(1)),
        },
      },
      totals: {
        sent: totalSent,
        delivered: totalDelivered,
        opened: totalOpened,
        clicked: totalClicked,
        bounced: totalBounced,
        unsubscribed: totalUnsubscribed,
        revenue: totalRevenue,
        conversions: totalConversions,
        campaignRevenue: totalCampaignRevenue,
        flowRevenue: flowRevenue,
      },
      funnel: funnelData,
      campaigns: allCampaigns.slice(0, 20).map(c => ({
        id: c.id,
        klaviyoId: c.klaviyo_campaign_id,
        name: c.name,
        status: c.status,
        type: 'campaign',
        sent: c.sent || c.recipients || 0,
        delivered: c.delivered || 0,
        opened: c.opened || 0,
        clicked: c.clicked || 0,
        converted: c.conversions || 0,
        revenue: parseFloat(c.revenue || '0'),
        openRate: c.open_rate?.toFixed(1) || '0',
        clickRate: c.click_rate?.toFixed(1) || '0',
        sentAt: c.sent_at,
      })),
      flows: allFlows
        .filter(f => f.status === 'live' || f.status === 'manual')
        .slice(0, 10)
        .map(f => ({
          id: f.id,
          klaviyoId: f.klaviyo_flow_id,
          name: f.name,
          status: f.status,
          type: 'flow',
          triggered: f.triggered || 0,
          opened: f.opened || 0,
          clicked: f.clicked || 0,
          revenue: parseFloat(f.revenue || '0'),
          conversions: f.conversions || 0,
          openRate: f.open_rate?.toFixed(1) || '0',
          clickRate: f.click_rate?.toFixed(1) || '0',
        })),
      lists: allLists.map(l => ({
        id: l.id,
        klaviyoId: l.klaviyo_list_id,
        name: l.name,
        profileCount: l.profile_count || 0,
      })),
      period: {
        current: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        previous: {
          start: prevStart.toISOString(),
          end: prevEnd.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('[Email Analytics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch email analytics' },
      { status: 500 }
    );
  }
}
