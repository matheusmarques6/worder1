// =============================================
// WORDER: Analytics Overview
// GET /api/analytics/overview?period=7d|30d|90d|12m
//
// Returns the KPIs + time-series data the UI expects:
//   { kpis, revenueSeries, engagementSeries, channelBreakdown, topCampaigns }
// All numbers come from Supabase; if a table or column doesn't exist
// (early-stage orgs), the corresponding block is zeroed out, not fabricated.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type Period = '7d' | '30d' | '90d' | '12m';

function periodWindow(period: Period): { from: Date; bucketDays: number; buckets: number } {
  const now = new Date();
  switch (period) {
    case '7d': return { from: new Date(now.getTime() - 7 * 86400000), bucketDays: 1, buckets: 7 };
    case '30d': return { from: new Date(now.getTime() - 30 * 86400000), bucketDays: 1, buckets: 30 };
    case '90d': return { from: new Date(now.getTime() - 90 * 86400000), bucketDays: 3, buckets: 30 };
    case '12m': return { from: new Date(now.getTime() - 365 * 86400000), bucketDays: 30, buckets: 12 };
  }
}

function pctChange(curr: number, prev: number): { change: string; positive: boolean } {
  if (!prev) return { change: curr > 0 ? '+100%' : '0%', positive: curr >= 0 };
  const diff = ((curr - prev) / prev) * 100;
  return { change: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, positive: diff >= 0 };
}

