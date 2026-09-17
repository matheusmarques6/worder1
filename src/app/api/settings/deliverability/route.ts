// Configurações → Entregabilidade.
//
// GET ?storeId → saúde dos últimos 30 dias (rejeição, spam, descadastro),
//                checklist de autenticação do domínio remetente e a higiene
//                da lista.
// PATCH { hygiene: { suppress_inactive_days, validate_on_entry } }

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { __resetSendingRulesCache } from '@/lib/email/sending-rules'
import { sharedSenderDomain } from '@/lib/email/shared-sender'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const storeId = request.nextUrl.searchParams.get('storeId')
  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString()
    const base = () => {
      let q = supabaseAdmin.from('email_sends').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', since)
      if (storeId) q = q.eq('store_id', storeId)
      return q
    }
    const [{ count: sent }, { count: bounced }, { count: complained }, { count: unsubscribed }, { count: delivered }, { count: opened }, { count: clicked }] = await Promise.all([
      base().not('status', 'in', '("failed","pending","queued")'),
      base().not('bounced_at', 'is', null),
      base().not('complained_at', 'is', null),
      base().not('unsubscribed_at', 'is', null),
      base().not('delivered_at', 'is', null),
      base().not('opened_at', 'is', null),
      base().not('clicked_at', 'is', null),
    ])
    const pct = (n: number | null, d: number | null) => (!d ? 0 : Math.round(((n || 0) / d) * 10000) / 100)

    // Remetente em uso na loja/org → domínio a auditar.
    let senderEmail: string | null = null
    let trackingDomain: string | null = null
    if (storeId) {
      const { data: st } = await supabaseAdmin.from('shopify_stores').select('settings').eq('id', storeId).eq('organization_id', orgId).maybeSingle()
      senderEmail = (st?.settings as any)?.email_settings?.default_sender_email || null
      trackingDomain = (st?.settings as any)?.email_settings?.tracking_domain || null
    }
    const { data: org } = await supabaseAdmin.from('organizations').select('sender_email, email_settings, settings').eq('id', orgId).single()
    if (!senderEmail) senderEmail = org?.sender_email || (org?.email_settings as any)?.default_sender_email || null
    if (!trackingDomain) trackingDomain = (org?.email_settings as any)?.tracking_domain || null
    const shared = sharedSenderDomain()
    const senderDomain = senderEmail ? senderEmail.split('@')[1] : shared

    const { data: dom } = await supabaseAdmin.from('email_domains').select('domain, status, dns_records, is_system').eq('domain', senderDomain).or(`organization_id.eq.${orgId},is_system.eq.true`).limit(1).maybeSingle()
    const recs: any[] = Array.isArray(dom?.dns_records) ? dom!.dns_records : []
    const recOk = (kind: string) => recs.some((r) => String(r.record || '').toUpperCase() === kind && r.status === 'verified')
    const verified = dom?.status === 'verified'

    const hygiene = (org?.settings as any)?.hygiene || {}
    return NextResponse.json({
      since,
      metrics: {
        sent: sent || 0, delivered: delivered || 0, opened: opened || 0, clicked: clicked || 0,
        bounced: bounced || 0, complained: complained || 0, unsubscribed: unsubscribed || 0,
        bounce_rate: pct(bounced, sent), complaint_rate: pct(complained, sent), unsubscribe_rate: pct(unsubscribed, sent),
        open_rate: pct(opened, delivered || sent), click_rate: pct(clicked, delivered || sent),
      },
      sender: { email: senderEmail, domain: senderDomain, is_shared: senderDomain === shared, verified, spf: verified && (recOk('SPF') || !recs.length), dkim: verified && (recOk('DKIM') || !recs.length) },
      tracking_domain: trackingDomain,
      hygiene: {
        suppress_inactive_days: Number(hygiene.suppress_inactive_days) > 0 ? Number(hygiene.suppress_inactive_days) : null,
        validate_on_entry: hygiene.validate_on_entry ?? true,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const h = body.hygiene || {}
  const days = h.suppress_inactive_days === null || h.suppress_inactive_days === undefined || h.suppress_inactive_days === '' ? null : Number(h.suppress_inactive_days)
  if (days !== null && (!Number.isFinite(days) || days < 30 || days > 3650)) return NextResponse.json({ error: 'Período inválido (30 a 3650 dias).' }, { status: 400 })
  try {
    const { data: org } = await supabaseAdmin.from('organizations').select('settings').eq('id', orgId).single()
    const settings = { ...(org?.settings || {}), hygiene: { suppress_inactive_days: days, validate_on_entry: h.validate_on_entry !== false } }
    const { error } = await supabaseAdmin.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', orgId)
    if (error) throw error
    __resetSendingRulesCache()
    return NextResponse.json({ hygiene: settings.hygiene })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
