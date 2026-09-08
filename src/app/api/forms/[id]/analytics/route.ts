// =============================================
// GET /api/forms/:id/analytics?days=30
//
// A série diária REAL de um popup (impressões, envios, fechamentos,
// hold-out), os totais do período, o funil, a quebra por dispositivo e
// as últimas inscrições. A versão anterior dividia o contador total pelo
// número de dias e desenhava uma reta.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  return Math.min(365, Math.max(1, Math.round(n)))
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const formId = params.id
  const { searchParams } = new URL(request.url)
  const days = clampDays(searchParams.get('days'))
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const admin = getSupabaseAdmin()

  // O formulário precisa ser da org — é o que impede ler a série de um
  // popup alheio pelo id.
  const { data: form } = await admin
    .from('crm_forms')
    .select('id, name, form_type, status, store_id, created_at, attributed_revenue, attributed_orders, driven_revenue, driven_orders, influenced_revenue, influenced_orders, views_count, submissions_count, dismissals_count')
    .eq('id', formId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 })

  const [daily, subs, consents, holdout] = await Promise.all([
    admin.rpc('popup_daily_stats', { p_organization_id: orgId, p_form_id: formId, p_days: days }),
    admin.rpc('popup_holdout_report', { p_organization_id: orgId, p_form_id: formId, p_days: days }),
    admin
      .from('crm_form_submissions')
      .select('id, answers, created_at, user_agent, device, country, coupon_code, coupon_kind, converted_at, conversion_value, contact_id')
      .eq('organization_id', orgId)
      .eq('form_id', formId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('consent_records')
      .select('channel, action')
      .eq('organization_id', orgId)
      .eq('source_ref', formId)
      .gte('occurred_at', since)
      .limit(5000),
  ].map((p) => Promise.resolve(p)))

  // Relatório de hold-out: quem viu × quem foi sorteado para não ver, no
  // mesmo período, com compras na janela após o sorteio. Receita
  // incremental = a diferença por visitante, escalada para os expostos.
  const holdoutRows = ((holdout as any)?.data || []) as Array<{ bucket: string; visitors: number; identified: number; buyers: number; orders: number; revenue: number }>
  const exposed = holdoutRows.find((r) => r.bucket === 'exposed')
  const control = holdoutRows.find((r) => r.bucket === 'holdout')
  const perVisitor = (r?: typeof exposed) => (r && Number(r.visitors) > 0 ? Number(r.revenue) / Number(r.visitors) : 0)
  const convRate = (r?: typeof exposed) => (r && Number(r.visitors) > 0 ? Number(r.buyers) / Number(r.visitors) : 0)
  const incremental = exposed && control && Number(control.visitors) >= 30 && Number(exposed.visitors) >= 30
    ? {
        exposed: { visitors: Number(exposed.visitors), buyers: Number(exposed.buyers), revenue: Number(exposed.revenue), conversion: convRate(exposed), revenue_per_visitor: perVisitor(exposed) },
        control: { visitors: Number(control.visitors), buyers: Number(control.buyers), revenue: Number(control.revenue), conversion: convRate(control), revenue_per_visitor: perVisitor(control) },
        lift_conversion: convRate(control) > 0 ? convRate(exposed) / convRate(control) - 1 : null,
        incremental_revenue: (perVisitor(exposed) - perVisitor(control)) * Number(exposed.visitors),
        reliable: Number(control.visitors) >= 200 && Number(exposed.visitors) >= 200,
      }
    : null

  const missingMigration = daily.error && (daily.error.code === '42883' || /does not exist/i.test(daily.error.message || ''))
  interface SeriesPoint { date: string; impressions: number; submissions: number; dismissals: number; holdouts: number }
  const series: SeriesPoint[] = (daily.data || []).map((r: any) => ({
    date: r.day,
    impressions: Number(r.impressions) || 0,
    submissions: Number(r.submissions) || 0,
    dismissals: Number(r.dismissals) || 0,
    holdouts: Number(r.holdouts) || 0,
  }))

  const totals = series.reduce(
    (acc: Omit<SeriesPoint, 'date'>, d: SeriesPoint) => ({
      impressions: acc.impressions + d.impressions,
      submissions: acc.submissions + d.submissions,
      dismissals: acc.dismissals + d.dismissals,
      holdouts: acc.holdouts + d.holdouts,
    }),
    { impressions: 0, submissions: 0, dismissals: 0, holdouts: 0 },
  )

  const submissions = (subs.data || []) as any[]
  const byDevice: Record<'mobile' | 'desktop' | 'tablet' | 'unknown', number> = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 }
  for (const s of submissions) {
    const d: string | null = s.device || guessDevice(s.user_agent)
    if (d === 'mobile' || d === 'desktop' || d === 'tablet') byDevice[d]++
    else byDevice.unknown++
  }

  // Opt-in confirmado = decisões positivas por canal no período. A prova
  // está em consent_records; a taxa é sobre impressões.
  const consentRows = (consents.data || []) as Array<{ channel: string; action: string }>
  const optIns = { email: 0, whatsapp: 0, sms: 0, denied: 0 }
  for (const c of consentRows) {
    if (c.action === 'granted' || c.action === 'confirmed') {
      if (c.channel === 'email') optIns.email++
      else if (c.channel === 'whatsapp') optIns.whatsapp++
      else if (c.channel === 'sms') optIns.sms++
    } else if (c.action === 'denied') optIns.denied++
  }

  const converted = submissions.filter((s) => s.converted_at)
  const timeToPurchaseHours = converted
    .map((s) => (new Date(s.converted_at).getTime() - new Date(s.created_at).getTime()) / 3600000)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b)
  const medianHours = timeToPurchaseHours.length
    ? timeToPurchaseHours[Math.floor(timeToPurchaseHours.length / 2)]
    : null

  return NextResponse.json({
    days,
    form: {
      id: form.id,
      name: form.name,
      form_type: form.form_type,
      status: form.status,
      created_at: form.created_at,
    },
    missing_migration: missingMigration ? '20260910100000_popup_foundation' : null,
    series,
    totals: {
      ...totals,
      submit_rate: totals.impressions > 0 ? totals.submissions / totals.impressions : 0,
      dismiss_rate: totals.impressions > 0 ? totals.dismissals / totals.impressions : 0,
      opt_in_rate: totals.impressions > 0 ? optIns.email / totals.impressions : 0,
      opt_ins: optIns,
      coupons_issued: submissions.filter((s) => s.coupon_code).length,
      // Totais de vida (não do período): o motor de atribuição recalcula.
      attributed_revenue: Number(form.attributed_revenue) || 0,
      attributed_orders: Number(form.attributed_orders) || 0,
      driven_revenue: Number(form.driven_revenue) || 0,
      driven_orders: Number(form.driven_orders) || 0,
      influenced_revenue: Number((form as any).influenced_revenue) || 0,
      influenced_orders: Number((form as any).influenced_orders) || 0,
      period_conversions: converted.length,
      period_conversion_value: converted.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0),
      median_time_to_purchase_hours: medianHours,
    },
    devices: byDevice,
    holdout: {
      configured: holdoutRows.length > 0 && !!control,
      rows: holdoutRows,
      incremental,
    },
    recent_submissions: submissions.slice(0, 50).map((s) => ({
      id: s.id,
      created_at: s.created_at,
      answers: redactAnswers(s.answers),
      device: s.device || guessDevice(s.user_agent),
      country: s.country,
      coupon_code: s.coupon_code,
      converted_at: s.converted_at,
      conversion_value: s.conversion_value,
    })),
  })
}

function guessDevice(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | null {
  if (!ua) return null
  const s = ua.toLowerCase()
  if (/ipad|tablet|(android(?!.*mobile))/.test(s)) return 'tablet'
  if (/mobi|iphone|ipod|android/.test(s)) return 'mobile'
  return 'desktop'
}

// A tela lista quem se inscreveu; o honeypot e os checkboxes de
// consentimento são ruído, não resposta.
function redactAnswers(answers: any): Record<string, unknown> {
  if (!answers || typeof answers !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(answers)) {
    if (k === '_wf_hp' || k === 'consent' || k.startsWith('consent__')) continue
    out[k] = v
  }
  return out
}
