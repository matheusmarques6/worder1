import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 15 — pausar: o agente deixa de ser carregado pelo
// runtime (status != active) e as conversas abertas que ele atendia passam
// para a equipe (conversations.status = 'human'), para ninguém ficar sem
// resposta. As entradas ficam: ao reativar, ele volta aos mesmos números.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id

  const { data: agent, error: updateError } = await supabase
    .from('ai_agents')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

  const { data: handed, error: handError } = await supabase
    .from('conversations')
    .update({ status: 'human' })
    .eq('organization_id', organizationId)
    .eq('agent_id', params.id)
    .eq('status', 'open')
    .select('id')
  if (handError) console.error('Error handing conversations to the team (non-fatal):', handError)

  return NextResponse.json({ ok: true, status: 'paused', handed_to_team: handed?.length ?? 0 })
}
