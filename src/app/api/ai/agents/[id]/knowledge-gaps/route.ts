// =============================================
// GET /api/ai/agents/[id]/knowledge-gaps  → lista gaps abertas
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'open'

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .eq('agent_id', params.id)
    .eq('status', status)
    .order('frequency', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gaps: data ?? [] })
}
