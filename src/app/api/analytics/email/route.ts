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

    // Fetch campaigns from database
    const { data: campaigns } = await supabase
      .from('campaign_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('sent_at', startDate.toISOString())
      .lte('sent_at', endDate.toISOString())
      .order('sent_at', { ascending: false });

    // Fetch flows from database
    const { data: flows } = await supabase
      .from('flow_metrics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });

    // Fetch lists
    const { data: lists } = await supabase
      .from('klaviyo_lists')
      .select('*')
      .eq('organization_id', organizationId)
      .order('profile_count', { ascending: false });

    // Calculate aggregated metrics
    const allCampaigns = campaigns || [];
    const allFlows = flows || [];
    const allLists = lists || [];

    // Campaign metrics
    const totalSent = allCampaigns.reduce((sum, c) => sum + (c.sent || 0), 0);
    const totalDelivered = allCampaigns.reduce((sum, c) => sum + (c.delivered || 0), 0);
    const totalOpened = allCampaigns.reduce((sum, c) => sum + (c.opened || 0), 0);
    const totalClicked = allCampaigns.reduce((sum, c) => sum + (c.clicked || 0), 0);
    const totalBounced = allCampaigns.reduce((sum, c) => sum + (c.bounced || 0), 0);
    const totalUnsubscribed = allCampaigns.reduce((sum, c) => sum + (c.unsubscribed || 0), 0);
    const totalRevenue = allCampaigns.reduce((sum, c) => sum + parseFloat(c.revenue || '0'), 0);
    const totalConversions = allCampaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

    // Flow metrics
    const flowTriggered = allFlows.reduce((sum, f) => sum + (f.triggered || 0), 0);
    const flowOpened = allFlows.reduce((sum, f) => sum + (f.opened || 0), 0);
    const flowClicked = allFlows.reduce((sum, f) => sum + (f.clicked || 0), 0);
    const flowRevenue = allFlows.reduce((sum, f) => sum + parseFloat(f.revenue || '0'), 0);

    // List metrics
    const totalSubscribers = allLists.reduce((sum, l) => sum + (l.profile_count || 0), 0);

    // Calculate rates
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const unsubscribeRate = totalDelivered > 0 ? (totalUnsubscribed / totalDelivered) * 100 : 0;
    const conversionRate = totalClicked > 0 ? (totalConversions / totalClicked) * 100 : 0;

    // ROI calculation (assuming $0.01 per email cost)
    const emailCost = totalSent * 0.01;
    const roi = emailCost > 0 ? totalRevenue / emailCost : 0;

    // Build funnel data
    const funnelData = [
      { stage: 'Enviados', value: totalSent, percent: 100 },
      { stage: 'Entregues', value: totalDelivered, percent: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0 },
      { stage: 'Abertos', value: totalOpened, percent: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0 },
      { stage: 'Clicados', value: totalClicked, percent: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0 },
      { stage: 'Convertidos', value: totalConversions, percent: totalSent > 0 ? (totalConversions / totalSent) * 100 : 0 },
    ];

    // Build response
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
          change: 0, // TODO: Calculate vs previous period
        },
        clickRate: {
          value: clickRate.toFixed(1),
          change: 0,
        },
        conversionRate: {
          value: conversionRate.toFixed(1),
          change: 0,
        },
        revenue: {
          value: totalRevenue + flowRevenue,
          change: 0,
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
          change: 0,
        },
        unsubscribeRate: {
          value: unsubscribeRate.toFixed(1),
          change: 0,
        },
      },
      totals: {
        sent: totalSent,
        delivered: totalDelivered,
        opened: totalOpened,
        clicked: totalClicked,
        bounced: totalBounced,
        unsubscribed: totalUnsubscribed,
        revenue: totalRevenue + flowRevenue,
        conversions: totalConversions,
      },
      funnel: funnelData,
      campaigns: allCampaigns.slice(0, 20).map(c => ({
        id: c.id,
        klaviyoId: c.klaviyo_campaign_id,
        name: c.name,
        status: c.status,
        type: 'campaign',
        sent: c.sent || 0,
        delivered: c.delivered || 0,
        opened: c.opened || 0,
        clicked: c.clicked || 0,
        converted: c.conversions || 0,
        revenue: c.revenue || 0,
        openRate: c.open_rate?.toFixed(1) || '0',
        clickRate: c.click_rate?.toFixed(1) || '0',
        sentAt: c.sent_at,
      })),
      flows: allFlows.filter(f => f.status === 'live').slice(0, 10).map(f => ({
        id: f.id,
        klaviyoId: f.klaviyo_flow_id,
        name: f.name,
        status: f.status,
        type: 'flow',
        triggered: f.triggered || 0,
        opened: f.opened || 0,
        clicked: f.clicked || 0,
        revenue: f.revenue || 0,
        openRate: f.open_rate?.toFixed(1) || '0',
        clickRate: f.click_rate?.toFixed(1) || '0',
      })),
      lists: allLists.map(l => ({
        id: l.id,
        klaviyoId: l.klaviyo_list_id,
        name: l.name,
        profileCount: l.profile_count || 0,
      })),
    });
  } catch (error: any) {
    console.error('[Email Analytics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch email analytics' },
      { status: 500 }
    );
  }
}
