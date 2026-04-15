// =============================================
// WORDER: Shopify GDPR — customers/redact
// POST /api/webhooks/shopify/gdpr/customers-redact
//
// Mandatory. Merchant pediu para deletar o cliente permanentemente
// (48h depois do uninstall ou sob demanda).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createHmac, timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'

async function verifyHmac(rawBody: string, hmacHeader: string | null): Promise<boolean> {
  if (!hmacHeader) return false
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hmacHeader))
  } catch { return false }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const hmac = req.headers.get('x-shopify-hmac-sha256')

  if (!(await verifyHmac(rawBody, hmac))) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  const body = JSON.parse(rawBody || '{}')
  const { shop_domain, customer } = body

  const { data: store } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id')
    .eq('shop_domain', shop_domain)
    .maybeSingle()

  if (!store) return NextResponse.json({ received: true })

  // Busca contato pelo shopify_customer_id e anonimiza
  const shopifyCustomerId = String(customer?.id || '')
  if (!shopifyCustomerId) return NextResponse.json({ received: true })

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', store.organization_id)
    .eq('shopify_customer_id', shopifyCustomerId)
    .maybeSingle()

  if (contact) {
    const anonId = `shopify_gdpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await supabaseAdmin
      .from('contacts')
      .update({
        email: `${anonId}@deleted.shopify.gdpr`,
        phone: null,
        whatsapp: null,
        first_name: 'Redigido',
        last_name: 'GDPR',
        full_name: 'Redigido GDPR',
        is_active: false,
        status: 'gdpr_redacted',
        email_consent: false,
        sms_consent: false,
        whatsapp_consent: false,
        custom_fields: {},
        shopify_customer_id: null,
      })
      .eq('id', contact.id)

    // Limpa PII em events
    await supabaseAdmin
      .from('contact_events')
      .update({ properties: {} })
      .eq('contact_id', contact.id)
  }

  return NextResponse.json({ received: true })
}
