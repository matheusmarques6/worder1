import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { pickEditableMomentFields } from '@/lib/ai/moments'

export const dynamic = 'force-dynamic'

// PATCH /api/ai/moments/[id] — edita, aprova, ou MATA.
//
// O kill switch é definitivo e vence a janela (§3.3.4): "matou, morreu" —
// não existe des-matar; um momento novo é um POST. Aprovação exige janela no
// futuro-ou-corrente e, se houver oferta, template_readiness é recomendada
// (o preflight do sender suprime toque de momento sem readiness — o aviso é
// da UI, o bloqueio é do sender).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const scope = { id: params.id, organization_id: auth.user.organization_id }

  if (body.status === 'killed') {
    const { data, error } = await supabase
      .from('commercial_moments')
      .update({ status: 'killed', killed_at: new Date().toISOString() })
      .eq('id', scope.id)
      .eq('organization_id', scope.organization_id)
      .select('*')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Momento não encontrado' }, { status: 404 })
    return NextResponse.json({ moment: data })
  }

  const updates: Record<string, any> = pickEditableMomentFields(body)
  if (body.status === 'approved') updates.status = 'approved'
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  // Morto não se edita nem se reaprova.
  const { data, error } = await supabase
    .from('commercial_moments')
    .update(updates)
    .eq('id', scope.id)
    .eq('organization_id', scope.organization_id)
    .is('killed_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('Error updating moment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Momento não encontrado (ou já foi morto pelo kill switch)' },
      { status: 404 }
    )
  }
  return NextResponse.json({ moment: data })
}
