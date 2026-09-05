// Configurações → Plano e uso / Faturas e pagamento.
//
// GET   → plano, ciclo, limites, uso (e-mails, contatos, WhatsApp, SMS),
//         preços por uso, método de pagamento (Stripe), dados da fatura, histórico.
// PATCH → { billing: { company_name, cnpj, billing_email } } dados da fatura.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-admin'
import { getPlanLimits, isStripeConfigured, getStripe, PLAN_PRICES } from '@/lib/billing/stripe'
import { PLANS, USAGE_PRICES } from '@/lib/billing/plans'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id

  try {
    const [{ data: sub }, { data: org }] = await Promise.all([
      supabaseAdmin.from('billing_subscriptions').select('*').eq('organization_id', orgId).maybeSingle(),
      supabaseAdmin.from('organizations').select('name, company_name, cnpj, billing_email, stripe_customer_id, plan_contacts_limit, plan_emails_limit, plan_whatsapp_limit').eq('id', orgId).single(),
    ])

    const plan = sub?.plan || 'free'
    const base = getPlanLimits(plan)
    const limits = {
      emailsMonth: org?.plan_emails_limit ?? base.emails_month,
      contacts: org?.plan_contacts_limit ?? base.contacts,
      whatsappMonth: org?.plan_whatsapp_limit ?? base.whatsapp_month,
    }

    // Ciclo: o da assinatura Stripe; sem assinatura, o mês corrente.
    const now = new Date()
    const periodStart = sub?.current_period_start ? new Date(sub.current_period_start) : new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const sinceIso = periodStart.toISOString()

    const [{ count: emailsSent }, { count: contactsCount }, { count: waSent }, { count: smsSent }, { data: invoices }] = await Promise.all([
      supabaseAdmin.from('email_sends').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', sinceIso).not('status', 'in', '("failed","pending","queued")'),
      supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabaseAdmin.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('direction', 'outbound').gte('created_at', sinceIso),
      supabaseAdmin.from('sms_sends').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).gte('created_at', sinceIso).then((r) => (r.error ? { count: 0 } : r)),
      supabaseAdmin.from('billing_invoices').select('stripe_invoice_id, invoice_number, amount_cents, currency, status, hosted_invoice_url, pdf_url, created_at, paid_at, due_at, period_start, period_end').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(24),
    ])

    // Método de pagamento (Stripe) — só se houver cliente.
    let paymentMethod: any = null
    let upcoming: any = null
    const customerId = sub?.stripe_customer_id || org?.stripe_customer_id
    if (customerId && isStripeConfigured()) {
      try {
        const stripe = getStripe()
        const cust: any = await stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] })
        const pm = cust?.invoice_settings?.default_payment_method
        if (pm?.card) paymentMethod = { brand: pm.card.brand, last4: pm.card.last4, exp_month: pm.card.exp_month, exp_year: pm.card.exp_year }
        else {
          const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
          const c = list.data[0]?.card
          if (c) paymentMethod = { brand: c.brand, last4: c.last4, exp_month: c.exp_month, exp_year: c.exp_year }
        }
        if (sub?.stripe_subscription_id) {
          const up: any = await (stripe.invoices as any).retrieveUpcoming({ customer: customerId }).catch(() => null)
          if (up) upcoming = { amount_cents: up.amount_due, currency: up.currency, date: up.next_payment_attempt ? new Date(up.next_payment_attempt * 1000).toISOString() : sub.current_period_end }
        }
      } catch { /* Stripe indisponível: mostra sem cartão */ }
    }

    const usage = { emailsMonth: emailsSent || 0, contacts: contactsCount || 0, whatsappMonth: waSent || 0, smsMonth: smsSent || 0 }
    const over = (used: number, lim: number) => (lim > 0 ? Math.max(0, used - lim) : 0)
    const usagePricing = USAGE_PRICES.map((p) => {
      let units = 0
      if (p.key === 'whatsapp_marketing') units = over(usage.whatsappMonth, limits.whatsappMonth)
      if (p.key === 'sms') units = usage.smsMonth
      if (p.key === 'email_block') units = Math.ceil(over(usage.emailsMonth, limits.emailsMonth) / 1000)
      return { ...p, units, estimate: units * p.price }
    })

    return NextResponse.json({
      plan,
      planLabel: PLANS.find((p) => p.key === plan)?.label || plan,
      status: sub?.status || 'active',
      trialEndsAt: sub?.trial_ends_at || null,
      currentPeriodStart: periodStart.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: sub?.cancel_at_period_end || false,
      limits,
      usage,
      usagePricing,
      plans: PLANS.map((p) => ({ ...p, available: p.key === 'free' || !!PLAN_PRICES[p.key] || !isStripeConfigured() })),
      stripeConfigured: isStripeConfigured(),
      invoices: invoices || [],
      hasStripeCustomer: Boolean(customerId),
      paymentMethod,
      upcoming,
      billing: {
        company_name: org?.company_name || org?.name || '',
        cnpj: org?.cnpj || '',
        billing_email: org?.billing_email || auth.user.email,
      },
    })
  } catch (err: any) {
    console.error('[settings/billing GET]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
  const orgId = auth.user.organization_id
  const body = await request.json().catch(() => ({}))
  const b = body.billing || body
  const company_name = String(b.company_name || '').trim()
  const cnpj = String(b.cnpj || '').trim()
  const billing_email = String(b.billing_email || '').trim().toLowerCase()
  if (company_name.length < 2) return NextResponse.json({ error: 'Informe a razão social.' }, { status: 400 })
  if (cnpj && cnpj.replace(/\D/g, '').length !== 14) return NextResponse.json({ error: 'CNPJ inválido.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing_email)) return NextResponse.json({ error: 'E-mail de cobrança inválido.' }, { status: 400 })
  try {
    const { error } = await supabaseAdmin.from('organizations').update({ company_name, cnpj: cnpj || null, billing_email, updated_at: new Date().toISOString() }).eq('id', orgId)
    if (error) throw error
    // Reflete no Stripe para as faturas saírem com os dados certos.
    const { data: sub } = await supabaseAdmin.from('billing_subscriptions').select('stripe_customer_id').eq('organization_id', orgId).maybeSingle()
    if (sub?.stripe_customer_id && isStripeConfigured()) {
      try { await getStripe().customers.update(sub.stripe_customer_id, { name: company_name, email: billing_email, metadata: { cnpj } }) } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
