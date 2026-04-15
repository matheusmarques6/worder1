// =============================================
// WORDER: Shopify GDPR — shop/redact
// POST /api/webhooks/shopify/gdpr/shop-redact
//
// Mandatory. 48 horas depois que merchant desinstalou o app,
// devemos apagar todos os dados da loja.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createHmac, timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

  const { shop_domain } = JSON.parse(rawBody || '{}')
  if (!shop_domain) return NextResponse.json({ received: true })

  const { data: store } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id')
    .eq('shop_domain', shop_domain)
    .maybeSingle()

  if (!store) return NextResponse.json({ received: true })

  // Delete em cascata dos dados Shopify:
  await Promise.allSettled([
    supabaseAdmin.from('shopify_products').delete().eq('store_id', store.id),
    supabaseAdmin.from('shopify_orders').delete().eq('store_id', store.id),
    supabaseAdmin.from('shopify_checkouts').delete().eq('store_id', store.id),
    supabaseAdmin.from('shopify_webhook_log').delete().eq('store_id', store.id),
    supabaseAdmin.from('shopify_rfm_scores').delete().eq('store_id', store.id),
  ])

  // Apaga/anonimiza contatos vinculados à store
  await supabaseAdmin
    .from('contacts')
    .update({
      shopify_customer_id: null,
      store_id: null,
      source: 'shopify_redacted',
    })
    .eq('store_id', store.id)

  // Por fim, deleta a própria loja
  await supabaseAdmin
    .from('shopify_stores')
    .delete()
    .eq('id', store.id)

  return NextResponse.json({ received: true })
}
