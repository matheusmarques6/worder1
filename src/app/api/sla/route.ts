import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

// =============================================
// Types
// =============================================

interface SLAConfig {
  id: string
  organization_id: string
  store_id?: string
  name: string
  description?: string
  first_response_minutes: number
  resolution_minutes: number
  business_hours_only: boolean
  business_hours_start: string
  business_hours_end: string
  business_days: number[]
  priority_multipliers: {
    low: number
    normal: number
    high: number
    urgent: number
  }
  escalation_rules: EscalationRule[]
  is_active: boolean
  created_at: string
  updated_at: string
}

interface EscalationRule {
  level: number
  after_minutes: number
  notify_emails: string[]
  notify_slack?: boolean
  auto_assign_to?: string
}

interface SLAMetric {
  id: string
  organization_id: string
  sla_config_id: string
  conversation_id: string
  contact_id?: string
  assigned_to?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  first_response_target: string
  first_response_actual?: string
  first_response_breached: boolean
  resolution_target: string
  resolution_actual?: string
  resolution_breached: boolean
  escalation_level: number
  status: 'pending' | 'in_progress' | 'resolved' | 'breached'
  created_at: string
  updated_at: string
}

interface SLAStats {
  total_conversations: number
  within_sla: number
  breached_first_response: number
  breached_resolution: number
  average_first_response_minutes: number
  average_resolution_minutes: number
  sla_compliance_rate: number
}

