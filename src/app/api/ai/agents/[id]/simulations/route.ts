// =============================================
// GET   /api/ai/agents/[id]/simulations  → lista simulações (recentes primeiro)
// POST  /api/ai/agents/[id]/simulations  → cria nova simulação
//   body: { scenario_name, persona_description, vertical?, script_messages, eval_criteria? }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_simulations')
    .select(
      'id, scenario_name, persona_description, vertical, status, ran_at, duration_ms, eval_score, created_at',
    )
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ simulations: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const scenarioName = String(body.scenario_name || '').trim()
  const persona = String(body.persona_description || '').trim()
  const vertical = body.vertical ? String(body.vertical) : null
  const script = Array.isArray(body.script_messages) ? body.script_messages : []
  const evalCriteria = Array.isArray(body.eval_criteria) ? body.eval_criteria : []

  if (!scenarioName || !persona) {
    return NextResponse.json(
      { error: 'scenario_name e persona_description são obrigatórios' },
      { status: 400 },
    )
  }
  if (script.length === 0) {
    return NextResponse.json({ error: 'script_messages vazio' }, { status: 400 })
  }
  if (script.length > 30) {
    return NextResponse.json({ error: 'script_messages > 30 mensagens' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_simulations')
    .insert({
      organization_id: auth.user.organization_id,
      agent_id: params.id,
      scenario_name: scenarioName,
      persona_description: persona,
      vertical,
      script_messages: script,
      eval_criteria: evalCriteria,
      status: 'pending',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ simulation: data }, { status: 201 })
}
