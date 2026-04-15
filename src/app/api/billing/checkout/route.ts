// =============================================
// WORDER: Stripe Checkout session
// POST /api/billing/checkout { plan }
// Cria (ou recupera) customer + inicia Checkout Session.
// Retorna URL pra redirecionar o user.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getStripe, isStripeConfigured, PLAN_PRICES } from '@/lib/billing/stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_* env vars.' },
      { status: 503 }
    )
  }

  const auth = await getAuthClient()
  if (!auth) return authError()

  const { plan } = await req.json()
  const priceId = PLAN_PRICES[plan]
  if (!priceId) {
    return NextResponse.json({ error: `Plan "${plan}" not configured` }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin

    // Recupera/cria billing_subscriptions row
    const { data: existing } = await supabaseAdmin
      .from('billing_subscriptions')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .maybeSingle()

    let customerId = existing?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        metadata: {
          organization_id: auth.user.organization_id,
          user_id: auth.user.id,
        },
      })
      customerId = customer.id

      await supabaseAdmin
        .from('billing_subscriptions')
        .upsert({
          organization_id: auth.user.organization_id,
          stripe_customer_id: customerId,
          plan: existing?.plan || 'free',
          status: existing?.status || 'active',
        })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${baseUrl}/settings/billing?status=cancelled`,
      subscription_data: {
        metadata: {
          organization_id: auth.user.organization_id,
          plan,
        },
      },
      metadata: {
        organization_id: auth.user.organization_id,
        plan,
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (err: any) {
    console.error('[billing/checkout]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
