import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// GET - Fetch sales analytics data
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')
  const period = searchParams.get('period') || '6months' // 30days, 3months, 6months, 12months, all
  const pipelineId = searchParams.get('pipelineId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required' }, { status: 400 })
  }

  try {
    // Calculate date range
    const now = new Date()
    let startDate: Date
    
    switch (period) {
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3months':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case '6months':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
        break
      case '12months':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date('2020-01-01')
    }

    // Build base query conditions
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        status,
        probability,
        commit_level,
        stage_id,
        pipeline_id,
        created_at,
        updated_at,
        won_at,
        lost_at,
        stage:pipeline_stages(id, name, color, probability, position)
      `)
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
    }

    const { data: deals, error: dealsError } = await dealsQuery

    if (dealsError) throw dealsError

    // Get stage history for velocity analysis
    let historyQuery = supabase
      .from('deal_stage_history')
      .select(`
        id,
        deal_id,
        from_stage_id,
        to_stage_id,
        changed_at,
        time_in_previous_stage,
        from_stage:pipeline_stages!deal_stage_history_from_stage_id_fkey(name),
        to_stage:pipeline_stages!deal_stage_history_to_stage_id_fkey(name, position)
      `)
      .gte('changed_at', startDate.toISOString())
      .order('changed_at', { ascending: true })

    // Filter by organization through deals
    const dealIds = deals?.map(d => d.id) || []
    if (dealIds.length > 0) {
      historyQuery = historyQuery.in('deal_id', dealIds)
    }

    const { data: history } = await historyQuery

    // Calculate timeline data (monthly/weekly aggregation)
    const timelineData = calculateTimelineData(deals || [], period)

    // Calculate funnel conversion rates
    const funnelData = calculateFunnelData(deals || [])

    // Calculate win/loss analysis
    const winLossData = calculateWinLossData(deals || [], period)

    // Calculate velocity metrics over time
    const velocityData = calculateVelocityData(history || [], period)

    // Calculate performance by stage
    const stagePerformance = calculateStagePerformance(deals || [], history || [])

    // Calculate top performers (deals and contacts)
    const topDeals = getTopDeals(deals || [])

    // Summary KPIs
    const kpis = calculateKPIs(deals || [], startDate)

    return NextResponse.json({
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
      },
      kpis,
      timeline: timelineData,
      funnel: funnelData,
      winLoss: winLossData,
      velocity: velocityData,
      stagePerformance,
      topDeals,
    })
  } catch (error: any) {
    console.error('Sales analytics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function calculateKPIs(deals: any[], startDate: Date) {
  const now = new Date()
  const previousStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))

  // Current period
  const wonDeals = deals.filter(d => d.status === 'won')
  const lostDeals = deals.filter(d => d.status === 'lost')
  const openDeals = deals.filter(d => d.status === 'open')

  const totalWonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const totalLostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const totalOpenValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const weightedPipeline = openDeals.reduce((sum, d) => {
    const prob = d.stage?.probability ?? d.probability ?? 50
    return sum + (d.value || 0) * (prob / 100)
  }, 0)

  const totalDeals = deals.length
  const closedDeals = wonDeals.length + lostDeals.length
  const winRate = closedDeals > 0 ? (wonDeals.length / closedDeals) * 100 : 0

  // Average deal size
  const avgDealSize = wonDeals.length > 0 ? totalWonValue / wonDeals.length : 0

  // Average sales cycle (from creation to won)
  const salesCycles = wonDeals
    .filter(d => d.won_at && d.created_at)
    .map(d => {
      const created = new Date(d.created_at)
      const won = new Date(d.won_at)
      return (won.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    })
  const avgSalesCycle = salesCycles.length > 0
    ? salesCycles.reduce((a, b) => a + b, 0) / salesCycles.length
    : 0

  return {
    totalDeals,
    wonDeals: wonDeals.length,
    lostDeals: lostDeals.length,
    openDeals: openDeals.length,
    totalWonValue,
    totalLostValue,
    totalOpenValue,
    weightedPipeline,
    winRate: Math.round(winRate * 10) / 10,
    avgDealSize: Math.round(avgDealSize),
    avgSalesCycle: Math.round(avgSalesCycle * 10) / 10,
  }
}

function calculateTimelineData(deals: any[], period: string) {
  // Group by month or week depending on period
  const useWeeks = period === '30days'
  const groupedData: Record<string, { created: number; won: number; lost: number; wonValue: number; lostValue: number }> = {}

  deals.forEach(deal => {
    const date = new Date(deal.created_at)
    let key: string

    if (useWeeks) {
      // Week number
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      key = weekStart.toISOString().split('T')[0]
    } else {
      // Month
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    if (!groupedData[key]) {
      groupedData[key] = { created: 0, won: 0, lost: 0, wonValue: 0, lostValue: 0 }
    }

    groupedData[key].created++

    if (deal.status === 'won') {
      groupedData[key].won++
      groupedData[key].wonValue += deal.value || 0
    } else if (deal.status === 'lost') {
      groupedData[key].lost++
      groupedData[key].lostValue += deal.value || 0
    }
  })

  // Convert to array and sort
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

function calculateFunnelData(deals: any[]) {
  // Group by stage position
  const stageGroups: Record<string, { name: string; color: string; position: number; count: number; value: number }> = {}

  deals.forEach(deal => {
    const stage = Array.isArray(deal.stage) ? deal.stage[0] : deal.stage
    if (!stage) return

    const key = stage.id
    if (!stageGroups[key]) {
      stageGroups[key] = {
        name: stage.name,
        color: stage.color,
        position: stage.position,
        count: 0,
        value: 0,
      }
    }

    stageGroups[key].count++
    stageGroups[key].value += deal.value || 0
  })

  return Object.values(stageGroups)
    .sort((a, b) => a.position - b.position)
    .map((stage, index, arr) => ({
      ...stage,
      conversionRate: index === 0 ? 100 : Math.round((stage.count / arr[0].count) * 100),
    }))
}

function calculateWinLossData(deals: any[], period: string) {
  const useWeeks = period === '30days'
  const groupedData: Record<string, { won: number; lost: number; winRate: number }> = {}

  // Group closed deals by period
  const closedDeals = deals.filter(d => d.status === 'won' || d.status === 'lost')

  closedDeals.forEach(deal => {
    const date = new Date(deal.won_at || deal.lost_at || deal.updated_at)
    let key: string

    if (useWeeks) {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      key = weekStart.toISOString().split('T')[0]
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    if (!groupedData[key]) {
      groupedData[key] = { won: 0, lost: 0, winRate: 0 }
    }

    if (deal.status === 'won') {
      groupedData[key].won++
    } else {
      groupedData[key].lost++
    }
  })

  // Calculate win rates
  Object.values(groupedData).forEach(data => {
    const total = data.won + data.lost
    data.winRate = total > 0 ? Math.round((data.won / total) * 100) : 0
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

function calculateVelocityData(history: any[], period: string) {
  const useWeeks = period === '30days'
  const groupedData: Record<string, { totalDays: number; count: number }> = {}

  history.forEach(h => {
    if (!h.time_in_previous_stage) return

    const date = new Date(h.changed_at)
    let key: string

    if (useWeeks) {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      key = weekStart.toISOString().split('T')[0]
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    if (!groupedData[key]) {
      groupedData[key] = { totalDays: 0, count: 0 }
    }

    // Convert seconds to days
    const days = h.time_in_previous_stage / (60 * 60 * 24)
    groupedData[key].totalDays += days
    groupedData[key].count++
  })

  return Object.entries(groupedData)
    .map(([date, data]) => ({
      date,
      label: useWeeks
        ? new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : new Date(date + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      avgDays: data.count > 0 ? Math.round((data.totalDays / data.count) * 10) / 10 : 0,
      transitions: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function calculateStagePerformance(deals: any[], history: any[]) {
  const stageStats: Record<string, {
    name: string
    color: string
    position: number
    currentDeals: number
    currentValue: number
    avgTimeInStage: number
    conversionToNext: number
  }> = {}

  // Count current deals per stage
  deals.forEach(deal => {
    const stage = Array.isArray(deal.stage) ? deal.stage[0] : deal.stage
    if (!stage) return

    if (!stageStats[stage.id]) {
      stageStats[stage.id] = {
        name: stage.name,
        color: stage.color,
        position: stage.position,
        currentDeals: 0,
        currentValue: 0,
        avgTimeInStage: 0,
        conversionToNext: 0,
      }
    }

    if (deal.status === 'open') {
      stageStats[stage.id].currentDeals++
      stageStats[stage.id].currentValue += deal.value || 0
    }
  })

  // Calculate avg time from history
  const stageTimeData: Record<string, { totalTime: number; count: number }> = {}

  history.forEach(h => {
    if (!h.from_stage_id || !h.time_in_previous_stage) return

    if (!stageTimeData[h.from_stage_id]) {
      stageTimeData[h.from_stage_id] = { totalTime: 0, count: 0 }
    }

    stageTimeData[h.from_stage_id].totalTime += h.time_in_previous_stage / (60 * 60 * 24) // to days
    stageTimeData[h.from_stage_id].count++
  })

  Object.entries(stageTimeData).forEach(([stageId, data]) => {
    if (stageStats[stageId]) {
      stageStats[stageId].avgTimeInStage = data.count > 0
        ? Math.round((data.totalTime / data.count) * 10) / 10
        : 0
    }
  })

  return Object.values(stageStats).sort((a, b) => a.position - b.position)
}

function getTopDeals(deals: any[]) {
  return deals
    .filter(d => d.status === 'open')
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5)
    .map(d => ({
      id: d.id,
      title: d.title,
      value: d.value || 0,
      probability: d.stage?.probability ?? d.probability ?? 50,
      stageName: Array.isArray(d.stage) ? d.stage[0]?.name : d.stage?.name,
      stageColor: Array.isArray(d.stage) ? d.stage[0]?.color : d.stage?.color,
      createdAt: d.created_at,
    }))
}
