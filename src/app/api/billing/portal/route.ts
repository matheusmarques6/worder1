// =============================================
// WORDER: Stripe Customer Portal
// POST /api/billing/portal — retorna URL do portal do cliente
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const auth = await getAuthClient()
  if (!auth) return authError()

  const { data: sub } = await supabaseAdmin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', auth.user.organization_id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing customer yet' }, { status: 404 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${baseUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
