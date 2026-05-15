import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// =============================================
// Types
// =============================================

interface DateRange {
  start: string
  end: string
}

interface ReportData {
  revenue: RevenueReport
  conversions: ConversionReport
  channels: ChannelReport
  roi: ROIReport
  sales: SalesReport
  trends: TrendData[]
}

interface RevenueReport {
  total: number
  growth: number
  average_ticket: number
  deals_closed: number
  target: number
  target_progress: number
}

interface ConversionReport {
  total_leads: number
  qualified_leads: number
  opportunities: number
  deals_won: number
  deals_lost: number
  conversion_rate: number
  qualification_rate: number
  win_rate: number
  average_cycle_days: number
}

interface ChannelReport {
  channels: Array<{
    name: string
    leads: number
    conversions: number
    revenue: number
    conversion_rate: number
    cost?: number
    roi?: number
  }>
}

interface ROIReport {
  total_investment: number
  total_return: number
  roi_percentage: number
  cac: number
  ltv: number
  ltv_cac_ratio: number
  payback_months: number
  campaigns: Array<{
    name: string
    investment: number
    return_value: number
    roi: number
    leads_generated: number
    conversions: number
  }>
}

interface SalesReport {
  by_agent: Array<{
    agent_id: string
    agent_name: string
    leads_assigned: number
    deals_won: number
    deals_lost: number
    revenue: number
    win_rate: number
    average_ticket: number
  }>
  by_product: Array<{
    product_name: string
    units_sold: number
    revenue: number
    average_price: number
  }>
  by_stage: Array<{
    stage_name: string
    deals_count: number
    total_value: number
    average_time_days: number
  }>
}

interface TrendData {
  date: string
  leads: number
  conversions: number
  revenue: number
}

