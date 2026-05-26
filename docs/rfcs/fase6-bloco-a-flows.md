# RFC: Fase 6 — Bloco A: WhatsApp Flows (Encryption + Data Exchange)

**Status:** Implemented (core)  
**Author:** Worder Engineering  
**Date:** 2026-05-26

## Problem

Worder's WhatsApp integration cannot use Meta's native Flows feature (interactive multi-screen forms within WhatsApp). This limits e-commerce use cases like cart recovery, NPS surveys, and appointment booking to basic text + button messages that have lower completion rates.

Meta Flows require a strict encryption protocol (RSA-OAEP + AES-128-GCM) for the data exchange endpoint. Without this, the platform cannot register flow endpoints with Meta.

## Solution (MVP)

### Encryption Module (`flows-encryption.ts`)
- RSA-2048 key pair generation for each WABA account
- Decrypt incoming requests: RSA-OAEP (SHA-256) unwraps AES key, AES-128-GCM decrypts payload
- Encrypt responses: AES-128-GCM with flipped IV (XOR 0xFF per Meta spec)
- Private keys stored encrypted at-rest using existing `token-encryption.ts` format

### Data Exchange Endpoint (`/api/whatsapp/flows/data-exchange`)
- Receives encrypted POST from Meta, decrypts, routes to handler, encrypts response
- Handles: ping, INIT, BACK, data_exchange actions
- 10-second maxDuration (Meta's hard timeout)
- Event logging to `whatsapp_flow_events` table

### Key Setup Endpoint (`/api/whatsapp/cloud/accounts/[id]/setup-flows`)
- POST: generates key pair, uploads public key to Meta, stores encrypted private key
- GET: returns configuration status (no key material exposed)

### Pre-built Templates
- `abandoned-cart.json` — Cart recovery with product list + feedback
- `nps-survey.json` — Post-purchase NPS (0-10 + comment)
- `appointment-booking.json` — Date/time selection

### Database Schema (`07-whatsapp-flows-schema.sql`)
- ALTER `whatsapp_business_accounts`: flow key columns
- ALTER `whatsapp_flows`: Meta Flow ID, flow_json, category, counters
- CREATE `whatsapp_flow_events`: interaction tracking with RLS

## Non-scope
- Flow visual builder UI (future Bloco A-2)
- A/B testing between flow variants
- Flow analytics dashboard
- WhatsApp Payments integration within flows

## Success Metrics
- Flow encryption round-trip works in <100ms (tested)
- Data exchange endpoint responds within Meta's 10s timeout
- 9/9 unit tests passing for encryption module
- Cart recovery flow achieves >15% completion rate (post-launch)

## Dependencies
- Node.js `crypto` module (already available)
- `token-encryption.ts` (existing, Fase 2)
- Meta Business API v22.0 (public key upload endpoint)
- SQL migration 07 must run before flow endpoints are used

## Risks
- **Meta API changes**: Encryption spec is stable since 2024 but could change. Mitigated by strict version pinning.
- **Key rotation**: No automated key rotation yet. Manual process via setup-flows endpoint.
- **10s timeout**: Complex flows with DB lookups could timeout. Mitigated by keeping handlers simple.

## Estimate
- Core encryption + endpoints: **Done** (this commit)
- Flow template customization UI: 3-5 days
- Flow analytics: 2-3 days
