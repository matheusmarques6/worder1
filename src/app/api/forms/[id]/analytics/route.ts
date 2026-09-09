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
  // Fuso do navegador de quem olha (validado): os dias da série e a janela
  // dos totais ficam no mesmo calendário.
  const tzRaw = String(searchParams.get('tz') || '')
  const tz = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(tzRaw) && tzRaw.length <= 64 ? tzRaw : 'America/Sao_Paulo'
  const since = startOfDayInTz(days, tz).toISOString()

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
    admin.rpc('popup_daily_stats', { p_organization_id: orgId, p_form_id: formId, p_days: days, p_tz: tz }),
    admin.rpc('popup_holdout_report', { p_organization_id: orgId, p_form_id: formId, p_days: days }),
    admin
      .from('crm_form_submissions')
      .select('id, answers, created_at, user_agent, device, country, coupon_code, converted_at, conversion_value, offer_bucket, offer_tier, intent, propensity_score, game_prize')
      .eq('organization_id', orgId)
      .eq('form_id', formId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('consent_records')
      .select('channel, action, submission_id, contact_id')
      .eq('organization_id', orgId)
      .eq('source_ref', formId)
      .gte('occurred_at', since)
      .limit(20000),
  ].map((p) => Promise.resolve(p)))

  // Erro de consulta vira erro de verdade — zeros com HTTP 200 parecem
  // um popup que ninguém viu.
  const missingMigration = daily.error && (daily.error.code === '42883' || /does not exist/i.test(daily.error.message || ''))
  for (const [name, r] of [['série', daily], ['inscrições', subs], ['consentimentos', consents], ['grupo de controle', holdout]] as const) {
    const err = (r as any)?.error
    if (err && !(name === 'série' && missingMigration) && !(name === 'grupo de controle' && err.code === '42883')) {
      return NextResponse.json({ error: `Não foi possível carregar ${name}: ${err.message}` }, { status: 500 })
    }
  }

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
        min_reliable: 200,
      }
    : null

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

  // Opt-in confirmado por canal, e PESSOAS com pelo menos um canal
  // positivo (para o funil, que nunca pode passar das inscrições). A prova
  // está em consent_records; a taxa é sobre impressões.
  const consentRows = (consents.data || []) as Array<{ channel: string; action: string; submission_id: string | null; contact_id: string | null }>
  const optIns = { email: 0, whatsapp: 0, sms: 0, denied: 0 }
  const optedPeople = new Set<string>()
  for (const c of consentRows) {
    if (c.action === 'granted' || c.action === 'confirmed') {
      if (c.channel === 'email') optIns.email++
      else if (c.channel === 'whatsapp') optIns.whatsapp++
      else if (c.channel === 'sms') optIns.sms++
      optedPeople.add(c.submission_id || c.contact_id || `${c.channel}:${optedPeople.size}`)
    } else if (c.action === 'denied') optIns.denied++
  }
  const optInPeople = Math.min(optedPeople.size, Math.max(totals.submissions, optedPeople.size))

  // Smart Offers: inscritos por grupo (oferta por intenção × controle) com
  // pedidos e receita — a comparação que diz se a margem economizada
  // custou conversão.
  const offers: Record<'smart' | 'control', { submissions: number; orders: number; revenue: number; no_offer: number }> = {
    smart: { submissions: 0, orders: 0, revenue: 0, no_offer: 0 },
    control: { submissions: 0, orders: 0, revenue: 0, no_offer: 0 },
  }
  for (const s of submissions) {
    const b: 'smart' | 'control' | null = s.offer_bucket === 'smart' ? 'smart' : s.offer_bucket === 'control' ? 'control' : null
    if (!b) continue
    offers[b].submissions++
    if (s.offer_tier === 'none') offers[b].no_offer++
    if (s.converted_at) { offers[b].orders++; offers[b].revenue += Number(s.conversion_value) || 0 }
  }
  // Jogo: quantas vezes cada prêmio saiu e quantos desses compraram — a
  // roleta que só dá "tente de novo" aparece aqui antes de virar reclamação.
  const prizeMap = new Map<string, { label: string; prize: string; count: number; orders: number }>()
  let plays = 0
  for (const s of submissions) {
    const g: any = s.game_prize
    if (!g || typeof g !== 'object') continue
    // Reenvio devolve o mesmo resultado — não é uma jogada nova.
    if (g.replay) continue
    plays++
    const key = `${g.segment_id || g.segment}|${g.label || ''}`
    const row = prizeMap.get(key) || { label: String(g.label || '—'), prize: String(g.prize || 'base'), count: 0, orders: 0 }
    row.count++
    if (s.converted_at) row.orders++
    prizeMap.set(key, row)
  }
  const games = plays > 0 ? { plays, prizes: [...prizeMap.values()].sort((a, b) => b.count - a.count) } : null
  const propScores = submissions.map((s) => Number(s.propensity_score)).filter((n) => Number.isFinite(n))
  const avgPropensity = propScores.length ? Math.round(propScores.reduce((a, b) => a + b, 0) / propScores.length) : null

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
      opt_in_rate: totals.impressions > 0 ? optInPeople / totals.impressions : 0,
      opt_ins: optIns,
      opt_in_people: optInPeople,
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
    offers: (offers.smart.submissions + offers.control.submissions) > 0 ? offers : null,
    games,
    avg_propensity: avgPropensity,
    holdout: {
      configured: holdoutRows.length > 0 && !!control,
      min_visitors: 30,
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

// Meia-noite de N-1 dias atrás no fuso pedido, em UTC.
function startOfDayInTz(days: number, tz: string): Date {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const localMidnightUtc = Date.UTC(get('year'), get('month') - 1, get('day'))
    // Diferença entre o "agora" local e o UTC diz o offset do fuso.
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime()
    const offset = localNow - now.getTime()
    return new Date(localMidnightUtc - offset - (days - 1) * 86400000)
  } catch {
    return new Date(Date.now() - days * 86400000)
  }
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
