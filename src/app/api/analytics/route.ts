import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, parseDateRange } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

export async function GET(request: NextRequest) {
  try {
    getDb(); // Verify connection early
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const type = searchParams.get('type') || 'overview';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const period = searchParams.get('period') || '30d';

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 });
  }

  try {
    // Calculate date range
    const { start, end } = parseDateRange(startDate, endDate, period);

    switch (type) {
      case 'overview':
        return await getOverviewMetrics(organizationId, start, end);
      case 'email':
        return await getEmailMetrics(organizationId, start, end);
      case 'ecommerce':
        return await getEcommerceMetrics(organizationId, start, end);
      case 'whatsapp':
        return await getWhatsAppMetrics(organizationId, start, end);
      case 'automations':
        return await getAutomationMetrics(organizationId, start, end);
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getOverviewMetrics(organizationId: string, start: Date, end: Date) {
  // Get daily metrics
  const { data: dailyMetrics } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('date', start.toISOString().split('T')[0])
    .lte('date', end.toISOString().split('T')[0])
    .order('date');

  // Get contact count
  const { count: totalContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  // Get active automations
  const { count: activeAutomations } = await supabase
    .from('automations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  // Aggregate metrics
  const aggregated = (dailyMetrics || []).reduce((acc, day) => ({
    revenue: acc.revenue + (day.revenue || 0),
    orders: acc.orders + (day.orders_count || 0),
    emailsSent: acc.emailsSent + (day.emails_sent || 0),
    emailsOpened: acc.emailsOpened + (day.emails_opened || 0),
    emailsClicked: acc.emailsClicked + (day.emails_clicked || 0),
    whatsappSent: acc.whatsappSent + (day.whatsapp_sent || 0),
    whatsappReceived: acc.whatsappReceived + (day.whatsapp_received || 0),
  }), {
    revenue: 0,
    orders: 0,
    emailsSent: 0,
    emailsOpened: 0,
    emailsClicked: 0,
    whatsappSent: 0,
    whatsappReceived: 0,
  });

  // Calculate rates
  const openRate = aggregated.emailsSent > 0 
    ? (aggregated.emailsOpened / aggregated.emailsSent) * 100 
    : 0;
  const clickRate = aggregated.emailsOpened > 0 
    ? (aggregated.emailsClicked / aggregated.emailsOpened) * 100 
    : 0;

  // Get previous period for comparison
  const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - periodDays);

  const { data: prevMetrics } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('date', prevStart.toISOString().split('T')[0])
    .lt('date', start.toISOString().split('T')[0]);

  const prevAggregated = (prevMetrics || []).reduce((acc, day) => ({
    revenue: acc.revenue + (day.revenue || 0),
    orders: acc.orders + (day.orders_count || 0),
  }), { revenue: 0, orders: 0 });

  const revenueChange = prevAggregated.revenue > 0
    ? ((aggregated.revenue - prevAggregated.revenue) / prevAggregated.revenue) * 100
    : 0;
  const ordersChange = prevAggregated.orders > 0
    ? ((aggregated.orders - prevAggregated.orders) / prevAggregated.orders) * 100
    : 0;

  return NextResponse.json({
    summary: {
      revenue: aggregated.revenue,
      revenueChange,
      orders: aggregated.orders,
      ordersChange,
      totalContacts,
      activeAutomations,
      openRate,
      clickRate,
    },
    timeSeries: dailyMetrics,
  });
}

async function getEmailMetrics(organizationId: string, start: Date, end: Date) {
  // Get Klaviyo integration
  const { data: klaviyo } = await supabase
    .from('klaviyo_integrations')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (!klaviyo) {
    return NextResponse.json({
      error: 'Klaviyo not connected',
      connected: false,
    });
  }

  // Get daily email metrics
  const { data: dailyMetrics } = await supabase
    .from('daily_metrics')
    .select('date, emails_sent, emails_delivered, emails_opened, emails_clicked, emails_bounced, emails_unsubscribed')
    .eq('organization_id', organizationId)
    .gte('date', start.toISOString().split('T')[0])
    .lte('date', end.toISOString().split('T')[0])
    .order('date');

  // Get campaign performance
  const { data: campaigns } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('sent_at', start.toISOString())
    .lte('sent_at', end.toISOString())
    .order('sent_at', { ascending: false });

  // Aggregate metrics
  const aggregated = (dailyMetrics || []).reduce((acc, day) => ({
    sent: acc.sent + (day.emails_sent || 0),
    delivered: acc.delivered + (day.emails_delivered || 0),
    opened: acc.opened + (day.emails_opened || 0),
    clicked: acc.clicked + (day.emails_clicked || 0),
    bounced: acc.bounced + (day.emails_bounced || 0),
    unsubscribed: acc.unsubscribed + (day.emails_unsubscribed || 0),
  }), {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
  });

  const deliveryRate = aggregated.sent > 0 ? (aggregated.delivered / aggregated.sent) * 100 : 0;
  const openRate = aggregated.delivered > 0 ? (aggregated.opened / aggregated.delivered) * 100 : 0;
  const clickRate = aggregated.opened > 0 ? (aggregated.clicked / aggregated.opened) * 100 : 0;
  const bounceRate = aggregated.sent > 0 ? (aggregated.bounced / aggregated.sent) * 100 : 0;

  return NextResponse.json({
    connected: true,
    summary: {
      sent: aggregated.sent,
      delivered: aggregated.delivered,
      opened: aggregated.opened,
      clicked: aggregated.clicked,
      bounced: aggregated.bounced,
      unsubscribed: aggregated.unsubscribed,
      deliveryRate,
      openRate,
      clickRate,
      bounceRate,
    },
    timeSeries: dailyMetrics,
    campaigns: campaigns || [],
  });
}

async function getEcommerceMetrics(organizationId: string, start: Date, end: Date) {
  // Get Shopify integration
  const { data: shopify } = await supabase
    .from('shopify_stores')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single();

  if (!shopify) {
    return NextResponse.json({
      error: 'Shopify not connected',
      connected: false,
    });
  }

  // Get daily metrics
  const { data: dailyMetrics } = await supabase
    .from('daily_metrics')
    .select('date, revenue, orders_count, average_order_value, new_customers, returning_customers')
    .eq('organization_id', organizationId)
    .gte('date', start.toISOString().split('T')[0])
    .lte('date', end.toISOString().split('T')[0])
    .order('date');

  // Get top products
  const { data: topProducts } = await supabase
    .from('product_metrics')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('date', start.toISOString().split('T')[0])
    .lte('date', end.toISOString().split('T')[0])
    .order('revenue', { ascending: false })
    .limit(10);

  // Get attribution data
  const { data: attribution } = await supabase
    .from('order_attribution')
    .select('source, revenue, orders_count')
    .eq('organization_id', organizationId)
    .gte('date', start.toISOString().split('T')[0])
    .lte('date', end.toISOString().split('T')[0]);

  // Aggregate metrics
  const aggregated = (dailyMetrics || []).reduce((acc, day) => ({
    revenue: acc.revenue + (day.revenue || 0),
    orders: acc.orders + (day.orders_count || 0),
    newCustomers: acc.newCustomers + (day.new_customers || 0),
    returningCustomers: acc.returningCustomers + (day.returning_customers || 0),
  }), {
    revenue: 0,
    orders: 0,
    newCustomers: 0,
    returningCustomers: 0,
  });

  const aov = aggregated.orders > 0 ? aggregated.revenue / aggregated.orders : 0;

  // Aggregate attribution
  const attributionSummary = (attribution || []).reduce((acc: any, item) => {
    if (!acc[item.source]) {
      acc[item.source] = { revenue: 0, orders: 0 };
    }
    acc[item.source].revenue += item.revenue || 0;
    acc[item.source].orders += item.orders_count || 0;
    return acc;
  }, {});

  return NextResponse.json({
    connected: true,
    summary: {
      revenue: aggregated.revenue,
      orders: aggregated.orders,
      aov,
      newCustomers: aggregated.newCustomers,
      returningCustomers: aggregated.returningCustomers,
      conversionRate: 0, // Would need session data
    },
    timeSeries: dailyMetrics,
    topProducts: topProducts || [],
    attribution: Object.entries(attributionSummary).map(([source, data]: [string, any]) => ({
      source,
      ...data,
    })),
  });
}

async function getWhatsAppMetrics(organizationId: string, start: Date, end: Date) {
  // Get WhatsApp config
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (!config) {
    return NextResponse.json({
      error: 'WhatsApp not connected',
      connected: false,
    });
  }

  // Get message counts
  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('direction, status, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  const inbound = (messages || []).filter(m => m.direction === 'inbound').length;
  const outbound = (messages || []).filter(m => m.direction === 'outbound').length;
  const delivered = (messages || []).filter(m => m.status === 'delivered').length;
  const read = (messages || []).filter(m => m.status === 'read').length;

  // Get conversation counts
  const { count: totalConversations } = await supabase
    .from('whatsapp_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  const { count: activeConversations } = await supabase
    .from('whatsapp_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'open');

  // Get response time
  const { data: responseTimes } = await supabase
    .rpc('calculate_avg_response_time', {
      p_organization_id: organizationId,
      p_start_date: start.toISOString(),
      p_end_date: end.toISOString(),
    });

  return NextResponse.json({
    connected: true,
    summary: {
      totalMessages: (messages || []).length,
      inboundMessages: inbound,
      outboundMessages: outbound,
      deliveryRate: outbound > 0 ? (delivered / outbound) * 100 : 0,
      readRate: delivered > 0 ? (read / delivered) * 100 : 0,
      totalConversations,
      activeConversations,
      avgResponseTime: responseTimes?.avg_minutes || 0,
    },
  });
}

async function getAutomationMetrics(organizationId: string, start: Date, end: Date) {
  // Get automation stats
  const { data: automations } = await supabase
    .from('automations')
    .select(`
      id,
      name,
      status,
      trigger_type,
      automation_runs(
        id,
        status,
        started_at,
        completed_at
      )
    `)
    .eq('organization_id', organizationId);

  const totalAutomations = automations?.length || 0;
  const activeAutomations = automations?.filter(a => a.status === 'active').length || 0;

  // Calculate runs in period
  let totalRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;

  for (const automation of automations || []) {
    for (const run of automation.automation_runs || []) {
      if (run.started_at >= start.toISOString() && run.started_at <= end.toISOString()) {
        totalRuns++;
        if (run.status === 'completed') successfulRuns++;
        if (run.status === 'failed') failedRuns++;
      }
    }
  }

  // Get top performing automations
  const topAutomations = (automations || [])
    .map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      triggerType: a.trigger_type,
      totalRuns: (a.automation_runs || []).length,
      successRate: (a.automation_runs || []).length > 0
        ? ((a.automation_runs || []).filter((r: any) => r.status === 'completed').length / (a.automation_runs || []).length) * 100
        : 0,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns)
    .slice(0, 5);

  return NextResponse.json({
    summary: {
      totalAutomations,
      activeAutomations,
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0,
    },
    topAutomations,
  });
}
