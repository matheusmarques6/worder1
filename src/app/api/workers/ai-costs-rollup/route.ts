// =============================================
// Worker /api/workers/ai-costs-rollup — agrega ai_executions em
// ai_costs_daily. Pode ser disparado por:
//   - QStash schedule diário (recomendado)
//   - cron interno
//   - chamada manual de admin
//
// Quando vier via QStash, aceita a assinatura padrão upstash-signature
// (mesmo helper do worker /api/workers/ai-respond). Em chamadas manuais,
// exige UPSTASH_QSTASH_SIGNING_KEY ausente OU header x-rollup-token.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { rollupCosts } from '@/lib/ai/costs/rollup'
import { verifyQstashSignature } from '@/lib/redis/qstash'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('upstash-signature') || ''
  const valid = await verifyQstashSignature(signature, rawBody, req.url)
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const url = new URL(req.url)
  const fromDate = url.searchParams.get('from') ?? undefined
  const toDate = url.searchParams.get('to') ?? undefined
  const organizationId = url.searchParams.get('organization_id') ?? undefined

  try {
    const out = await rollupCosts({ fromDate, toDate, organizationId })
    return NextResponse.json({ ok: true, ...out })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
