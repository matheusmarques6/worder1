# RFC: Fase 6 — Bloco B: Evolution API Deprecation

**Status:** Proposed  
**Author:** Worder Engineering  
**Date:** 2026-05-26

## Problem

Worder currently supports two WhatsApp backends: Evolution API (unofficial) and Cloud API (official Meta). Maintaining both creates:

1. **Double maintenance**: every feature (sending, receiving, templates, webhooks) must work with both APIs
2. **Compliance risk**: Evolution API uses unofficial WhatsApp Web protocol, risking number bans
3. **Feature parity gap**: Cloud API features (Flows, Catalog, Payments) cannot work on Evolution
4. **Support burden**: debugging requires knowing which backend each customer uses

## Solution (MVP)

### Phase 1: Soft Deprecation (Week 1-2)
- Add deprecation banner in the UI for Evolution-connected accounts
- Email notification to affected organizations with migration timeline
- Create migration guide documentation
- Feature flag `EVOLUTION_DEPRECATED=true` to disable new Evolution connections

### Phase 2: Migration Tools (Week 3-4)
- One-click migration wizard: disconnect Evolution, connect Cloud API
- Preserve conversation history (messages stay in DB, only connection changes)
- Verify phone number is available for Cloud API registration
- Batch migration support for multi-number accounts

### Phase 3: Hard Deprecation (Week 5-6)
- Disable Evolution webhook processing
- Remove Evolution-specific code paths (behind feature flag initially)
- Archive Evolution-related tables (don't delete)

### Database Changes
- `whatsapp_business_accounts.connection_method` — add `deprecated_evolution` status
- New table `evolution_migrations` — track migration progress per account

## Non-scope
- Migrating message history to Meta's format (messages stay as-is in our DB)
- Supporting both APIs simultaneously long-term
- Refunding customers who chose Evolution

## Success Metrics
- 90% of Evolution accounts migrated within 4 weeks of announcement
- Zero message loss during migration
- <1h downtime per account migration

## Dependencies
- Cloud API embedded signup (Fase 4) must be working smoothly
- Customer communication templates (email + in-app) must be approved
- Support team trained on migration process

## Risks
- **Customer churn**: Some customers chose Evolution intentionally. Mitigated by extended timeline + support.
- **Phone number portability**: Some numbers may not be eligible for Cloud API. Requires manual review.
- **Downtime during migration**: Brief gap between disconnecting Evolution and connecting Cloud API.

## Estimate
- Soft deprecation (UI + feature flag): 2 days
- Migration wizard: 5 days
- Hard deprecation + code cleanup: 3 days
- **Total: ~10 working days** (spread over 6 weeks for customer communication)
