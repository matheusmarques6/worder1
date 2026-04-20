// =============================================
// Track Event Endpoint
// src/app/api/track/event/route.ts
//
// Receives behavioral events from BOTH:
// - App Embed (theme extension) — has cookies, DOM access
// - Web Pixel (sandbox) — no cookies, limited context
//
// PUBLIC endpoint — no auth required.
// Target: <100ms response time.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { WorderShopifyEventType } from '@/lib/shopify/event-types';
import { EVENT_SOURCES } from '@/lib/shopify/event-types';

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
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

// Simple UA parser for device/browser/os
function parseUserAgent(ua: string | undefined | null) {
  if (!ua) return { device_type: null, browser: null, os: null };

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const device_type = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'other';
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
  else if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Edge/i.test(ua)) browser = 'edge';
  else if (/OPR|Opera/i.test(ua)) browser = 'opera';

  let os = 'other';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac OS/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'linux';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';

  return { device_type, browser, os };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      // Identification
      accountId,
      storeId,
      storeDomain,
      visitorId,
      sessionId,
      fingerprint,
      // Event
      eventType,
      eventId,
      properties,
      // Contact fields
      email,
      phone,
      firstName,
      lastName,
      shopifyCustomerId,
      // Attribution
      utmParams,
      clickIds,
      // Context
      source,
      url,
      referrer,
      userAgent,
      timestamp,
      title,
      // Legacy
      clientId,
      anonymousId,
    } = body;

    // Validate: need at least an event type and a way to resolve the store
    if (!eventType) {
      return NextResponse.json(
        { error: 'Missing eventType' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!accountId && !storeId && !storeDomain) {
      return NextResponse.json(
        { error: 'Missing store identifier (accountId, storeId, or storeDomain)' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = getSupabaseAdmin();

    // ---- Resolve store ----
    let store: { id: string; organization_id: string } | null = null;

    if (storeId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('id', storeId)
        .maybeSingle();
      store = data;
    }

    if (!store && accountId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('organization_id', accountId)
        .limit(1)
        .maybeSingle();
      store = data;
    }

    if (!store && storeDomain) {
      // Normalize domain: strip protocol and trailing slash
      const domain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('shop_domain', domain)
        .maybeSingle();
      store = data;
    }

    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const organizationId = store.organization_id;

    // ---- Resolve contact ----
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

    // ---- Map event type ----
    const mappedEventType = EVENT_TYPE_MAP[eventType] || eventType;

    // ---- Determine source ----
    const eventSource = source === 'shopify_pixel'
      ? EVENT_SOURCES.WORDER_PIXEL
      : source === 'app_embed'
        ? EVENT_SOURCES.APP_EMBED
        : EVENT_SOURCES.WORDER_PIXEL;

    // ---- Enrich properties ----
    const enrichedProperties: Record<string, any> = {
      ...properties,
      url: url || properties?.url,
      referrer: referrer || properties?.referrer,
      title: title || properties?.title,
      user_agent: userAgent,
      _original_event_type: eventType,
    };

    // Attach contact info if provided
    if (firstName) enrichedProperties._first_name = firstName;
    if (lastName) enrichedProperties._last_name = lastName;
    if (phone) enrichedProperties._phone = phone;
    if (fingerprint) enrichedProperties._fingerprint = fingerprint;

    // Attach UTM params
    if (utmParams && typeof utmParams === 'object') {
      enrichedProperties._utm = utmParams;
    }

    // Attach click IDs (gclid, fbclid, etc.)
    if (clickIds && typeof clickIds === 'object') {
      enrichedProperties._click_ids = clickIds;
    }

    // ---- Extract monetary value ----
    let monetaryValue: number | null = null;
    if (properties?.$value != null) {
      monetaryValue = parseFloat(properties.$value);
    } else if (properties?.total_price != null) {
      monetaryValue = parseFloat(properties.total_price);
    } else if (properties?.Price != null) {
      const qty = properties?.Quantity || 1;
      monetaryValue = parseFloat(properties.Price) * qty;
    }

    const currency = properties?.Currency || properties?.currency || 'BRL';

    // ---- Build idempotency key ----
    let idempotencyKey: string | null = null;
    if (eventId) {
      idempotencyKey = eventId;
    } else {
      const resourceId = properties?.shopify_resource_id
        || properties?.product_id
        || properties?.order_id
        || properties?.checkout_id;
      if (resourceId) {
        idempotencyKey = `${eventType}:${resourceId}:${sessionId || visitorId || anonymousId || ''}`;
      } else if (sessionId || anonymousId) {
        idempotencyKey = `${source || 'pixel'}:${sessionId || anonymousId}:${eventType}:${timestamp || Date.now()}`;
      }
    }

    // ---- Deduplication check ----
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('contact_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, deduplicated: true }, { status: 200, headers: CORS_HEADERS });
      }
    }

    // ---- Parse UA ----
    const { device_type, browser, os } = parseUserAgent(userAgent);

    // ---- Insert event ----
    const now = new Date().toISOString();
    const eventData: Record<string, any> = {
      organization_id: organizationId,
      contact_id: contactId,
      store_id: store.id,
      event_type: mappedEventType,
      event_source: eventSource,
      properties: enrichedProperties,
      monetary_value: monetaryValue,
      currency,
      session_id: sessionId || null,
      anonymous_id: !contactId ? (visitorId || anonymousId || sessionId) : null,
      occurred_at: timestamp || now,
      received_at: now,
      idempotency_key: idempotencyKey,
    };

    // Add optional shopify resource fields if present
    if (properties?.shopify_resource_id) {
      eventData.shopify_resource_id = properties.shopify_resource_id;
    }
    if (properties?.shopify_resource_type) {
      eventData.shopify_resource_type = properties.shopify_resource_type;
    }

    await supabase.from('contact_events').insert(eventData);

    // ---- Update contact (fire-and-forget for speed) ----
    if (contactId) {
      const contactUpdate: Record<string, any> = {
        last_active_at: now,
        last_event_type: mappedEventType,
      };

      // UA-derived fields
      if (device_type) contactUpdate.device_type = device_type;
      if (browser) contactUpdate.browser = browser;
      if (os) contactUpdate.os = os;

      // UTM attribution
      if (utmParams) {
        if (utmParams.utm_source) contactUpdate.utm_source = utmParams.utm_source;
        if (utmParams.utm_medium) contactUpdate.utm_medium = utmParams.utm_medium;
        if (utmParams.utm_campaign) contactUpdate.utm_campaign = utmParams.utm_campaign;
      }

      // Update contact fields + increment total_events via RPC or plain update
      // We do the update and then a separate increment to keep it simple
      supabase
        .from('contacts')
        .update(contactUpdate)
        .eq('id', contactId)
        .then(() => {
          // Increment total_events
          supabase.rpc('increment_contact_events', { contact_id_input: contactId }).then(() => {});
        });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[Track Event] Error:', error?.message || error);
    // Always return 200 to not break pixel/embed
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  }
}
