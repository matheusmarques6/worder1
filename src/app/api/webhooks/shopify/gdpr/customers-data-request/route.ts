// =============================================
// WORDER: Shopify GDPR — customers/data_request
// POST /api/webhooks/shopify/gdpr/customers-data-request
//
// Mandatory GDPR webhook (Shopify requires for app approval).
// Merchant está solicitando os dados de um cliente. Resposta 200 obrigatória.
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
  const { shop_domain, customer, orders_requested } = body

  // Log o pedido. Processamento real (export) roda via LGPD engine.
  const { data: store } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id')
    .eq('shop_domain', shop_domain)
    .maybeSingle()

  if (store) {
    await supabaseAdmin.from('lgpd_data_requests').insert({
      organization_id: store.organization_id,
      requester_email: customer?.email || 'unknown@shopify.gdpr',
      request_type: 'export',
      payload: { source: 'shopify_gdpr', customer, orders_requested },
      status: 'pending',
      verified_at: new Date().toISOString(), // Shopify já validou
    })
  }

  return NextResponse.json({ received: true })
}
