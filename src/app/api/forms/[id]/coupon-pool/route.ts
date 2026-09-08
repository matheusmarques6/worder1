// =============================================
// /api/forms/:id/coupon-pool
//
//   GET  — estado do pool de cupons do popup (estoque livre, reservados,
//          usados, erro da última reposição).
//   POST — sincroniza o pool com o bloco de cupom e cria um lote agora,
//          sem esperar o cron. Útil ao publicar e ao mudar o desconto.
//
// Tudo escopado pela organização da sessão; o formulário precisa ser dela.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getPoolStatus, replenishPool, syncPoolFromForm } from '@/lib/coupons/pool-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function serialize(status: Awaited<ReturnType<typeof getPoolStatus>>) {
  const p = status.pool
  return {
    pool: p ? {
      id: p.id,
      status: p.status,
      kind: p.kind,
      value: Number(p.value),
      currency: p.currency,
      code_prefix: p.code_prefix,
      validity_days: p.validity_days,
      min_stock: p.min_stock,
      last_error: p.last_error,
      last_replenished_at: p.last_replenished_at,
    } : null,
    stock: { usable: status.usable, free: status.free, reserved: status.reserved, consumed: status.consumed, expired: status.expired },
    needs_replenish: status.needs_replenish,
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()
  const { data: form } = await admin.from('crm_forms').select('id').eq('id', params.id).eq('organization_id', orgId).maybeSingle()
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  const status = await getPoolStatus(orgId, params.id)
  return NextResponse.json(serialize(status))
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()
  const { data: form } = await admin
    .from('crm_forms')
    .select('id, organization_id, store_id, name, design_json')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })

  try {
    const synced = await syncPoolFromForm(form)
    if (!synced.pool) {
      return NextResponse.json({ error: `Este popup não usa cupom único (${synced.reason}).` }, { status: 400 })
    }
    const r = await replenishPool(synced.pool.id, orgId, { maxCreate: 25, timeBudgetMs: 20000 })
    const status = await getPoolStatus(orgId, params.id)
    return NextResponse.json({ ...serialize(status), created: r.created, stopped: r.stopped || null, error: r.error || null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível repor o pool' }, { status: 500 })
  }
}
