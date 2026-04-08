// =============================================
// Track Event Endpoint
// src/app/api/track/event/route.ts
//
// Receives behavioral events from BOTH:
// - App Embed (theme extension) — has cookies, DOM access
// - Web Pixel (sandbox) — no cookies, limited context
//
// PUBLIC endpoint — no auth required.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createEvent } from '@/lib/shopify/event-service';
import { EVENT_SOURCES } from '@/lib/shopify/event-types';
import type { WorderShopifyEventType } from '@/lib/shopify/event-types';

export const dynamic = 'force-dynamic';

// Map incoming event types to our CDP event types
const EVENT_TYPE_MAP: Record<string, WorderShopifyEventType> = {
  // App Embed events
  active_on_site: 'active_on_site',
  viewed_product: 'viewed_product',
  viewed_collection: 'viewed_collection',
  page_viewed: 'page_viewed',

  // Web Pixel events
  added_to_cart: 'added_to_cart',
  removed_from_cart: 'removed_from_cart',
  checkout_started: 'checkout_started',
  checkout_completed: 'checkout_completed',
  submitted_search: 'submitted_search',
  cart_viewed: 'cart_viewed',

  // Pixel-only checkout progress events
  checkout_contact_submitted: 'checkout_contact_submitted',
  payment_submitted: 'payment_submitted',
};

// CORS headers for cross-origin requests from Shopify stores
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      accountId,
      storeId,
      eventType,
      properties,
      email,
      shopifyCustomerId,
      clientId,         // Legacy field from old pixel
      anonymousId,
      sessionId,
      source,
      timestamp,
      url,
      userAgent,
      referrer,
      title,
    } = body;

    // Validate required fields
    if (!accountId || !storeId || !eventType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = getSupabaseAdmin();

    // Validate store exists and get organization_id
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('id', storeId)
      .maybeSingle();

    if (!store) {
      return NextResponse.json(
        { error: 'Invalid store' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const organizationId = store.organization_id;

    // Resolve contact from identification data
    let contactId: string | null = null;
    const resolvedCustomerId = shopifyCustomerId || clientId;

    if (email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .maybeSingle();
      contactId = contact?.id || null;
    }

    if (!contactId && resolvedCustomerId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('shopify_customer_id', String(resolvedCustomerId))
        .maybeSingle();
      contactId = contact?.id || null;
    }

    // Map event type
    const mappedEventType = EVENT_TYPE_MAP[eventType] || eventType;

    // Determine event source
    const eventSource = source === 'shopify_pixel'
      ? EVENT_SOURCES.WORDER_PIXEL
      : source === 'app_embed'
        ? 'app_embed'
        : EVENT_SOURCES.WORDER_PIXEL;

    // Enrich properties with context data
    const enrichedProperties = {
      ...properties,
      url: url || properties?.url,
      referrer: referrer || properties?.referrer,
      title: title || properties?.title,
      user_agent: userAgent,
      _original_event_type: eventType, // Preserve original for debugging
    };

    // Extract monetary value
    let monetaryValue: number | null = null;
    if (properties?.$value != null) {
      monetaryValue = parseFloat(properties.$value);
    } else if (properties?.total_price != null) {
      monetaryValue = parseFloat(properties.total_price);
    } else if (properties?.Price != null) {
      const qty = properties?.Quantity || 1;
      monetaryValue = parseFloat(properties.Price) * qty;
    }

    // Extract currency
    const currency = properties?.Currency || properties?.currency || 'BRL';

    // Build idempotency key
    const idempotencyKey = sessionId || anonymousId
      ? `${source || 'pixel'}:${sessionId || anonymousId}:${eventType}:${timestamp || Date.now()}`
      : null;

    // Create event
    await createEvent({
      organization_id: organizationId,
      contact_id: contactId,
      store_id: store.id,
      event_type: mappedEventType as WorderShopifyEventType,
      event_source: eventSource,
      properties: enrichedProperties,
      monetary_value: monetaryValue,
      currency,
      session_id: sessionId || null,
      anonymous_id: !contactId ? (anonymousId || sessionId) : null,
      occurred_at: timestamp || new Date().toISOString(),
      idempotency_key: idempotencyKey,
    });

    // Update last_active_at on contact
    if (contactId) {
      await supabase
        .from('contacts')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', contactId);
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[Track Event] Error:', error);
    // Always return 200 to not break pixel/embed
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  }
}
