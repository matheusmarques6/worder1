import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const KINDS = ['sale', 'solved', 'handoff', 'incentive', 'blocked', 'gap']

// Plano IA M5 passo 29 — o registro de atividade: ?kind=&agent=&limit=
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const agent = params.get('agent')
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))
  let query = getSupabaseAdmin()
    .from('ai_activity_events')
    .select('id, kind, text, amount, agent_id, conversation_id, contact_id, metadata, created_at')
    .eq('organization_id', auth.user.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (kind && KINDS.includes(kind)) query = query.eq('kind', kind)
  if (agent) query = query.eq('agent_id', agent)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}
