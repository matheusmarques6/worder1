// =============================================
// /api/forms/:id/experiment — o teste A/B de um popup.
//
//   GET  — estado: variantes, divisão, KPI, estatística por variante e a
//          avaliação (líder, significância, vencedora).
//   POST — { action }:
//          create_variant                → cópia do popup como variante B/C/D
//          remove_variant { variant_id } → só com o experimento parado
//          update { split, kpi, mode, min_sample, max_days, confidence,
//                   auto_apply_winner, bandit_min_views, name }
//          start | stop
//          apply_winner { variant_id }   → design da variante vira o do popup
//
// Tudo escopado pela organização da sessão; o popup precisa ser dela e
// ser o principal (variante não tem experimento próprio).
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getExperimentBundle,
  createVariant,
  removeVariant,
  updateExperiment,
  startExperiment,
  stopExperiment,
  applyWinner,
} from '@/lib/popups/experiment-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  try {
    const bundle = await getExperimentBundle(getSupabaseAdmin(), auth.user.organization_id, params.id)
    if (!bundle) return NextResponse.json({ error: 'Popup não encontrado' }, { status: 404 })
    return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível carregar o experimento' }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()
  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const action = String(body.action || '')

  try {
    switch (action) {
      case 'create_variant':
        await createVariant(admin, orgId, params.id)
        break
      case 'remove_variant':
        if (!UUID_RE.test(String(body.variant_id || ''))) return NextResponse.json({ error: 'variant_id inválido' }, { status: 400 })
        await removeVariant(admin, orgId, params.id, body.variant_id)
        break
      case 'update':
        await updateExperiment(admin, orgId, params.id, body.patch || body)
        break
      case 'start':
        if (body.patch) await updateExperiment(admin, orgId, params.id, body.patch)
        await startExperiment(admin, orgId, params.id)
        break
      case 'stop':
        await stopExperiment(admin, orgId, params.id, 'manual')
        break
      case 'apply_winner': {
        const winner = String(body.variant_id || '')
        if (!UUID_RE.test(winner)) return NextResponse.json({ error: 'variant_id inválido' }, { status: 400 })
        await applyWinner(admin, orgId, params.id, winner, 'manual_apply')
        break
      }
      default:
        return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
    }
    const bundle = await getExperimentBundle(admin, orgId, params.id)
    if (!bundle) return NextResponse.json({ error: 'Popup não encontrado' }, { status: 404 })
    return NextResponse.json(bundle, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Não foi possível atualizar o experimento' }, { status: 400 })
  }
}
