import { supabaseAdmin } from '@/lib/supabase-admin'
import { orgStoreIds } from '@/lib/api/guards'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

// =============================================
// Types
// =============================================

interface StageHistory {
  id: string
  deal_id: string
  organization_id: string
  from_stage_id?: string
  to_stage_id: string
  changed_by?: string
  time_in_previous_stage_minutes?: number
  created_at: string
  from_stage?: {
    id: string
    name: string
  }
  to_stage?: {
    id: string
    name: string
  }
  profiles?: {
    id: string
    email: string
    full_name: string
  }
}

interface StageTimeStats {
  stage_id: string
  stage_name: string
  average_time_minutes: number
  min_time_minutes: number
  max_time_minutes: number
  deals_count: number
  current_deals: number
  total_time_minutes: number
}

interface DealTimeData {
  deal_id: string
  deal_title: string
  current_stage: string
  time_in_current_stage_minutes: number
  total_time_minutes: number
  stage_history: Array<{
    stage_name: string
    time_minutes: number
    entered_at: string
    left_at?: string
  }>
}

// =============================================
// GET - Get time tracking data
// =============================================

export async function GET(request: NextRequest) {
  // Nenhuma sessão era exigida e a organização vinha na URL. O cliente
  // aqui é o de componente de servidor, que depende de um cookie que
  // este app não grava — então a consulta ia como anônima. A
  // organização passa a vir do token.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth
  const organizationId = auth.orgId

  try {
    const supabase = supabaseAdmin
    const { searchParams } = new URL(request.url)

    const pipelineId = searchParams.get('pipeline_id')
    const dealId = searchParams.get('deal_id')
    const type = searchParams.get('type') || 'stats' // stats, deal, history


    switch (type) {
      case 'stats':
        return await getStageStats(supabase, organizationId, pipelineId)

      case 'deal':
        if (!dealId) {
          return NextResponse.json({ error: 'deal_id is required for type=deal' }, { status: 400 })
        }
        return await getDealTimeData(supabase, dealId, organizationId)

      case 'history':
        return await getStageHistory(supabase, organizationId, pipelineId)

      default:
        return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
    }
  } catch (error) {
    console.error('[DealTimeTracking] GET error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// POST - Record stage change
// =============================================

export async function POST(request: NextRequest) {
  // Sessão obrigatória; a organização do corpo é substituída pela do
  // token para que nenhum dos caminhos abaixo escreva em outra.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = supabaseAdmin
    const body = await request.json()
    body.organization_id = auth.orgId

    const {
      deal_id,
      organization_id,
      from_stage_id,
      to_stage_id,
      changed_by,
    } = body

    if (!deal_id || !organization_id || !to_stage_id) {
      return NextResponse.json({
        error: 'deal_id, organization_id e to_stage_id sao obrigatorios'
      }, { status: 400 })
    }

    // Calculate time in previous stage
    let timeInPreviousStage: number | null = null

    if (from_stage_id) {
      const { data: lastEntry } = await supabase
        .from('deal_stage_history')
        .select('created_at')
        .eq('deal_id', deal_id)
        .eq('organization_id', organization_id)
        .eq('to_stage_id', from_stage_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastEntry) {
        const enteredAt = new Date(lastEntry.created_at).getTime()
        const now = Date.now()
        timeInPreviousStage = Math.round((now - enteredAt) / (1000 * 60))
      }
    }

    // Insert history record
    const { data: history, error } = await supabase
      .from('deal_stage_history')
      .insert({
        deal_id,
        organization_id,
        from_stage_id,
        to_stage_id,
        changed_by,
        time_in_previous_stage_minutes: timeInPreviousStage,
      })
      .select(`
        *,
        from_stage:pipeline_stages!deal_stage_history_from_stage_id_fkey (id, name),
        to_stage:pipeline_stages!deal_stage_history_to_stage_id_fkey (id, name)
      `)
      .single()

    if (error) {
      console.error('[DealTimeTracking] Insert error:', error)
      return NextResponse.json({ error: 'Erro ao registrar mudanca de etapa' }, { status: 500 })
    }

    return NextResponse.json({ history, time_in_previous_stage: timeInPreviousStage })
  } catch (error) {
    console.error('[DealTimeTracking] POST error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// Helper Functions
// =============================================

async function getStageStats(
  supabase: any,
  organizationId: string,
  pipelineId?: string | null
): Promise<NextResponse> {
  // `pipeline_stages` e `deals` não têm coluna de organização: a cerca
  // é a loja. As consultas daqui filtravam por `organization_id` numa
  // tabela que não tem essa coluna — não cercavam nada e ainda erravam.
  const storeIds = await orgStoreIds(supabase, organizationId)
  if (storeIds.length === 0) {
    return NextResponse.json({ stats: [] })
  }

  const { data: orgPipelines } = await supabase
    .from('pipelines')
    .select('id')
    .in('store_id', storeIds)
  const pipelineIds = (orgPipelines || []).map((p: any) => p.id)
  if (pipelineIds.length === 0) {
    return NextResponse.json({ stats: [] })
  }

  let stagesQuery = supabase
    .from('pipeline_stages')
    .select('id, name, position')
    .in('pipeline_id', pipelineIds)
    .order('position', { ascending: true })

  if (pipelineId) {
    stagesQuery = stagesQuery.eq('pipeline_id', pipelineId)
  }

  const { data: stages, error: stagesError } = await stagesQuery

  if (stagesError) {
    console.error('[DealTimeTracking] Stages error:', stagesError)
    return NextResponse.json({ error: 'Erro ao carregar etapas' }, { status: 500 })
  }

  // Get time data for each stage
  const stats: StageTimeStats[] = await Promise.all(
    (stages || []).map(async (stage: any) => {
      // Get history entries for this stage
      const { data: historyData } = await supabase
        .from('deal_stage_history')
        .select('time_in_previous_stage_minutes')
        .eq('organization_id', organizationId)
        .eq('from_stage_id', stage.id)
        .not('time_in_previous_stage_minutes', 'is', null)

      const times = historyData
        ?.map((h: any) => h.time_in_previous_stage_minutes)
        .filter((t: number) => t > 0) || []

      const totalTime = times.reduce((sum: number, t: number) => sum + t, 0)
      const avgTime = times.length > 0 ? Math.round(totalTime / times.length) : 0
      const minTime = times.length > 0 ? Math.min(...times) : 0
      const maxTime = times.length > 0 ? Math.max(...times) : 0

      // Get current deals in this stage
      const { count: currentDeals } = await supabase
        .from('deals')
        .select('*', { count: 'exact', head: true })
        .in('store_id', storeIds)
        .eq('stage_id', stage.id)
        .eq('status', 'active')

      return {
        stage_id: stage.id,
        stage_name: stage.name,
        average_time_minutes: avgTime,
        min_time_minutes: minTime,
        max_time_minutes: maxTime,
        deals_count: times.length,
        current_deals: currentDeals || 0,
        total_time_minutes: totalTime,
      }
    })
  )

  // Calculate overall metrics
  const totalDealsWithTime = stats.reduce((sum, s) => sum + s.deals_count, 0)
  const avgCycleTime = totalDealsWithTime > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.total_time_minutes, 0) / totalDealsWithTime)
    : 0

  return NextResponse.json({
    stats,
    summary: {
      total_stages: stats.length,
      average_cycle_minutes: avgCycleTime,
      slowest_stage: stats.reduce((max, s) => s.average_time_minutes > max.average_time_minutes ? s : max, stats[0])?.stage_name,
      fastest_stage: stats.filter(s => s.average_time_minutes > 0).reduce((min, s) =>
        s.average_time_minutes < min.average_time_minutes ? s : min,
        stats.find(s => s.average_time_minutes > 0) || stats[0]
      )?.stage_name,
    },
  })
}

async function getDealTimeData(
  supabase: any,
  dealId: string,
  organizationId: string
): Promise<NextResponse> {
  // Idem: `deals` se cerca pela loja.
  const storeIds = await orgStoreIds(supabase, organizationId)
  if (storeIds.length === 0) {
    return NextResponse.json({ error: 'Deal nao encontrado' }, { status: 404 })
  }

  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select(`
      id,
      title,
      stage_id,
      created_at,
      pipeline_stages (id, name)
    `)
    .eq('id', dealId)
    .in('store_id', storeIds)
    .single()

  if (dealError || !deal) {
    return NextResponse.json({ error: 'Deal nao encontrado' }, { status: 404 })
  }

  // Get stage history
  const { data: history } = await supabase
    .from('deal_stage_history')
    .select(`
      *,
      to_stage:pipeline_stages!deal_stage_history_to_stage_id_fkey (id, name)
    `)
    .eq('deal_id', dealId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  // Build timeline
  const stageTimeline: Array<{
    stage_name: string
    time_minutes: number
    entered_at: string
    left_at?: string
  }> = []

  let totalTime = 0
  const historyEntries = history || []

  for (let i = 0; i < historyEntries.length; i++) {
    const entry = historyEntries[i]
    const nextEntry = historyEntries[i + 1]

    const timeInStage = nextEntry
      ? Math.round((new Date(nextEntry.created_at).getTime() - new Date(entry.created_at).getTime()) / (1000 * 60))
      : Math.round((Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60))

    stageTimeline.push({
      stage_name: entry.to_stage?.name || 'Unknown',
      time_minutes: timeInStage,
      entered_at: entry.created_at,
      left_at: nextEntry?.created_at,
    })

    if (nextEntry) {
      totalTime += timeInStage
    }
  }

  // Time in current stage
  const lastEntry = historyEntries[historyEntries.length - 1]
  const timeInCurrentStage = lastEntry
    ? Math.round((Date.now() - new Date(lastEntry.created_at).getTime()) / (1000 * 60))
    : Math.round((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60))

  return NextResponse.json({
    deal: {
      deal_id: deal.id,
      deal_title: deal.title,
      current_stage: deal.pipeline_stages?.name || 'Unknown',
      time_in_current_stage_minutes: timeInCurrentStage,
      total_time_minutes: totalTime + timeInCurrentStage,
      stage_history: stageTimeline,
    },
  })
}

async function getStageHistory(
  supabase: any,
  organizationId: string,
  pipelineId?: string | null
): Promise<NextResponse> {
  let query = supabase
    .from('deal_stage_history')
    .select(`
      *,
      from_stage:pipeline_stages!deal_stage_history_from_stage_id_fkey (id, name),
      to_stage:pipeline_stages!deal_stage_history_to_stage_id_fkey (id, name),
      profiles:changed_by (id, email, full_name),
      deals (id, title)
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: history, error } = await query

  if (error) {
    console.error('[DealTimeTracking] History error:', error)
    return NextResponse.json({ error: 'Erro ao carregar historico' }, { status: 500 })
  }

  return NextResponse.json({ history: history || [] })
}
