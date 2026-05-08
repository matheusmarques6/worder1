// =============================================
// GET    /experiments/[expId]  → detalhe + métricas
// PATCH  /experiments/[expId]  → atualiza variants/status (start/end/draft)
// DELETE /experiments/[expId]  → remove (só draft)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { computeVariantMetrics } from '@/lib/ai/experiments'

export const dynamic = 'force-dynamic'

const VALID_STATUS = ['draft', 'running', 'ended']

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; expId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_experiments')
    .select('*')
    .eq('id', params.expId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'experimento não encontrado' }, { status: 404 })
  return NextResponse.json({ experiment: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; expId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) update.name = body.name
  if (body.description !== undefined) update.description = body.description
  if (Array.isArray(body.variants)) update.variants = body.variants
  if (typeof body.status === 'string') {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }
    update.status = body.status
    if (body.status === 'running') update.started_at = new Date().toISOString()
    if (body.status === 'ended') {
      update.ended_at = new Date().toISOString()
      // Calcula métricas + winner ao encerrar
      const { metricsByVariant, winningVariant } = await computeVariantMetrics(params.expId)
      update.metrics_by_variant = metricsByVariant
      update.winning_variant = winningVariant
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('ai_experiments')
    .update(update)
    .eq('id', params.expId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ experiment: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; expId: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  // Apenas drafts podem ser deletadas
  const { data: exp } = await supabase
    .from('ai_experiments')
    .select('status')
    .eq('id', params.expId)
    .maybeSingle()
  if (exp?.status && exp.status !== 'draft') {
    return NextResponse.json({ error: 'só é possível deletar experimentos em draft' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ai_experiments')
    .delete()
    .eq('id', params.expId)
    .eq('agent_id', params.id)
    .eq('organization_id', auth.user.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
