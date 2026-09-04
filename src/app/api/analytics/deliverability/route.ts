import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const orgId = auth.user.organization_id
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '30', 10)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  // A página manda a loja selecionada; a rota ignorava e somava a
  // organização inteira. Um id de outra organização é recusado.
  const storeId = searchParams.get('storeId') || searchParams.get('store_id')
  if (storeId) {
    const { validateStoreAccess } = await import('@/lib/api-utils')
    const access = await validateStoreAccess(auth.supabase as any, orgId, storeId, auth.user.id)
    if (!access.valid) return NextResponse.json({ error: access.error }, { status: access.status || 403 })
  }

  try {
    // ── KPIs: aggregate stats ──
    let sendsQuery = supabaseAdmin
      .from('email_sends')
      .select('status, opened_at, clicked_at, isp_domain, sent_at, complained_at')
      .eq('organization_id', orgId)
      .gte('sent_at', since)
    if (storeId) sendsQuery = sendsQuery.eq('store_id', storeId)
    const { data: allSends } = await sendsQuery

    const sends = allSends || []
    const total = sends.length
    const delivered = sends.filter(s => s.status === 'delivered' || s.status === 'sent' || s.opened_at).length
    const bounced = sends.filter(s => s.status === 'bounced').length
    const complained = sends.filter(s => s.status === 'complained' || s.complained_at).length
    const opened = sends.filter(s => s.opened_at).length
    const clicked = sends.filter(s => s.clicked_at).length

    const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0'
    const bounceRate = total > 0 ? ((bounced / total) * 100).toFixed(2) : '0'
    const complaintRate = total > 0 ? ((complained / total) * 100).toFixed(3) : '0'
    const openRate = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0'
    const clickRate = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : '0'

    // ── Reputation score (0-100) ──
    // Based on industry thresholds:
    // bounce_rate <2% = good, <5% = warn, >5% = bad
    // complaint_rate <0.1% = good, <0.3% = warn, >0.3% = bad
    const bounceRateNum = total > 0 ? (bounced / total) * 100 : 0
    const complaintRateNum = total > 0 ? (complained / total) * 100 : 0
    let reputationScore = 100
    if (bounceRateNum > 5) reputationScore -= 40
    else if (bounceRateNum > 2) reputationScore -= 20
    else if (bounceRateNum > 1) reputationScore -= 10
    if (complaintRateNum > 0.3) reputationScore -= 40
    else if (complaintRateNum > 0.1) reputationScore -= 20
    else if (complaintRateNum > 0.05) reputationScore -= 10
    if (opened / Math.max(delivered, 1) < 0.1) reputationScore -= 10
    reputationScore = Math.max(0, reputationScore)

    // ── Daily volume chart ──
    const dailyMap = new Map<string, { delivered: number; bounced: number; complaints: number }>()
    for (const s of sends) {
      if (!s.sent_at) continue
      const day = s.sent_at.split('T')[0]
      if (!dailyMap.has(day)) dailyMap.set(day, { delivered: 0, bounced: 0, complaints: 0 })
      const d = dailyMap.get(day)!
      if (s.status === 'bounced') d.bounced++
      else if (s.status === 'complained' || s.complained_at) d.complaints++
      else d.delivered++
    }

    const deliveryChart = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        ...data,
      }))

    // ── ISP breakdown ──
    const ispStats = new Map<string, { total: number; delivered: number; opened: number; bounced: number; complained: number }>()
    for (const s of sends) {
      const isp = normalizeIsp(s.isp_domain || detectIspFromEmail(s))
      if (!ispStats.has(isp)) ispStats.set(isp, { total: 0, delivered: 0, opened: 0, bounced: 0, complained: 0 })
      const st = ispStats.get(isp)!
      st.total++
      if (s.status !== 'bounced' && s.status !== 'complained') st.delivered++
      if (s.opened_at) st.opened++
      if (s.status === 'bounced') st.bounced++
      if (s.status === 'complained' || s.complained_at) st.complained++
    }

    const ispBreakdown = Array.from(ispStats.entries())
      .filter(([, s]) => s.total >= 5)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 8)
      .map(([name, s]) => ({
        name,
        total: s.total,
        deliveredCount: s.delivered,
        openedCount: s.opened,
        bouncedCount: s.bounced,
        complainedCount: s.complained,
        delivered: s.total > 0 ? Number(((s.delivered / s.total) * 100).toFixed(1)) : 0,
        opens: s.delivered > 0 ? Number(((s.opened / s.delivered) * 100).toFixed(1)) : 0,
        inbox: s.total > 0 ? Number((((s.total - s.bounced - s.complained) / s.total) * 100).toFixed(1)) : 0,
        spam: s.total > 0 ? Number(((s.complained / s.total) * 100).toFixed(1)) : 0,
      }))

    // ── Domain health ──
    const { data: domains } = await supabaseAdmin
      .from('email_domains')
      .select('domain, status, dns_records, verified_at, warmup_enabled, warmup_day, warmup_daily_limit')
      .eq('organization_id', orgId)

    const domainHealth = (domains || []).map((d: any) => {
      const dns = d.dns_records || {}
      const records = Array.isArray(dns) ? dns : (dns.records || dns.data || [])

      let spf = false, dkim = false, dmarc = false
      if (Array.isArray(records)) {
        for (const r of records) {
          const t = (r.type || r.record_type || '').toLowerCase()
          const s = (r.status || '').toLowerCase()
          if (t === 'spf' || t === 'txt') spf = spf || s === 'verified' || s === 'valid'
          if (t === 'dkim' || t === 'cname') dkim = dkim || s === 'verified' || s === 'valid'
          if (t === 'dmarc') dmarc = dmarc || s === 'verified' || s === 'valid'
        }
      }

      if (d.status === 'verified') { spf = true; dkim = true }

      return {
        domain: d.domain,
        status: d.status === 'verified' ? 'healthy' : d.status,
        spf, dkim, dmarc,
        reputation: reputationScore,
        warmup: d.warmup_enabled ? { day: d.warmup_day, dailyLimit: d.warmup_daily_limit } : null,
      }
    })

    return NextResponse.json({
      kpis: {
        deliveryRate, bounceRate, complaintRate, openRate, clickRate,
        reputationScore,
        totalSent: total,
        totalDelivered: delivered,
        totalBounced: bounced,
        totalComplaints: complained,
      },
      deliveryChart,
      ispBreakdown,
      domainHealth,
    })
  } catch (err: any) {
    console.error('[Deliverability API]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

function normalizeIsp(isp: string): string {
  if (!isp) return 'Outros'
  const l = isp.toLowerCase()
  if (l === 'gmail' || l.includes('gmail') || l.includes('googlemail')) return 'Gmail'
  if (l === 'outlook' || l.includes('outlook') || l.includes('live')) return 'Outlook'
  if (l === 'hotmail' || l.includes('hotmail') || l.includes('msn')) return 'Hotmail'
  if (l === 'yahoo' || l.includes('yahoo') || l.includes('ymail')) return 'Yahoo'
  if (l.includes('uol') || l.includes('bol')) return 'UOL'
  if (l.includes('aol')) return 'AOL'
  if (l.includes('icloud') || l.includes('me.com') || l.includes('mac.com')) return 'iCloud'
  return isp.charAt(0).toUpperCase() + isp.slice(1)
}

function detectIspFromEmail(send: any): string {
  const email = send?.email || ''
  const domain = email.split('@')[1]?.toLowerCase() || ''
  if (domain.includes('gmail')) return 'gmail'
  if (domain.includes('yahoo') || domain.includes('ymail')) return 'yahoo'
  if (domain.includes('outlook') || domain.includes('live')) return 'outlook'
  if (domain.includes('hotmail') || domain.includes('msn')) return 'hotmail'
  if (domain.includes('uol') || domain.includes('bol')) return 'uol'
  if (domain.includes('aol')) return 'aol'
  if (domain.includes('icloud') || domain.includes('me.com')) return 'icloud'
  return 'default'
}
