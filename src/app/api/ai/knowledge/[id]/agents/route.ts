import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { ownAgentIds, setReaders } from '@/lib/ai/knowledge/server'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — "lida por": substitui o conjunto de agentes que
// leem a nota. { agent_ids: [] } deixa a nota sem leitor.
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: note } = await supabase
    .from('ai_sources').select('id').eq('id', params.id).eq('organization_id', organizationId).maybeSingle()
  if (!note) return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
  const agentIds = await ownAgentIds(supabase, organizationId, body?.agent_ids)
  if (agentIds === null) return NextResponse.json({ error: 'agent_ids com agente de outra organização' }, { status: 400 })
  try {
    await setReaders(supabase, organizationId, params.id, agentIds)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  return NextResponse.json({ readers: agentIds })
}