// =============================================
// GET - List SLA configs or get metrics
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

    const configId = searchParams.get('config_id')
    const includeMetrics = searchParams.get('include_metrics') === 'true'
    const period = searchParams.get('period') || '7d'


    // Get single config with metrics
    if (configId) {
      const { data: config, error: configError } = await supabase
        .from('sla_configs')
        .select('*')
        .eq('id', configId)
        .eq('organization_id', organizationId)
        .single()

      if (configError) {
        return NextResponse.json({ error: 'Config nao encontrada' }, { status: 404 })
      }

      let metrics: SLAMetric[] = []
      let stats: SLAStats | null = null

      if (includeMetrics) {
        const dateRange = getDateRange(period)

        const { data: metricsData } = await supabase
          .from('sla_metrics')
          .select(`
            *,
            profiles:assigned_to (id, email, full_name),
            contacts (id, first_name, last_name)
          `)
          .eq('sla_config_id', configId)
          .gte('created_at', dateRange.start)
          .order('created_at', { ascending: false })
          .limit(100)

        metrics = metricsData || []
        stats = calculateStats(metrics)
      }

      return NextResponse.json({ config, metrics, stats })
    }

    // List all configs
    const { data: configs, error } = await supabase
      .from('sla_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[SLA] List error:', error)
      return NextResponse.json({ error: 'Erro ao carregar configuracoes' }, { status: 500 })
    }

    // Get summary stats for each config
    const dateRange = getDateRange(period)
    const configsWithStats = await Promise.all(
      (configs || []).map(async (config) => {
        const { data: metrics } = await supabase
          .from('sla_metrics')
          .select('first_response_breached, resolution_breached, status')
          .eq('sla_config_id', config.id)
          .gte('created_at', dateRange.start)

        const total = metrics?.length || 0
        const breached = metrics?.filter(m => m.first_response_breached || m.resolution_breached).length || 0
        const complianceRate = total > 0 ? ((total - breached) / total) * 100 : 100

        return {
          ...config,
          total_tracked: total,
          compliance_rate: Math.round(complianceRate * 10) / 10,
        }
      })
    )

    return NextResponse.json({ configs: configsWithStats })
  } catch (error) {
    console.error('[SLA] GET error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// POST - Create config or track conversation
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

    const { action } = body

    switch (action) {
      case 'track':
        return await trackConversation(supabase, body)

      case 'update_metric':
        return await updateMetric(supabase, body)

      case 'check_breaches':
        return await checkBreaches(supabase, body)

      default:
        // Create new config
        return await createConfig(supabase, body)
    }
  } catch (error) {
    console.error('[SLA] POST error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// PUT - Update config
// =============================================

export async function PUT(request: NextRequest) {
  // Sessão obrigatória; a organização do corpo é substituída pela do
  // token para que nenhum dos caminhos abaixo escreva em outra.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = supabaseAdmin
    const body = await request.json()
    body.organization_id = auth.orgId

    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data: config, error } = await supabase
      .from('sla_configs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', auth.orgId)
      .select()
      .single()

    if (error) {
      console.error('[SLA] Update error:', error)
      return NextResponse.json({ error: 'Erro ao atualizar configuracao' }, { status: 500 })
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error('[SLA] PUT error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// DELETE - Delete config
// =============================================

export async function DELETE(request: NextRequest) {
  // Sessão obrigatória; a organização do corpo é substituída pela do
  // token para que nenhum dos caminhos abaixo escreva em outra.
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = supabaseAdmin
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sla_configs')
      .delete()
      .eq('id', id)
      .eq('organization_id', auth.orgId)

    if (error) {
      console.error('[SLA] Delete error:', error)
      return NextResponse.json({ error: 'Erro ao excluir configuracao' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[SLA] DELETE error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// Helper Functions
// =============================================

function getDateRange(period: string): { start: string; end: string } {
  const end = new Date()
  const start = new Date()

  switch (period) {
    case '24h':
      start.setDate(end.getDate() - 1)
      break
    case '7d':
      start.setDate(end.getDate() - 7)
      break
    case '30d':
      start.setDate(end.getDate() - 30)
      break
    default:
      start.setDate(end.getDate() - 7)
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function calculateStats(metrics: SLAMetric[]): SLAStats {
  const total = metrics.length
  if (total === 0) {
    return {
      total_conversations: 0,
      within_sla: 0,
      breached_first_response: 0,
      breached_resolution: 0,
      average_first_response_minutes: 0,
      average_resolution_minutes: 0,
      sla_compliance_rate: 100,
    }
  }

  const breachedFirst = metrics.filter(m => m.first_response_breached).length
  const breachedResolution = metrics.filter(m => m.resolution_breached).length
  const withinSLA = metrics.filter(m => !m.first_response_breached && !m.resolution_breached).length

  // Calculate average response times
  let totalFirstResponse = 0
  let firstResponseCount = 0
  let totalResolution = 0
  let resolutionCount = 0

  metrics.forEach(m => {
    if (m.first_response_actual) {
      const target = new Date(m.first_response_target).getTime()
      const actual = new Date(m.first_response_actual).getTime()
      const created = new Date(m.created_at).getTime()
      totalFirstResponse += (actual - created) / (1000 * 60) // minutes
      firstResponseCount++
    }

    if (m.resolution_actual) {
      const created = new Date(m.created_at).getTime()
      const resolved = new Date(m.resolution_actual).getTime()
      totalResolution += (resolved - created) / (1000 * 60) // minutes
      resolutionCount++
    }
  })

  return {
    total_conversations: total,
    within_sla: withinSLA,
    breached_first_response: breachedFirst,
    breached_resolution: breachedResolution,
    average_first_response_minutes: firstResponseCount > 0
      ? Math.round(totalFirstResponse / firstResponseCount)
      : 0,
    average_resolution_minutes: resolutionCount > 0
      ? Math.round(totalResolution / resolutionCount)
      : 0,
    sla_compliance_rate: Math.round((withinSLA / total) * 1000) / 10,
  }
}

// =============================================
// Action Handlers
// =============================================

async function createConfig(supabase: any, body: any) {
  const {
    organization_id,
    store_id,
    name,
    description,
    first_response_minutes = 15,
    resolution_minutes = 240,
    business_hours_only = true,
    business_hours_start = '09:00',
    business_hours_end = '18:00',
    business_days = [1, 2, 3, 4, 5],
    priority_multipliers = { low: 2, normal: 1, high: 0.5, urgent: 0.25 },
    escalation_rules = [],
  } = body

  if (!organization_id || !name) {
    return NextResponse.json({ error: 'organization_id e name sao obrigatorios' }, { status: 400 })
  }

  const { data: config, error } = await supabase
    .from('sla_configs')
    .insert({
      organization_id,
      store_id,
      name,
      description,
      first_response_minutes,
      resolution_minutes,
      business_hours_only,
      business_hours_start,
      business_hours_end,
      business_days,
      priority_multipliers,
      escalation_rules,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error('[SLA] Create config error:', error)
    return NextResponse.json({ error: 'Erro ao criar configuracao' }, { status: 500 })
  }

  return NextResponse.json({ config })
}

async function trackConversation(supabase: any, body: any) {
  const {
    organization_id,
    sla_config_id,
    conversation_id,
    contact_id,
    assigned_to,
    priority = 'normal',
  } = body

  if (!organization_id || !sla_config_id || !conversation_id) {
    return NextResponse.json({
      error: 'organization_id, sla_config_id e conversation_id sao obrigatorios'
    }, { status: 400 })
  }

  // Get SLA config
  const { data: config, error: configError } = await supabase
    .from('sla_configs')
    .select('*')
    .eq('id', sla_config_id)
    .eq('organization_id', organization_id)
    .single()

  if (configError || !config) {
    return NextResponse.json({ error: 'Configuracao SLA nao encontrada' }, { status: 404 })
  }

  // Calculate targets based on priority
  const multiplier = config.priority_multipliers[priority] || 1
  const firstResponseMinutes = Math.round(config.first_response_minutes * multiplier)
  const resolutionMinutes = Math.round(config.resolution_minutes * multiplier)

  const now = new Date()
  const firstResponseTarget = new Date(now.getTime() + firstResponseMinutes * 60 * 1000)
  const resolutionTarget = new Date(now.getTime() + resolutionMinutes * 60 * 1000)

  const { data: metric, error } = await supabase
    .from('sla_metrics')
    .insert({
      organization_id,
      sla_config_id,
      conversation_id,
      contact_id,
      assigned_to,
      priority,
      first_response_target: firstResponseTarget.toISOString(),
      first_response_breached: false,
      resolution_target: resolutionTarget.toISOString(),
      resolution_breached: false,
      escalation_level: 0,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[SLA] Track error:', error)
    return NextResponse.json({ error: 'Erro ao iniciar rastreamento' }, { status: 500 })
  }

  return NextResponse.json({ metric })
}

async function updateMetric(supabase: any, body: any) {
  // `organization_id` foi sobrescrito pelo do token no handler.
  const { metric_id, event, organization_id } = body

  if (!metric_id || !event) {
    return NextResponse.json({ error: 'metric_id e event sao obrigatorios' }, { status: 400 })
  }

  const { data: metric, error: fetchError } = await supabase
    .from('sla_metrics')
    .select('*')
    .eq('id', metric_id)
    .eq('organization_id', organization_id)
    .single()

  if (fetchError || !metric) {
    return NextResponse.json({ error: 'Metrica nao encontrada' }, { status: 404 })
  }

  const now = new Date()
  const updates: any = { updated_at: now.toISOString() }

  switch (event) {
    case 'first_response':
      updates.first_response_actual = now.toISOString()
      updates.first_response_breached = now > new Date(metric.first_response_target)
      updates.status = 'in_progress'
      break

    case 'resolved':
      updates.resolution_actual = now.toISOString()
      updates.resolution_breached = now > new Date(metric.resolution_target)
      updates.status = 'resolved'
      break

    case 'escalate':
      updates.escalation_level = (metric.escalation_level || 0) + 1
      break
  }

  const { data: updated, error } = await supabase
    .from('sla_metrics')
    .update(updates)
    .eq('id', metric_id)
    .eq('organization_id', organization_id)
    .select()
    .single()

  if (error) {
    console.error('[SLA] Update metric error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar metrica' }, { status: 500 })
  }

  return NextResponse.json({ metric: updated })
}

async function checkBreaches(supabase: any, body: any) {
  const { organization_id } = body

  if (!organization_id) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
  }

  const now = new Date()

  // Find metrics that should have breached first response
  const { data: firstResponseBreaches } = await supabase
    .from('sla_metrics')
    .select('id')
    .eq('organization_id', organization_id)
    .eq('first_response_breached', false)
    .is('first_response_actual', null)
    .lt('first_response_target', now.toISOString())

  if (firstResponseBreaches && firstResponseBreaches.length > 0) {
    await supabase
      .from('sla_metrics')
      .update({
        first_response_breached: true,
        status: 'breached',
        updated_at: now.toISOString(),
      })
      .in('id', firstResponseBreaches.map((m: any) => m.id))
  }

  // Find metrics that should have breached resolution
  const { data: resolutionBreaches } = await supabase
    .from('sla_metrics')
    .select('id')
    .eq('organization_id', organization_id)
    .eq('resolution_breached', false)
    .neq('status', 'resolved')
    .lt('resolution_target', now.toISOString())

  if (resolutionBreaches && resolutionBreaches.length > 0) {
    await supabase
      .from('sla_metrics')
      .update({
        resolution_breached: true,
        status: 'breached',
        updated_at: now.toISOString(),
      })
      .in('id', resolutionBreaches.map((m: any) => m.id))
  }

  return NextResponse.json({
    checked: true,
    first_response_breaches: firstResponseBreaches?.length || 0,
    resolution_breaches: resolutionBreaches?.length || 0,
  })
}
