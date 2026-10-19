import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { loadReadiness } from '@/lib/ai/agent-readiness'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 15 — ativar exige o checklist verde. Não arquiva os
// demais: vários agentes ativos por org (20261016000008).
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

  const readiness = await loadReadiness(supabase, organizationId, agent)
  if (!readiness.ready) {
    return NextResponse.json(
      { error: 'Checklist incompleto', ...readiness },
      { status: 422 },
    )
  }

  const { error } = await supabase
    .from('ai_agents')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: 'active', ...readiness })
}
