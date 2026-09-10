// =============================================
// GET /api/sending/health?storeId=…
//
// O que está prestes a falhar em silêncio no envio desta organização —
// e-mail e WhatsApp no mesmo lugar, porque para o lojista é uma coisa só
// ("minhas mensagens chegam?").
//
// A regra de decisão mora em @/lib/sending/health (pura, testada); aqui
// só buscamos as linhas, sempre presas à organização da sessão e, quando
// vem storeId, à loja.
// =============================================
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildSendingIssues, type DomainRow, type WhatsAppRow } from '@/lib/sending/health'
import { allowanceStatus } from '@/lib/email/shared-domain-allowance'
import { isSharedDomainEmail } from '@/lib/email/shared-sender'
import { resolveTrackingBaseUrl, platformTrackingBaseUrl } from '@/lib/email/tracking-url'
import { getAppBaseUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id
  const storeId = request.nextUrl.searchParams.get('storeId')
  const admin = getSupabaseAdmin()

  const nowIso = new Date().toISOString()
  const since = new Date(Date.now() - 30 * 86400000).toISOString()

  // ── Remetente em uso e host dos links: o da loja quando existe,
  // senão o da organização.
  let senderEmail: string | null = null
  let storeTrackingDomain: unknown = null
  if (storeId) {
    const { data: store } = await admin
      .from('shopify_stores')
      .select('settings')
      .eq('id', storeId)
      .eq('organization_id', orgId)
      .maybeSingle()
    senderEmail = (store?.settings as any)?.email_settings?.default_sender_email || null
    storeTrackingDomain = (store?.settings as any)?.email_settings?.tracking_domain ?? null
  }
  const { data: org } = await admin
    .from('organizations')
    .select('sender_email, email_settings')
    .eq('id', orgId)
    .maybeSingle()
  if (!senderEmail) {
    senderEmail = org?.sender_email || (org?.email_settings as any)?.default_sender_email || null
  }
  const trackingHost = resolveTrackingBaseUrl({
    storeDomain: storeTrackingDomain,
    orgDomain: (org?.email_settings as any)?.tracking_domain ?? null,
    platformDomain: platformTrackingBaseUrl(),
    appBaseUrl: getAppBaseUrl(),
  })

  // Contagem de envios na janela: um count por status, sem trazer linhas.
  const sends = () => {
    let q = admin.from('email_sends').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', since)
    if (storeId) q = q.eq('store_id', storeId)
    return q
  }

  const [domainsRes, scheduledRes, waRes, sentRes, bouncedRes, complainedRes, allowance] = await Promise.all([
    admin
      .from('email_domains')
      .select('domain, status, verified_at, is_system, created_at, warmup_enabled, warmup_daily_limit, total_sent_today, store_id')
      .eq('organization_id', orgId)
      .limit(100),
    admin
      .from('email_campaigns')
      .select('id, name, scheduled_at, from_email, total_recipients, store_id')
      .eq('organization_id', orgId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(50),
    admin
      .from('whatsapp_business_accounts')
      .select('id, display_phone_number, phone_number, verified_name, status, quality_rating, webhook_configured, last_webhook_at, last_health_status, last_health_expires_at, token_invalid_at, store_id')
      .eq('organization_id', orgId)
      .limit(50),
    sends().not('status', 'in', '("failed","pending","queued")'),
    sends().not('bounced_at', 'is', null),
    sends().not('complained_at', 'is', null),
    allowanceStatus(admin, orgId, storeId, senderEmail),
  ])

  // Linha com loja só vale para aquela loja; sem loja, vale para todas.
  const forStore = <T extends { store_id?: string | null }>(rows: T[] | null): T[] =>
    (rows || []).filter((r) => !r.store_id || !storeId || r.store_id === storeId)

  const domains: DomainRow[] = forStore(domainsRes.data as any[]).map((d: any) => ({
    domain: d.domain,
    status: d.status,
    verified_at: d.verified_at,
    is_system: d.is_system,
    created_at: d.created_at,
    warmup_enabled: d.warmup_enabled,
    warmup_daily_limit: d.warmup_daily_limit,
    total_sent_today: d.total_sent_today,
  }))

  const whatsapp: WhatsAppRow[] = forStore(waRes.data as any[]).map((w: any) => ({
    id: w.id,
    label: w.verified_name || w.display_phone_number || w.phone_number || null,
    status: w.status,
    quality_rating: w.quality_rating,
    webhook_configured: w.webhook_configured,
    last_webhook_at: w.last_webhook_at,
    last_health_status: w.last_health_status,
    last_health_expires_at: w.last_health_expires_at,
    token_invalid_at: w.token_invalid_at,
  }))

  // Se a leitura dos domínios falhou, a lista vem vazia — e "vazia" é
  // exatamente o que dispara o convite para verificar um domínio. Cobrar
  // do lojista um passo que ele talvez já tenha dado, por causa de um erro
  // nosso, é pior do que não dizer nada.
  const domainsUnknown = !!domainsRes.error
  if (domainsUnknown) console.warn('[sending-health] não consegui ler os domínios:', domainsRes.error!.message)

  const issues = buildSendingIssues({
    sender: {
      email: senderEmail,
      onSharedDomain: domainsUnknown ? false : (isSharedDomainEmail(senderEmail) || !senderEmail),
    },
    domains,
    allowance: {
      onSharedDomain: allowance.onSharedDomain,
      used: allowance.used,
      allowance: allowance.allowance,
      remaining: allowance.remaining,
    },
    scheduled: forStore(scheduledRes.data as any[]).map((c: any) => ({
      id: c.id, name: c.name, scheduled_at: c.scheduled_at, from_email: c.from_email, total_recipients: c.total_recipients,
    })),
    rates: {
      sent: sentRes.count || 0,
      bounced: bouncedRes.count || 0,
      complained: complainedRes.count || 0,
    },
    whatsapp,
    trackingHost,
  })

  return NextResponse.json({
    checked_at: nowIso,
    sender: { email: senderEmail, on_shared_domain: allowance.onSharedDomain },
    counts: {
      error: issues.filter((i) => i.level === 'error').length,
      warn: issues.filter((i) => i.level === 'warn').length,
    },
    issues: issues.slice(0, 50),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
