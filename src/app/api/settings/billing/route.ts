import { NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getPlanLimits } from '@/lib/billing/stripe'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id

  try {
    // 1. Assinatura Stripe (se existe)
    const { data: sub } = await supabaseAdmin
      .from('billing_subscriptions')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle()

    const plan = sub?.plan || 'free'
    const limits = getPlanLimits(plan)

    // 2. Consumo do mês (emails enviados)
    const firstOfMonth = new Date()
    firstOfMonth.setDate(1)
    firstOfMonth.setHours(0, 0, 0, 0)

    const { count: emailsSent } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', firstOfMonth.toISOString())

    const { count: contactsCount } = await supabaseAdmin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)

    // 3. Faturas recentes
    const { data: invoices } = await supabaseAdmin
      .from('billing_invoices')
      .select('stripe_invoice_id, amount_cents, currency, status, hosted_invoice_url, pdf_url, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(12)

    return NextResponse.json({
      plan,
      status: sub?.status || 'active',
      trialEndsAt: sub?.trial_ends_at || null,
      currentPeriodStart: sub?.current_period_start || null,
      currentPeriodEnd: sub?.current_period_end || null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end || false,
      limits: {
        emailsMonth: limits.emails_month,
        contacts: limits.contacts,
        whatsappMonth: limits.whatsapp_month,
      },
      usage: {
        emailsMonth: emailsSent || 0,
        contacts: contactsCount || 0,
      },
      invoices: invoices || [],
      hasStripeCustomer: Boolean(sub?.stripe_customer_id),
    })
  } catch (err: any) {
    console.error('[settings/billing GET]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
