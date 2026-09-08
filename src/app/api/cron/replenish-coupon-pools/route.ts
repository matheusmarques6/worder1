// =============================================
// CRON: repor os pools de cupom dos popups
// /api/cron/replenish-coupon-pools — a cada 2 minutos
//
// Cada pool ativo abaixo do estoque mínimo recebe um lote de códigos
// novos (cada um o seu próprio desconto na Shopify, uso único). O submit
// nunca cria código — só reserva do que está aqui.
//
// Orçamento: 60 s de função, ~40 s de criação, um pool por vez em ordem
// de quem foi reposto há mais tempo. Se a Shopify limitar a taxa, o pool
// fica para a próxima rodada; o erro fica gravado no pool para a tela.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { listPoolsNeedingStock, replenishPool } from '@/lib/coupons/pool-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const results: Array<{ pool_id: string; form_id: string | null; created: number; usable: number; stopped?: string; error?: string }> = []
  try {
    const pools = await listPoolsNeedingStock(10)
    for (const pool of pools) {
      const remaining = 45000 - (Date.now() - started)
      if (remaining < 5000) break
      const r = await replenishPool(pool.id, pool.organization_id, { timeBudgetMs: Math.min(remaining, 30000) })
      results.push({ pool_id: pool.id, form_id: pool.form_id, created: r.created, usable: r.usable, stopped: r.stopped, error: r.error })
      if (r.stopped === 'throttled') break
    }
    return NextResponse.json({ ok: true, pools: results.length, results, ms: Date.now() - started })
  } catch (e: any) {
    console.error('[replenish-coupon-pools] falhou:', e?.message)
    return NextResponse.json({ ok: false, error: e?.message, results }, { status: 500 })
  }
}
