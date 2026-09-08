// =============================================
// /api/forms/:id/coupon-pool
//
//   GET  — estado dos pools de cupom do popup: a base e um por tier de
//          recompensa progressiva (estoque pronto, entregues, usados,
//          erro da última reposição).
//   POST — sincroniza os pools com o bloco de cupom e cria um lote em cada
//          agora, sem esperar o cron. Útil ao publicar e ao mudar o desconto.
//
// Tudo escopado pela organização da sessão; o formulário precisa ser dela.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listPoolStatuses, replenishPool, syncPoolFromForm, type PoolStatus } from '@/lib/coupons/pool-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function serializeOne(status: PoolStatus) {
  const p = status.pool!
  return {
    id: p.id,
    tier_key: p.tier_key || 'base',
    name: p.name,
    status: p.status,
    kind: p.kind,
    value: Number(p.value),
    currency: p.currency,
    code_prefix: p.code_prefix,
    validity_days: p.validity_days,
    min_stock: p.min_stock,
    last_error: p.last_error,
    last_replenished_at: p.last_replenished_at,
    stock: { usable: status.usable, free: status.free, reserved: status.reserved, consumed: status.consumed, expired: status.expired },
    needs_replenish: status.needs_replenish,
  }
}

function serialize(statuses: PoolStatus[]) {
  const withPool = statuses.filter((s) => s.pool)
  const base = withPool.find((s) => (s.pool!.tier_key || 'base') === 'base') || null
  return {
    // Compatível com quem lia um pool só.
    pool: base ? serializeOne(base) : null,
    stock: base ? serializeOne(base).stock : { usable: 0, free: 0, reserved: 0, consumed: 0, expired: 0 },
    needs_replenish: withPool.some((s) => s.needs_replenish),
    pools: withPool.map(serializeOne),
  }
}

async function ownedForm(orgId: string, formId: string) {
  const admin = getSupabaseAdmin()
  const { data } = await admin
    .from('crm_forms')
    .select('id, organization_id, store_id, name, design_json')
    .eq('id', formId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const form = await ownedForm(orgId, params.id)
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })
  return NextResponse.json(serialize(await listPoolStatuses(orgId, params.id)))
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const form = await ownedForm(orgId, params.id)
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })

  try {
    const synced = await syncPoolFromForm(form)
    if (!synced.pools.length) {
      return NextResponse.json({ error: `Este popup não usa cupom único (${synced.reason}).` }, { status: 400 })
    }
    const budget = Math.max(4000, Math.floor(20000 / synced.pools.length))
    let created = 0
    let stopped: string | null = null
    let error: string | null = null
    for (const p of synced.pools) {
      const r = await replenishPool(p.id, orgId, { maxCreate: 25, timeBudgetMs: budget })
      created += r.created
      if (r.stopped) stopped = r.stopped
      if (r.error) error = r.error
    }
    return NextResponse.json({ ...serialize(await listPoolStatuses(orgId, params.id)), created, stopped, error })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível repor o pool' }, { status: 500 })
  }
}
