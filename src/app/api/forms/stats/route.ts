// =============================================
// GET /api/forms/stats?days=30&storeId=…
//
// O resumo por popup que a lista lê: impressões, visitantes únicos,
// envios, fechamentos, hold-out e as duas receitas (atribuída e por
// código). Tudo agregado no banco (popup_forms_summary) e sempre dentro
// da organização de quem pergunta — o org id vem da sessão, nunca do
// query string.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export interface FormStatsRow {
  form_id: string
  impressions: number
  unique_visitors: number
  submissions: number
  dismissals: number
  holdouts: number
  submit_rate: number
  dismiss_rate: number
  attributed_revenue: number
  attributed_orders: number
  driven_revenue: number
  driven_orders: number
}

function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  return Math.min(365, Math.max(1, Math.round(n)))
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const { searchParams } = new URL(request.url)
  const days = clampDays(searchParams.get('days'))
  const storeId = searchParams.get('storeId') || searchParams.get('store_id')

  const admin = getSupabaseAdmin()

  // A função só devolve formulários da org; o filtro de loja é o mesmo da
  // lista (loja do popup ou popup sem loja).
  const [{ data: rows, error }, { data: forms }] = await Promise.all([
    admin.rpc('popup_forms_summary', { p_organization_id: orgId, p_days: days }),
    admin.from('crm_forms').select('id, store_id').eq('organization_id', orgId),
  ])

  if (error) {
    // Função ainda não aplicada (migration popup_foundation): devolver
    // vazio é melhor do que inventar — a tela mostra zeros e diz por quê.
    if (error.code === '42883' || /function .* does not exist/i.test(error.message || '')) {
      return NextResponse.json({ days, stats: [], missing_migration: '20260910100000_popup_foundation' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allowed = new Set(
    (forms || [])
      .filter((f: any) => (storeId ? !f.store_id || f.store_id === storeId : !f.store_id))
      .map((f: any) => f.id),
  )

  const stats: FormStatsRow[] = (rows || [])
    .filter((r: any) => allowed.has(r.form_id))
    .map((r: any) => {
      const impressions = Number(r.impressions) || 0
      const submissions = Number(r.submissions) || 0
      const dismissals = Number(r.dismissals) || 0
      return {
        form_id: r.form_id,
        impressions,
        unique_visitors: Number(r.unique_visitors) || 0,
        submissions,
        dismissals,
        holdouts: Number(r.holdouts) || 0,
        submit_rate: impressions > 0 ? submissions / impressions : 0,
        dismiss_rate: impressions > 0 ? dismissals / impressions : 0,
        attributed_revenue: Number(r.attributed_revenue) || 0,
        attributed_orders: Number(r.attributed_orders) || 0,
        driven_revenue: Number(r.driven_revenue) || 0,
        driven_orders: Number(r.driven_orders) || 0,
      }
    })

  return NextResponse.json({ days, stats })
}