// =============================================
// GET - Generate reports
// =============================================

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerComponentClient({ cookies })
    const { searchParams } = new URL(request.url)

    // Resolve the authenticated user and the set of orgs they own;
    // only those can be queried. Before this guard, ?organization_id=...
    // from the URL was trusted as-is — any session could pull any
    // org's revenue/conversions/channels by guessing the UUID.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
    const ownedOrgs = new Set<string>(
      [profile?.organization_id, ...((memberships || []).map((m: any) => m.organization_id))]
        .filter(Boolean)
    )

    const requested = searchParams.get('organization_id')
    const organizationId =
      requested && ownedOrgs.has(requested) ? requested : profile?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    const reportType = searchParams.get('type') || 'all'
    const period = searchParams.get('period') || '30d'
    const pipelineId = searchParams.get('pipeline_id')
    const storeId = searchParams.get('store_id')

    // Calculate date range
    const dateRange = getDateRange(period)

    // Generate reports based on type
    let report: Partial<ReportData> = {}

    switch (reportType) {
      case 'revenue':
        report.revenue = await generateRevenueReport(supabase, organizationId, dateRange, pipelineId)
        break
      case 'conversions':
        report.conversions = await generateConversionReport(supabase, organizationId, dateRange, pipelineId)
        break
      case 'channels':
        report.channels = await generateChannelReport(supabase, organizationId, dateRange)
        break
      case 'roi':
        report.roi = await generateROIReport(supabase, organizationId, dateRange)
        break
      case 'sales':
        report.sales = await generateSalesReport(supabase, organizationId, dateRange, pipelineId)
        break
      case 'trends':
        report.trends = await generateTrendData(supabase, organizationId, dateRange)
        break
      case 'all':
      default:
        const [revenue, conversions, channels, roi, sales, trends] = await Promise.all([
          generateRevenueReport(supabase, organizationId, dateRange, pipelineId),
          generateConversionReport(supabase, organizationId, dateRange, pipelineId),
          generateChannelReport(supabase, organizationId, dateRange),
          generateROIReport(supabase, organizationId, dateRange),
          generateSalesReport(supabase, organizationId, dateRange, pipelineId),
          generateTrendData(supabase, organizationId, dateRange),
        ])
        report = { revenue, conversions, channels, roi, sales, trends }
    }

    return NextResponse.json({
      report,
      period,
      dateRange,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Reports] GET error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// Helper Functions
// =============================================

function getDateRange(period: string): DateRange {
  const end = new Date()
  const start = new Date()

  switch (period) {
    case '7d':
      start.setDate(end.getDate() - 7)
      break
    case '30d':
      start.setDate(end.getDate() - 30)
      break
    case '90d':
      start.setDate(end.getDate() - 90)
      break
    case '1y':
      start.setFullYear(end.getFullYear() - 1)
      break
    case 'mtd': // Month to date
      start.setDate(1)
      break
    case 'ytd': // Year to date
      start.setMonth(0, 1)
      break
    default:
      start.setDate(end.getDate() - 30)
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

// =============================================
// Revenue Report
// =============================================

async function generateRevenueReport(
  supabase: any,
  organizationId: string,
  dateRange: DateRange,
  pipelineId?: string | null
): Promise<RevenueReport> {
  // Get won deals in period
  let query = supabase
    .from('deals')
    .select('value, closed_at')
    .eq('organization_id', organizationId)
    .eq('status', 'won')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end)

  if (pipelineId) {
    query = query.eq('pipeline_id', pipelineId)
  }

  const { data: wonDeals, error } = await query

  if (error) {
    console.error('[Reports] Revenue query error:', error)
    return {
      total: 0,
      growth: 0,
      average_ticket: 0,
      deals_closed: 0,
      target: 100000,
      target_progress: 0,
    }
  }

  const total = wonDeals?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0
  const dealsCount = wonDeals?.length || 0
  const avgTicket = dealsCount > 0 ? total / dealsCount : 0

  // Get previous period for growth calculation
  const prevPeriodDays = Math.ceil((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (1000 * 60 * 60 * 24))
  const prevStart = new Date(dateRange.start)
  prevStart.setDate(prevStart.getDate() - prevPeriodDays)
  const prevEnd = new Date(dateRange.start)

  let prevQuery = supabase
    .from('deals')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('status', 'won')
    .gte('closed_at', prevStart.toISOString())
    .lt('closed_at', prevEnd.toISOString())

  if (pipelineId) {
    prevQuery = prevQuery.eq('pipeline_id', pipelineId)
  }

  const { data: prevDeals } = await prevQuery

  const prevTotal = prevDeals?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0
  const growth = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0

  // Get target from settings (mock for now)
  const target = 100000
  const targetProgress = target > 0 ? (total / target) * 100 : 0

  return {
    total,
    growth: Math.round(growth * 10) / 10,
    average_ticket: Math.round(avgTicket),
    deals_closed: dealsCount,
    target,
    target_progress: Math.round(targetProgress * 10) / 10,
  }
}

// =============================================
// Conversion Report
// =============================================

async function generateConversionReport(
  supabase: any,
  organizationId: string,
  dateRange: DateRange,
  pipelineId?: string | null
): Promise<ConversionReport> {
  // Get all deals in period
  let query = supabase
    .from('deals')
    .select('status, created_at, closed_at, pipeline_stages(name)')
    .eq('organization_id', organizationId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)

  if (pipelineId) {
    query = query.eq('pipeline_id', pipelineId)
  }

  const { data: deals, error } = await query

  if (error) {
    console.error('[Reports] Conversion query error:', error)
    return {
      total_leads: 0,
      qualified_leads: 0,
      opportunities: 0,
      deals_won: 0,
      deals_lost: 0,
      conversion_rate: 0,
      qualification_rate: 0,
      win_rate: 0,
      average_cycle_days: 0,
    }
  }

  const totalLeads = deals?.length || 0
  const qualifiedLeads = deals?.filter((d: any) => d.status !== 'lost').length || 0
  const opportunities = deals?.filter((d: any) => ['active', 'won'].includes(d.status)).length || 0
  const dealsWon = deals?.filter((d: any) => d.status === 'won').length || 0
  const dealsLost = deals?.filter((d: any) => d.status === 'lost').length || 0

  // Calculate cycle time for won deals
  const wonDealsWithDates = deals?.filter((d: any) => d.status === 'won' && d.closed_at) || []
  let avgCycleDays = 0
  if (wonDealsWithDates.length > 0) {
    const totalDays = wonDealsWithDates.reduce((sum: number, d: any) => {
      const created = new Date(d.created_at).getTime()
      const closed = new Date(d.closed_at).getTime()
      return sum + (closed - created) / (1000 * 60 * 60 * 24)
    }, 0)
    avgCycleDays = totalDays / wonDealsWithDates.length
  }

  return {
    total_leads: totalLeads,
    qualified_leads: qualifiedLeads,
    opportunities,
    deals_won: dealsWon,
    deals_lost: dealsLost,
    conversion_rate: totalLeads > 0 ? Math.round((dealsWon / totalLeads) * 1000) / 10 : 0,
    qualification_rate: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 1000) / 10 : 0,
    win_rate: (dealsWon + dealsLost) > 0 ? Math.round((dealsWon / (dealsWon + dealsLost)) * 1000) / 10 : 0,
    average_cycle_days: Math.round(avgCycleDays),
  }
}

// =============================================
// Channel Report
// =============================================

async function generateChannelReport(
  supabase: any,
  organizationId: string,
  dateRange: DateRange
): Promise<ChannelReport> {
  // Get deals by source
  const { data: deals, error } = await supabase
    .from('deals')
    .select('source, status, value')
    .eq('organization_id', organizationId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)

  if (error) {
    console.error('[Reports] Channel query error:', error)
    return { channels: [] }
  }

  // Group by source
  const channelMap = new Map<string, { leads: number; conversions: number; revenue: number }>()

  deals?.forEach((d: any) => {
    const source = d.source || 'Direto'
    const existing = channelMap.get(source) || { leads: 0, conversions: 0, revenue: 0 }

    existing.leads++
    if (d.status === 'won') {
      existing.conversions++
      existing.revenue += d.value || 0
    }

    channelMap.set(source, existing)
  })

  const channels = Array.from(channelMap.entries()).map(([name, data]) => ({
    name,
    leads: data.leads,
    conversions: data.conversions,
    revenue: data.revenue,
    conversion_rate: data.leads > 0 ? Math.round((data.conversions / data.leads) * 1000) / 10 : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  return { channels }
}

// =============================================
// ROI Report
// =============================================

async function generateROIReport(
  supabase: any,
  organizationId: string,
  dateRange: DateRange
): Promise<ROIReport> {
  // Get campaigns and their results
  const { data: campaigns } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)

  // Get total revenue from won deals
  const { data: wonDeals } = await supabase
    .from('deals')
    .select('value, source')
    .eq('organization_id', organizationId)
    .eq('status', 'won')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end)

  const totalReturn = wonDeals?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0

  // Calculate investment (from campaigns or estimate)
  const totalInvestment = campaigns?.reduce((sum: number, c: any) => sum + (c.budget || 0), 0) || 5000

  // Get customer count for LTV/CAC
  const { count: customerCount } = await supabase
    .from('deals')
    .select('contact_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'won')
    .gte('closed_at', dateRange.start)
    .lte('closed_at', dateRange.end)

  const customersAcquired = customerCount || 1
  const cac = customersAcquired > 0 ? totalInvestment / customersAcquired : 0
  const avgTicket = customersAcquired > 0 ? totalReturn / customersAcquired : 0
  const ltv = avgTicket * 12 // Simplified: assume 12 month average lifetime
  const ltvCacRatio = cac > 0 ? ltv / cac : 0
  const paybackMonths = avgTicket > 0 ? Math.ceil(cac / (avgTicket / 12)) : 0

  const roiPercentage = totalInvestment > 0 ? ((totalReturn - totalInvestment) / totalInvestment) * 100 : 0

  // Campaign details
  const campaignData = (campaigns || []).map((c: any) => ({
    name: c.name,
    investment: c.budget || 0,
    return_value: c.revenue || 0,
    roi: c.budget > 0 ? ((c.revenue - c.budget) / c.budget) * 100 : 0,
    leads_generated: c.leads_count || 0,
    conversions: c.conversions_count || 0,
  }))

  return {
    total_investment: totalInvestment,
    total_return: totalReturn,
    roi_percentage: Math.round(roiPercentage * 10) / 10,
    cac: Math.round(cac),
    ltv: Math.round(ltv),
    ltv_cac_ratio: Math.round(ltvCacRatio * 10) / 10,
    payback_months: paybackMonths,
    campaigns: campaignData,
  }
}

// =============================================
// Sales Report
// =============================================

async function generateSalesReport(
  supabase: any,
  organizationId: string,
  dateRange: DateRange,
  pipelineId?: string | null
): Promise<SalesReport> {
  // Get deals with agent info
  let query = supabase
    .from('deals')
    .select(`
      *,
      profiles:assigned_to (id, email, full_name),
      pipeline_stages (id, name)
    `)
    .eq('organization_id', organizationId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)

  if (pipelineId) {
    query = query.eq('pipeline_id', pipelineId)
  }

  const { data: deals, error } = await query

  if (error) {
    console.error('[Reports] Sales query error:', error)
    return { by_agent: [], by_product: [], by_stage: [] }
  }

  // Group by agent
  const agentMap = new Map<string, {
    agent_name: string
    leads: number
    won: number
    lost: number
    revenue: number
  }>()

  deals?.forEach((d: any) => {
    const agentId = d.assigned_to || 'unassigned'
    const agentName = d.profiles?.full_name || 'Nao atribuido'
    const existing = agentMap.get(agentId) || { agent_name: agentName, leads: 0, won: 0, lost: 0, revenue: 0 }

    existing.leads++
    if (d.status === 'won') {
      existing.won++
      existing.revenue += d.value || 0
    } else if (d.status === 'lost') {
      existing.lost++
    }

    agentMap.set(agentId, existing)
  })

  const byAgent = Array.from(agentMap.entries()).map(([id, data]) => ({
    agent_id: id,
    agent_name: data.agent_name,
    leads_assigned: data.leads,
    deals_won: data.won,
    deals_lost: data.lost,
    revenue: data.revenue,
    win_rate: (data.won + data.lost) > 0 ? Math.round((data.won / (data.won + data.lost)) * 1000) / 10 : 0,
    average_ticket: data.won > 0 ? Math.round(data.revenue / data.won) : 0,
  })).sort((a, b) => b.revenue - a.revenue)

  // Group by stage
  const stageMap = new Map<string, { stage_name: string; count: number; value: number; days: number[] }>()

  deals?.forEach((d: any) => {
    const stageName = d.pipeline_stages?.name || 'Sem etapa'
    const existing = stageMap.get(stageName) || { stage_name: stageName, count: 0, value: 0, days: [] }

    existing.count++
    existing.value += d.value || 0

    stageMap.set(stageName, existing)
  })

  const byStage = Array.from(stageMap.values()).map((data) => ({
    stage_name: data.stage_name,
    deals_count: data.count,
    total_value: data.value,
    average_time_days: data.days.length > 0
      ? Math.round(data.days.reduce((a, b) => a + b, 0) / data.days.length)
      : 0,
  }))

  return {
    by_agent: byAgent,
    by_product: [], // Would need products table
    by_stage: byStage,
  }
}

// =============================================
// Trend Data
// =============================================

async function generateTrendData(
  supabase: any,
  organizationId: string,
  dateRange: DateRange
): Promise<TrendData[]> {
  // Get daily aggregated data
  const { data: deals, error } = await supabase
    .from('deals')
    .select('created_at, status, value, closed_at')
    .eq('organization_id', organizationId)
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end)
    .order('created_at', { ascending: true })

  if (error || !deals) {
    return []
  }

  // Group by date
  const dateMap = new Map<string, { leads: number; conversions: number; revenue: number }>()

  deals.forEach((d: any) => {
    const date = new Date(d.created_at).toISOString().split('T')[0]
    const existing = dateMap.get(date) || { leads: 0, conversions: 0, revenue: 0 }

    existing.leads++
    if (d.status === 'won') {
      existing.conversions++
      existing.revenue += d.value || 0
    }

    dateMap.set(date, existing)
  })

  return Array.from(dateMap.entries())
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
