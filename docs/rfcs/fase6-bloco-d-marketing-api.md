# RFC: Fase 6 — Bloco D: Marketing Messages API (Optional)

**Status:** Proposed (Optional)  
**Author:** Worder Engineering  
**Date:** 2026-05-26

## Problem

Worder's campaign system (`campaign-processor.ts`) sends marketing messages but lacks:
- Audience segmentation based on purchase history / engagement
- Scheduled sends with timezone awareness
- A/B testing for template variants
- Compliance guardrails (opt-out handling, frequency caps)

## Solution (MVP)

### API Endpoints
- `POST /api/marketing/campaigns` — create campaign with audience filter + schedule
- `GET /api/marketing/campaigns/[id]/stats` — delivery, read, click-through rates
- `POST /api/marketing/audiences` — create saved audience segment
- `GET /api/marketing/audiences` — list segments with estimated reach

### Audience Segmentation
Build segments from existing data:
- Last purchase date (e.g., "bought in last 30 days")
- Message engagement (e.g., "read last 3 campaigns")
- Tag-based (CRM tags from contacts)
- Cart abandonment (contacts with abandoned carts in last 7 days)

### Compliance
- Automatic opt-out processing (respond to "STOP" / "SAIR")
- Per-contact frequency cap (max 1 marketing message per 24h by default)
- Template pre-validation against Meta policies
- Consent tracking per contact

### Database Changes
- `marketing_campaigns` table with schedule, audience_filter, status, stats
- `marketing_audiences` table with filter JSON + cached count
- `contact_preferences` table for opt-out and frequency tracking

## Non-scope
- Visual campaign builder (use template builder from Fase 5)
- Multi-channel campaigns (WhatsApp only for MVP)
- Advanced analytics (cohort analysis, LTV attribution)
- WhatsApp Business API marketing message pricing optimization

## Success Metrics
- Campaign creation to first delivery in <5 minutes
- Opt-out compliance: 100% of STOP requests processed within 1 minute
- Template rejection rate <10% (pre-validation catches issues)

## Dependencies
- Template builder (Fase 5) for creating marketing templates
- Cloud API connection (Fase 1-4)
- Contact/CRM data populated

## Risks
- **Meta policy enforcement**: Aggressive marketing can get numbers blocked. Frequency caps essential.
- **Scale**: Large audience campaigns (10k+) need queue-based processing. Existing `campaign-processor.ts` may need scaling.

## Estimate
- API endpoints + segmentation: 5 days
- Compliance layer: 3 days
- Campaign stats: 2 days
- **Total: ~10 working days**
