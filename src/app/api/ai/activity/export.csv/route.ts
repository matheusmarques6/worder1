import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { periodWindow, toCsv } from '@/lib/ai/activity-summary'
import { loadOutcomes, parsePeriod } from '@/lib/ai/activity-data'

export const dynamic = 'force-dynamic'

// Plano IA M5 passo 29 — uma linha por conversa do período (?period=&agent=).
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const days = parsePeriod(params.get('period'))
  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id
  try {
    const [rows, agents] = await Promise.all([
      loadOutcomes(supabase, organizationId, periodWindow(days, new Date()).start, params.get('agent')),
      supabase.from('ai_agents').select('id, name').eq('organization_id', organizationId),
    ])
    const names = new Map((agents.data ?? []).map((a: any) => [a.id as string, a.name as string]))
    return new NextResponse(toCsv(rows, names), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="atividade-ia-${days}d.csv"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
