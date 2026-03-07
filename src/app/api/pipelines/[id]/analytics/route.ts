// =============================================
// API: Pipeline Analytics - Dashboard Específica
// src/app/api/pipelines/[id]/analytics/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

interface PipelineAnalyticsParams {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: PipelineAnalyticsParams) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { supabase, user } = auth
    const organizationId = user.organization_id
    const pipelineId = params.id

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Calcular datas
    const now = new Date()
    let start: Date
    let end: Date = new Date()

    switch (period) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0))
        break
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7))
        break
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1))
        break
      case 'quarter':
        start = new Date(now.setMonth(now.getMonth() - 3))
        break
      case 'year':
        start = new Date(now.setFullYear(now.getFullYear() - 1))
        break
      case 'custom':
        start = startDate ? new Date(startDate) : new Date(now.setMonth(now.getMonth() - 1))
        end = endDate ? new Date(endDate) : new Date()
        break
      default:
        start = new Date(now.setMonth(now.getMonth() - 1))
    }

    // Buscar pipeline com stages
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .select(`
        id,
        name,
        color,
        description,
        stages:pipeline_stages(
          id,
          name,
          color,
          position,
          is_won,
          is_lost,
          probability
        )
      `)
      .eq('id', pipelineId)
      .eq('organization_id', organizationId)
      .single()

    if (pipelineError || !pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    }

    // Ordenar stages por posição
    const stages = (pipeline.stages || []).sort((a: any, b: any) => a.position - b.position)

    // Buscar todos os deals desta pipeline no período
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        currency,
        stage_id,
        status,
        created_at,
        updated_at,
        closed_at,
        expected_close_date,
        contact_id,
        owner_id,
        source,
        tags,
        contacts:contact_id(id, name, email, phone),
        users:owner_id(id, name, email)
      `)
      .eq('pipeline_id', pipelineId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })

    if (dealsError) {
      console.error('[Pipeline Analytics] Error fetching deals:', dealsError)
      return NextResponse.json({ error: dealsError.message }, { status: 500 })
    }

    // Buscar transições de stage para calcular velocidade
    const { data: transitions } = await supabase
      .from('deal_stage_transitions')
      .select('*')
      .in('deal_id', deals?.map(d => d.id) || [])
      .gte('created_at', start.toISOString())

    // Calcular KPIs principais
    const allDeals = deals || []
    const wonDeals = allDeals.filter(d => d.status === 'won')
    const lostDeals = allDeals.filter(d => d.status === 'lost')
    const openDeals = allDeals.filter(d => d.status === 'open')

    const totalValue = allDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const lostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0)
    const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)

    const winRate = wonDeals.length + lostDeals.length > 0
      ? (wonDeals.length / (wonDeals.length + lostDeals.length)) * 100
      : 0

    const avgTicket = wonDeals.length > 0
      ? wonValue / wonDeals.length
      : allDeals.length > 0
        ? totalValue / allDeals.length
        : 0

    // Calcular ciclo médio de vendas
    const cycleTimeDeals = wonDeals.filter(d => d.closed_at && d.created_at)
    const avgCycleDays = cycleTimeDeals.length > 0
      ? cycleTimeDeals.reduce((sum, d) => {
          const start = new Date(d.created_at)
          const end = new Date(d.closed_at!)
          return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
        }, 0) / cycleTimeDeals.length
      : 0

    // Calcular funil de vendas
    const funnel = stages.map((stage: any) => {
      const stageDeals = allDeals.filter(d => d.stage_id === stage.id)
      const stageValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
      const weightedValue = stageValue * (stage.probability / 100)

      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        probability: stage.probability,
        isWon: stage.is_won,
        isLost: stage.is_lost,
        count: stageDeals.length,
        value: stageValue,
        weightedValue,
        percentage: allDeals.length > 0 ? (stageDeals.length / allDeals.length) * 100 : 0,
        avgTimeInStage: calculateAvgTimeInStage(stage.id, transitions || []),
      }
    })

    // Calcular velocidade por stage
    const velocity = stages.map((stage: any) => {
      const stageTransitions = (transitions || []).filter(t => t.to_stage_id === stage.id)
      const avgHours = stageTransitions.length > 0
        ? stageTransitions.reduce((sum, t) => {
            if (t.duration_seconds) {
              return sum + t.duration_seconds / 3600
            }
            return sum
          }, 0) / stageTransitions.length
        : 0

      return {
        stageId: stage.id,
        stageName: stage.name,
        position: stage.position,
        avgHours,
        avgDays: avgHours / 24,
        transitions: stageTransitions.length,
      }
    })

    // Top 10 deals em aberto
    const topDeals = openDeals
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 10)
      .map(d => {
        const stage = stages.find((s: any) => s.id === d.stage_id)
        return {
          id: d.id,
          title: d.title,
          value: d.value || 0,
          stageName: stage?.name || 'Unknown',
          stageColor: stage?.color || '#6366f1',
          probability: stage?.probability || 0,
          contactName: Array.isArray(d.contacts) ? d.contacts[0]?.name : (d.contacts as any)?.name || null,
          createdAt: d.created_at,
          expectedCloseDate: d.expected_close_date,
        }
      })

    // Deals em risco (sem atualização há mais de 7 dias)
    const riskThresholdDays = 7
    const dealsAtRisk = openDeals
      .filter(d => {
        const lastUpdate = new Date(d.updated_at)
        const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
        return daysSinceUpdate > riskThresholdDays
      })
      .sort((a, b) => {
        const daysA = (Date.now() - new Date(a.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        const daysB = (Date.now() - new Date(b.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        return daysB - daysA
      })
      .slice(0, 10)
      .map(d => {
        const stage = stages.find((s: any) => s.id === d.stage_id)
        const daysSinceUpdate = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        return {
          id: d.id,
          title: d.title,
          value: d.value || 0,
          stageName: stage?.name || 'Unknown',
          stageColor: stage?.color || '#6366f1',
          daysSinceUpdate,
          updatedAt: d.updated_at,
        }
      })

    // Timeline de deals ganhos/perdidos (últimos 30 dias agrupado por semana)
    const timeline = calculateTimeline(allDeals, 'week')

    // Deals por source
    const dealsBySource = allDeals.reduce((acc: Record<string, { count: number; value: number }>, deal) => {
      const source = deal.source || 'direct'
      if (!acc[source]) {
        acc[source] = { count: 0, value: 0 }
      }
      acc[source].count++
      acc[source].value += deal.value || 0
      return acc
    }, {})

    // Deals por owner
    const dealsByOwner = allDeals.reduce((acc: Record<string, { name: string; count: number; value: number; won: number; lost: number }>, deal) => {
      const ownerId = deal.owner_id || 'unassigned'
      const ownerName = deal.users?.name || 'Sem atribuição'
      if (!acc[ownerId]) {
        acc[ownerId] = { name: ownerName, count: 0, value: 0, won: 0, lost: 0 }
      }
      acc[ownerId].count++
      acc[ownerId].value += deal.value || 0
      if (deal.status === 'won') acc[ownerId].won++
      if (deal.status === 'lost') acc[ownerId].lost++
      return acc
    }, {})

    // Conversão entre stages
    const stageConversions = calculateStageConversions(stages, allDeals, transitions || [])

    // Insights automáticos
    const insights = generateInsights({
      winRate,
      avgCycleDays,
      dealsAtRisk: dealsAtRisk.length,
      totalDeals: allDeals.length,
      openValue,
      funnel,
    })

    // Previsão (forecast)
    const forecast = {
      pipeline: openValue,
      weighted: funnel.reduce((sum, s) => sum + s.weightedValue, 0),
      committed: funnel
        .filter(s => s.probability >= 75)
        .reduce((sum, s) => sum + s.value, 0),
      bestCase: funnel
        .filter(s => s.probability >= 50)
        .reduce((sum, s) => sum + s.value, 0),
    }

    return NextResponse.json({
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
        color: pipeline.color,
        description: pipeline.description,
      },
      period: {
        label: getPeriodLabel(period),
        start: start.toISOString(),
        end: end.toISOString(),
      },
      kpis: {
        totalDeals: allDeals.length,
        openDeals: openDeals.length,
        wonDeals: wonDeals.length,
        lostDeals: lostDeals.length,
        totalValue,
        openValue,
        wonValue,
        lostValue,
        winRate,
        avgTicket,
        avgCycleDays,
      },
      funnel,
      velocity,
      topDeals,
      dealsAtRisk,
      timeline,
      dealsBySource: Object.entries(dealsBySource).map(([source, data]) => ({
        source,
        ...data,
      })),
      dealsByOwner: Object.entries(dealsByOwner).map(([id, data]) => ({
        id,
        ...data,
        winRate: data.won + data.lost > 0 ? (data.won / (data.won + data.lost)) * 100 : 0,
      })),
      stageConversions,
      forecast,
      insights,
    })

  } catch (error: any) {
    console.error('[Pipeline Analytics] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helpers
function calculateAvgTimeInStage(stageId: string, transitions: any[]): number {
  const stageTransitions = transitions.filter(t => t.from_stage_id === stageId && t.duration_seconds)
  if (stageTransitions.length === 0) return 0

  const totalHours = stageTransitions.reduce((sum, t) => sum + (t.duration_seconds / 3600), 0)
  return totalHours / stageTransitions.length
}

function calculateTimeline(deals: any[], groupBy: 'day' | 'week' | 'month'): any[] {
  const groups: Record<string, { label: string; wonValue: number; wonCount: number; lostValue: number; lostCount: number; createdCount: number }> = {}

  deals.forEach(deal => {
    const date = new Date(deal.created_at)
    let key: string
    let label: string

    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0]
        label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        break
      case 'week':
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        key = weekStart.toISOString().split('T')[0]
        label = `Sem ${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
        break
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        label = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        break
    }

    if (!groups[key]) {
      groups[key] = { label, wonValue: 0, wonCount: 0, lostValue: 0, lostCount: 0, createdCount: 0 }
    }

    groups[key].createdCount++

    if (deal.status === 'won') {
      groups[key].wonValue += deal.value || 0
      groups[key].wonCount++
    } else if (deal.status === 'lost') {
      groups[key].lostValue += deal.value || 0
      groups[key].lostCount++
    }
  })

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({ date: key, ...data }))
}