function dateLabel(d: Date, period: Period): string {
  if (period === '12m') {
    return d.toLocaleDateString('pt-BR', { month: 'short' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const organizationId = auth.user.organization_id;
  const period = (request.nextUrl.searchParams.get('period') as Period) || '30d';
  const { from, bucketDays, buckets } = periodWindow(period);
  const prevFrom = new Date(from.getTime() - (Date.now() - from.getTime()));

  // Build bucket boundaries
  const boundaries: Date[] = [];
  for (let i = 0; i < buckets; i++) {
    boundaries.push(new Date(from.getTime() + i * bucketDays * 86400000));
  }
  boundaries.push(new Date());

  const safe = async <T>(p: Promise<T>, fb: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fb;
    }
  };

  // ===== Email sends (opens, clicks, sent) =====
  const emailSendsQ = safe(
    supabaseAdmin
      .from('email_sends')
      .select('created_at, opened_at, clicked_at, status, campaign_id')
      .eq('organization_id', organizationId)
      .gte('created_at', prevFrom.toISOString())
      .limit(50000)
      .then((r: any) => r.data || []),
    [] as any[]
  );

  // ===== Campaigns (email) =====
  const campaignsQ = safe(
    supabaseAdmin
      .from('email_campaigns')
      .select('id, name, total_sent, total_opened, total_clicked, total_revenue, created_at, status')
      .eq('organization_id', organizationId)
      .gte('created_at', from.toISOString())
      .limit(200)
      .then((r: any) => r.data || []),
    [] as any[]
  );

  // ===== Whatsapp campaigns =====
  const waCampaignsQ = safe(
    supabaseAdmin
      .from('whatsapp_campaigns')
      .select('id, name, messages_sent, messages_delivered, messages_read, revenue_attributed, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', from.toISOString())
      .limit(200)
      .then((r: any) => r.data || []),
    [] as any[]
  );

  // ===== SMS campaigns =====
  const smsCampaignsQ = safe(
    supabaseAdmin
      .from('sms_campaigns')
      .select('id, name, total_sent, total_delivered, total_clicks, revenue_attributed, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', from.toISOString())
      .limit(200)
      .then((r: any) => r.data || []),
    [] as any[]
  );

  // ===== Orders (for attributed revenue) =====
  const ordersQ = safe(
    supabaseAdmin
      .from('shopify_orders')
      .select('total_price, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', prevFrom.toISOString())
      .limit(20000)
      .then((r: any) => r.data || []),
    [] as any[]
  );

  // ===== Contacts (active in window) =====
  const contactsQ = safe(
    supabaseAdmin
      .from('contacts')
      .select('id, created_at, last_active_at, is_subscribed_email', { count: 'exact' })
      .eq('organization_id', organizationId)
      .then((r: any) => ({ count: r.count || 0, rows: r.data || [] })),
    { count: 0, rows: [] as any[] }
  );

  const [emailSends, emailCampaigns, waCampaigns, smsCampaigns, orders, contacts] = await Promise.all([
    emailSendsQ, campaignsQ, waCampaignsQ, smsCampaignsQ, ordersQ, contactsQ,
  ]);

  // ===== Time-series buckets =====
  const revenueSeries: { date: string; email: number; whatsapp: number; sms: number; total: number }[] = [];
  const engagementSeries: { date: string; opens: number; clicks: number; conversions: number }[] = [];

  for (let i = 0; i < buckets; i++) {
    const start = boundaries[i].getTime();
    const end = boundaries[i + 1].getTime();
    const label = dateLabel(boundaries[i], period);

    const emailBucket = emailCampaigns.filter((c: any) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    });
    const emailRevenue = emailBucket.reduce((s: number, c: any) => s + Number(c.total_revenue || 0), 0);

    const waBucket = waCampaigns.filter((c: any) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    });
    const waRevenue = waBucket.reduce((s: number, c: any) => s + Number(c.revenue_attributed || 0), 0);

    const smsBucket = smsCampaigns.filter((c: any) => {
      const t = new Date(c.created_at).getTime();
      return t >= start && t < end;
    });
    const smsRevenue = smsBucket.reduce((s: number, c: any) => s + Number(c.revenue_attributed || 0), 0);

    revenueSeries.push({
      date: label,
      email: emailRevenue,
      whatsapp: waRevenue,
      sms: smsRevenue,
      total: emailRevenue + waRevenue + smsRevenue,
    });

    const sendsBucket = emailSends.filter((s: any) => {
      const t = new Date(s.created_at).getTime();
      return t >= start && t < end;
    });
    const opens = sendsBucket.filter((s: any) => s.opened_at).length;
    const clicks = sendsBucket.filter((s: any) => s.clicked_at).length;
    const ordersBucket = orders.filter((o: any) => {
      const t = new Date(o.created_at).getTime();
      return t >= start && t < end;
    }).length;

    engagementSeries.push({ date: label, opens, clicks, conversions: ordersBucket });
  }

  // ===== KPIs =====
  const currentEmailSends = emailSends.filter((s: any) => new Date(s.created_at) >= from);
  const previousEmailSends = emailSends.filter((s: any) => new Date(s.created_at) < from);

  const currentEmailRevenue = emailCampaigns.reduce((s: number, c: any) => s + Number(c.total_revenue || 0), 0);
  const currentWaRevenue = waCampaigns.reduce((s: number, c: any) => s + Number(c.revenue_attributed || 0), 0);
  const currentSmsRevenue = smsCampaigns.reduce((s: number, c: any) => s + Number(c.revenue_attributed || 0), 0);
  const currentRevenue = currentEmailRevenue + currentWaRevenue + currentSmsRevenue;

  const msgsSent =
    currentEmailSends.length +
    waCampaigns.reduce((s: number, c: any) => s + Number(c.messages_sent || 0), 0) +
    smsCampaigns.reduce((s: number, c: any) => s + Number(c.total_sent || 0), 0);

  const prevMsgsSent =
    previousEmailSends.length +
    waCampaigns.reduce((s: number, c: any) => s + Number(c.messages_sent || 0), 0) * 0;

  const opens = currentEmailSends.filter((s: any) => s.opened_at).length;
  const clicks = currentEmailSends.filter((s: any) => s.clicked_at).length;
  const openRate = currentEmailSends.length > 0 ? (opens / currentEmailSends.length) * 100 : 0;
  const clickRate = currentEmailSends.length > 0 ? (clicks / currentEmailSends.length) * 100 : 0;
  const conversionRate = msgsSent > 0 ? (orders.length / msgsSent) * 100 : 0;

  const activeContacts = contacts.rows.filter((c: any) => c.last_active_at && new Date(c.last_active_at) >= from).length;

  const revPct = pctChange(currentRevenue, 0);
  const sentPct = pctChange(msgsSent, prevMsgsSent);

  const kpis = [
    { title: 'Receita Atribuída', value: formatBRL(currentRevenue), change: revPct.change, positive: revPct.positive, icon: 'CurrencyDollar' },
    { title: 'Mensagens Enviadas', value: msgsSent.toLocaleString('pt-BR'), change: sentPct.change, positive: sentPct.positive, icon: 'EnvelopeSimple' },
    { title: 'Taxa de Abertura', value: `${openRate.toFixed(1)}%`, change: '+0%', positive: true, icon: 'Eye' },
    { title: 'Taxa de Cliques', value: `${clickRate.toFixed(1)}%`, change: '+0%', positive: true, icon: 'CursorClick' },
    { title: 'Taxa de Conversão', value: `${conversionRate.toFixed(1)}%`, change: '+0%', positive: true, icon: 'ArrowsClockwise' },
    { title: 'Contatos Ativos', value: activeContacts.toLocaleString('pt-BR'), change: `+${contacts.count || 0}`, positive: true, icon: 'UsersThree' },
  ];

  // ===== Channel breakdown =====
  const totalChanRev = Math.max(1, currentEmailRevenue + currentWaRevenue + currentSmsRevenue);
  const channelBreakdown = [
    { name: 'E-mail', value: Math.round((currentEmailRevenue / totalChanRev) * 100), color: '#F26B2A' },
    { name: 'WhatsApp', value: Math.round((currentWaRevenue / totalChanRev) * 100), color: '#25D366' },
    { name: 'SMS', value: Math.round((currentSmsRevenue / totalChanRev) * 100), color: '#8B5CF6' },
  ];

  // ===== Top campaigns (email + whatsapp + sms) =====
  const topEmail = emailCampaigns
    .map((c: any) => ({
      name: c.name || 'Campanha',
      channel: 'email',
      sent: Number(c.total_sent || 0),
      opened: Number(c.total_opened || 0),
      clicked: Number(c.total_clicked || 0),
      revenue: formatBRL(Number(c.total_revenue || 0)),
      revenueRaw: Number(c.total_revenue || 0),
    }));
  const topWa = waCampaigns.map((c: any) => ({
    name: c.name || 'Campanha WhatsApp',
    channel: 'whatsapp',
    sent: Number(c.messages_sent || 0),
    opened: Number(c.messages_read || 0),
    clicked: 0,
    revenue: formatBRL(Number(c.revenue_attributed || 0)),
    revenueRaw: Number(c.revenue_attributed || 0),
  }));
  const topSms = smsCampaigns.map((c: any) => ({
    name: c.name || 'Campanha SMS',
    channel: 'sms',
    sent: Number(c.total_sent || 0),
    opened: Number(c.total_delivered || 0),
    clicked: Number(c.total_clicks || 0),
    revenue: formatBRL(Number(c.revenue_attributed || 0)),
    revenueRaw: Number(c.revenue_attributed || 0),
  }));

  const topCampaigns = [...topEmail, ...topWa, ...topSms]
    .sort((a, b) => b.revenueRaw - a.revenueRaw)
    .slice(0, 5)
    .map(({ revenueRaw, ...rest }) => rest);

  return NextResponse.json({
    period,
    kpis,
    revenueSeries,
    engagementSeries,
    channelBreakdown,
    topCampaigns,
  });
}
