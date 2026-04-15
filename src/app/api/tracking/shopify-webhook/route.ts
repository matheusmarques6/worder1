import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verifyHmacSignature } from '@/lib/webhook-security'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/tracking/shopify-webhook
// Recebe webhooks do Shopify e converte em eventos.
// AUTENTICAÇÃO: HMAC-SHA256 por loja (api_secret do store).
// =============================================

export async function POST(request: NextRequest) {
  try {
    const topic = request.headers.get('x-shopify-topic')
    const shopDomain = request.headers.get('x-shopify-shop-domain')
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256')

    if (!topic || !shopDomain) {
      return NextResponse.json({ error: 'Missing Shopify headers' }, { status: 400 })
    }

    // IMPORTANTE: ler raw body pra HMAC — NÃO usar request.json() antes
    const rawBody = await request.text()

    console.log(`[Shopify Webhook] Topic: ${topic} | Shop: ${shopDomain}`)

    // Buscar loja com secret (necessário pro HMAC)
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id, api_secret')
      .eq('shop_domain', shopDomain)
      .single()

    if (!store) {
      console.warn(`[Shopify Webhook] Store not found: ${shopDomain}`)
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Verificar HMAC (Shopify envia base64, não hex)
    const secret = store.api_secret || process.env.SHOPIFY_API_SECRET || ''
    if (!secret) {
      console.error(`[Shopify Webhook] No secret configured for store ${store.id}`)
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    // HMAC do Shopify é base64
    let hmacValid = false
    try {
      const { createHmac, timingSafeEqual } = await import('crypto')
      const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
      const received = hmacHeader || ''
      if (expected.length === received.length) {
        hmacValid = timingSafeEqual(Buffer.from(expected), Buffer.from(received))
      }
    } catch {
      hmacValid = false
    }

    if (!hmacValid) {
      console.warn(`[Shopify Webhook] Invalid HMAC for ${shopDomain}`)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const organization_id = store.organization_id

    // Processar por tipo de evento
    switch (topic) {
      case 'checkouts/create':
      case 'checkouts/update':
        await handleCheckout(organization_id, body, 'checkout_started')
        break

      case 'orders/create':
        await handleOrder(organization_id, body, 'purchase')
        break

      case 'orders/paid':
        await handleOrder(organization_id, body, 'order_paid')
        break

      case 'orders/fulfilled':
        await handleOrder(organization_id, body, 'order_fulfilled')
        break

      case 'carts/create':
      case 'carts/update':
        await handleCart(organization_id, body)
        break

      case 'customers/create':
        await handleCustomer(organization_id, body)
        break

      default:
        console.log(`[Shopify Webhook] Unhandled topic: ${topic}`)
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Shopify Webhook] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCheckout(org_id: string, data: any, event_type: string) {
  const customer = data.customer || {}
  const lineItems = data.line_items || []

  const contact_id = await findOrCreateContact(org_id, {
    email: data.email || customer.email,
    phone: data.phone || customer.phone,
    name: customer.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null,
    shopify_customer_id: customer.id?.toString(),
  })

  await supabase.from('customer_events').insert({
    organization_id: org_id,
    contact_id,
    customer_email: data.email,
    customer_phone: data.phone,
    shopify_customer_id: customer.id?.toString(),
    event_type,
    event_source: 'shopify',
    order_id: data.token || data.id?.toString(),
    order_total: parseFloat(data.total_price || 0),
    event_data: {
      line_items: lineItems.map((item: any) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      currency: data.currency,
      abandoned_checkout_url: data.abandoned_checkout_url,
    },
  })

  for (const item of lineItems) {
    await supabase.from('customer_events').insert({
      organization_id: org_id,
      contact_id,
      customer_email: data.email,
      event_type: 'add_to_cart',
      event_source: 'shopify',
      product_id: item.product_id?.toString(),
      product_name: item.title,
      product_price: parseFloat(item.price || 0),
      product_quantity: item.quantity,
      event_data: { from_checkout: true },
    })
  }
}

async function handleOrder(org_id: string, data: any, event_type: string) {
  const customer = data.customer || {}
  const lineItems = data.line_items || []

  const contact_id = await findOrCreateContact(org_id, {
    email: data.email || customer.email,
    phone: data.phone || customer.phone,
    name: customer.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null,
    shopify_customer_id: customer.id?.toString(),
  })

  await supabase.from('customer_events').insert({
    organization_id: org_id,
    contact_id,
    customer_email: data.email,
    customer_phone: data.phone,
    shopify_customer_id: customer.id?.toString(),
    event_type,
    event_source: 'shopify',
    order_id: data.order_number?.toString() || data.id?.toString(),
    order_total: parseFloat(data.total_price || 0),
    event_data: {
      line_items: lineItems.map((item: any) => ({
        product_id: item.product_id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      currency: data.currency,
      discount_codes: data.discount_codes,
      shipping_address: data.shipping_address,
      financial_status: data.financial_status,
      fulfillment_status: data.fulfillment_status,
    },
  })

  // Se for compra, atualizar contato
  if (event_type === 'purchase' && contact_id) {
    const orderTotal = parseFloat(data.total_price || 0)
    
    // Buscar valores atuais
    const { data: currentContact } = await supabase
      .from('contacts')
      .select('total_revenue, total_orders')
      .eq('id', contact_id)
      .single()

    if (currentContact) {
      await supabase
        .from('contacts')
        .update({
          total_revenue: (currentContact.total_revenue || 0) + orderTotal,
          total_orders: (currentContact.total_orders || 0) + 1,
          last_order_date: new Date().toISOString(),
          shopify_customer_id: customer.id?.toString(),
        })
        .eq('id', contact_id)
    }
  }
}

async function handleCart(org_id: string, data: any) {
  const lineItems = data.line_items || []

  for (const item of lineItems) {
    await supabase.from('customer_events').insert({
      organization_id: org_id,
      event_type: 'add_to_cart',
      event_source: 'shopify',
      product_id: item.product_id?.toString(),
      product_name: item.title,
      product_price: parseFloat(item.price || 0),
      product_quantity: item.quantity,
      session_id: data.token,
    })
  }
}

async function handleCustomer(org_id: string, data: any) {
  await findOrCreateContact(org_id, {
    email: data.email,
    phone: data.phone,
    name: data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : null,
    shopify_customer_id: data.id?.toString(),
  })
}

// =============================================
// HELPER: Encontrar ou criar contato
// =============================================
async function findOrCreateContact(
  organization_id: string, 
  data: { email?: string; phone?: string; name?: string | null; shopify_customer_id?: string }
): Promise<string | null> {
  if (!data.email && !data.phone) return null

  // Buscar existente
  let query = supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organization_id)

  if (data.email && data.phone) {
    query = query.or(`email.eq.${data.email},phone.eq.${data.phone}`)
  } else if (data.email) {
    query = query.eq('email', data.email)
  } else if (data.phone) {
    query = query.eq('phone', data.phone)
  }

  const { data: existing } = await query.limit(1).single()

  if (existing) {
    if (data.shopify_customer_id) {
      await supabase
        .from('contacts')
        .update({ shopify_customer_id: data.shopify_customer_id })
        .eq('id', existing.id)
    }
    return existing.id
  }

  // Criar novo
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      organization_id,
      email: data.email,
      phone: data.phone,
      name: data.name || data.email?.split('@')[0] || 'Cliente',
      shopify_customer_id: data.shopify_customer_id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Find/Create Contact] Error:', error)
    return null
  }

  return newContact.id
}
