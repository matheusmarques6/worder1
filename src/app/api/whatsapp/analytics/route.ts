// =============================================
// API: /api/whatsapp/analytics
// Analytics de campanhas WhatsApp
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type {
  CampaignAnalyticsResponse,
  CampaignAnalyticsSummary,
  CampaignAnalyticsTrends,
  CampaignChartDataPoint,
  CampaignWithMetrics,
  ErrorBreakdown,
  HourlyDistributionItem,
  BestHours,
  DateRange,
} from '@/types/whatsapp-analytics';

// GET - Buscar analytics de campanhas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const period = (searchParams.get('period') || '7d') as DateRange;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const campaignId = searchParams.get('campaign_id');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    // Calcular datas do período
    const { currentStart, currentEnd, previousStart, previousEnd } = calculatePeriodDates(period, startDate, endDate);

    // Se for uma campanha específica, retornar detalhes
    if (campaignId) {
      return getCampaignDetails(campaignId, organizationId);
    }

    // Buscar campanhas com métricas do período atual
    const campaigns = await getCampaignsWithMetrics(organizationId, currentStart, currentEnd);

    // Calcular summary
    const summary = calculateSummary(campaigns);

    // Calcular tendências (comparar com período anterior)
    const previousCampaigns = await getCampaignsWithMetrics(organizationId, previousStart, previousEnd);
    const previousSummary = calculateSummary(previousCampaigns);
    const trends = calculateTrends(summary, previousSummary);

    // Buscar dados do gráfico (por dia)
    const chartData = await getChartData(organizationId, currentStart, currentEnd);

    // Agregar erros de todas as campanhas
    const errorBreakdown = aggregateErrors(campaigns);

    // Agregar distribuição por hora
    const hourlyDistribution = await getHourlyDistribution(organizationId, currentStart, currentEnd);

    // Encontrar melhores horários
    const bestHours = findBestHours(hourlyDistribution);

    const response: CampaignAnalyticsResponse = {
      summary,
      trends,
      chart_data: chartData,
      campaigns: campaigns.map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        template_name: c.template_name || '',
        total_contacts: c.total_contacts || 0,
        sent: c.total_sent || 0,
        delivered: c.total_delivered || 0,
        read: c.total_read || 0,
        replied: c.total_replied || 0,
        failed: c.total_failed || 0,
        delivery_rate: c.delivery_rate || 0,
        read_rate: c.read_rate || 0,
        reply_rate: c.reply_rate || 0,
        failure_rate: c.failure_rate || 0,
        started_at: c.started_at,
        completed_at: c.completed_at,
        created_at: c.created_at,
      })),
      error_breakdown: errorBreakdown,
      hourly_distribution: hourlyDistribution,
      best_hours: bestHours,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Recalcular analytics de uma campanha
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaign_id, organization_id } = body;

    if (!campaign_id || !organization_id) {
      return NextResponse.json({ error: 'campaign_id and organization_id required' }, { status: 400 });
    }

    // Verificar se a campanha pertence à organização
    const { data: campaign, error: campaignError } = await supabase
      .from('whatsapp_campaigns')
      .select('id')
      .eq('id', campaign_id)
      .eq('organization_id', organization_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Chamar função de recálculo
    const { error } = await supabase.rpc('calculate_campaign_analytics', {
      p_campaign_id: campaign_id,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Analytics recalculated' });
  } catch (error: any) {
    console.error('Analytics POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================

function calculatePeriodDates(period: DateRange, startDate?: string | null, endDate?: string | null) {
  const now = new Date();
  let currentStart: Date;
  let currentEnd: Date = now;
  let periodDays: number;

  switch (period) {
    case 'today':
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodDays = 1;
      break;
    case '7d':
      currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      periodDays = 7;
      break;
    case '30d':
      currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      periodDays = 30;
      break;
    case '90d':
      currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      periodDays = 90;
      break;
    case 'custom':
      currentStart = startDate ? new Date(startDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      currentEnd = endDate ? new Date(endDate) : now;
      periodDays = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000));
      break;
    case 'all':
    default:
      currentStart = new Date(0);
      periodDays = 365;
      break;
  }

  // Período anterior para comparação
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  };
}

async function getCampaignsWithMetrics(organizationId: string, start: Date, end: Date): Promise<any[]> {
  const { data, error } = await supabase
    .from('v_campaign_analytics_summary')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    // Se a view não existir, buscar direto das tabelas
    const { data: campaigns, error: campaignsError } = await supabase
      .from('whatsapp_campaigns')
      .select(`
        *,
        analytics:whatsapp_campaign_analytics(*)
      `)
      .eq('organization_id', organizationId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    if (campaignsError) throw campaignsError;

    return (campaigns || []).map(c => ({
      ...c,
      total_sent: c.analytics?.[0]?.total_sent || 0,
      total_delivered: c.analytics?.[0]?.total_delivered || 0,
      total_read: c.analytics?.[0]?.total_read || 0,
      total_replied: c.analytics?.[0]?.total_replied || 0,
      total_failed: c.analytics?.[0]?.total_failed || 0,
      delivery_rate: c.analytics?.[0]?.delivery_rate || 0,
      read_rate: c.analytics?.[0]?.read_rate || 0,
      reply_rate: c.analytics?.[0]?.reply_rate || 0,
      failure_rate: c.analytics?.[0]?.failure_rate || 0,
      error_breakdown: c.analytics?.[0]?.error_breakdown || {},
      hourly_stats: c.analytics?.[0]?.hourly_stats || [],
    }));
  }

  return data || [];
}

function calculateSummary(campaigns: any[]): CampaignAnalyticsSummary {
  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + (c.total_sent || 0),
      delivered: acc.delivered + (c.total_delivered || 0),
      read: acc.read + (c.total_read || 0),
      replied: acc.replied + (c.total_replied || 0),
      failed: acc.failed + (c.total_failed || 0),
      deliveryTime: acc.deliveryTime + (c.avg_delivery_time_seconds || 0),
      readTime: acc.readTime + (c.avg_read_time_seconds || 0),
      count: acc.count + 1,
    }),
    { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, deliveryTime: 0, readTime: 0, count: 0 }
  );

  return {
    total_campaigns: campaigns.length,
    total_sent: totals.sent,
    total_delivered: totals.delivered,
    total_read: totals.read,
    total_replied: totals.replied,
    total_failed: totals.failed,
    delivery_rate: totals.sent > 0 ? Number(((totals.delivered / totals.sent) * 100).toFixed(2)) : 0,
    read_rate: totals.delivered > 0 ? Number(((totals.read / totals.delivered) * 100).toFixed(2)) : 0,
    reply_rate: totals.sent > 0 ? Number(((totals.replied / totals.sent) * 100).toFixed(2)) : 0,
    failure_rate: totals.sent > 0 ? Number(((totals.failed / totals.sent) * 100).toFixed(2)) : 0,
    avg_delivery_time_seconds: totals.count > 0 ? totals.deliveryTime / totals.count : 0,
    avg_read_time_seconds: totals.count > 0 ? totals.readTime / totals.count : 0,
  };
}

