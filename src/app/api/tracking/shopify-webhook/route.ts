import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/tracking/shopify-webhook
// Recebe webhooks do Shopify e grava em contact_events.
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

    const rawBody = await request.text()

    console.log(`[Shopify Webhook] Topic: ${topic} | Shop: ${shopDomain}`)

    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id, api_secret')
      .eq('shop_domain', shopDomain)
      .single()

    if (!store) {
      console.warn(`[Shopify Webhook] Store not found: ${shopDomain}`)
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const secret = store.api_secret || process.env.SHOPIFY_API_SECRET || ''
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
      }
    } else {
      let valid = false
      try {
        const { createHmac, timingSafeEqual } = await import('crypto')
        const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
        const received = hmacHeader || ''
        if (expected.length === received.length) {
          valid = timingSafeEqual(Buffer.from(expected), Buffer.from(received))
        }
      } catch { valid = false }
      if (!valid) {
        console.warn(`[Shopify Webhook] Invalid HMAC for ${shopDomain}`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    let body: any
    try { body = JSON.parse(rawBody) } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const ctx = { org_id: store.organization_id, store_id: store.id }

    switch (topic) {
      case 'checkouts/create':
      case 'checkouts/update':
        await handleCheckout(ctx, body, 'checkout_started')
        break
      case 'orders/create':
        await handleOrder(ctx, body, 'purchase')
        break
      case 'orders/paid':
        await handleOrder(ctx, body, 'order_paid')
        break
      case 'orders/fulfilled':
        await handleOrder(ctx, body, 'order_fulfilled')
        break
      case 'carts/create':
      case 'carts/update':
        await handleCart(ctx, body)
        break
      case 'customers/create':
        await handleCustomer(ctx, body)
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
// HANDLERS — sempre escrevem em contact_events
// =============================================

interface Ctx { org_id: string; store_id: string }

async function handleCheckout(ctx: Ctx, data: any, event_type: string) {
  const customer = data.customer || {}
  const lineItems = data.line_items || []

  const contact_id = await findOrCreateContact(ctx.org_id, {
    email: data.email || customer.email,
    phone: data.phone || customer.phone,
    name: customer.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null,
    shopify_customer_id: customer.id?.toString(),
  })

  const checkoutId = data.token || data.id?.toString()

  await supabase.from('contact_events').insert({
    organization_id: ctx.org_id,
    store_id: ctx.store_id,
    contact_id,
    shopify_customer_id: customer.id?.toString(),
    event_type,
    event_source: 'shopify',
    order_id: checkoutId,
    order_total: parseFloat(data.total_price || 0),
    monetary_value: parseFloat(data.total_price || 0),
    currency: data.currency || 'BRL',
    properties: {
      line_items: lineItems.map((item: any) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      abandoned_checkout_url: data.abandoned_checkout_url,
      customer_email: data.email,
      customer_phone: data.phone,
    },
    occurred_at: new Date().toISOString(),
    idempotency_key: checkoutId ? `${event_type}:${ctx.org_id}:${checkoutId}` : null,
  })

  for (const item of lineItems) {
    await supabase.from('contact_events').insert({
      organization_id: ctx.org_id,
      store_id: ctx.store_id,
      contact_id,
      event_type: 'added_to_cart',
      event_source: 'shopify',
      product_id: item.product_id?.toString(),
      product_name: item.title,
      product_price: parseFloat(item.price || 0),
      product_quantity: item.quantity,
      monetary_value: parseFloat(item.price || 0) * (item.quantity || 1),
      currency: data.currency || 'BRL',
      properties: { from_checkout: true, customer_email: data.email },
      occurred_at: new Date().toISOString(),
      idempotency_key: `added_to_cart:${ctx.org_id}:${checkoutId}:${item.product_id}:${item.variant_id}`,
    }).select().maybeSingle()
  }
}

async function handleOrder(ctx: Ctx, data: any, event_type: string) {
  const customer = data.customer || {}
  const lineItems = data.line_items || []
  const orderTotal = parseFloat(data.total_price || 0)
  const orderId = data.order_number?.toString() || data.id?.toString()

  const contact_id = await findOrCreateContact(ctx.org_id, {
    email: data.email || customer.email,
    phone: data.phone || customer.phone,
    name: customer.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null,
    shopify_customer_id: customer.id?.toString(),
  })

  await supabase.from('contact_events').insert({
    organization_id: ctx.org_id,
    store_id: ctx.store_id,
    contact_id,
    shopify_customer_id: customer.id?.toString(),
    event_type,
    event_source: 'shopify',
    order_id: orderId,
    order_total: orderTotal,
    monetary_value: orderTotal,
    currency: data.currency || 'BRL',
    properties: {
      line_items: lineItems.map((item: any) => ({
        product_id: item.product_id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      discount_codes: data.discount_codes,
      shipping_address: data.shipping_address,
      financial_status: data.financial_status,
      fulfillment_status: data.fulfillment_status,
      customer_email: data.email,
      customer_phone: data.phone,
    },
    occurred_at: new Date().toISOString(),
    idempotency_key: orderId ? `${event_type}:${ctx.org_id}:${orderId}` : null,
  })

  if (event_type === 'purchase' && contact_id) {
    const { error: rpcErr } = await supabase.rpc('increment_contact_revenue', {
      p_contact_id: contact_id,
      p_amount: orderTotal,
    })
    if (rpcErr) {
      // Fallback manual se RPC não existir / falhou
      const { data: c } = await supabase.from('contacts')
        .select('total_revenue, total_orders').eq('id', contact_id).single()
      if (c) {
        await supabase.from('contacts').update({
          total_revenue: (c.total_revenue || 0) + orderTotal,
          total_orders: (c.total_orders || 0) + 1,
          last_order_date: new Date().toISOString(),
          shopify_customer_id: customer.id?.toString(),
        }).eq('id', contact_id)
      }
    }
  }
}

async function handleCart(ctx: Ctx, data: any) {
  const lineItems = data.line_items || []
  for (const item of lineItems) {
    await supabase.from('contact_events').insert({
      organization_id: ctx.org_id,
      store_id: ctx.store_id,
      event_type: 'added_to_cart',
      event_source: 'shopify',
      product_id: item.product_id?.toString(),
      product_name: item.title,
      product_price: parseFloat(item.price || 0),
      product_quantity: item.quantity,
      monetary_value: parseFloat(item.price || 0) * (item.quantity || 1),
      currency: data.currency || 'BRL',
      session_id: data.token,
      occurred_at: new Date().toISOString(),
      idempotency_key: `added_to_cart:${ctx.org_id}:${data.token}:${item.product_id}`,
      properties: {},
    }).select().maybeSingle()
  }
}

async function handleCustomer(ctx: Ctx, data: any) {
  await findOrCreateContact(ctx.org_id, {
    email: data.email,
    phone: data.phone,
    name: data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : null,
    shopify_customer_id: data.id?.toString(),
  })
}

// =============================================
// HELPER: Encontrar ou criar contato (isolado por org)
// =============================================
async function findOrCreateContact(
  organization_id: string,
  data: { email?: string; phone?: string; name?: string | null; shopify_customer_id?: string }
): Promise<string | null> {
  if (!data.email && !data.phone && !data.shopify_customer_id) return null

  // Buscar por shopify_customer_id primeiro (mais confiável)
  if (data.shopify_customer_id) {
    const { data: byShopify } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('shopify_customer_id', data.shopify_customer_id)
      .maybeSingle()
    if (byShopify?.id) return byShopify.id
  }

  // Depois por email (case-insensitive)
  if (data.email) {
    const { data: byEmail } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization_id)
      .ilike('email', data.email)
      .maybeSingle()
    if (byEmail?.id) {
      if (data.shopify_customer_id) {
        await supabase.from('contacts')
          .update({ shopify_customer_id: data.shopify_customer_id })
          .eq('id', byEmail.id)
      }
      return byEmail.id
    }
  }

  // Depois por telefone
  if (data.phone) {
    const { data: byPhone } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization_id)
      .or(`phone.eq.${data.phone},whatsapp.eq.${data.phone}`)
      .maybeSingle()
    if (byPhone?.id) return byPhone.id
  }

  // Criar novo
  try {
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        organization_id,
        email: data.email || null,
        phone: data.phone || null,
        name: data.name || data.email?.split('@')[0] || 'Cliente',
        shopify_customer_id: data.shopify_customer_id,
      })
      .select('id')
      .single()

    if (error) {
      // Race condition: outro processo criou — busca de novo
      if (String(error.code) === '23505' && data.email) {
        const { data: again } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', organization_id)
          .ilike('email', data.email)
          .maybeSingle()
        return again?.id || null
      }
      console.error('[Find/Create Contact] Error:', error)
      return null
    }
    return newContact.id
  } catch (e) {
    console.error('[Find/Create Contact] Exception:', e)
    return null
  }
}
