import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// =============================================
// GET - CRM Analytics Data
// =============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const pipelineId = searchParams.get('pipeline_id')
    const period = searchParams.get('period') || '30d'
    const storeId = searchParams.get('store_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
    }

    // Calculate date range
    const now = new Date()
    let startDate = new Date()
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    // Build base query for deals
    let dealsQuery = supabase
      .from('deals')
      .select(`
        id,
        title,
        value,
        status,
        stage_id,
        pipeline_id,
        assigned_to,
        contact_id,
        created_at,
        updated_at,
        won_at,
        lost_at,
        time_in_current_stage_seconds,
        stage_entered_at,
        source,
        utm_source,
        utm_medium,
        utm_campaign,
        tags,
        pipeline_stages (
          id,
          name,
          color,
          position,
          probability,
          is_won,
          is_lost
        ),
        contacts (
          id,
          first_name,
          last_name,
          email,
          phone,
          total_spent,
          total_orders,
          lifetime_value
        ),
        profiles:assigned_to (
          id,
          email,
          first_name,
          last_name,
          full_name
        )
      `)
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())

    if (pipelineId) {
      dealsQuery = dealsQuery.eq('pipeline_id', pipelineId)
    }

    const { data: deals, error: dealsError } = await dealsQuery

    if (dealsError) {
      console.error('Error fetching deals:', dealsError)
      return NextResponse.json({ error: dealsError.message }, { status: 500 })
    }

    // Get pipeline info
    let pipelinesQuery = supabase
      .from('pipelines')
      .select(`
        id,
        name,
        color,
        pipeline_stages (
          id,
          name,
          color,
          position,
          probability,
          is_won,
          is_lost
        )
      `)
      .eq('organization_id', organizationId)
      .order('position')

    const { data: pipelines } = await pipelinesQuery

    // Get stage history for time tracking
    const { data: stageHistory } = await supabase
      .from('deal_stage_history')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())

    // Calculate metrics
    const allDeals = deals || []
    const wonDeals = allDeals.filter(d => d.status === 'won')
    const lostDeals = allDeals.filter(d => d.status === 'lost')
    const openDeals = allDeals.filter(d => d.status === 'open')

    // Summary metrics
    const summary = {
      total_deals: allDeals.length,
      total_value: allDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      won_deals: wonDeals.length,
      won_value: wonDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      lost_deals: lostDeals.length,
      lost_value: lostDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      open_deals: openDeals.length,
      open_value: openDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      conversion_rate: allDeals.length > 0
        ? ((wonDeals.length / allDeals.length) * 100).toFixed(1)
        : 0,
      avg_deal_value: wonDeals.length > 0
        ? (wonDeals.reduce((sum, d) => sum + (d.value || 0), 0) / wonDeals.length).toFixed(2)
        : 0,
    }

    // Stage metrics
    const stageMetrics: Record<string, any> = {}
    const allStages = pipelines?.flatMap(p => p.pipeline_stages || []) || []

    for (const stage of allStages) {
      const stageDeals = allDeals.filter(d => d.stage_id === stage.id)
      const stageWon = stageDeals.filter(d => d.status === 'won')

      // Calculate avg time in stage
      const stageHistoryItems = (stageHistory || []).filter(h => h.to_stage_id === stage.id)
      const avgTimeInStage = stageHistoryItems.length > 0
        ? stageHistoryItems.reduce((sum, h) => sum + (h.time_in_stage_seconds || 0), 0) / stageHistoryItems.length
        : 0

      stageMetrics[stage.id] = {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        deals_count: stageDeals.length,
        deals_value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        conversion_rate: stageDeals.length > 0
          ? ((stageWon.length / stageDeals.length) * 100).toFixed(1)
          : 0,
        avg_time_seconds: Math.round(avgTimeInStage),
        avg_time_formatted: formatDuration(avgTimeInStage),
      }
    }

    // Agent metrics
    const agentMetrics: Record<string, any> = {}
    for (const deal of allDeals) {
      if (!deal.assigned_to) continue

      if (!agentMetrics[deal.assigned_to]) {
        const profile = deal.profiles
        agentMetrics[deal.assigned_to] = {
          id: deal.assigned_to,
          name: profile?.full_name || profile?.email || 'Unknown',
          email: profile?.email,
          deals_count: 0,
          deals_value: 0,
          won_count: 0,
          won_value: 0,
          lost_count: 0,
          conversion_rate: 0,
        }
      }

      agentMetrics[deal.assigned_to].deals_count++
      agentMetrics[deal.assigned_to].deals_value += deal.value || 0

      if (deal.status === 'won') {
        agentMetrics[deal.assigned_to].won_count++
        agentMetrics[deal.assigned_to].won_value += deal.value || 0
      } else if (deal.status === 'lost') {
        agentMetrics[deal.assigned_to].lost_count++
      }
    }

    // Calculate conversion rates for agents
    for (const agent of Object.values(agentMetrics)) {
      const closedDeals = agent.won_count + agent.lost_count
      agent.conversion_rate = closedDeals > 0
        ? ((agent.won_count / closedDeals) * 100).toFixed(1)
        : 0
    }

    // Source metrics
    const sourceMetrics: Record<string, any> = {}
    for (const deal of allDeals) {
      const source = deal.source || deal.utm_source || 'Direct'

      if (!sourceMetrics[source]) {
        sourceMetrics[source] = {
          source,
          deals_count: 0,
          deals_value: 0,
          won_count: 0,
          won_value: 0,
          conversion_rate: 0,
        }
      }

      sourceMetrics[source].deals_count++
      sourceMetrics[source].deals_value += deal.value || 0

      if (deal.status === 'won') {
        sourceMetrics[source].won_count++
        sourceMetrics[source].won_value += deal.value || 0
      }
    }

    // Calculate conversion rates for sources
    for (const src of Object.values(sourceMetrics)) {
      src.conversion_rate = src.deals_count > 0
        ? ((src.won_count / src.deals_count) * 100).toFixed(1)
        : 0
    }

    // Funnel data
    const funnelData = allStages
      .sort((a, b) => a.position - b.position)
      .map(stage => {
        const stageDeals = allDeals.filter(d => d.stage_id === stage.id ||
          (d.pipeline_stages as any)?.position >= stage.position)
        return {
          stage: stage.name,
          color: stage.color,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
          percentage: allDeals.length > 0
            ? ((stageDeals.length / allDeals.length) * 100).toFixed(1)
            : 0,
        }
      })

    // Timeline data (daily)
    const timelineData: Record<string, any> = {}
    for (const deal of allDeals) {
      const date = new Date(deal.created_at).toISOString().split('T')[0]

      if (!timelineData[date]) {
        timelineData[date] = {
          date,
          new_deals: 0,
          new_value: 0,
          won_deals: 0,
          won_value: 0,
          lost_deals: 0,
        }
      }

      timelineData[date].new_deals++
      timelineData[date].new_value += deal.value || 0
    }

    // Add won/lost to timeline
    for (const deal of wonDeals) {
      if (deal.won_at) {
        const date = new Date(deal.won_at).toISOString().split('T')[0]
        if (timelineData[date]) {
          timelineData[date].won_deals++
          timelineData[date].won_value += deal.value || 0
        }
      }
    }

    for (const deal of lostDeals) {
      if (deal.lost_at) {
        const date = new Date(deal.lost_at).toISOString().split('T')[0]
        if (timelineData[date]) {
          timelineData[date].lost_deals++
        }
      }
    }

    // LTV calculation (from contacts)
    const contactsWithLTV = allDeals
      .filter(d => d.contacts?.lifetime_value > 0)
      .map(d => d.contacts.lifetime_value)

    const avgLTV = contactsWithLTV.length > 0
      ? contactsWithLTV.reduce((sum, ltv) => sum + ltv, 0) / contactsWithLTV.length
      : 0

    return NextResponse.json({
      summary,
      stages: Object.values(stageMetrics).sort((a, b) => a.position - b.position),
      agents: Object.values(agentMetrics).sort((a, b) => b.won_value - a.won_value),
      sources: Object.values(sourceMetrics).sort((a, b) => b.deals_count - a.deals_count),
      funnel: funnelData,
      timeline: Object.values(timelineData).sort((a, b) => a.date.localeCompare(b.date)),
      pipelines: pipelines || [],
      ltv: {
        average: avgLTV,
        total_customers: contactsWithLTV.length,
      },
      period: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        label: period,
      },
    })
  } catch (error: any) {
    console.error('CRM Analytics Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper function
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
