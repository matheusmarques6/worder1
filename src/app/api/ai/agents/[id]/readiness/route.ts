import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { loadReadiness } from '@/lib/ai/agent-readiness'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 15 — o checklist mínimo (chave, missão, handoff; entrada
// como aviso). O M4 (passo 26) acrescenta a avaliação automática.
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, provider, settings, status')
    .eq('id', params.id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
  try {
    const readiness = await loadReadiness(supabase, organizationId, agent)
    return NextResponse.json({ ...readiness, status: agent.status })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
