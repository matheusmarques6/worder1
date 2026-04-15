import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyUnsubscribeToken, signUnsubscribeToken } from '@/lib/email/unsubscribe-token'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/email/unsubscribe
 *
 * Aceita:
 *   1. `{ token }` — token HMAC assinado (preferencial, usado no link do email)
 *   2. `{ contactId, orgId }` — LEGACY, mantido temporariamente com rate-limit.
 *
 * Sempre desinscreve o contato do canal `email`.
 */
export async function POST(req: NextRequest) {
  try {
    // Rate-limit para evitar unsubscribe em massa por atacante
    const ip = getClientIp(req)
    const rl = await checkRateLimit(`unsub:${ip}`, { limit: 20, windowSec: 60 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const { token, contactId: rawContactId, orgId: rawOrgId, reason } = body as any

    let contactId: string | null = null
    let orgId: string | null = null
    let campaignId: string | undefined

    if (token) {
      const verified = verifyUnsubscribeToken(String(token))
      if (!verified) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
      }
      contactId = verified.contactId
      orgId = verified.orgId
      campaignId = verified.campaignId
    } else if (rawContactId && rawOrgId) {
      // Legacy fallback (rate-limited). Loga uso para migração.
      console.warn('[Unsubscribe] LEGACY unsigned request from', ip)
      contactId = String(rawContactId)
      orgId = String(rawOrgId)
    } else {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    // Update contact
    const { error } = await supabaseAdmin
      .from('contacts')
      .update({
        status: 'unsubscribed',
        email_consent: false,
        email_consent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('organization_id', orgId)

    if (error) {
      console.error('[Unsubscribe] DB error:', error)
      return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }

    // Record CDP event (idempotent por contact_id + dia)
    const dayKey = new Date().toISOString().slice(0, 10)
    await supabaseAdmin
      .from('contact_events')
      .insert({
        organization_id: orgId,
        contact_id: contactId,
        event_type: 'email_unsubscribed',
        event_source: 'worder_email',
        properties: {
          reason: reason || 'user_unsubscribed',
          campaign_id: campaignId || null,
          via_token: Boolean(token),
        },
        occurred_at: new Date().toISOString(),
        idempotency_key: `unsubscribe:${contactId}:${dayKey}`,
      })
      .select()
      .maybeSingle()

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Unsubscribe] Error:', error?.message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * GET /api/email/unsubscribe?token=...
 *
 * Utilitário para facilitar testes + permitir one-click unsubscribe
 * (RFC 8058) via link direto. Processa e redireciona para a página pública.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }
  const verified = verifyUnsubscribeToken(token)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
  // Redireciona para página pública que pede confirmação + ressubscribe
  const dest = new URL('/unsubscribe', url.origin)
  dest.searchParams.set('token', token)
  return NextResponse.redirect(dest, 302)
}

/**
 * Helper exportado para uso em envios de email.
 */
export { signUnsubscribeToken }
