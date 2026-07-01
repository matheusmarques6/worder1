// =============================================================
// Tests for cross-store trigger scoping.
//
// One organization can host multiple Shopify stores that SHARE a
// single contact row per (organization_id, email). A store-triggered
// event (checkout abandoned, order, etc.) must only enroll the shared
// contact into flows belonging to THAT store — otherwise a checkout on
// "Dr. Groot" fans the contact into "Based"'s funnels (cross-store leak).
//
// shouldIncludeAutomationForStore is the pure decision that gates this,
// mirrored both in the SQL .or() filter and as JS defense-in-depth.
// =============================================================

import { describe, it, expect } from 'vitest';
import { shouldIncludeAutomationForStore } from '../trigger-dispatcher';
import { extractEventPayloadStoreId } from '../../events';

const STORE_A = 'store-a-uuid';
const STORE_B = 'store-b-uuid';

describe('shouldIncludeAutomationForStore', () => {
  it('includes an automation of the SAME store as the event', () => {
    expect(shouldIncludeAutomationForStore(STORE_A, STORE_A)).toBe(true);
  });

  it('EXCLUDES an automation of a DIFFERENT store (the leak)', () => {
    // Dr. Groot checkout must NOT match a Based flow.
    expect(shouldIncludeAutomationForStore(STORE_A, STORE_B)).toBe(false);
  });

  it('includes org-wide flows (NULL automation store) for a store event', () => {
    expect(shouldIncludeAutomationForStore(null, STORE_A)).toBe(true);
    expect(shouldIncludeAutomationForStore(undefined, STORE_A)).toBe(true);
  });

  it('includes everything when the event has no store (non-store triggers)', () => {
    // Segment / custom-event / email-event triggers stay org-wide.
    expect(shouldIncludeAutomationForStore(STORE_A, null)).toBe(true);
    expect(shouldIncludeAutomationForStore(STORE_B, undefined)).toBe(true);
    expect(shouldIncludeAutomationForStore(null, null)).toBe(true);
  });
});

// =============================================================
// Legacy EventBus path — store id extraction from the event payload.
// The store id must reach findMatchingAutomations/createAutomationRun so
// the store-scope actually engages on the legacy path too.
// =============================================================
describe('extractEventPayloadStoreId (legacy EventBus path)', () => {
  it('reads a flat store_id', () => {
    expect(extractEventPayloadStoreId({ store_id: STORE_A })).toBe(STORE_A);
  });

  it('reads a camelCase storeId', () => {
    expect(extractEventPayloadStoreId({ storeId: STORE_A })).toBe(STORE_A);
  });

  it('reads store_id from the Shopify outbound dispatch meta', () => {
    // Checkout-abandoned events carry the store under _webhook_dispatch_meta.
    expect(
      extractEventPayloadStoreId({ _webhook_dispatch_meta: { store_id: STORE_A } })
    ).toBe(STORE_A);
  });

  it('returns null for non-store events (stays org-wide)', () => {
    expect(extractEventPayloadStoreId({})).toBe(null);
    expect(extractEventPayloadStoreId(null)).toBe(null);
    expect(extractEventPayloadStoreId(undefined)).toBe(null);
    expect(extractEventPayloadStoreId({ email: 'a@b.com' })).toBe(null);
  });

  it('prefers a top-level store_id over the dispatch meta', () => {
    expect(
      extractEventPayloadStoreId({
        store_id: STORE_A,
        _webhook_dispatch_meta: { store_id: STORE_B },
      })
    ).toBe(STORE_A);
  });
});
