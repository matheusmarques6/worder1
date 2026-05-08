// =============================================
// CDP Event Service
// src/lib/shopify/event-service.ts
//
// CRUD operations for the contact_events table.
// Handles event creation with idempotency,
// querying, and anonymous event linking.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { WorderShopifyEventType, EventSource } from './event-types';

// =============================================
// TYPES
// =============================================

export interface CreateEventInput {
  organization_id: string;
  contact_id?: string | null;
  store_id?: string | null;
  event_type: WorderShopifyEventType;
  event_source: EventSource;
  properties: Record<string, any>;
  monetary_value?: number | null;
  currency?: string;
  shopify_resource_id?: string | null;
  shopify_resource_type?: string | null;
  session_id?: string | null;
  anonymous_id?: string | null;
  occurred_at?: string;
  idempotency_key?: string | null;
}

export interface EventRecord {
  id: string;
  organization_id: string;
  contact_id: string | null;
  store_id: string | null;
  event_type: string;
  event_source: string;
  properties: Record<string, any>;
  monetary_value: number | null;
  currency: string | null;
  shopify_resource_id: string | null;
  shopify_resource_type: string | null;
  session_id: string | null;
  anonymous_id: string | null;
  occurred_at: string;
  received_at: string;
  processed_at: string | null;
  idempotency_key: string | null;
}

export interface EventQueryOptions {
  limit?: number;
  offset?: number;
  event_type?: string | string[];
  event_source?: string;
  from?: string;
  to?: string;
  shopify_resource_id?: string;
}

// =============================================
// CREATE EVENT
// =============================================

/**
 * Insert a new event into contact_events with idempotency protection.
 *
 * If an idempotency_key is provided and already exists, the insert is
 * skipped and the existing record is returned (no error thrown).
 */
