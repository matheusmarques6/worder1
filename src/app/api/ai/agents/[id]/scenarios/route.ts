import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M4 passo 24 — cenários de teste (ai_test_scenarios): o diálogo do
// painel Testar guardado para repetir depois (e, no passo 26, para a
// avaliação automática). GET lista; POST salva { title, user_turns,
// persona?, expected_behavior?, tags? }.

async function ownAgent(supabase: any, organizationId: string, agentId: string) {
  const { data } = await supabase
    .from('ai_agents').select('id').eq('id', agentId).eq('organization_id', organizationId).maybeSingle()
  return Boolean(data)
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  if (!(await ownAgent(supabase, organizationId, params.id))) {
    return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  }
  const { data, error } = await supabase
    .from('ai_test_scenarios')
    .select('id, title, persona, user_turns, expected_behavior, tags, is_active, created_at')
    .eq('organization_id', organizationId)
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scenarios: data ?? [] })
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const turns = Array.isArray(body?.user_turns)
    ? body.user_turns.filter((t: unknown) => typeof t === 'string' && t.trim()).slice(0, 30)
    : []
  if (!title || turns.length === 0) {
    return NextResponse.json({ error: 'title e user_turns (ao menos uma fala) são obrigatórios' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  if (!(await ownAgent(supabase, organizationId, params.id))) {
    return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  }
  const { data, error } = await supabase
    .from('ai_test_scenarios')
    .insert({
      organization_id: organizationId,
      agent_id: params.id,
      title: title.slice(0, 200),
      persona: typeof body?.persona === 'string' ? body.persona : null,
      user_turns: turns,
      expected_behavior: typeof body?.expected_behavior === 'string' ? body.expected_behavior : null,
      tags: Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
      created_by: auth.user.id,
    })
    .select('id, title, user_turns, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ scenario: data }, { status: 201 })
}
