// =============================================
// CRON: /api/cron/resolve-popup-experiments — a cada 30 minutos.
//
// Para cada experimento de popup em andamento: recalcula a estatística por
// variante, roda o teste de significância e
//   * aplica a vencedora (design da variante vira o do popup) quando o
//     lojista pediu aplicação automática;
//   * registra a vencedora e espera, quando não pediu;
//   * encerra por prazo (max_days) sem vencedora;
//   * no modo bandit, recalcula os pesos por contexto (Thompson).
//
// A cadência de 30 min é deliberada: avaliar a cada minuto ("peeking")
// inflaria os falsos positivos do teste z.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveRunningExperiments } from '@/lib/popups/experiment-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const results = await resolveRunningExperiments(supabaseAdmin, { limit: 50 })
    return NextResponse.json({ resolved: results.length, results })
  } catch (e: any) {
    console.error('[resolve-popup-experiments] failed:', e?.message)
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
