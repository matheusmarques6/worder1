// =============================================
// WORDER: Stripe webhook
// POST /api/webhooks/stripe
//
// Sincroniza billing_subscriptions + billing_invoices com eventos Stripe.
// Verifica signature (stripe-signature header).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RELEVANT = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.finalized',
  'invoice.payment_failed',
  'checkout.session.completed',
])

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not set' }, { status: 500 })
  }

  const rawBody = await req.text()
  const stripe = getStripe()

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err: any) {
    console.warn('[stripe webhook] invalid signature:', err?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (!RELEVANT.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session: any = event.data.object
        const orgId = session.metadata?.organization_id
        if (!orgId) break
        await supabaseAdmin
          .from('billing_subscriptions')
          .update({
            stripe_subscription_id: session.subscription,
            plan: session.metadata?.plan || 'starter',
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgId)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub: any = event.data.object
        const orgId = sub.metadata?.organization_id
        if (!orgId) break

        // Detecta plano pelo price_id (primeiro item)
        const priceId = sub.items?.data?.[0]?.price?.id
        const { PLAN_PRICES } = await import('@/lib/billing/stripe')
        let detectedPlan = sub.metadata?.plan
        if (!detectedPlan) {
          for (const [plan, pid] of Object.entries(PLAN_PRICES)) {
            if (pid && pid === priceId) { detectedPlan = plan; break }
          }
        }

        await supabaseAdmin
          .from('billing_subscriptions')
          .upsert({
            organization_id: orgId,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            plan: detectedPlan || 'starter',
            status: sub.status,
            trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000).toISOString()
              : null,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
        break
      }

      case 'customer.subscription.deleted': {
        const sub: any = event.data.object
        await supabaseAdmin
          .from('billing_subscriptions')
          .update({
            status: 'canceled',
            plan: 'free',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', sub.customer)
        break
      }

      case 'invoice.paid':
      case 'invoice.finalized':
      case 'invoice.payment_failed': {
        const inv: any = event.data.object
        const orgId = inv.metadata?.organization_id || inv.subscription_details?.metadata?.organization_id

        // Se não achou org no metadata, busca via customer
        let finalOrgId = orgId
        if (!finalOrgId) {
          const { data: sub } = await supabaseAdmin
            .from('billing_subscriptions')
            .select('organization_id')
            .eq('stripe_customer_id', inv.customer)
            .maybeSingle()
          finalOrgId = sub?.organization_id
        }
        if (!finalOrgId) break

        await supabaseAdmin.from('billing_invoices').upsert({
          organization_id: finalOrgId,
          stripe_invoice_id: inv.id,
          amount_cents: inv.amount_paid || inv.amount_due,
          currency: inv.currency,
          status: inv.status,
          hosted_invoice_url: inv.hosted_invoice_url,
          pdf_url: inv.invoice_pdf,
          paid_at: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
            : null,
          due_at: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        }, { onConflict: 'stripe_invoice_id' })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[stripe webhook] processing error:', err)
    // 200 para não retentar eternamente
    return NextResponse.json({ received: true, error: err?.message })
  }
}
