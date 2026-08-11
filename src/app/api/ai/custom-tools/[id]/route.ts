import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH — hoje só liga/desliga. Ligar exige teste ok: o CHECK do schema é o
// juiz final; aqui a recusa vira mensagem legível.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled é obrigatório' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (body.enabled) {
    const { data: row } = await supabase
      .from('ai_agent_custom_tools')
      .select('last_test_status')
      .eq('id', params.id)
      .eq('organization_id', auth.user.organization_id)
      .single()
    if (!row) return NextResponse.json({ error: 'Tool não encontrada' }, { status: 404 })
    if (row.last_test_status !== 'ok') {
      return NextResponse.json(
        { error: 'Teste a chamada antes de ligar — obrigatório (10.7).' },
        { status: 409 }
      )
    }
  }

  const { error } = await supabase
    .from('ai_agent_custom_tools')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { error } = await getSupabaseAdmin()
    .from('ai_agent_custom_tools')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
