// =============================================
// API: /api/whatsapp/ai/analytics
// Analytics de agentes de IA WhatsApp
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type {
  AIAnalyticsResponse,
  AIAnalyticsSummary,
  AIAnalyticsTrends,
  AIAgentWithMetrics,
  AIChartDataPoint,
  ProviderBreakdown,
  ModelBreakdown,
  AIHourlyDistribution,
  PerformanceMetrics,
  QualityMetrics,
  AIErrorBreakdown,
} from '@/types/whatsapp-ai-analytics';
import type { DateRange } from '@/types/whatsapp-analytics';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Buscar analytics de agentes de IA
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const period = (searchParams.get('period') || '7d') as DateRange;
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const agentId = searchParams.get('agent_id');

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    // Calcular datas do período
    const { currentStart, currentEnd, previousStart, previousEnd } = calculatePeriodDates(period, startDate, endDate);

    // Se for um agente específico, retornar detalhes
    if (agentId) {
      return getAgentDetails(agentId, organizationId, currentStart, currentEnd);
    }

    // Buscar agentes
    const agents = await getAgentsWithMetrics(organizationId);

    // Buscar interações do período
    const interactions = await getInteractions(organizationId, currentStart, currentEnd);
    const previousInteractions = await getInteractions(organizationId, previousStart, previousEnd);

    // Calcular summary
    const summary = calculateSummary(agents, interactions);
    const previousSummary = calculateSummary(agents, previousInteractions);

    // Calcular tendências
    const trends = calculateTrends(summary, previousSummary);

    // Buscar dados do gráfico
    const chartData = await getChartData(organizationId, currentStart, currentEnd);

    // Calcular breakdowns
    const byProvider = calculateProviderBreakdown(interactions);
    const byModel = calculateModelBreakdown(interactions);

    // Distribuição por hora
    const hourlyDistribution = calculateHourlyDistribution(interactions);

    // Métricas de performance
    const performance = calculatePerformance(interactions);

    // Métricas de qualidade
    const quality = calculateQuality(interactions);

    // Breakdown de erros
    const errorBreakdown = calculateErrorBreakdown(interactions);

    const response: AIAnalyticsResponse = {
      summary,
      trends,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name || `Agente ${a.id.slice(0, 8)}`,
        description: a.description,
        provider: a.provider,
        model: a.model,
        is_active: a.is_active,
        temperature: a.temperature,
        max_tokens: a.max_tokens,
        total_interactions: a.total_interactions || 0,
        total_tokens_used: a.total_tokens_used || 0,
        total_cost_usd: a.total_cost_usd || 0,
        last_interaction_at: a.last_interaction_at,
        created_at: a.created_at,
      })),
      chart_data: chartData,
      by_provider: byProvider,
      by_model: byModel,
      hourly_distribution: hourlyDistribution,
      performance,
      quality,
      error_breakdown: errorBreakdown,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('AI Analytics GET error:', error);
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

  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

  return { currentStart, currentEnd, previousStart, previousEnd };
}

