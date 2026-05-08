// =============================================
// CRUD de tools habilitadas para um agente.
// GET   /api/ai/agents/[id]/tools  → lista tools do agente + catálogo dos built-ins
// POST  /api/ai/agents/[id]/tools  → habilita/atualiza uma tool {tool_type, enabled, config}
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { BUILTIN_TOOLS } from '@/lib/ai/tools/builtins'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: tools, error } = await supabase
    .from('ai_agent_tools')
    .select('id, tool_type, name, description, enabled, config, usage_stats, created_at, updated_at')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const catalog = Object.values(BUILTIN_TOOLS).map((t) => ({
    type: t.type,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  return NextResponse.json({ tools: tools ?? [], catalog })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const tool_type = String(body.tool_type || '').trim()
  const enabled = body.enabled !== false
  const config = (body.config && typeof body.config === 'object') ? body.config : {}

  if (!tool_type || !BUILTIN_TOOLS[tool_type]) {
    return NextResponse.json({ error: 'tool_type inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const def = BUILTIN_TOOLS[tool_type]

  const { data: existing } = await supabase
    .from('ai_agent_tools')
    .select('id')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .eq('tool_type', tool_type)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('ai_agent_tools')
      .update({ enabled, config, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tool: data })
  }

  const { data, error } = await supabase
    .from('ai_agent_tools')
    .insert({
      organization_id: auth.user.organization_id,
      agent_id: params.id,
      tool_type,
      name: def.name,
      description: def.description,
      enabled,
      config,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tool: data }, { status: 201 })
}
