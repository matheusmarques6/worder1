// =============================================
// WORDER: Stripe client (lazy singleton)
// /src/lib/billing/stripe.ts
// =============================================

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not set')
  }
  _stripe = new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as any,
    typescript: true,
  })
  return _stripe
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// Mapeamento de plan → Stripe Price ID (preenchido via env vars)
export const PLAN_PRICES: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  business: process.env.STRIPE_PRICE_BUSINESS,
}

// Limites por plano (usado pra enforcement)
export const PLAN_LIMITS = {
  free:     { emails_month: 1_000,   contacts: 2_000,    whatsapp_month: 200 },
  starter:  { emails_month: 10_000,  contacts: 10_000,   whatsapp_month: 1_000 },
  pro:      { emails_month: 50_000,  contacts: 50_000,   whatsapp_month: 5_000 },
  business: { emails_month: 200_000, contacts: 200_000,  whatsapp_month: 20_000 },
  enterprise: { emails_month: -1, contacts: -1, whatsapp_month: -1 }, // unlimited
} as const

export type Plan = keyof typeof PLAN_LIMITS

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[(plan as Plan)] || PLAN_LIMITS.free
}
