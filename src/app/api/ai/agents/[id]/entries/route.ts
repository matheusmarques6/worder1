import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { ENTRY_KINDS, listEntries } from '@/lib/ai/agent-entries'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 15 — onde o agente atua (ai_agent_entries).
// Uma entrada ativa por (org, kind, ref): o número que já tem agente devolve
// 409 com o NOME dele, para a UI oferecer a troca em vez de um erro cru.

async function ownAgent(supabase: any, organizationId: string, agentId: string) {
  const { data } = await supabase
    .from('ai_agents')
    .select('id, name')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data as { id: string; name: string } | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  if (!(await ownAgent(supabase, organizationId, params.id))) {
    return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  }
  try {
    const entries = await listEntries(supabase, organizationId, [params.id])
    return NextResponse.json({ entries })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const kind = body?.kind
  const refId = body?.ref_id
  if (!ENTRY_KINDS.includes(kind) || typeof refId !== 'string' || !refId) {
    return NextResponse.json(
      { error: `kind (${ENTRY_KINDS.join(' | ')}) e ref_id são obrigatórios` },
      { status: 400 },
    )
  }
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  if (!(await ownAgent(supabase, organizationId, params.id))) {
    return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  }

  if (kind === 'whatsapp_account') {
    const { data: account } = await supabase
      .from('whatsapp_business_accounts')
      .select('id')
      .eq('id', refId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!account) {
      return NextResponse.json({ error: 'Conta WhatsApp não encontrada' }, { status: 404 })
    }
  }

  const { data: taken } = await supabase
    .from('ai_agent_entries')
    .select('id, agent_id')
    .eq('organization_id', organizationId)
    .eq('kind', kind)
    .eq('ref_id', refId)
    .eq('active', true)
    .maybeSingle()
  if (taken) {
    if (taken.agent_id === params.id) {
      return NextResponse.json({ entry: taken, already: true })
    }
    const owner = await ownAgent(supabase, organizationId, taken.agent_id)
    return NextResponse.json(
      {
        error: `Esta entrada já pertence ao agente ${owner?.name ?? taken.agent_id}`,
        owner_agent_id: taken.agent_id,
        owner_agent_name: owner?.name ?? null,
      },
      { status: 409 },
    )
  }

  const { data, error } = await supabase
    .from('ai_agent_entries')
    .insert({ organization_id: organizationId, agent_id: params.id, kind, ref_id: refId })
    .select('id, agent_id, kind, ref_id, active, created_at')
    .single()
  if (error) {
    // Corrida com outro POST: o índice parcial decide; mesma resposta do preflight.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Esta entrada já pertence a outro agente' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entry: data }, { status: 201 })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entry_id')
  if (!entryId) return NextResponse.json({ error: 'entry_id é obrigatório' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_entries')
    .update({ active: false })
    .eq('id', entryId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
