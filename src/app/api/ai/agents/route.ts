import { NextRequest, NextResponse } from 'next/server'
import { AIAgent, DEFAULT_PERSONA, DEFAULT_SETTINGS } from '@/lib/ai/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { hasActiveProviderKey, providerKeyMissingResponse } from '@/lib/ai/provider-key-check';
import { hasBooleanTransferCooldown } from '@/lib/ai/guards';
import { findAgentTemplate } from '@/lib/ai/agent-templates';
import { listEntries } from '@/lib/ai/agent-entries';
export const dynamic = 'force-dynamic';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =====================================================
// GET - LISTAR AGENTES
// =====================================================

export async function GET(request: NextRequest) {
  try {
    // ✅ CORREÇÃO: Validar autenticação
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabase()

    // Parâmetros
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const isActive = searchParams.get('is_active')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // ✅ CORREÇÃO: Validar organization_id contra o usuário autenticado
    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (organizationId !== auth.user.organization_id) {
      return NextResponse.json({ error: 'Acesso não autorizado a esta organização' }, { status: 403 })
    }

    const status = searchParams.get('status')

    // Query
    let query = supabase
      .from('ai_agents')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: agents, error, count } = await query

    if (error) {
      console.error('Error fetching agents:', error)
      throw error
    }

    // Plano IA M2 passo 15: a lista do protótipo precisa de onde atua,
    // quantas missões e conversas dos últimos 7 dias. Receita fica 0 até o M5.
    const rows = agents || []
    const ids = rows.map((a: any) => a.id)
    let entries: Awaited<ReturnType<typeof listEntries>> = []
    const missionsCount = new Map<string, number>()
    const conversations7d = new Map<string, number>()
    if (ids.length > 0) {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const [entriesResult, missions, conversations] = await Promise.all([
        listEntries(supabase, organizationId, ids).catch((e) => {
          console.error('Error listing agent entries:', e)
          return []
        }),
        supabase
          .from('ai_missions')
          .select('agent_id')
          .eq('organization_id', organizationId)
          .in('agent_id', ids)
          .neq('status', 'archived'),
        supabase
          .from('conversations')
          .select('agent_id')
          .eq('organization_id', organizationId)
          .in('agent_id', ids)
          .gte('created_at', since),
      ])
      entries = entriesResult
      for (const m of missions.data ?? []) {
        missionsCount.set(m.agent_id, (missionsCount.get(m.agent_id) ?? 0) + 1)
      }
      for (const c of conversations.data ?? []) {
        conversations7d.set(c.agent_id, (conversations7d.get(c.agent_id) ?? 0) + 1)
      }
    }

    const enriched = rows.map((agent: any) => ({
      ...agent,
      role: agent.role ?? null,
      status: agent.status ?? (agent.is_active ? 'active' : 'paused'),
      entries: entries.filter((e) => e.agent_id === agent.id),
      missions_count: missionsCount.get(agent.id) ?? 0,
      conversations_7d: conversations7d.get(agent.id) ?? 0,
      revenue_7d: 0,
    }))

    return NextResponse.json({
      agents: enriched,
      total: count || 0,
      limit,
      offset,
    })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - CRIAR AGENTE
// =====================================================

export async function POST(request: NextRequest) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // body é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json()

    if (hasBooleanTransferCooldown(body.settings)) {
      return NextResponse.json({ error: 'cooldown_after_transfer deve ser numérico' }, { status: 400 })
    }
    const supabase = getSupabase()

    // Validação
    const { provider, model } = body
    const organizationId = auth.user.organization_id

    // Plano IA M2 passo 15: origem do agente — modelo, cópia de outro agente
    // da org, ou do zero. `source_ids` é aceito e ignorado até o M3 (hoje a
    // fonte pertence a UM agente; ligar fontes a vários vem com ai_source_agents).
    const template = findAgentTemplate(body.template_id)
    if (body.template_id && !template) {
      return NextResponse.json({ error: 'template_id desconhecido' }, { status: 400 })
    }
    let copied: Record<string, any> | null = null
    if (body.copy_from) {
      const { data, error: copyError } = await supabase
        .from('ai_agents')
        .select('name, description, system_prompt, provider, model, temperature, max_tokens, persona, settings, presentation_mode, client_adaptation, role')
        .eq('id', body.copy_from)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (copyError) throw new Error(copyError.message)
      if (!data) {
        return NextResponse.json({ error: 'copy_from: agente não encontrado' }, { status: 404 })
      }
      copied = data
    }

    const name = String(body.name ?? template?.name ?? (copied ? `${copied.name} (cópia)` : '')).trim()
    if (!name) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    const templateSettings = template
      ? {
          tools: { enabled: template.tools },
          safety: {
            blocked_topics: template.blocked_topics,
            handoff_keywords: template.handoff_keywords,
            handoff_confirmation_message: template.handoff_confirmation_message,
          },
        }
      : {}

    // Preparar dados
    const agentData: Record<string, any> = {
      organization_id: organizationId,
      name,
      role: body.role?.trim?.() || template?.role || copied?.role || null,
      description: body.description?.trim() || copied?.description || template?.summary || null,
      system_prompt: body.system_prompt?.trim() || copied?.system_prompt || template?.system_prompt || null,
      provider: provider || copied?.provider || 'openai',
      model: model || copied?.model || 'gpt-4o-mini',
      temperature: body.temperature ?? copied?.temperature ?? 0.7,
      // Default 2048: modelos com reasoning (Gemini 3.5+, o-series, R1)
      // consomem max_tokens 'pensando' antes de escrever. 500 (default
      // antigo) devolvia respostas vazias na 2a pergunta.
      max_tokens: body.max_tokens ?? copied?.max_tokens ?? 2048,
      // Agente novo nasce rascunho (status); is_active segue o status por
      // trigger. `is_active: true` no body ainda é aceito (rotas antigas).
      status: body.status ?? (body.is_active === true ? 'active' : 'draft'),
      is_active: body.is_active ?? false,
      persona: {
        ...DEFAULT_PERSONA,
        ...(copied?.persona || {}),
        ...(template?.persona || {}),
        ...(body.persona || {}),
      },
      settings: {
        ...DEFAULT_SETTINGS,
        ...(copied?.settings || {}),
        ...templateSettings,
        ...(body.settings || {}),
      },
      total_messages: 0,
      total_conversations: 0,
      total_tokens_used: 0,
      avg_response_time_ms: 0,
    }
    if (copied?.presentation_mode) agentData.presentation_mode = copied.presentation_mode
    if (copied?.client_adaptation || template?.client_adaptation) {
      agentData.client_adaptation = template?.client_adaptation ?? copied?.client_adaptation
    }

    // P1-1: criar ja-ativo exige chave do provider (mesma regra do PUT/PATCH).
    if (agentData.status === 'active') {
      const hasKey = await hasActiveProviderKey(supabase, organizationId, agentData.provider)
      if (!hasKey) {
        return NextResponse.json(providerKeyMissingResponse(agentData.provider), { status: 400 })
      }
    }

    // Plano IA M2 (20261016000008): vários agentes ativos por org — criar
    // ativo não arquiva mais os outros.

    // Inserir
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .insert(agentData)
      .select()
      .single()

    if (error) {
      console.error('Error creating agent:', error)
      throw error
    }

    // Missões do modelo nascem em rascunho, já ligadas ao agente.
    let seeded = 0
    if (template && agent?.id) {
      const { data: created, error: seedError } = await supabase.rpc('seed_default_missions', {
        p_organization_id: organizationId,
        p_agent_id: agent.id,
      })
      if (seedError) console.error('Error seeding template missions (non-fatal):', seedError)
      else seeded = Number(created ?? 0)
    }

    return NextResponse.json({ agent, seeded_missions: seeded }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
