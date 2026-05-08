// =============================================
// PATCH  /api/ai/agents/[id]/knowledge-gaps/[gapId]
//   body: { status: 'addressed'|'dismissed', addressed_source_id? }
// Atualiza status do gap (resolvido ou descartado).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const VALID_STATUS = ['open', 'addressed', 'dismissed']

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; gapId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const status = String(body.status || '')
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  if (status === 'addressed') {
    update.addressed_at = new Date().toISOString()
    update.addressed_by_user_id = auth.user.id
    if (body.addressed_source_id) {
      update.addressed_source_id = body.addressed_source_id
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .update(update)
    .eq('id', params.gapId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gap: data })
}
