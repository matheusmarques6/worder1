import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { RuntimeNotConfigured, callRuntime } from '@/lib/ai/runtime-client'

export const dynamic = 'force-dynamic'

// Plano IA M4 passo 26 — "Rodar avaliação": o runtime cria o run e roda o
// pack em segundo plano; aqui devolvemos o id para a tela acompanhar.
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const agentId = typeof body?.agent_id === 'string' ? body.agent_id : ''
  if (!agentId) return NextResponse.json({ error: 'agent_id é obrigatório' }, { status: 400 })
  const organizationId = auth.user.organization_id
  const { data: agent } = await getSupabaseAdmin()
    .from('ai_agents').select('id').eq('id', agentId).eq('organization_id', organizationId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  try {
    const { status, payload } = await callRuntime('/internal/run-eval', { organization_id: organizationId, agent_id: agentId })
    if (status === 202 || status === 200) return NextResponse.json(payload, { status: 202 })
    if (status === 422 || status === 400) return NextResponse.json(payload, { status })
    return NextResponse.json({ error: payload?.error || 'Avaliação indisponível' }, { status: 502 })
  } catch (e: any) {
    const status = e instanceof RuntimeNotConfigured ? 503 : 502
    return NextResponse.json({ error: e.message }, { status })
  }
}