function calculateStageConversions(stages: any[], deals: any[], transitions: any[]): any[] {
  const result: any[] = []

  for (let i = 0; i < stages.length - 1; i++) {
    const fromStage = stages[i]
    const toStage = stages[i + 1]

    // Contar transições entre estes stages
    const stageTransitions = transitions.filter(
      t => t.from_stage_id === fromStage.id && t.to_stage_id === toStage.id
    )

    // Contar deals que passaram pelo fromStage
    const dealsInFromStage = deals.filter(d => {
      const dealTransitions = transitions.filter(t => t.deal_id === d.id)
      return dealTransitions.some(t => t.from_stage_id === fromStage.id || t.to_stage_id === fromStage.id)
    })

    const conversionRate = dealsInFromStage.length > 0
      ? (stageTransitions.length / dealsInFromStage.length) * 100
      : 0

    result.push({
      from: { id: fromStage.id, name: fromStage.name, color: fromStage.color },
      to: { id: toStage.id, name: toStage.name, color: toStage.color },
      transitions: stageTransitions.length,
      conversionRate: Math.min(conversionRate, 100),
    })
  }

  return result
}

function generateInsights(data: {
  winRate: number
  avgCycleDays: number
  dealsAtRisk: number
  totalDeals: number
  openValue: number
  funnel: any[]
}): Array<{ type: 'positive' | 'negative' | 'neutral'; message: string }> {
  const insights: Array<{ type: 'positive' | 'negative' | 'neutral'; message: string }> = []

  // Win rate
  if (data.winRate >= 40) {
    insights.push({
      type: 'positive',
      message: `Taxa de conversão de ${data.winRate.toFixed(1)}% está acima da média do mercado`,
    })
  } else if (data.winRate < 20 && data.totalDeals > 10) {
    insights.push({
      type: 'negative',
      message: `Taxa de conversão de ${data.winRate.toFixed(1)}% está baixa. Revise o processo de qualificação`,
    })
  }

  // Deals at risk
  if (data.dealsAtRisk > 0) {
    insights.push({
      type: 'negative',
      message: `${data.dealsAtRisk} deals estão parados há mais de 7 dias e precisam de atenção`,
    })
  }

  // Ciclo de vendas
  if (data.avgCycleDays > 0) {
    if (data.avgCycleDays < 14) {
      insights.push({
        type: 'positive',
        message: `Ciclo de vendas de ${data.avgCycleDays.toFixed(0)} dias é considerado rápido`,
      })
    } else if (data.avgCycleDays > 60) {
      insights.push({
        type: 'neutral',
        message: `Ciclo de vendas de ${data.avgCycleDays.toFixed(0)} dias. Considere acelerar o processo`,
      })
    }
  }

  // Funil - gargalos
  const bottleneck = data.funnel.reduce((prev, curr) => {
    if (!prev) return curr
    if (curr.avgTimeInStage > prev.avgTimeInStage && !curr.isWon && !curr.isLost) return curr
    return prev
  }, null as any)

  if (bottleneck && bottleneck.avgTimeInStage > 48) {
    insights.push({
      type: 'neutral',
      message: `Stage "${bottleneck.name}" tem tempo médio de ${(bottleneck.avgTimeInStage / 24).toFixed(1)} dias. Pode ser um gargalo`,
    })
  }

  // Pipeline value
  if (data.openValue > 0) {
    const weighted = data.funnel.reduce((sum, s) => sum + s.weightedValue, 0)
    insights.push({
      type: 'neutral',
      message: `Pipeline de R$ ${(data.openValue / 1000).toFixed(1)}k com valor ponderado de R$ ${(weighted / 1000).toFixed(1)}k`,
    })
  }

  return insights
}

function getPeriodLabel(period: string): string {
  const labels: Record<string, string> = {
    today: 'Hoje',
    week: 'Última semana',
    month: 'Último mês',
    quarter: 'Último trimestre',
    year: 'Último ano',
    custom: 'Período personalizado',
  }
  return labels[period] || 'Último mês'
}
