// =============================================
// POST /api/ai/agents/[id]/simulations/[simId]/run
// Executa a simulação contra o script e persiste transcrição + eval.
// Síncrono (até 60s) — pra scripts maiores, considerar QStash assíncrono.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { runSimulation } from '@/lib/ai/simulator'
import { isLLMConfigured } from '@/lib/ai/llm/client'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; simId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!isLLMConfigured()) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY ausente' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({} as any))
  const useRAG = !!body.use_rag

  // Verifica ownership
  const supabase = getSupabaseAdmin()
  const { data: sim } = await supabase
    .from('ai_simulations')
    .select('id, status')
    .eq('id', params.simId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()
  if (!sim) {
    return NextResponse.json({ error: 'simulação não encontrada' }, { status: 404 })
  }

  try {
    const out = await runSimulation({ simulationId: params.simId, useRAG })
    return NextResponse.json({
      ok: true,
      simulation_id: params.simId,
      transcript_messages: out.transcript.length,
      eval_score: out.evalResult?.score ?? null,
      eval_per_criterion: out.evalResult?.per_criterion ?? null,
      duration_ms: out.durationMs,
      total_cost_usd: out.totalCostUsd,
    })
  } catch (err) {
    await supabase
      .from('ai_simulations')
      .update({
        status: 'failed',
        eval_feedback: { error: err instanceof Error ? err.message : 'unknown' },
      })
      .eq('id', params.simId)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro desconhecido' },
      { status: 500 },
    )
  }
}
