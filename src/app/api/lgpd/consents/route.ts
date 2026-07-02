// =============================================
// WORDER: LGPD consent management
// /src/app/api/lgpd/consents/route.ts
//
// POST: registrar consentimento (banner/form)
// GET:  consultar consentimentos (admin)
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getClientIp } from '@/lib/rate-limit'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token'

export const dynamic = 'force-dynamic'

const CONSENT_TYPES = ['marketing', 'analytics', 'tracking', 'profiling', 'data_sharing', 'cookies']

/**
 * POST — registro de consentimento.
 * body: {
 *   organization_id, consents: { [type]: boolean },
 *   contact_id?, visitor_id?, source?, token?
 * }
 *
 * ✅ Requer autorização: OU uma sessão válida (dashboard, org da sessão), OU um
 * token assinado de unsubscribe/preference-center. Sem isso, retorna 401 — caso
 * contrário qualquer um poderia virar as flags de consentimento de um contato
 * apenas conhecendo contact_id + organization_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { organization_id, contact_id, visitor_id, consents, source, token } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }
    if (!consents || typeof consents !== 'object') {
      return NextResponse.json({ error: 'consents object required' }, { status: 400 })
    }

    // ✅ Autorização: sessão OU token assinado.
    let authorized = false
    const auth = await getAuthClient()
    if (auth) {
      // Sessão só pode registrar consentimentos para a própria organização.
      if (auth.user.organization_id !== organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      authorized = true
    } else if (token) {
      const verified = verifyUnsubscribeToken(String(token))
      // Token precisa bater com a org e (se informado) com o contato alvo.
      if (
        verified &&
        verified.orgId === organization_id &&
        (!contact_id || verified.contactId === contact_id)
      ) {
        authorized = true
      }
    }

    if (!authorized) {
      return authError()
    }

    const ip = getClientIp(req)
    const ua = req.headers.get('user-agent') || undefined
    const now = new Date().toISOString()

    const rows: any[] = []
    for (const [type, granted] of Object.entries(consents)) {
      if (!CONSENT_TYPES.includes(type)) continue
      rows.push({
        organization_id,
        contact_id: contact_id || null,
        visitor_id: visitor_id || null,
        consent_type: type,
        granted: Boolean(granted),
        source: source || 'banner',
        ip_address: ip,
        user_agent: ua,
        granted_at: granted ? now : null,
        revoked_at: !granted ? now : null,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid consents' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('lgpd_consents').insert(rows)
    if (error) {
      console.error('[lgpd/consents POST] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Se contact_id fornecido, atualizar flags do contato
    if (contact_id && consents) {
      const update: Record<string, any> = { updated_at: now }
      if ('marketing' in consents) update.email_consent = Boolean(consents.marketing)
      if ('tracking' in consents) update.tracking_consent = Boolean(consents.tracking)
      await supabaseAdmin
        .from('contacts')
        .update(update)
        .eq('id', contact_id)
        .eq('organization_id', organization_id)
    }

    return NextResponse.json({ success: true, registered: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contact_id')
  const type = searchParams.get('type')

  let q = supabaseAdmin
    .from('lgpd_consents')
    .select('*')
    .eq('organization_id', auth.user.organization_id)
    .order('granted_at', { ascending: false })
    .limit(500)

  if (contactId) q = q.eq('contact_id', contactId)
  if (type) q = q.eq('consent_type', type)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ consents: data || [] })
}