export async function createEvent(input: CreateEventInput): Promise<EventRecord | null> {
  const supabase = getSupabaseAdmin();

  // Pre-storage pipeline (every event flows through this):
  //   1. enrichShopifyEvent — fills line item images + product URLs +
  //      collections + descriptions from shopify_products. Variant-aware
  //      (uses variants[].image_id → images[]). Falls back to images[0]
  //      when the variant has no specific image. Also populates customer
  //      data from contacts when contact_id is set.
  //   2. normalizeToCanonical — produces stable top-level field names
  //      ({{ CheckoutURL }}, {{ Items[0].ProductName }}, …) regardless
  //      of source. Templates rely on these.
  // Original payload always preserved on properties.raw.
  let mergedProperties: Record<string, any> = input.properties;
  try {
    let storeDomain: string | null = null;
    if (input.store_id) {
      try {
        const { data: storeRow } = await supabase
          .from('shopify_stores')
          .select('shop_domain')
          .eq('id', input.store_id)
          .maybeSingle();
        storeDomain = storeRow?.shop_domain || null;
      } catch { /* best-effort */ }
    }

    // Step 1: enrich line items + customer from local DB caches. Webhook
    // events arrive with bare line_items (no images, no handles, no
    // collections — Shopify's checkout webhook payload is sparse). This
    // join makes the stored event self-contained so downstream renders
    // don't have to hit the DB again.
    let enrichedInput: Record<string, any> = input.properties;
    try {
      const { enrichShopifyEvent } = await import('@/lib/cdp/enrich-shopify-event');
      const enriched = await enrichShopifyEvent(input.event_type, input.properties, {
        supabase,
        storeId: input.store_id || '',
        organizationId: input.organization_id,
        shopDomain: storeDomain,
        contactId: input.contact_id || null,
        sessionId: input.session_id || null,
        anonymousId: input.anonymous_id || null,
      });
      enrichedInput = { ...input.properties, ...enriched };
    } catch (e) {
      console.warn('[createEvent] enrichment failed (non-fatal):', e);
    }

    // Step 2: canonicalize to the Worder schema
    const { normalizeToCanonical } = await import('@/lib/cdp/normalize-to-canonical');
    const canonical = normalizeToCanonical(enrichedInput, {
      source: input.event_source,
      storeDomain,
      rawEventType: input.event_type,
    });
    // Merge: enriched first (preserves source-specific extras), canonical
    // last (top-level stable names overwrite when conflicting).
    mergedProperties = { ...enrichedInput, ...canonical };
  } catch (e) {
    console.warn('[createEvent] pre-storage pipeline failed (non-fatal):', e);
  }

  const record = {
    organization_id: input.organization_id,
    contact_id: input.contact_id || null,
    store_id: input.store_id || null,
    event_type: input.event_type,
    event_source: input.event_source,
    properties: mergedProperties,
    monetary_value: input.monetary_value ?? null,
    currency: input.currency || 'BRL',
    shopify_resource_id: input.shopify_resource_id || null,
    shopify_resource_type: input.shopify_resource_type || null,
    session_id: input.session_id || null,
    anonymous_id: input.anonymous_id || null,
    occurred_at: input.occurred_at || new Date().toISOString(),
    received_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    idempotency_key: input.idempotency_key || null,
  };

  // If idempotency_key is set, check for existing first
  if (record.idempotency_key) {
    const { data: existing } = await supabase
      .from('contact_events')
      .select('*')
      .eq('idempotency_key', record.idempotency_key)
      .maybeSingle();

    if (existing) {
      // Backfill contact_id when the new call has it but the original didn't.
      // Common case: checkouts/create fires before email is captured (no contact),
      // then checkouts/update fires with the same idempotency key after the
      // contact has been resolved. Without this, the event stays orphaned and
      // never shows up on the contact's timeline.
      const patch: Record<string, any> = {};
      if (!existing.contact_id && record.contact_id) {
        patch.contact_id = record.contact_id;
      }
      if (!existing.session_id && record.session_id) {
        patch.session_id = record.session_id;
      }
      if (!existing.anonymous_id && record.anonymous_id) {
        patch.anonymous_id = record.anonymous_id;
      }
      if (Object.keys(patch).length > 0) {
        const { data: updated } = await supabase
          .from('contact_events')
          .update(patch)
          .eq('id', existing.id)
          .select()
          .maybeSingle();
        return (updated || { ...existing, ...patch }) as EventRecord;
      }
      return existing as EventRecord;
    }
  }

  const { data, error } = await supabase
    .from('contact_events')
    .insert(record)
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation on idempotency_key (race condition)
    if (error.code === '23505' && record.idempotency_key) {
      const { data: existing } = await supabase
        .from('contact_events')
        .select('*')
        .eq('idempotency_key', record.idempotency_key)
        .maybeSingle();
      return existing as EventRecord | null;
    }

    console.error('[EventService] Failed to create event:', error);
    throw error;
  }

  // Bridge CDP event to flow engine's event_logs
  try {
    const flowEventMap: Record<string, string> = {
      'placed_order': 'order.created',
      'ordered_product': 'order.created',
      'fulfilled_order': 'order.fulfilled',
      'cancelled_order': 'order.cancelled',
      'refunded_order': 'order.refunded',
      'checkout_started': 'checkout.completed',
      'checkout_abandoned': 'checkout.abandoned',
      'profile_created': 'contact.created',
      'profile_updated': 'contact.updated',
      'subscribed_email': 'contact.created',
      'added_to_cart': 'custom.added_to_cart',
      'viewed_product': 'custom.viewed_product',
    };

    const flowEventType = flowEventMap[input.event_type];
    if (flowEventType && input.contact_id) {
      try {
        await supabase.from('event_logs').insert({
          organization_id: input.organization_id,
          event_type: flowEventType,
          contact_id: input.contact_id,
          payload: input.properties || {},
          status: 'pending',
          created_at: new Date().toISOString(),
        })
      } catch {} // Don't fail the main event if flow bridge fails
    }
  } catch {
    // Silently ignore - flow bridge is non-critical
  }

  return data as EventRecord;
}

// =============================================
// QUERY EVENTS
// =============================================

/**
 * Get events for a specific contact, ordered by occurred_at DESC.
 */
