// =============================================
// PATCH/DELETE /api/ai/agents/[id]/skills/[skillId]
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; skillId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) update.name = String(body.name)
  if (body.description !== undefined) update.description = body.description
  if (body.instructions !== undefined) update.instructions = String(body.instructions)
  if (Array.isArray(body.trigger_phrases)) {
    update.trigger_phrases = body.trigger_phrases.map((s: any) => String(s))
  }
  if (Array.isArray(body.tools_used)) update.tools_used = body.tools_used
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_agent_skills')
    .update(update)
    .eq('id', params.skillId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ skill: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; skillId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('ai_agent_skills')
    .delete()
    .eq('id', params.skillId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
