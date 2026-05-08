// =============================================
// GET    /api/ai/agents/[id]/simulations/[simId] → detalhe (transcript, eval)
// DELETE /api/ai/agents/[id]/simulations/[simId] → remove
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; simId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_simulations')
    .select('*')
    .eq('id', params.simId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'simulação não encontrada' }, { status: 404 })
  return NextResponse.json({ simulation: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; simId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('ai_simulations')
    .delete()
    .eq('id', params.simId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
