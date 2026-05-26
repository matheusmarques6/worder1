# RFC: Fase 6 — Bloco C: Self-Service Onboarding + Stripe Billing

**Status:** Proposed  
**Author:** Worder Engineering  
**Date:** 2026-05-26

## Problem

Worder currently requires manual onboarding for every new customer: creating the organization, setting up billing, and configuring WhatsApp. This bottleneck limits growth and creates support overhead.

Additionally, there is no automated billing — conversations and messages are tracked but not charged.

## Solution (MVP)

### Self-Service Signup Flow
1. User signs up via Supabase Auth (email + password or Google OAuth)
2. Automatic organization creation with trial plan (14 days)
3. Guided setup wizard: connect WhatsApp (embedded signup), configure chatbot basics
4. Billing wall after trial: must add payment method to continue

### Stripe Integration
- **Products**: 3 tiers (Starter, Growth, Enterprise) based on conversation volume
- **Metered billing**: track WhatsApp conversations via `whatsapp_cloud_conversations` table
- **Stripe Checkout**: redirect to Stripe-hosted checkout for payment method collection
- **Webhooks**: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`
- **Usage reporting**: daily cron reports conversation count to Stripe via usage records

### Database Changes
```sql
-- organizations table additions
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN plan_tier TEXT DEFAULT 'trial';
ALTER TABLE organizations ADD COLUMN plan_conversation_limit INTEGER DEFAULT 100;
ALTER TABLE organizations ADD COLUMN trial_ends_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN billing_status TEXT DEFAULT 'trial';

-- billing_events for audit trail
CREATE TABLE billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  amount_cents INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### API Endpoints
- `POST /api/billing/checkout` — create Stripe Checkout session
- `POST /api/billing/webhook` — Stripe webhook handler
- `GET /api/billing/usage` — current period usage
- `POST /api/billing/portal` — redirect to Stripe Customer Portal

## Non-scope
- Custom pricing for Enterprise (handled via sales team)
- Annual billing (Stripe supports it but not in MVP)
- Multi-currency (BRL only for MVP)
- Invoice PDF generation (Stripe handles this)

## Success Metrics
- Signup-to-first-message in <15 minutes
- 80% of trial users complete WhatsApp setup
- <2% payment failure rate
- Zero manual intervention for standard plan changes

## Dependencies
- Stripe account with BRL support configured
- Embedded signup (Fase 4) working reliably
- Landing page with pricing (requires product/design decision)

## Risks
- **Stripe regional availability**: BRL metered billing has some quirks. Test thoroughly.
- **Conversation counting accuracy**: Must match Meta's billing definition exactly.
- **Trial abuse**: Users creating multiple accounts. Mitigated by phone number uniqueness.
- **Revenue recognition**: Need accounting advice on when to recognize metered billing revenue.

## Estimate
- Stripe integration (products, checkout, webhooks): 5 days
- Self-service signup flow: 3 days
- Usage reporting cron: 2 days
- Billing UI components: 3 days
- **Total: ~13 working days**
