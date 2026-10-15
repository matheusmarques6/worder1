import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Plano IA M4 passo 24 — o painel Testar do editor. Proxy para o runtime
// (/internal/simulate-turn, mesmo token do preview): o turno roda em
// sandbox — nada vai ao cliente, ferramentas de escrita só dizem o que
// fariam, e o custo fica como `playground`. A org vem da sessão, nunca do body.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message é obrigatório' }, { status: 400 })

  const organizationId = auth.user.organization_id
  const { data: agent } = await getSupabaseAdmin()
    .from('ai_agents').select('id').eq('id', params.id).eq('organization_id', organizationId).maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const runtimeUrl = process.env.AGENTS_RUNTIME_URL
  const runtimeToken = process.env.AGENTS_PREVIEW_TOKEN
  if (!runtimeUrl || !runtimeToken) {
    return NextResponse.json(
      { error: 'Simulação indisponível: AGENTS_RUNTIME_URL/AGENTS_PREVIEW_TOKEN não configurados' },
      { status: 503 },
    )
  }

  try {
    const upstream = await fetch(`${runtimeUrl.replace(/\/$/, '')}/internal/simulate-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${runtimeToken}` },
      body: JSON.stringify({
        organization_id: organizationId,
        agent_id: params.id,
        message,
        history: Array.isArray(body?.history) ? body.history.slice(-20) : [],
        agent_draft: body?.agent_draft && typeof body.agent_draft === 'object' ? body.agent_draft : null,
        mission_version_id: typeof body?.mission_version_id === 'string' ? body.mission_version_id : null,
        event_type: typeof body?.event_type === 'string' ? body.event_type : 'whatsapp.received',
        contact_profile: body?.contact_profile ?? null,
      }),
      signal: AbortSignal.timeout(55_000),
    })
    const payload = await upstream.json().catch(() => ({ error: 'resposta inválida do runtime' }))
    if (upstream.ok) return NextResponse.json(payload)
    if (upstream.status === 422 || upstream.status === 400) return NextResponse.json(payload, { status: upstream.status })
    return NextResponse.json({ error: payload?.error || 'Simulação indisponível' }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: `Runtime inacessível: ${e.message}` }, { status: 502 })
  }
}
