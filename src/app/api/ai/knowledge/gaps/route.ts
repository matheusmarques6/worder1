import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M3 passo 21 — lacunas: abertas por padrão (as ignoradas cujo
// prazo venceu voltam a aparecer), filtro por agente, mais recentes primeiro.
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const status = params.get('status') ?? 'open'
  const agentId = params.get('agent_id')
  const now = new Date().toISOString()
  let query = getSupabaseAdmin()
    .from('ai_knowledge_gaps')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('last_seen', { ascending: false })
    .limit(100)
  if (status === 'open') query = query.or(`status.eq.open,and(status.eq.ignored_until,ignored_until.lt.${now})`)
  else query = query.eq('status', status)
  if (agentId) query = query.contains('agent_ids', [agentId])
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gaps: data ?? [] })
}
