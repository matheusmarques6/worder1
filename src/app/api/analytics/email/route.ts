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
  const debug = request.nextUrl.searchParams.get('debug') === 'true';

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
    
    // DEBUG MODE: Show raw database values
    if (debug) {
      const { data: rawCampaigns } = await supabase
        .from('campaign_metrics')
        .select('klaviyo_campaign_id, name, status, sent, delivered, opened, clicked, revenue, open_rate, click_rate, sent_at, updated_at')
        .eq('organization_id', organizationId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(10);
      
      const { data: rawFlows } = await supabase
        .from('flow_metrics')
        .select('klaviyo_flow_id, name, status, triggered, received, opened, clicked, revenue, open_rate, click_rate, updated_at')
        .eq('organization_id', organizationId)
        .order('revenue', { ascending: false, nullsFirst: false })
        .limit(10);
      
      return NextResponse.json({
        debug: true,
        organizationId,
        message: 'Dados RAW do banco de dados',
        campaigns: rawCampaigns,
        flows: rawFlows,
        columnInfo: {
          expectedColumns: ['sent', 'delivered', 'opened', 'clicked', 'revenue', 'open_rate', 'click_rate'],
          note: 'Se sent/opened/clicked estão zerados, o sync não está salvando esses dados'
        }
      });
    }

    const { startDate, endDate } = getDateRange(period);
    const { startDate: prevStart, endDate: prevEnd } = getPreviousPeriod(period);

    // Fetch ALL campaigns from database (for display purposes)
    // We need to show all campaigns, even if they don't have a sent_at date
    const { data: allCampaignsFromDb } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('sent_at', { ascending: false, nullsFirst: false });

    // Filter campaigns by period for metrics calculation
    const campaigns = (allCampaignsFromDb || []).filter(c => {
      if (!c.sent_at) return false; // Only count campaigns that were actually sent
      const sentDate = new Date(c.sent_at);
      return sentDate >= startDate && sentDate <= endDate;
    });

    // Previous period campaigns for comparison
    const prevCampaigns = (allCampaignsFromDb || []).filter(c => {
      if (!c.sent_at) return false;
      const sentDate = new Date(c.sent_at);
      return sentDate >= prevStart && sentDate <= prevEnd;
    });

    // Fetch flows from database (only active flows: live or manual)
    const { data: flows } = await supabase
      .from('flow_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['live', 'manual', 'Live', 'Manual'])
      .order('revenue', { ascending: false, nullsFirst: false });

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
    
    // All campaigns for display (including draft/scheduled)
    const allCampaignsForDisplay = allCampaignsFromDb || [];

    // ============================================
    // CURRENT PERIOD - CAMPAIGN METRICS
    // ============================================
    const totalSent = allCampaigns.reduce((sum, c) => sum + (Number(c.sent) || Number(c.recipients) || 0), 0);
    const totalDelivered = allCampaigns.reduce((sum, c) => sum + (Number(c.delivered) || 0), 0);
    const totalOpened = allCampaigns.reduce((sum, c) => sum + (Number(c.opened) || 0), 0);
    const totalClicked = allCampaigns.reduce((sum, c) => sum + (Number(c.clicked) || 0), 0);
    const totalBounced = allCampaigns.reduce((sum, c) => sum + (Number(c.bounced) || 0), 0);
    const totalUnsubscribed = allCampaigns.reduce((sum, c) => sum + (Number(c.unsubscribed) || 0), 0);
    const totalCampaignRevenue = allCampaigns.reduce((sum, c) => sum + (Number(c.revenue) || 0), 0);
    const totalCampaignConversions = allCampaigns.reduce((sum, c) => sum + (Number(c.conversions) || 0), 0);

    // ============================================
    // PREVIOUS PERIOD - CAMPAIGN METRICS
    // ============================================
    const prevTotalSent = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.sent) || Number(c.recipients) || 0), 0);
    const prevTotalDelivered = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.delivered) || 0), 0);
    const prevTotalOpened = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.opened) || 0), 0);
    const prevTotalClicked = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.clicked) || 0), 0);
    const prevTotalBounced = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.bounced) || 0), 0);
    const prevTotalUnsubscribed = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.unsubscribed) || 0), 0);
    const prevCampaignRevenue = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.revenue) || 0), 0);
    const prevCampaignConversions = allPrevCampaigns.reduce((sum, c) => sum + (Number(c.conversions) || 0), 0);

    // ============================================
    // FLOW METRICS
    // ============================================
    const flowTriggered = allFlows.reduce((sum, f) => sum + (Number(f.triggered) || 0), 0);
    const flowOpened = allFlows.reduce((sum, f) => sum + (Number(f.opened) || 0), 0);
    const flowClicked = allFlows.reduce((sum, f) => sum + (Number(f.clicked) || 0), 0);
    const flowRevenue = allFlows.reduce((sum, f) => sum + (Number(f.revenue) || 0), 0);
    const flowConversions = allFlows.reduce((sum, f) => sum + (Number(f.conversions) || 0), 0);

    // ============================================
    // LIST METRICS
    // ============================================
    const totalSubscribers = allLists.reduce((sum, l) => sum + (Number(l.profile_count) || 0), 0);

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
        publicKey: klaviyoAccount.public_key || null,
      },
      tracking: {
        enabled: !!klaviyoAccount.public_key,
        siteId: klaviyoAccount.public_key || '',
        eventsToday: 0, // TODO: Implement event tracking from Klaviyo API
        eventsThisWeek: 0,
        activeOnSite: 0,
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
      campaigns: allCampaignsForDisplay.slice(0, 10).map(c => {
        // Safe number conversion for all fields
        const sent = Number(c.sent) || Number(c.recipients) || 0;
        const delivered = Number(c.delivered) || 0;
        const opened = Number(c.opened) || 0;
        const clicked = Number(c.clicked) || 0;
        const conversions = Number(c.conversions) || 0;
        const revenue = Number(c.revenue) || 0;
        const openRate = Number(c.open_rate) || 0;
        const clickRate = Number(c.click_rate) || 0;
        
        return {
          id: c.id,
          klaviyoId: c.klaviyo_campaign_id,
          name: c.name,
          status: c.status,
          type: 'campaign',
          sent,
          delivered,
          opened,
          clicked,
          converted: conversions,
          revenue,
          openRate: openRate.toFixed(1),
          clickRate: clickRate.toFixed(1),
          sentAt: c.sent_at,
        };
      }),
      flows: allFlows
        .slice(0, 10)
        .map(f => {
          // Safe number conversion for all fields
          const triggered = Number(f.triggered) || 0;
          const received = Number(f.received) || 0;
          const opened = Number(f.opened) || 0;
          const clicked = Number(f.clicked) || 0;
          const conversions = Number(f.conversions) || 0;
          const revenue = Number(f.revenue) || 0;
          const openRate = Number(f.open_rate) || 0;
          const clickRate = Number(f.click_rate) || 0;
          
          return {
            id: f.id,
            klaviyoId: f.klaviyo_flow_id,
            name: f.name,
            status: f.status,
            type: 'flow',
            triggered,
            received,
            opened,
            clicked,
            revenue,
            conversions,
            openRate: openRate.toFixed(1),
            clickRate: clickRate.toFixed(1),
          };
        }),
      lists: allLists.map(l => ({
        id: l.id,
        klaviyoId: l.klaviyo_list_id,
        name: l.name,
        profileCount: l.profile_count || 0,
      })),
      totalCounts: {
        campaigns: allCampaignsForDisplay.length,
        flows: allFlows.length,
        lists: allLists.length,
      },
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
