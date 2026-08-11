import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { pickEditableMissionFields } from '@/lib/ai/missions'

export const dynamic = 'force-dynamic'

// PATCH /api/ai/missions/[id] — edita campos de um draft, arquiva, ou ATIVA.
//
// Ativação usa a RPC activate_ai_mission (migration 0009): arquiva-e-ativa num
// comando — o índice one-active transforma corrida em erro, nunca em duas
// ativas. Editar conteúdo de missão ativa não é permitido: versão nova é um
// POST com parent_version_id (a história das versões é a trilha do lojista).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const organizationId = auth.user.organization_id

  if (body.status === 'active') {
    const { data, error } = await supabase.rpc('activate_ai_mission', {
      p_organization_id: organizationId,
      p_mission_id: params.id,
    })
    if (error) {
      console.error('Error activating mission:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Missão não encontrada' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  }

  const updates: Record<string, any> = pickEditableMissionFields(body)
  if (body.status === 'archived') updates.status = 'archived'
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  // Conteúdo só muda em draft; arquivar pode a partir de qualquer status.
  let query = supabase
    .from('ai_missions')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', organizationId)
  if (updates.status !== 'archived') {
    query = query.eq('status', 'draft')
  }
  const { data, error } = await query.select('*').maybeSingle()

  if (error) {
    console.error('Error updating mission:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Missão não encontrada (ou não é um rascunho editável)' },
      { status: 404 }
    )
  }
  return NextResponse.json({ mission: data })
}
