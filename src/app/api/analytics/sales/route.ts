import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic'

// GET - Fetch sales analytics data with multi-pipeline support
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams
  const period = searchParams.get('period') || 'month'
  const pipelineIds = searchParams.get('pipelineIds')
  const includeComparison = searchParams.get('includeComparison') === 'true'

  try {
    const now = new Date()
    let startDate: Date
    let previousStartDate: Date
    let previousEndDate: Date
    
    switch (period) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0)
        break
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1)
        previousStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1)
        previousEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1)
        previousEndDate = new Date(now.getFullYear() - 1, 11, 31)
        break
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        previousStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3months':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        previousStartDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '6months':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        previousStartDate = new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0)
    }

    const selectedPipelineIds = pipelineIds ? pipelineIds.split(',').filter(Boolean) : []

    // 1. FETCH PIPELINES - RLS filtra automaticamente
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name, color')
      .order('position', { ascending: true })

    // 2. FETCH ALL DEALS - RLS filtra automaticamente
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id, title, value, status, probability, commit_level, stage_id, pipeline_id,
        contact_id, created_at, updated_at, won_at, lost_at, expected_close_date,
        stage:pipeline_stages(id, name, color, probability, position),
        contact:contacts(id, first_name, last_name, email)
      `)

    if (selectedPipelineIds.length > 0) {
      dealsQuery = dealsQuery.in('pipeline_id', selectedPipelineIds)
    }

    const { data: allDeals, error: dealsError } = await dealsQuery
    if (dealsError) throw dealsError

    const deals = allDeals || []

    // 3. FETCH PREVIOUS PERIOD DEALS - RLS filtra automaticamente
    let previousDealsQuery = supabase
      .from('deals')
      .select('id, value, status, won_at, lost_at, created_at')
      .gte('created_at', previousStartDate.toISOString())
      .lte('created_at', previousEndDate.toISOString())

    if (selectedPipelineIds.length > 0) {
      previousDealsQuery = previousDealsQuery.in('pipeline_id', selectedPipelineIds)
    }

    const { data: previousDeals } = await previousDealsQuery

    // 4. FETCH STAGE HISTORY - RLS filtra automaticamente
    const dealIds = deals.map(d => d.id)
    let history: any[] = []
    
    if (dealIds.length > 0) {
      const { data: historyData } = await supabase
        .from('deal_stage_history')
        .select('id, deal_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, changed_at, time_in_previous_stage')
        .in('deal_id', dealIds)
        .order('changed_at', { ascending: true })
      
      history = historyData || []
    }

    // CALCULATE ALL METRICS
    const kpis = calculateMainKPIs(deals, previousDeals || [], startDate, now)
    const byCommitLevel = calculateByCommitLevel(deals)
    const byPipeline = (includeComparison || selectedPipelineIds.length === 0) 
      ? calculateByPipeline(deals, pipelines || []) 
      : null
    const funnel = calculateFunnelData(deals)
    const timeline = calculateTimelineData(deals, period)
    const velocity = calculateVelocityByStage(history, deals)
    const topDeals = getTopDeals(deals)
    const dealsAtRisk = getDealsAtRisk(deals)
    const insights = generateInsights(kpis, byPipeline, velocity, dealsAtRisk)

    return NextResponse.json({
      period,
      periodLabel: getPeriodLabel(period),
      dateRange: { start: startDate.toISOString(), end: now.toISOString() },
      pipelines: pipelines || [],
      selectedPipelineIds,
      kpis,
      byCommitLevel,
      byPipeline,
      funnel,
      timeline,
      velocity,
      topDeals,
      dealsAtRisk,
      insights,
    })
  } catch (error: any) {
    console.error('Sales analytics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function getPeriodLabel(period: string): string {
  const labels: Record<string, string> = {
    'month': 'Este Mês', 'quarter': 'Este Trimestre', 'year': 'Este Ano',
    '30days': 'Últimos 30 Dias', '3months': 'Últimos 3 Meses', '6months': 'Últimos 6 Meses',
  }
  return labels[period] || 'Este Mês'
}

function calculateMainKPIs(deals: any[], previousDeals: any[], startDate: Date, now: Date) {
  const openDeals = deals.filter(d => d.status === 'open')
  const wonDeals = deals.filter(d => d.status === 'won' && d.won_at && new Date(d.won_at) >= startDate)
  const lostDeals = deals.filter(d => d.status === 'lost' && d.lost_at && new Date(d.lost_at) >= startDate)
  
  const prevWonDeals = previousDeals.filter(d => d.status === 'won')
  const prevLostDeals = previousDeals.filter(d => d.status === 'lost')

  const pipelineTotal = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const weightedTotal = openDeals.reduce((sum, d) => {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    const prob = stage?.probability ?? d.probability ?? 50
    return sum + (d.value || 0) * (prob / 100)
  }, 0)
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const lostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const prevWonValue = prevWonDeals.reduce((sum, d) => sum + (d.value || 0), 0)

  const closedCount = wonDeals.length + lostDeals.length
  const winRate = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : 0
  const prevClosedCount = prevWonDeals.length + prevLostDeals.length
  const prevWinRate = prevClosedCount > 0 ? (prevWonDeals.length / prevClosedCount) * 100 : 0

  const avgDealValue = openDeals.length > 0 ? pipelineTotal / openDeals.length : 0
  const avgWonValue = wonDeals.length > 0 ? wonValue / wonDeals.length : 0

  const salesCycles = wonDeals.map(d => {
    const created = new Date(d.created_at)
    const won = new Date(d.won_at)
    return (won.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
  }).filter(days => days >= 0)
  const avgCycleDays = salesCycles.length > 0 ? salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length : 0

  const prevSalesCycles = prevWonDeals.map(d => {
    if (!d.won_at) return -1
    const created = new Date(d.created_at)
    const won = new Date(d.won_at)
    return (won.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
  }).filter(days => days >= 0)
  const prevAvgCycleDays = prevSalesCycles.length > 0 ? prevSalesCycles.reduce((a, b) => a + b, 0) / prevSalesCycles.length : 0

  return {
    pipelineTotal: Math.round(pipelineTotal * 100) / 100,
    weightedTotal: Math.round(weightedTotal * 100) / 100,
    wonValue: Math.round(wonValue * 100) / 100,
    lostValue: Math.round(lostValue * 100) / 100,
    openDealsCount: openDeals.length,
    wonDealsCount: wonDeals.length,
    lostDealsCount: lostDeals.length,
    winRate: Math.round(winRate * 10) / 10,
    avgDealValue: Math.round(avgDealValue),
    avgWonValue: Math.round(avgWonValue),
    avgCycleDays: Math.round(avgCycleDays * 10) / 10,
    variations: {
      wonValue: prevWonValue > 0 ? Math.round(((wonValue - prevWonValue) / prevWonValue) * 1000) / 10 : 0,
      winRate: Math.round((winRate - prevWinRate) * 10) / 10,
      avgCycleDays: Math.round((avgCycleDays - prevAvgCycleDays) * 10) / 10,
    }
  }
}

function calculateByCommitLevel(deals: any[]) {
  const openDeals = deals.filter(d => d.status === 'open')
  const levels = { omit: 0, pipeline: 0, best_case: 0, commit: 0 }
  const counts = { omit: 0, pipeline: 0, best_case: 0, commit: 0 }

  openDeals.forEach(deal => {
    const level = deal.commit_level || 'pipeline'
    if (level in levels) {
      levels[level as keyof typeof levels] += deal.value || 0
      counts[level as keyof typeof counts]++
    }
  })

  return {
    omit: { value: Math.round(levels.omit * 100) / 100, count: counts.omit },
    pipeline: { value: Math.round(levels.pipeline * 100) / 100, count: counts.pipeline },
    bestCase: { value: Math.round(levels.best_case * 100) / 100, count: counts.best_case },
    commit: { value: Math.round(levels.commit * 100) / 100, count: counts.commit },
  }
}

function calculateByPipeline(deals: any[], pipelines: any[]) {
  return pipelines.map(pipeline => {
    const pipelineDeals = deals.filter(d => d.pipeline_id === pipeline.id)
    const openDeals = pipelineDeals.filter(d => d.status === 'open')
    const wonDeals = pipelineDeals.filter(d => d.status === 'won')
    const lostDeals = pipelineDeals.filter(d => d.status === 'lost')

    const totalValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const closedCount = wonDeals.length + lostDeals.length
    const winRate = closedCount > 0 ? (wonDeals.length / closedCount) * 100 : 0
    const avgTicket = wonDeals.length > 0 ? wonValue / wonDeals.length : 0

    const salesCycles = wonDeals.map(d => {
      if (!d.won_at) return -1
      const created = new Date(d.created_at)
      const won = new Date(d.won_at)
      return (won.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    }).filter(days => days >= 0)
    const avgCycleDays = salesCycles.length > 0 ? salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length : 0

    return {
      id: pipeline.id,
      name: pipeline.name,
      color: pipeline.color || '#6366f1',
      metrics: {
        totalValue: Math.round(totalValue * 100) / 100,
        wonValue: Math.round(wonValue * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        avgTicket: Math.round(avgTicket),
        avgCycleDays: Math.round(avgCycleDays * 10) / 10,
        totalDeals: pipelineDeals.length,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
      }
    }
  })
}

function calculateFunnelData(deals: any[]) {
  const openDeals = deals.filter(d => d.status === 'open')
  const stageGroups: Record<string, { id: string; name: string; color: string; position: number; count: number; value: number; probability: number }> = {}

  openDeals.forEach(deal => {
    const stage = Array.isArray(deal.stage) ? deal.stage[0] : deal.stage
    if (!stage) return

    if (!stageGroups[stage.id]) {
      stageGroups[stage.id] = { id: stage.id, name: stage.name, color: stage.color, position: stage.position, probability: stage.probability || 50, count: 0, value: 0 }
    }
    stageGroups[stage.id].count++
    stageGroups[stage.id].value += deal.value || 0
  })

  const sortedStages = Object.values(stageGroups).sort((a, b) => a.position - b.position)
  const firstStageCount = sortedStages[0]?.count || 1

  return sortedStages.map(stage => ({
    ...stage,
    value: Math.round(stage.value * 100) / 100,
    weightedValue: Math.round(stage.value * (stage.probability / 100) * 100) / 100,
    percentage: Math.round((stage.count / firstStageCount) * 100),
  }))
}

function calculateTimelineData(deals: any[], period: string) {
  const useWeeks = period === '30days'
  const groupedData: Record<string, { created: number; won: number; lost: number; wonValue: number; lostValue: number }> = {}

  deals.forEach(deal => {
    const date = new Date(deal.created_at)
    const key = useWeeks 
      ? (() => { const d = new Date(date); d.setDate(date.getDate() - date.getDay()); return d.toISOString().split('T')[0] })()
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!groupedData[key]) groupedData[key] = { created: 0, won: 0, lost: 0, wonValue: 0, lostValue: 0 }
    groupedData[key].created++

    if (deal.status === 'won') { groupedData[key].won++; groupedData[key].wonValue += deal.value || 0 }
    else if (deal.status === 'lost') { groupedData[key].lost++; groupedData[key].lostValue += deal.value || 0 }
  })

  return Object.entries(groupedData)
    .map(([date, data]) => ({
      date,
      label: useWeeks 
        ? new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : new Date(date + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function calculateVelocityByStage(history: any[], deals: any[]) {
  const stageInfo: Record<string, { name: string; position: number }> = {}
  deals.forEach(deal => {
    const stage = Array.isArray(deal.stage) ? deal.stage[0] : deal.stage
    if (stage) stageInfo[stage.id] = { name: stage.name, position: stage.position }
  })

  const stageTimeData: Record<string, { totalHours: number; count: number }> = {}

  history.forEach(h => {
    if (!h.from_stage_id || !h.time_in_previous_stage) return
    if (!stageTimeData[h.from_stage_id]) stageTimeData[h.from_stage_id] = { totalHours: 0, count: 0 }

    const hours = (typeof h.time_in_previous_stage === 'number' ? h.time_in_previous_stage : parseInterval(h.time_in_previous_stage)) / 3600
    stageTimeData[h.from_stage_id].totalHours += hours
    stageTimeData[h.from_stage_id].count++
  })

  return Object.entries(stageTimeData)
    .map(([stageId, data]) => ({
      stageId,
      stageName: stageInfo[stageId]?.name || history.find(h => h.from_stage_id === stageId)?.from_stage_name || 'Unknown',
      position: stageInfo[stageId]?.position || 0,
      avgHours: data.count > 0 ? Math.round((data.totalHours / data.count) * 10) / 10 : 0,
      avgDays: data.count > 0 ? Math.round((data.totalHours / data.count / 24) * 10) / 10 : 0,
      transitions: data.count,
    }))
    .sort((a, b) => a.position - b.position)
}

function parseInterval(interval: string): number {
  if (!interval) return 0
  let totalSeconds = 0
  const daysMatch = interval.match(/(\d+)\s*days?/i)
  if (daysMatch) totalSeconds += parseInt(daysMatch[1]) * 86400
  const timeMatch = interval.match(/(\d{1,2}):(\d{2}):(\d{2})/)
  if (timeMatch) { totalSeconds += parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) }
  return totalSeconds
}

function getTopDeals(deals: any[]) {
  return deals
    .filter(d => d.status === 'open')
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5)
    .map(d => {
      const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
      const contact = Array.isArray(d.contact) ? d.contact[0] : d.contact
      return {
        id: d.id, title: d.title, value: d.value || 0,
        probability: stage?.probability ?? d.probability ?? 50,
        stageName: stage?.name || 'Unknown', stageColor: stage?.color || '#6366f1',
        contactName: contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email : null,
        createdAt: d.created_at, expectedCloseDate: d.expected_close_date,
      }
    })
}

function getDealsAtRisk(deals: any[], daysThreshold: number = 7) {
  const now = new Date()
  const threshold = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000)

  return deals
    .filter(d => d.status === 'open' && new Date(d.updated_at) < threshold)
    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
    .slice(0, 10)
    .map(d => {
      const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
      return {
        id: d.id, title: d.title, value: d.value || 0,
        stageName: stage?.name || 'Unknown', stageColor: stage?.color || '#6366f1',
        daysSinceUpdate: Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
        updatedAt: d.updated_at,
      }
    })
}

function generateInsights(kpis: any, byPipeline: any[] | null, velocity: any[], dealsAtRisk: any[]) {
  const insights: { type: 'positive' | 'negative' | 'neutral'; message: string }[] = []

  if (kpis.variations.winRate > 5) {
    insights.push({ type: 'positive', message: `Taxa de conversão aumentou ${kpis.variations.winRate.toFixed(1)}% vs período anterior` })
  } else if (kpis.variations.winRate < -5) {
    insights.push({ type: 'negative', message: `Taxa de conversão caiu ${Math.abs(kpis.variations.winRate).toFixed(1)}% vs período anterior` })
  }

  if (kpis.variations.avgCycleDays < -1) {
    insights.push({ type: 'positive', message: `Ciclo de vendas diminuiu ${Math.abs(kpis.variations.avgCycleDays).toFixed(1)} dias` })
  } else if (kpis.variations.avgCycleDays > 1) {
    insights.push({ type: 'negative', message: `Ciclo de vendas aumentou ${kpis.variations.avgCycleDays.toFixed(1)} dias` })
  }

  if (byPipeline && byPipeline.length > 1) {
    const sorted = [...byPipeline].sort((a, b) => b.metrics.winRate - a.metrics.winRate)
    if (sorted[0].metrics.winRate > 0 && sorted[1]?.metrics.winRate > 0) {
      const diff = sorted[0].metrics.winRate - sorted[1].metrics.winRate
      if (diff > 10) {
        insights.push({ type: 'neutral', message: `${sorted[0].name} tem ${Math.round(diff)}% mais conversão que ${sorted[1].name}` })
      }
    }
  }

  if (dealsAtRisk.length > 0) {
    const totalValue = dealsAtRisk.reduce((sum, d) => sum + d.value, 0)
    insights.push({ type: 'negative', message: `${dealsAtRisk.length} deals (R$ ${totalValue.toLocaleString('pt-BR')}) parados há mais de 7 dias` })
  }

  if (velocity.length > 0) {
    const slowest = velocity.reduce((max, v) => v.avgDays > max.avgDays ? v : max, velocity[0])
    if (slowest.avgDays > 5) {
      insights.push({ type: 'neutral', message: `Deals ficam em média ${slowest.avgDays} dias no estágio "${slowest.stageName}"` })
    }
  }

  return insights
}
