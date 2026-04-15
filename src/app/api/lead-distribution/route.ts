import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

// =============================================
// Types
// =============================================

interface DistributionRule {
  id: string
  organization_id: string
  store_id?: string
  name: string
  distribution_type: 'round_robin' | 'weighted' | 'capacity' | 'skill_based'
  is_active: boolean
  config: {
    agents: AgentConfig[]
    fallback_agent_id?: string
    max_leads_per_agent?: number
    reset_period?: 'daily' | 'weekly' | 'monthly'
    skills_required?: string[]
  }
  last_assigned_index: number
  created_at: string
  updated_at: string
}

interface AgentConfig {
  agent_id: string
  weight?: number
  max_capacity?: number
  skills?: string[]
  is_available: boolean
}

interface DistributionLog {
  id: string
  rule_id: string
  lead_id: string
  assigned_to: string
  distribution_type: string
  reason?: string
  created_at: string
}

// =============================================
// GET - List rules or get single rule
// =============================================

export async function GET(request: NextRequest) {
  try {
    // ✅ Multi-tenant: org_id SEMPRE vem do usuário autenticado, nunca de query params
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organizationId = auth.user.organization_id

    const supabase = createServerComponentClient({ cookies })
    const { searchParams } = new URL(request.url)

    const ruleId = searchParams.get('rule_id')
    const storeId = searchParams.get('store_id')
    const includeLogs = searchParams.get('include_logs') === 'true'

    // Get single rule with logs
    if (ruleId) {
      const { data: rule, error: ruleError } = await supabase
        .from('lead_distribution_rules')
        .select('*')
        .eq('id', ruleId)
        .eq('organization_id', organizationId)
        .single()

      if (ruleError) {
        console.error('[LeadDistribution] Get rule error:', ruleError)
        return NextResponse.json({ error: 'Regra nao encontrada' }, { status: 404 })
      }

      let logs: DistributionLog[] = []
      if (includeLogs) {
        const { data: logsData } = await supabase
          .from('lead_distribution_logs')
          .select(`
            *,
            profiles:assigned_to (id, email, full_name)
          `)
          .eq('rule_id', ruleId)
          .order('created_at', { ascending: false })
          .limit(100)

        logs = logsData || []
      }

      return NextResponse.json({ rule, logs })
    }

    // List all rules
    let query = supabase
      .from('lead_distribution_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    const { data: rules, error } = await query

    if (error) {
      console.error('[LeadDistribution] List error:', error)
      return NextResponse.json({ error: 'Erro ao carregar regras' }, { status: 500 })
    }

    // Get agent stats for each rule
    const rulesWithStats = await Promise.all(
      (rules || []).map(async (rule) => {
        const { data: stats } = await supabase
          .from('lead_distribution_logs')
          .select('assigned_to')
          .eq('rule_id', rule.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

        const agentCounts: Record<string, number> = {}
        stats?.forEach((log) => {
          agentCounts[log.assigned_to] = (agentCounts[log.assigned_to] || 0) + 1
        })

        return {
          ...rule,
          today_distributions: stats?.length || 0,
          agent_distribution: agentCounts,
        }
      })
    )

    return NextResponse.json({ rules: rulesWithStats })
  } catch (error) {
    console.error('[LeadDistribution] GET error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// POST - Create rule or distribute lead
// =============================================

export async function POST(request: NextRequest) {
  try {
    // ✅ Multi-tenant: org_id SEMPRE vem do usuário autenticado
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const supabase = createServerComponentClient({ cookies })
    const body = await request.json()

    const { action } = body

    // Distribute a lead
    if (action === 'distribute') {
      return await distributeLead(supabase, { ...body, organization_id })
    }

    // Create new rule
    const {
      store_id,
      name,
      distribution_type = 'round_robin',
      config,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'name eh obrigatorio' }, { status: 400 })
    }

    const { data: rule, error } = await supabase
      .from('lead_distribution_rules')
      .insert({
        organization_id,
        store_id,
        name,
        distribution_type,
        config: config || { agents: [] },
        is_active: true,
        last_assigned_index: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('[LeadDistribution] Create error:', error)
      return NextResponse.json({ error: 'Erro ao criar regra' }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error('[LeadDistribution] POST error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// PUT - Update rule
// =============================================

export async function PUT(request: NextRequest) {
  try {
    // ✅ Multi-tenant: garantir org do user
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const supabase = createServerComponentClient({ cookies })
    const body = await request.json()

    // Remover quaisquer tentativas do cliente de forçar org_id
    const { id, organization_id: _omit, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { data: rule, error } = await supabase
      .from('lead_distribution_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      console.error('[LeadDistribution] Update error:', error)
      return NextResponse.json({ error: 'Erro ao atualizar regra' }, { status: 500 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error('[LeadDistribution] PUT error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// DELETE - Delete rule
// =============================================

export async function DELETE(request: NextRequest) {
  try {
    // ✅ Multi-tenant: garantir org do user
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organization_id = auth.user.organization_id

    const supabase = createServerComponentClient({ cookies })
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('lead_distribution_rules')
      .delete()
      .eq('id', id)
      .eq('organization_id', organization_id)

    if (error) {
      console.error('[LeadDistribution] Delete error:', error)
      return NextResponse.json({ error: 'Erro ao excluir regra' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[LeadDistribution] DELETE error:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// =============================================
// Lead Distribution Logic
// =============================================

async function distributeLead(supabase: any, body: any) {
  const { rule_id, lead_id, organization_id, store_id } = body

  if (!lead_id || !organization_id) {
    return NextResponse.json({ error: 'lead_id e organization_id sao obrigatorios' }, { status: 400 })
  }

  // Get the active rule
  let ruleQuery = supabase
    .from('lead_distribution_rules')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)

  if (rule_id) {
    ruleQuery = ruleQuery.eq('id', rule_id)
  } else if (store_id) {
    ruleQuery = ruleQuery.eq('store_id', store_id)
  }

  const { data: rules, error: ruleError } = await ruleQuery.limit(1)

  if (ruleError || !rules || rules.length === 0) {
    return NextResponse.json({ error: 'Nenhuma regra de distribuicao ativa encontrada' }, { status: 404 })
  }

  const rule = rules[0] as DistributionRule
  const config = rule.config || { agents: [] }
  const availableAgents = config.agents.filter((a: AgentConfig) => a.is_available)

  if (availableAgents.length === 0) {
    // Use fallback agent if configured
    if (config.fallback_agent_id) {
      await logDistribution(supabase, rule.id, lead_id, config.fallback_agent_id, 'fallback', 'Nenhum agente disponivel')
      return NextResponse.json({ assigned_to: config.fallback_agent_id, reason: 'fallback' })
    }
    return NextResponse.json({ error: 'Nenhum agente disponivel para distribuicao' }, { status: 400 })
  }

  let assignedAgent: string | null = null
  let reason = ''

  switch (rule.distribution_type) {
    case 'round_robin':
      const result = await distributeRoundRobin(supabase, rule, availableAgents)
      assignedAgent = result.agent_id
      reason = result.reason
      break

    case 'weighted':
      const weightedResult = distributeWeighted(availableAgents)
      assignedAgent = weightedResult.agent_id
      reason = weightedResult.reason
      break

    case 'capacity':
      const capacityResult = await distributeByCapacity(supabase, rule, availableAgents)
      assignedAgent = capacityResult.agent_id
      reason = capacityResult.reason
      break

    case 'skill_based':
      const skillResult = distributeBySkills(availableAgents, config.skills_required || [])
      assignedAgent = skillResult.agent_id
      reason = skillResult.reason
      break

    default:
      return NextResponse.json({ error: 'Tipo de distribuicao invalido' }, { status: 400 })
  }

  if (!assignedAgent) {
    if (config.fallback_agent_id) {
      assignedAgent = config.fallback_agent_id
      reason = 'fallback'
    } else {
      return NextResponse.json({ error: 'Nao foi possivel distribuir o lead' }, { status: 400 })
    }
  }

  // Log the distribution
  await logDistribution(supabase, rule.id, lead_id, assignedAgent, rule.distribution_type, reason)

  // Update the lead/deal with assigned agent
  await supabase
    .from('deals')
    .update({
      assigned_to: assignedAgent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead_id)

  return NextResponse.json({
    assigned_to: assignedAgent,
    distribution_type: rule.distribution_type,
    reason,
  })
}

// Round Robin Distribution
async function distributeRoundRobin(supabase: any, rule: DistributionRule, agents: AgentConfig[]) {
  const nextIndex = (rule.last_assigned_index + 1) % agents.length
  const agent = agents[nextIndex]

  // Update the index
  await supabase
    .from('lead_distribution_rules')
    .update({
      last_assigned_index: nextIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rule.id)

  return {
    agent_id: agent.agent_id,
    reason: `Round robin - posicao ${nextIndex + 1}`,
  }
}

// Weighted Distribution
function distributeWeighted(agents: AgentConfig[]) {
  const totalWeight = agents.reduce((sum, a) => sum + (a.weight || 1), 0)
  let random = Math.random() * totalWeight

  for (const agent of agents) {
    random -= agent.weight || 1
    if (random <= 0) {
      return {
        agent_id: agent.agent_id,
        reason: `Weighted - peso ${agent.weight || 1}`,
      }
    }
  }

  return {
    agent_id: agents[0].agent_id,
    reason: 'Weighted - fallback',
  }
}

// Capacity-based Distribution
async function distributeByCapacity(supabase: any, rule: DistributionRule, agents: AgentConfig[]) {
  // Get current lead count for each agent
  const { data: counts } = await supabase
    .from('deals')
    .select('assigned_to')
    .in('assigned_to', agents.map(a => a.agent_id))
    .in('status', ['active', 'pending'])

  const agentCounts: Record<string, number> = {}
  counts?.forEach((d: any) => {
    agentCounts[d.assigned_to] = (agentCounts[d.assigned_to] || 0) + 1
  })

  // Find agent with most available capacity
  let bestAgent: AgentConfig | null = null
  let bestAvailable = -1

  for (const agent of agents) {
    const current = agentCounts[agent.agent_id] || 0
    const capacity = agent.max_capacity || 50
    const available = capacity - current

    if (available > bestAvailable) {
      bestAvailable = available
      bestAgent = agent
    }
  }

  if (bestAgent && bestAvailable > 0) {
    return {
      agent_id: bestAgent.agent_id,
      reason: `Capacity - ${bestAvailable} vagas disponiveis`,
    }
  }

  // All at capacity, use first available
  return {
    agent_id: agents[0].agent_id,
    reason: 'Capacity - todos no limite',
  }
}

// Skill-based Distribution
function distributeBySkills(agents: AgentConfig[], requiredSkills: string[]) {
  if (requiredSkills.length === 0) {
    return {
      agent_id: agents[0].agent_id,
      reason: 'Skills - sem requisitos',
    }
  }

  // Find agent with most matching skills
  let bestAgent: AgentConfig | null = null
  let bestMatch = 0

  for (const agent of agents) {
    const agentSkills = agent.skills || []
    const matchCount = requiredSkills.filter(s => agentSkills.includes(s)).length

    if (matchCount > bestMatch) {
      bestMatch = matchCount
      bestAgent = agent
    }
  }

  if (bestAgent && bestMatch > 0) {
    return {
      agent_id: bestAgent.agent_id,
      reason: `Skills - ${bestMatch}/${requiredSkills.length} habilidades`,
    }
  }

  // No skill match, use first available
  return {
    agent_id: agents[0].agent_id,
    reason: 'Skills - sem match',
  }
}

// Log distribution
async function logDistribution(
  supabase: any,
  ruleId: string,
  leadId: string,
  assignedTo: string,
  distributionType: string,
  reason: string
) {
  await supabase
    .from('lead_distribution_logs')
    .insert({
      rule_id: ruleId,
      lead_id: leadId,
      assigned_to: assignedTo,
      distribution_type: distributionType,
      reason,
    })
}
