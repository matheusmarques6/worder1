// =============================================
// Pool de cupons de um popup
//
// O bloco de cupom do popup descreve o desconto; o pool é o estoque de
// códigos únicos já criados na Shopify para ele. Quem enche é o cron
// (e a publicação, para os primeiros); quem esvazia é o submit, via
// issue_popup_incentive → reserve_coupon_code. Este módulo nunca roda
// no caminho do visitante — só o banco roda lá.
//
// Multi-tenant: toda leitura e escrita carrega organization_id; o token
// da loja sai da shopify_stores da MESMA org do pool, nunca de um id
// vindo de fora.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  createUniqueDiscount,
  deleteDiscount,
  generateCouponCode,
  isDuplicateCodeError,
  type CouponKind,
} from './shopify-discounts'
import { ShopifyThrottledError } from '@/lib/shopify/graphql-client'
import { readRewardTiers, type RewardTier } from '@/lib/popups/branching'

export interface CouponPoolRow {
  id: string
  organization_id: string
  store_id: string
  form_id: string | null
  tier_key: string
  name: string
  kind: CouponKind
  value: number
  currency: string
  code_prefix: string
  validity_days: number
  pool_buffer_days: number
  min_stock: number
  batch_size: number
  minimum_subtotal: number | null
  applies_to: { collections?: string[] } | null
  combines_with: { order?: boolean; product?: boolean; shipping?: boolean } | null
  status: 'active' | 'paused' | 'error'
  last_error: string | null
  last_replenished_at: string | null
}

export interface PoolStatus {
  pool: CouponPoolRow | null
  free: number
  reserved: number
  consumed: number
  expired: number
  /** códigos livres que ainda cobrem a validade prometida */
  usable: number
  needs_replenish: boolean
}

export interface CouponBlockConfig {
  mode: 'static' | 'unique'
  kind: CouponKind
  value: number
  validityDays: number
  codePrefix: string
  staticCode: string | null
  minimumSubtotal: number | null
  combinesWith: { order: boolean; product: boolean; shipping: boolean }
  autoApply: boolean
  showCode: boolean
  collectionIds: string[]
  /** Recompensa progressiva: tiers desbloqueados por etapa (Fase 2). */
  tiers: RewardTier[]
}

/** O desconto efetivo de um tier (ou da base, quando tier é nulo). */
export function effectiveDiscount(cfg: CouponBlockConfig, tier: RewardTier | null) {
  if (!tier) return { kind: cfg.kind, value: cfg.value, staticCode: cfg.staticCode, codePrefix: cfg.codePrefix, tierKey: 'base' }
  return {
    kind: tier.kind,
    value: tier.value,
    staticCode: tier.staticCode || cfg.staticCode,
    codePrefix: tier.codePrefix || cfg.codePrefix,
    tierKey: tier.id,
  }
}