export async function getEventsByContact(
  contactId: string,
  options?: EventQueryOptions
): Promise<EventRecord[]> {
  const supabase = getSupabaseAdmin();
  const { limit = 50, offset = 0, event_type, event_source, from, to } = options || {};

  let query = supabase
    .from('contact_events')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (event_type) {
    if (Array.isArray(event_type)) {
      query = query.in('event_type', event_type);
    } else {
      query = query.eq('event_type', event_type);
    }
  }

  if (event_source) {
    query = query.eq('event_source', event_source);
  }

  if (from) {
    query = query.gte('occurred_at', from);
  }

  if (to) {
    query = query.lte('occurred_at', to);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[EventService] Failed to query events by contact:', error);
    throw error;
  }

  return (data || []) as EventRecord[];
}

/**
 * Get events by type for an organization, ordered by occurred_at DESC.
 */
export async function getEventsByType(
  organizationId: string,
  eventType: string | string[],
  options?: EventQueryOptions
): Promise<EventRecord[]> {
  const supabase = getSupabaseAdmin();
  const { limit = 50, offset = 0, from, to, shopify_resource_id } = options || {};

  let query = supabase
    .from('contact_events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (Array.isArray(eventType)) {
    query = query.in('event_type', eventType);
  } else {
    query = query.eq('event_type', eventType);
  }

  if (from) {
    query = query.gte('occurred_at', from);
  }

  if (to) {
    query = query.lte('occurred_at', to);
  }

  if (shopify_resource_id) {
    query = query.eq('shopify_resource_id', shopify_resource_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[EventService] Failed to query events by type:', error);
    throw error;
  }

  return (data || []) as EventRecord[];
}

// =============================================
// LINK ANONYMOUS EVENTS
// =============================================

/**
 * Associate all anonymous events from a session with a known contact.
 * Used when an anonymous visitor is later identified (e.g., via form, login, checkout).
 */
export async function linkAnonymousEvents(
  sessionId: string,
  contactId: string
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('contact_events')
    .update({ contact_id: contactId })
    .is('contact_id', null)
    .eq('session_id', sessionId)
    .select('id');

  if (error) {
    console.error('[EventService] Failed to link anonymous events:', error);
    throw error;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[EventService] Linked ${count} anonymous events (session=${sessionId}) to contact ${contactId}`);
  }

  return count;
}

/**
 * Link events by anonymous_id to a contact (alternative to session_id).
 */
export async function linkAnonymousEventsByAnonymousId(
  anonymousId: string,
  contactId: string
): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('contact_events')
    .update({ contact_id: contactId })
    .is('contact_id', null)
    .eq('anonymous_id', anonymousId)
    .select('id');

  if (error) {
    console.error('[EventService] Failed to link anonymous events by anonymous_id:', error);
    throw error;
  }

  return data?.length || 0;
}

// =============================================
// HELPERS
// =============================================

/**
 * Count events by type for an organization (useful for dashboards).
 */
export async function countEventsByType(
  organizationId: string,
  options?: { from?: string; to?: string }
): Promise<Record<string, number>> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('contact_events')
    .select('event_type')
    .eq('organization_id', organizationId);

  if (options?.from) {
    query = query.gte('occurred_at', options.from);
  }

  if (options?.to) {
    query = query.lte('occurred_at', options.to);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[EventService] Failed to count events:', error);
    throw error;
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.event_type] = (counts[row.event_type] || 0) + 1;
  }

  return counts;
}

/**
 * Check if an event with the given idempotency_key already exists.
 */
export async function eventExists(idempotencyKey: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('contact_events')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  return !!data;
}

/**
 * Get the most recent event of a given type for a contact.
 */
export async function getLastEventForContact(
  contactId: string,
  eventType: string
): Promise<EventRecord | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('contact_events')
    .select('*')
    .eq('contact_id', contactId)
    .eq('event_type', eventType)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[EventService] Failed to get last event:', error);
    return null;
  }

  return data as EventRecord | null;
}