function calculateTrends(current: CampaignAnalyticsSummary, previous: CampaignAnalyticsSummary): CampaignAnalyticsTrends {
  const calcChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Number((((curr - prev) / prev) * 100).toFixed(2));
  };

  return {
    sent_change: calcChange(current.total_sent, previous.total_sent),
    delivered_change: calcChange(current.total_delivered, previous.total_delivered),
    read_change: calcChange(current.total_read, previous.total_read),
    replied_change: calcChange(current.total_replied, previous.total_replied),
    delivery_rate_change: Number((current.delivery_rate - previous.delivery_rate).toFixed(2)),
    read_rate_change: Number((current.read_rate - previous.read_rate).toFixed(2)),
  };
}

async function getChartData(organizationId: string, start: Date, end: Date): Promise<CampaignChartDataPoint[]> {
  // Buscar logs agregados por dia
  const { data, error } = await supabase
    .from('whatsapp_campaign_logs')
    .select(`
      sent_at,
      status,
      campaign:whatsapp_campaigns!inner(organization_id)
    `)
    .eq('campaign.organization_id', organizationId)
    .gte('sent_at', start.toISOString())
    .lte('sent_at', end.toISOString());

  if (error || !data) {
    // Retornar dados vazios se houver erro
    return generateEmptyChartData(start, end);
  }

  // Agrupar por dia
  const byDay = new Map<string, { sent: number; delivered: number; read: number; replied: number; failed: number }>();

  data.forEach((log: any) => {
    if (!log.sent_at) return;
    const date = log.sent_at.split('T')[0];
    
    if (!byDay.has(date)) {
      byDay.set(date, { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
    }

    const day = byDay.get(date)!;
    day.sent++;

    if (log.status === 'DELIVERED' || log.status === 'READ') {
      day.delivered++;
    }
    if (log.status === 'READ') {
      day.read++;
    }
    if (log.status === 'FAILED') {
      day.failed++;
    }
  });

  // Converter para array e ordenar
  const chartData: CampaignChartDataPoint[] = Array.from(byDay.entries())
    .map(([date, metrics]) => ({
      date,
      ...metrics,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Preencher dias faltantes
  return fillMissingDays(chartData, start, end);
}

function generateEmptyChartData(start: Date, end: Date): CampaignChartDataPoint[] {
  const data: CampaignChartDataPoint[] = [];
  const current = new Date(start);
  
  while (current <= end) {
    data.push({
      date: current.toISOString().split('T')[0],
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
    });
    current.setDate(current.getDate() + 1);
  }
  
  return data;
}

function fillMissingDays(data: CampaignChartDataPoint[], start: Date, end: Date): CampaignChartDataPoint[] {
  const dateMap = new Map(data.map(d => [d.date, d]));
  const filled: CampaignChartDataPoint[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    filled.push(
      dateMap.get(dateStr) || {
        date: dateStr,
        sent: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0,
      }
    );
    current.setDate(current.getDate() + 1);
  }

  return filled;
}

function aggregateErrors(campaigns: any[]): ErrorBreakdown {
  const errors: ErrorBreakdown = {};

  campaigns.forEach(c => {
    const breakdown = c.error_breakdown || {};
    Object.entries(breakdown).forEach(([code, data]: [string, any]) => {
      if (!errors[code]) {
        errors[code] = { count: 0, description: data.description || code };
      }
      errors[code].count += data.count || 0;
    });
  });

  // Calcular percentuais
  const totalErrors = Object.values(errors).reduce((sum, e) => sum + e.count, 0);
  Object.values(errors).forEach(e => {
    e.percent = totalErrors > 0 ? Number(((e.count / totalErrors) * 100).toFixed(2)) : 0;
  });

  return errors;
}

async function getHourlyDistribution(organizationId: string, start: Date, end: Date): Promise<HourlyDistributionItem[]> {
  // Buscar logs e agregar por hora
  const { data, error } = await supabase
    .from('whatsapp_campaign_logs')
    .select(`
      sent_at,
      status,
      campaign:whatsapp_campaigns!inner(organization_id)
    `)
    .eq('campaign.organization_id', organizationId)
    .gte('sent_at', start.toISOString())
    .lte('sent_at', end.toISOString());

  if (error || !data) {
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      sent: 0,
      delivered: 0,
      read: 0,
    }));
  }

  // Agrupar por hora
  const byHour = new Map<number, { sent: number; delivered: number; read: number }>();

  data.forEach((log: any) => {
    if (!log.sent_at) return;
    const hour = new Date(log.sent_at).getHours();
    
    if (!byHour.has(hour)) {
      byHour.set(hour, { sent: 0, delivered: 0, read: 0 });
    }

    const h = byHour.get(hour)!;
    h.sent++;

    if (log.status === 'DELIVERED' || log.status === 'READ') {
      h.delivered++;
    }
    if (log.status === 'READ') {
      h.read++;
    }
  });

  // Preencher todas as horas
  return Array.from({ length: 24 }, (_, hour) => {
    const h = byHour.get(hour) || { sent: 0, delivered: 0, read: 0 };
    return {
      hour,
      sent: h.sent,
      delivered: h.delivered,
      read: h.read,
      delivery_rate: h.sent > 0 ? Number(((h.delivered / h.sent) * 100).toFixed(2)) : 0,
      read_rate: h.delivered > 0 ? Number(((h.read / h.delivered) * 100).toFixed(2)) : 0,
    };
  });
}

function findBestHours(hourly: HourlyDistributionItem[]): BestHours {
  const withEnoughData = hourly.filter(h => h.sent >= 10);

  if (withEnoughData.length === 0) {
    return { delivery: null, read: null };
  }

  const bestDelivery = withEnoughData.reduce((best, h) => 
    (h.delivery_rate || 0) > (best.delivery_rate || 0) ? h : best
  );

  const bestRead = withEnoughData.reduce((best, h) => 
    (h.read_rate || 0) > (best.read_rate || 0) ? h : best
  );

  return {
    delivery: { hour: bestDelivery.hour, rate: bestDelivery.delivery_rate || 0 },
    read: { hour: bestRead.hour, rate: bestRead.read_rate || 0 },
  };
}

async function getCampaignDetails(campaignId: string, organizationId: string) {
  // Buscar campanha
  const { data: campaign, error: campaignError } = await supabase
    .from('whatsapp_campaigns')
    .select(`
      *,
      phonebook:whatsapp_phonebooks(id, name),
      analytics:whatsapp_campaign_analytics(*)
    `)
    .eq('id', campaignId)
    .eq('organization_id', organizationId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const analytics = campaign.analytics?.[0] || {};

  // Buscar logs recentes
  const { data: logs } = await supabase
    .from('whatsapp_campaign_logs')
    .select(`
      id, contact_name, contact_mobile, status, message_id,
      sent_at, delivered_at, read_at, failed_at, replied_at,
      error_code, error_message, delivery_time_seconds, read_time_seconds
    `)
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false })
    .limit(50);

  // Montar funil
  const funnel = [
    { stage: 'Enviadas', value: analytics.total_sent || 0, percent: 100, color: '#3b82f6' },
    { stage: 'Entregues', value: analytics.total_delivered || 0, percent: analytics.delivery_rate || 0, color: '#10b981' },
    { stage: 'Lidas', value: analytics.total_read || 0, percent: analytics.total_sent > 0 ? ((analytics.total_read / analytics.total_sent) * 100) : 0, color: '#22d3ee' },
    { stage: 'Respondidas', value: analytics.total_replied || 0, percent: analytics.reply_rate || 0, color: '#8b5cf6' },
  ];

  // Formatar tempos
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Processar erros
  const errorBreakdown = analytics.error_breakdown || {};
  const totalErrors = Object.values(errorBreakdown as Record<string, any>).reduce((sum: number, e: any) => sum + (e.count || 0), 0);
  
  const errors = Object.entries(errorBreakdown).map(([code, data]: [string, any]) => ({
    code,
    count: data.count || 0,
    description: data.description || code,
    percent: totalErrors > 0 ? Number(((data.count / totalErrors) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      title: campaign.title,
      template_name: campaign.template_name,
      template_language: campaign.template_language,
      phonebook: campaign.phonebook,
      status: campaign.status,
      total_contacts: campaign.total_contacts,
      created_at: campaign.created_at,
      started_at: campaign.started_at,
      completed_at: campaign.completed_at,
    },
    metrics: {
      sent: analytics.total_sent || 0,
      delivered: analytics.total_delivered || 0,
      read: analytics.total_read || 0,
      replied: analytics.total_replied || 0,
      failed: analytics.total_failed || 0,
      optout: analytics.total_optout || 0,
      delivery_rate: analytics.delivery_rate || 0,
      read_rate: analytics.read_rate || 0,
      reply_rate: analytics.reply_rate || 0,
      failure_rate: analytics.failure_rate || 0,
      avg_delivery_time: formatTime(analytics.avg_delivery_time_seconds),
      avg_read_time: formatTime(analytics.avg_read_time_seconds),
    },
    funnel,
    hourly_stats: analytics.hourly_stats || [],
    errors,
    recent_logs: logs || [],
  });
}
