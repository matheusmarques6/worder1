// =============================================
// PATCH /api/ai/agents/[id]/tools/[toolId] — toggle/update tool config
// DELETE /api/ai/agents/[id]/tools/[toolId] — remove
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; toolId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.config && typeof body.config === 'object') patch.config = body.config

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_tools')
    .update(patch)
    .eq('id', params.toolId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tool: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; toolId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('ai_agent_tools')
    .delete()
    .eq('id', params.toolId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