async function getAgentsWithMetrics(organizationId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getInteractions(organizationId: string, start: Date, end: Date): Promise<any[]> {
  const { data, error } = await supabase
    .from('whatsapp_ai_interactions')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (error) {
    console.error('Error fetching interactions:', error);
    return [];
  }
  return data || [];
}

function calculateSummary(agents: any[], interactions: any[]): AIAnalyticsSummary {
  const totalInteractions = interactions.length;
  const uniqueConversations = new Set(interactions.map(i => i.conversation_id).filter(Boolean)).size;
  
  const successCount = interactions.filter(i => i.status === 'success').length;
  const errorCount = interactions.filter(i => i.status === 'error').length;
  const resolvedCount = interactions.filter(i => i.conversation_resolved).length;
  const transferredCount = interactions.filter(i => i.was_transferred).length;

  const totalInputTokens = interactions.reduce((sum, i) => sum + (i.input_tokens || 0), 0);
  const totalOutputTokens = interactions.reduce((sum, i) => sum + (i.output_tokens || 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;

  // Calcular custo estimado (usar custo já calculado ou estimar)
  const estimatedCost = agents.reduce((sum, a) => sum + (a.total_cost_usd || 0), 0);

  const avgResponseTime = interactions.length > 0
    ? interactions.reduce((sum, i) => sum + (i.response_time_ms || 0), 0) / interactions.length
    : 0;

  return {
    total_agents: agents.length,
    active_agents: agents.filter(a => a.is_active).length,
    total_interactions: totalInteractions,
    total_conversations: uniqueConversations,
    total_tokens: totalTokens,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    estimated_cost_usd: Number(estimatedCost.toFixed(4)),
    avg_response_time_ms: Number(avgResponseTime.toFixed(0)),
    success_rate: totalInteractions > 0 ? Number(((successCount / totalInteractions) * 100).toFixed(2)) : 0,
    error_rate: totalInteractions > 0 ? Number(((errorCount / totalInteractions) * 100).toFixed(2)) : 0,
    resolution_rate: uniqueConversations > 0 ? Number(((resolvedCount / uniqueConversations) * 100).toFixed(2)) : 0,
    transfer_rate: uniqueConversations > 0 ? Number(((transferredCount / uniqueConversations) * 100).toFixed(2)) : 0,
  };
}

function calculateTrends(current: AIAnalyticsSummary, previous: AIAnalyticsSummary): AIAnalyticsTrends {
  const calcChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Number((((curr - prev) / prev) * 100).toFixed(2));
  };

  const calcDiff = (curr: number, prev: number): number => {
    return Number((curr - prev).toFixed(2));
  };

  return {
    interactions_change: calcChange(current.total_interactions, previous.total_interactions),
    tokens_change: calcChange(current.total_tokens, previous.total_tokens),
    cost_change: calcChange(current.estimated_cost_usd, previous.estimated_cost_usd),
    latency_change: calcDiff(current.avg_response_time_ms, previous.avg_response_time_ms),
    success_rate_change: calcDiff(current.success_rate, previous.success_rate),
    resolution_rate_change: calcDiff(current.resolution_rate, previous.resolution_rate),
  };
}

async function getChartData(organizationId: string, start: Date, end: Date): Promise<AIChartDataPoint[]> {
  const { data, error } = await supabase
    .from('whatsapp_ai_interactions')
    .select('created_at, input_tokens, output_tokens, response_time_ms, status')
    .eq('organization_id', organizationId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (error || !data) {
    return generateEmptyChartData(start, end);
  }

  // Agrupar por dia
  const byDay = new Map<string, {
    interactions: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    latencySum: number;
    successCount: number;
  }>();

  data.forEach((i: any) => {
    const date = i.created_at.split('T')[0];
    
    if (!byDay.has(date)) {
      byDay.set(date, { interactions: 0, tokens: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, successCount: 0 });
    }

    const day = byDay.get(date)!;
    day.interactions++;
    day.inputTokens += i.input_tokens || 0;
    day.outputTokens += i.output_tokens || 0;
    day.tokens += (i.input_tokens || 0) + (i.output_tokens || 0);
    day.latencySum += i.response_time_ms || 0;
    if (i.status === 'success') day.successCount++;
  });

  // Converter para array
  const chartData: AIChartDataPoint[] = Array.from(byDay.entries())
    .map(([date, metrics]) => ({
      date,
      interactions: metrics.interactions,
      tokens: metrics.tokens,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      cost_usd: estimateCost(metrics.inputTokens, metrics.outputTokens),
      avg_latency_ms: metrics.interactions > 0 ? Math.round(metrics.latencySum / metrics.interactions) : 0,
      success_rate: metrics.interactions > 0 ? Number(((metrics.successCount / metrics.interactions) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return fillMissingDays(chartData, start, end);
}

function generateEmptyChartData(start: Date, end: Date): AIChartDataPoint[] {
  const data: AIChartDataPoint[] = [];
  const current = new Date(start);
  
  while (current <= end) {
    data.push({
      date: current.toISOString().split('T')[0],
      interactions: 0,
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      avg_latency_ms: 0,
      success_rate: 0,
    });
    current.setDate(current.getDate() + 1);
  }
  
  return data;
}

function fillMissingDays(data: AIChartDataPoint[], start: Date, end: Date): AIChartDataPoint[] {
  const dateMap = new Map(data.map(d => [d.date, d]));
  const filled: AIChartDataPoint[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    filled.push(
      dateMap.get(dateStr) || {
        date: dateStr,
        interactions: 0,
        tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        avg_latency_ms: 0,
        success_rate: 0,
      }
    );
    current.setDate(current.getDate() + 1);
  }

  return filled;
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  // Preço médio estimado (baseado em GPT-4o-mini)
  const inputPrice = 0.15 / 1000000;  // $0.15 por 1M tokens
  const outputPrice = 0.60 / 1000000; // $0.60 por 1M tokens
  return Number(((inputTokens * inputPrice) + (outputTokens * outputPrice)).toFixed(4));
}

function calculateProviderBreakdown(interactions: any[]): ProviderBreakdown {
  const breakdown: ProviderBreakdown = {};
  const total = interactions.length;

  interactions.forEach(i => {
    const provider = i.provider || 'unknown';
    if (!breakdown[provider]) {
      breakdown[provider] = { interactions: 0, tokens: 0, cost_usd: 0, percent: 0 };
    }
    breakdown[provider].interactions++;
    breakdown[provider].tokens += (i.input_tokens || 0) + (i.output_tokens || 0);
  });

  // Calcular percentuais e custos
  Object.values(breakdown).forEach(b => {
    b.percent = total > 0 ? Number(((b.interactions / total) * 100).toFixed(2)) : 0;
    b.cost_usd = estimateCost(b.tokens * 0.4, b.tokens * 0.6); // Estimativa input/output
  });

  return breakdown;
}

function calculateModelBreakdown(interactions: any[]): ModelBreakdown {
  const breakdown: ModelBreakdown = {};
  const total = interactions.length;

  interactions.forEach(i => {
    const model = i.model || 'unknown';
    if (!breakdown[model]) {
      breakdown[model] = { provider: i.provider || 'unknown', interactions: 0, tokens: 0, cost_usd: 0, percent: 0 };
    }
    breakdown[model].interactions++;
    breakdown[model].tokens += (i.input_tokens || 0) + (i.output_tokens || 0);
  });

  Object.values(breakdown).forEach(b => {
    b.percent = total > 0 ? Number(((b.interactions / total) * 100).toFixed(2)) : 0;
    b.cost_usd = estimateCost(b.tokens * 0.4, b.tokens * 0.6);
  });

  return breakdown;
}

function calculateHourlyDistribution(interactions: any[]): AIHourlyDistribution[] {
  const byHour = new Map<number, { count: number; latencySum: number; successCount: number }>();

  interactions.forEach(i => {
    if (!i.created_at) return;
    const hour = new Date(i.created_at).getHours();
    
    if (!byHour.has(hour)) {
      byHour.set(hour, { count: 0, latencySum: 0, successCount: 0 });
    }

    const h = byHour.get(hour)!;
    h.count++;
    h.latencySum += i.response_time_ms || 0;
    if (i.status === 'success') h.successCount++;
  });

  return Array.from({ length: 24 }, (_, hour) => {
    const h = byHour.get(hour) || { count: 0, latencySum: 0, successCount: 0 };
    return {
      hour,
      interactions: h.count,
      avg_latency_ms: h.count > 0 ? Math.round(h.latencySum / h.count) : 0,
      success_rate: h.count > 0 ? Number(((h.successCount / h.count) * 100).toFixed(2)) : 0,
    };
  });
}

function calculatePerformance(interactions: any[]): PerformanceMetrics {
  const latencies = interactions
    .map(i => i.response_time_ms)
    .filter((l): l is number => l != null && l > 0)
    .sort((a, b) => a - b);

  const successCount = interactions.filter(i => i.status === 'success').length;
  const errorCount = interactions.filter(i => i.status === 'error').length;
  const timeoutCount = interactions.filter(i => i.status === 'timeout').length;
  const total = interactions.length;

  const getPercentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  return {
    avg_latency_ms: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    min_latency_ms: latencies.length > 0 ? latencies[0] : 0,
    max_latency_ms: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
    p50_latency_ms: getPercentile(latencies, 50),
    p95_latency_ms: getPercentile(latencies, 95),
    p99_latency_ms: getPercentile(latencies, 99),
    success_rate: total > 0 ? Number(((successCount / total) * 100).toFixed(2)) : 0,
    error_rate: total > 0 ? Number(((errorCount / total) * 100).toFixed(2)) : 0,
    timeout_rate: total > 0 ? Number(((timeoutCount / total) * 100).toFixed(2)) : 0,
  };
}

function calculateQuality(interactions: any[]): QualityMetrics {
  const conversationIds = [...new Set(interactions.map(i => i.conversation_id).filter(Boolean))];
  const totalConversations = conversationIds.length;

  const resolvedCount = interactions.filter(i => i.conversation_resolved).length;
  const transferredCount = interactions.filter(i => i.was_transferred).length;

  // Estimar abandono (conversas onde usuário não continuou)
  const continuedCount = interactions.filter(i => i.user_continued).length;
  const abandonmentRate = totalConversations > 0 
    ? 100 - ((continuedCount / totalConversations) * 100) - ((transferredCount / totalConversations) * 100)
    : 0;

  // Média de mensagens por conversa
  const avgMessages = totalConversations > 0 ? interactions.length / totalConversations : 0;

  return {
    resolution_rate: totalConversations > 0 ? Number(((resolvedCount / totalConversations) * 100).toFixed(2)) : 0,
    transfer_rate: totalConversations > 0 ? Number(((transferredCount / totalConversations) * 100).toFixed(2)) : 0,
    abandonment_rate: Math.max(0, Number(abandonmentRate.toFixed(2))),
    avg_messages_per_conversation: Number(avgMessages.toFixed(1)),
  };
}

function calculateErrorBreakdown(interactions: any[]): AIErrorBreakdown {
  const errors = interactions.filter(i => i.status === 'error');
  const breakdown: AIErrorBreakdown = {};
  const total = errors.length;

  errors.forEach(e => {
    const code = e.error_code || 'unknown';
    if (!breakdown[code]) {
      breakdown[code] = { count: 0, percent: 0 };
    }
    breakdown[code].count++;
    if (!breakdown[code].last_at || e.created_at > breakdown[code].last_at) {
      breakdown[code].last_at = e.created_at;
    }
  });

  Object.values(breakdown).forEach(b => {
    b.percent = total > 0 ? Number(((b.count / total) * 100).toFixed(2)) : 0;
  });

  return breakdown;
}

async function getAgentDetails(agentId: string, organizationId: string, start: Date, end: Date) {
  // Buscar agente
  const { data: agent, error: agentError } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single();

  if (agentError || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Buscar interações do período
  const { data: interactions } = await supabase
    .from('whatsapp_ai_interactions')
    .select('*')
    .eq('ai_config_id', agentId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false });

  const interactionList = interactions || [];

  // Calcular métricas
  const totalInteractions = interactionList.length;
  const uniqueConversations = new Set(interactionList.map(i => i.conversation_id).filter(Boolean)).size;
  const totalInputTokens = interactionList.reduce((sum, i) => sum + (i.input_tokens || 0), 0);
  const totalOutputTokens = interactionList.reduce((sum, i) => sum + (i.output_tokens || 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;

  const performance = calculatePerformance(interactionList);
  const quality = calculateQuality(interactionList);
  const hourlyHeatmap = calculateHourlyDistribution(interactionList);

  // Gráfico timeline
  const chartData = await getChartDataForAgent(agentId, start, end);

  // Erros
  const errorBreakdown = calculateErrorBreakdown(interactionList);
  const errors = Object.entries(errorBreakdown).map(([code, data]) => ({
    code,
    count: data.count,
    last_at: data.last_at,
  })).sort((a, b) => b.count - a.count);

  // Interações recentes
  const recentInteractions = interactionList.slice(0, 20).map(i => ({
    id: i.id,
    conversation_id: i.conversation_id,
    provider: i.provider,
    model: i.model,
    user_message: i.user_message,
    ai_response: i.ai_response,
    input_tokens: i.input_tokens,
    output_tokens: i.output_tokens,
    total_tokens: i.total_tokens,
    response_time_ms: i.response_time_ms,
    status: i.status,
    error_code: i.error_code,
    error_message: i.error_message,
    was_transferred: i.was_transferred,
    conversation_resolved: i.conversation_resolved,
    created_at: i.created_at,
  }));

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name || `Agente ${agent.id.slice(0, 8)}`,
      description: agent.description,
      provider: agent.provider,
      model: agent.model,
      temperature: agent.temperature,
      max_tokens: agent.max_tokens,
      system_prompt: agent.system_prompt,
      is_active: agent.is_active,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
    },
    metrics: {
      total_interactions: totalInteractions,
      total_conversations: uniqueConversations,
      total_tokens: totalTokens,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost_usd: agent.total_cost_usd || estimateCost(totalInputTokens, totalOutputTokens),
      avg_response_time_ms: performance.avg_latency_ms,
      avg_tokens_per_interaction: totalInteractions > 0 ? Math.round(totalTokens / totalInteractions) : 0,
      avg_cost_per_conversation: uniqueConversations > 0 
        ? Number((estimateCost(totalInputTokens, totalOutputTokens) / uniqueConversations).toFixed(4)) 
        : 0,
    },
    performance,
    quality,
    timeline: chartData,
    hourly_heatmap: hourlyHeatmap,
    recent_interactions: recentInteractions,
    errors,
  });
}

async function getChartDataForAgent(agentId: string, start: Date, end: Date): Promise<AIChartDataPoint[]> {
  const { data, error } = await supabase
    .from('whatsapp_ai_interactions')
    .select('created_at, input_tokens, output_tokens, response_time_ms, status')
    .eq('ai_config_id', agentId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (error || !data) {
    return generateEmptyChartData(start, end);
  }

  const byDay = new Map<string, {
    interactions: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    latencySum: number;
    successCount: number;
  }>();

  data.forEach((i: any) => {
    const date = i.created_at.split('T')[0];
    
    if (!byDay.has(date)) {
      byDay.set(date, { interactions: 0, tokens: 0, inputTokens: 0, outputTokens: 0, latencySum: 0, successCount: 0 });
    }

    const day = byDay.get(date)!;
    day.interactions++;
    day.inputTokens += i.input_tokens || 0;
    day.outputTokens += i.output_tokens || 0;
    day.tokens += (i.input_tokens || 0) + (i.output_tokens || 0);
    day.latencySum += i.response_time_ms || 0;
    if (i.status === 'success') day.successCount++;
  });

  const chartData: AIChartDataPoint[] = Array.from(byDay.entries())
    .map(([date, metrics]) => ({
      date,
      interactions: metrics.interactions,
      tokens: metrics.tokens,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      cost_usd: estimateCost(metrics.inputTokens, metrics.outputTokens),
      avg_latency_ms: metrics.interactions > 0 ? Math.round(metrics.latencySum / metrics.interactions) : 0,
      success_rate: metrics.interactions > 0 ? Number(((metrics.successCount / metrics.interactions) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return fillMissingDays(chartData, start, end);
}
