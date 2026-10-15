import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// Plano IA M5 passo 30 — reconhecer ({status:'acknowledged'}) ou resolver
// ({status:'resolved'}) um alerta da org. Reconhecer libera o dedup_key para
// o mesmo problema abrir de novo se voltar a acontecer só depois de resolvido.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const status = body?.status
  if (status !== 'acknowledged' && status !== 'resolved') {
    return NextResponse.json({ error: "status deve ser 'acknowledged' ou 'resolved'" }, { status: 400 })
  }
  const now = new Date().toISOString()
  const patch: Record<string, unknown> =
    status === 'acknowledged'
      ? { status, acknowledged_at: now, acknowledged_by: auth.user.id }
      : { status, resolved_at: now }
  const { data, error } = await getSupabaseAdmin()
    .from('alerts')
    .update(patch)
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select('id, status')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Alerta não encontrado' }, { status: 404 })
  return NextResponse.json({ alert: data })
}