/** Lê o bloco de cupom do design (o primeiro, em qualquer etapa). */
export function readCouponBlock(designJson: any): CouponBlockConfig | null {
  const blocks: any[] = []
  for (const step of designJson?.steps || []) if (Array.isArray(step?.blocks)) blocks.push(...step.blocks)
  if (Array.isArray(designJson?.successStep?.blocks)) blocks.push(...designJson.successStep.blocks)
  const b = blocks.find((x) => x?.type === 'coupon')
  if (!b) return null
  const p = b.props || {}
  const mode: 'static' | 'unique' = p.mode === 'unique' || p.mode === 'dynamic' ? 'unique' : 'static'
  const kind: CouponKind =
    p.discountType === 'free_shipping' ? 'free_shipping'
      : p.discountType === 'fixed_amount' || p.discountType === 'fixed' ? 'fixed'
        : 'percent'
  const cw = p.combinesWith || {}
  return {
    mode,
    kind,
    value: kind === 'free_shipping' ? 0 : Math.max(0, Number(p.discountValue) || (kind === 'percent' ? 10 : 0)),
    validityDays: Math.max(1, Math.min(365, Math.round(Number(p.validityDays) || 7))),
    codePrefix: String(p.codePrefix || 'POPUP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'POPUP',
    staticCode: String(p.code || '').trim().toUpperCase() || null,
    minimumSubtotal: Number(p.minimumAmount) > 0 ? Number(p.minimumAmount) : null,
    combinesWith: { order: cw.order === true, product: cw.product !== false, shipping: cw.shipping !== false },
    autoApply: p.autoApply !== false,
    showCode: p.showCode !== false,
    collectionIds: Array.isArray(p.collectionIds) ? p.collectionIds.filter((x: any) => typeof x === 'string' && x.startsWith('gid://')) : [],
    tiers: readRewardTiers(p),
  }
}

interface FormForPool {
  id: string
  organization_id: string
  store_id: string | null
  name?: string | null
  design_json?: any
}

/**
 * Faz os pools refletirem o bloco de cupom do popup: um para a base
 * ('base') e um por tier de recompensa progressiva — cada tier é um
 * desconto diferente na Shopify, logo um estoque diferente. Sem bloco (ou
 * bloco estático) os pools existentes ficam pausados — nunca apagados: os
 * códigos já entregues continuam válidos na Shopify e no ledger.
 *
 * Devolve o pool da base (o que o submit usa quando nenhum tier casa).
 */
export async function syncPoolFromForm(form: FormForPool): Promise<{ pool: CouponPoolRow | null; pools: CouponPoolRow[]; reason?: string }> {
  const admin = getSupabaseAdmin()
  const cfg = readCouponBlock(form.design_json)

  const { data: existingRows } = await admin
    .from('coupon_pools')
    .select('*')
    .eq('organization_id', form.organization_id)
    .eq('form_id', form.id)
  const existing = (existingRows || []) as CouponPoolRow[]

  const pauseAll = async (reason: string) => {
    const active = existing.filter((p) => p.status === 'active')
    if (active.length) {
      await admin.from('coupon_pools').update({ status: 'paused' })
        .in('id', active.map((p) => p.id)).eq('organization_id', form.organization_id)
    }
    return { pool: null, pools: [], reason }
  }

  if (!cfg || cfg.mode !== 'unique' || !form.store_id) {
    return pauseAll(!cfg ? 'sem bloco de cupom' : cfg.mode !== 'unique' ? 'cupom estático' : 'popup sem loja')
  }

  // A loja tem de ser da org do popup — o store_id vem do formulário, que
  // já foi validado na rota, mas a checagem é barata e o dano seria grande.
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, currency')
    .eq('id', form.store_id)
    .eq('organization_id', form.organization_id)
    .maybeSingle()
  if (!store) return { pool: null, pools: [], reason: 'loja não pertence à organização' }

  const wanted: Array<{ tierKey: string; label: string; kind: CouponKind; value: number; codePrefix: string }> = [
    { tierKey: 'base', label: '', kind: cfg.kind, value: cfg.value, codePrefix: cfg.codePrefix },
    ...cfg.tiers.map((t) => ({ tierKey: t.id, label: t.label, kind: t.kind, value: t.value, codePrefix: t.codePrefix || cfg.codePrefix })),
  ]

  const out: CouponPoolRow[] = []
  for (const w of wanted) {
    const payload = {
      organization_id: form.organization_id,
      store_id: form.store_id,
      form_id: form.id,
      tier_key: w.tierKey,
      name: `Popup · ${form.name || form.id}${w.label ? ` · ${w.label}` : ''}`,
      kind: w.kind,
      value: w.value,
      currency: store.currency || 'BRL',
      code_prefix: w.codePrefix,
      validity_days: cfg.validityDays,
      minimum_subtotal: cfg.minimumSubtotal,
      applies_to: cfg.collectionIds.length ? { collections: cfg.collectionIds } : {},
      combines_with: cfg.combinesWith,
      status: 'active' as const,
      last_error: null,
    }
    const cur = existing.find((p) => (p.tier_key || 'base') === w.tierKey)
    if (cur) {
      // Mudou o desconto? Os códigos livres antigos carregam o desconto
      // antigo na Shopify — saem de circulação e o cron cria novos.
      const changed =
        cur.kind !== payload.kind ||
        Number(cur.value) !== Number(payload.value) ||
        Number(cur.minimum_subtotal || 0) !== Number(payload.minimum_subtotal || 0) ||
        JSON.stringify(cur.combines_with || {}) !== JSON.stringify(payload.combines_with) ||
        JSON.stringify(cur.applies_to || {}) !== JSON.stringify(payload.applies_to)
      const { data: updated, error } = await admin
        .from('coupon_pools')
        .update(payload)
        .eq('id', cur.id)
        .eq('organization_id', form.organization_id)
        .select('*')
        .single()
      if (error) throw new Error(`coupon_pools update: ${error.message}`)
      if (changed) await voidFreeCodes(updated as CouponPoolRow, 'desconto do popup mudou')
      out.push(updated as CouponPoolRow)
    } else {
      const { data: created, error } = await admin.from('coupon_pools').insert(payload).select('*').single()
      if (error) throw new Error(`coupon_pools insert: ${error.message}`)
      out.push(created as CouponPoolRow)
    }
  }

  // Tiers que saíram do bloco: pausa (os códigos entregues seguem válidos).
  const keep = new Set(wanted.map((w) => w.tierKey))
  const stale = existing.filter((p) => !keep.has(p.tier_key || 'base') && p.status === 'active')
  if (stale.length) {
    await admin.from('coupon_pools').update({ status: 'paused' })
      .in('id', stale.map((p) => p.id)).eq('organization_id', form.organization_id)
  }

  return { pool: out.find((p) => (p.tier_key || 'base') === 'base') || null, pools: out }
}

async function loadStoreForPool(pool: CouponPoolRow) {
  const admin = getSupabaseAdmin()
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, access_token')
    .eq('id', pool.store_id)
    .eq('organization_id', pool.organization_id)
    .maybeSingle()
  if (!store?.access_token || !store.shop_domain) return null
  return store as { id: string; organization_id: string; shop_domain: string; access_token: string }
}

async function countCodes(pool: CouponPoolRow) {
  const admin = getSupabaseAdmin()
  const base = () => admin.from('coupon_codes').select('id', { count: 'exact', head: true }).eq('pool_id', pool.id).eq('organization_id', pool.organization_id)
  const usableAfter = new Date(Date.now() + pool.validity_days * 86400000).toISOString()
  const [free, usable, reserved, consumed, expired] = await Promise.all([
    base().eq('status', 'free'),
    base().eq('status', 'free').gt('expires_at', usableAfter),
    base().eq('status', 'reserved'),
    base().eq('status', 'consumed'),
    base().eq('status', 'expired'),
  ])
  return {
    free: free.count || 0,
    usable: usable.count || 0,
    reserved: reserved.count || 0,
    consumed: consumed.count || 0,
    expired: expired.count || 0,
  }
}

export async function getPoolStatus(organizationId: string, formId: string, tierKey = 'base'): Promise<PoolStatus> {
  const admin = getSupabaseAdmin()
  const { data: pool } = await admin
    .from('coupon_pools')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('form_id', formId)
    .eq('tier_key', tierKey)
    .maybeSingle()
  if (!pool) return { pool: null, free: 0, usable: 0, reserved: 0, consumed: 0, expired: 0, needs_replenish: false }
  const c = await countCodes(pool as CouponPoolRow)
  return { pool: pool as CouponPoolRow, ...c, needs_replenish: pool.status === 'active' && c.usable < pool.min_stock }
}

/** Todos os pools do popup (base + tiers), com estoque. */
export async function listPoolStatuses(organizationId: string, formId: string): Promise<PoolStatus[]> {
  const admin = getSupabaseAdmin()
  const { data: pools } = await admin
    .from('coupon_pools')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('form_id', formId)
    .order('created_at', { ascending: true })
  const out: PoolStatus[] = []
  for (const p of (pools || []) as CouponPoolRow[]) {
    const c = await countCodes(p)
    out.push({ pool: p, ...c, needs_replenish: p.status === 'active' && c.usable < p.min_stock })
  }
  return out
}

export interface ReplenishResult {
  created: number
  usable: number
  stopped?: 'budget' | 'throttled' | 'error'
  error?: string
}

/**
 * Cria códigos até o estoque utilizável chegar a 2× min_stock, respeitando
 * batch_size, um teto por chamada e um orçamento de tempo — o cron tem 60 s
 * e a Shopify repõe 50 pontos/s.
 */
export async function replenishPool(
  poolId: string,
  organizationId: string,
  opts: { maxCreate?: number; timeBudgetMs?: number } = {},
): Promise<ReplenishResult> {
  const admin = getSupabaseAdmin()
  const started = Date.now()
  const budget = opts.timeBudgetMs ?? 40000

  const { data: poolRow } = await admin
    .from('coupon_pools')
    .select('*')
    .eq('id', poolId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  const pool = poolRow as CouponPoolRow | null
  if (!pool) return { created: 0, usable: 0, stopped: 'error', error: 'pool não encontrado' }
  if (pool.status === 'paused') return { created: 0, usable: 0 }

  const store = await loadStoreForPool(pool)
  if (!store) {
    await admin.from('coupon_pools').update({ status: 'error', last_error: 'loja sem token de acesso' }).eq('id', pool.id)
    return { created: 0, usable: 0, stopped: 'error', error: 'loja sem token de acesso' }
  }

  // Códigos que já não cobrem a validade prometida saem antes de contar.
  await expireShortCodes(pool, store)

  const counts = await countCodes(pool)
  const target = pool.min_stock * 2
  let need = Math.max(0, target - counts.usable)
  need = Math.min(need, pool.batch_size, opts.maxCreate ?? pool.batch_size)
  if (need === 0) return { created: 0, usable: counts.usable }

  const endsAt = new Date(Date.now() + (pool.validity_days + pool.pool_buffer_days) * 86400000)
  let created = 0
  let stopped: ReplenishResult['stopped'] | undefined
  let lastError: string | undefined

  for (let i = 0; i < need; i++) {
    if (Date.now() - started > budget) { stopped = 'budget'; break }
    let attempt = 0
    let done = false
    while (attempt < 3 && !done) {
      attempt++
      const code = generateCouponCode(pool.code_prefix)
      try {
        const res = await createUniqueDiscount(store, {
          code,
          title: `${pool.name} · ${code}`,
          kind: pool.kind,
          value: Number(pool.value) || 0,
          currency: pool.currency,
          endsAt,
          minimumSubtotal: pool.minimum_subtotal,
          combinesWith: pool.combines_with || undefined,
          collectionIds: pool.applies_to?.collections || [],
        })
        const { error } = await admin.from('coupon_codes').insert({
          pool_id: pool.id,
          organization_id: pool.organization_id,
          code: res.code,
          shopify_discount_id: res.discountId,
          status: 'free',
          expires_at: endsAt.toISOString(),
        })
        if (error) {
          // O desconto existe na Shopify mas não no banco: apaga lá para
          // não deixar um código órfão válido.
          await deleteDiscount(store, res.discountId).catch(() => {})
          throw new Error(`coupon_codes insert: ${error.message}`)
        }
        created++
        done = true
      } catch (err: any) {
        if (isDuplicateCodeError(err)) continue // tenta outro código
        if (err instanceof ShopifyThrottledError) { stopped = 'throttled'; lastError = 'Shopify limitou a taxa'; break }
        stopped = 'error'
        lastError = err?.message || String(err)
        break
      }
    }
    if (stopped === 'throttled' || stopped === 'error') break
  }

  await admin.from('coupon_pools').update({
    last_replenished_at: new Date().toISOString(),
    status: stopped === 'error' ? 'error' : 'active',
    last_error: lastError || null,
  }).eq('id', pool.id).eq('organization_id', pool.organization_id)

  const after = await countCodes(pool)
  return { created, usable: after.usable, stopped, error: lastError }
}

/** Códigos livres que venceriam antes de honrar a validade prometida. */
async function expireShortCodes(pool: CouponPoolRow, store: { shop_domain: string; access_token: string; id: string; organization_id: string }) {
  const admin = getSupabaseAdmin()
  const limit = new Date(Date.now() + pool.validity_days * 86400000).toISOString()
  const { data: rows } = await admin
    .from('coupon_codes')
    .select('id, shopify_discount_id')
    .eq('pool_id', pool.id)
    .eq('organization_id', pool.organization_id)
    .eq('status', 'free')
    .lte('expires_at', limit)
    .limit(50)
  for (const r of rows || []) {
    await admin.from('coupon_codes').update({ status: 'expired' }).eq('id', r.id).eq('organization_id', pool.organization_id)
    if (r.shopify_discount_id) await deleteDiscount(store, r.shopify_discount_id).catch(() => {})
  }
}

/** Tira de circulação os códigos livres (desconto mudou). */
async function voidFreeCodes(pool: CouponPoolRow, reason: string) {
  const admin = getSupabaseAdmin()
  const store = await loadStoreForPool(pool)
  const { data: rows } = await admin
    .from('coupon_codes')
    .select('id, shopify_discount_id')
    .eq('pool_id', pool.id)
    .eq('organization_id', pool.organization_id)
    .eq('status', 'free')
    .limit(500)
  for (const r of rows || []) {
    await admin.from('coupon_codes').update({ status: 'void' }).eq('id', r.id).eq('organization_id', pool.organization_id)
    if (store && r.shopify_discount_id) await deleteDiscount(store, r.shopify_discount_id).catch(() => {})
  }
  console.log(`[coupon-pool] ${rows?.length || 0} códigos anulados no pool ${pool.id}: ${reason}`)
}

/** Para o cron: pools ativos que estão abaixo do estoque mínimo. */
export async function listPoolsNeedingStock(limit = 20): Promise<CouponPoolRow[]> {
  const admin = getSupabaseAdmin()
  const { data: pools } = await admin
    .from('coupon_pools')
    .select('*')
    .eq('status', 'active')
    .order('last_replenished_at', { ascending: true, nullsFirst: true })
    .limit(limit * 3)
  const out: CouponPoolRow[] = []
  for (const p of (pools || []) as CouponPoolRow[]) {
    const c = await countCodes(p)
    if (c.usable < p.min_stock) out.push(p)
    if (out.length >= limit) break
  }
  return out
}
