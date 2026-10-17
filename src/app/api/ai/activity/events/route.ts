import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { parsePeriod } from '@/lib/ai/activity-data'
import { periodWindow } from '@/lib/ai/activity-summary'

export const dynamic = 'force-dynamic'

const KINDS = ['sale', 'solved', 'handoff', 'incentive', 'blocked', 'gap']

// Plano IA M5 passo 29 — o registro de atividade: ?kind=&agent=&limit=
// Cada evento vem com `contact_name` (UI F5: "Duda · Juliana Prado").
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const kind = params.get('kind')
  const agent = params.get('agent')
  const period = periodWindow(parsePeriod(params.get('period')), new Date())
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))
  let query = getSupabaseAdmin()
    .from('ai_activity_events')
    .select('id, kind, text, amount, agent_id, conversation_id, contact_id, metadata, created_at')
    .eq('organization_id', auth.user.organization_id)
    .gte('created_at', period.start.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (kind && KINDS.includes(kind)) query = query.eq('kind', kind)
  if (agent) query = query.eq('agent_id', agent)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((data ?? []).map((e: any) => e.contact_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: contacts } = await getSupabaseAdmin()
      .from('contacts')
      .select('id, first_name, last_name, phone')
      .eq('organization_id', auth.user.organization_id)
      .in('id', ids)
    for (const c of contacts ?? []) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
      names.set(c.id, name || c.phone || '')
    }
  }
  return NextResponse.json({ events: (data ?? []).map((e: any) => ({ ...e, contact_name: (e.contact_id && names.get(e.contact_id)) || null })) })
}
