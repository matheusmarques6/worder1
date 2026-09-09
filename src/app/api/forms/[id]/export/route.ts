// =============================================
// GET /api/forms/:id/export?days=30&kind=submissions|daily&tz=...
//
// CSV das inscrições do período (quem, quando, de onde, cupom, oferta,
// variante, pedido) ou da série diária. Sempre da org da sessão; o
// formulário precisa ser dela. Respostas livres entram como colunas.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function csv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  return Math.min(365, Math.max(1, Math.round(n)))
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const admin = getSupabaseAdmin()
  const { searchParams } = req.nextUrl
  const days = clampDays(searchParams.get('days'))
  const kind = searchParams.get('kind') === 'daily' ? 'daily' : 'submissions'
  const tzRaw = String(searchParams.get('tz') || '')
  const tz = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,3}$/.test(tzRaw) && tzRaw.length <= 64 ? tzRaw : 'America/Sao_Paulo'

  const { data: form } = await admin.from('crm_forms').select('id, name').eq('id', params.id).eq('organization_id', orgId).maybeSingle()
  if (!form) return NextResponse.json({ error: 'Popup não encontrado' }, { status: 404 })
  const slug = String(form.name || 'popup').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'popup'
  const headers = { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }

  if (kind === 'daily') {
    const { data, error } = await admin.rpc('popup_daily_stats', { p_organization_id: orgId, p_form_id: params.id, p_days: days, p_tz: tz })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const lines = ['dia,visualizacoes,inscricoes,fechamentos,grupo_de_controle']
    for (const r of (data || []) as any[]) lines.push([r.day, r.impressions, r.submissions, r.dismissals, r.holdouts].map(csv).join(','))
    return new NextResponse('﻿' + lines.join('\n'), { headers: { ...headers, 'Content-Disposition': `attachment; filename="${slug}-por-dia-${days}d.csv"` } })
  }

  const since = new Date(Date.now() - days * 86400000).toISOString()
  const fixed = ['created_at', 'email', 'phone', 'first_name', 'last_name', 'device', 'country', 'traffic_type', 'page_kind', 'page_url', 'coupon_code', 'reward_tier', 'intent', 'offer_bucket', 'offer_tier', 'game_prize', 'variant_id', 'propensity_score', 'converted_at', 'conversion_value', 'converted_order_id']
  const rows: any[] = []
  const PAGE = 1000
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await admin
      .from('crm_form_submissions')
      .select('created_at, answers, device, country, traffic_type, page_kind, page_url, coupon_code, reward_tier, intent, offer_bucket, offer_tier, game_prize, variant_id, propensity_score, converted_at, conversion_value, converted_order_id, contact:contacts(email, phone, first_name, last_name)')
      .eq('organization_id', orgId)
      .eq('form_id', params.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  // Respostas livres viram colunas próprias (sem honeypot nem consentimentos).
  const answerKeys = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r.answers || {})) if (k !== '_wf_hp' && k !== 'consent' && !k.startsWith('consent__') && !['email', 'phone', 'whatsapp', 'first_name', 'last_name'].includes(k)) answerKeys.add(k)
  const extra = [...answerKeys].sort().slice(0, 60)
  const lines = [[...fixed, ...extra].map(csv).join(',')]
  for (const r of rows) {
    const c: any = Array.isArray(r.contact) ? r.contact[0] : r.contact
    const a = r.answers || {}
    const base = [
      r.created_at, c?.email || a.email || '', c?.phone || a.phone || a.whatsapp || '', c?.first_name || a.first_name || '', c?.last_name || a.last_name || '',
      r.device, r.country, r.traffic_type, r.page_kind, r.page_url, r.coupon_code, r.reward_tier, r.intent, r.offer_bucket, r.offer_tier, r.game_prize && typeof r.game_prize === 'object' ? r.game_prize.label : null, r.variant_id, r.propensity_score, r.converted_at, r.conversion_value, r.converted_order_id,
    ]
    lines.push([...base, ...extra.map((k) => a[k])].map(csv).join(','))
  }
  return new NextResponse('﻿' + lines.join('\n'), { headers: { ...headers, 'Content-Disposition': `attachment; filename="${slug}-inscricoes-${days}d.csv"` } })
}
