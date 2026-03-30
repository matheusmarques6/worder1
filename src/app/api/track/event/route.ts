// =============================================
// Track Event Endpoint
// src/app/api/track/event/route.ts
//
// Receives behavioral events from the Web Pixel
// and stores them in contact_events.
// PUBLIC endpoint — no auth required (pixel has no session).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createEvent } from '@/lib/shopify/event-service';
import { EVENT_SOURCES } from '@/lib/shopify/event-types';
import type { WorderShopifyEventType } from '@/lib/shopify/event-types';

export const dynamic = 'force-dynamic';

// Map pixel event types to our CDP event types
const PIXEL_EVENT_MAP: Record<string, WorderShopifyEventType> = {
  viewed_product: 'viewed_product',
  added_to_cart: 'added_to_cart',
  checkout_started: 'checkout_started',
  checkout_completed: 'checkout_completed',
  viewed_collection: 'viewed_collection',
  submitted_search: 'submitted_search',
  cart_viewed: 'cart_viewed',
  page_viewed: 'page_viewed',
  active_on_site: 'active_on_site',
};

// CORS headers for cross-origin requests from Shopify stores
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      accountId,
      storeId,
      eventType,
      properties,
      clientId,
      email,
      timestamp,
      url,
      userAgent,
      sessionId,
    } = body;

    // Validate required fields
    if (!accountId || !eventType) {
      return NextResponse.json(
        { error: 'Missing accountId or eventType' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate event type
    const mappedEventType = PIXEL_EVENT_MAP[eventType];
    if (!mappedEventType) {
      return NextResponse.json(
        { error: 'Unknown event type' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate accountId (organization_id) and storeId exist
    const supabase = getSupabaseAdmin();

    let organizationId = accountId;
    let resolvedStoreId = storeId || null;

    // Quick validation: check store exists and belongs to org
    if (resolvedStoreId) {
      const { data: store } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('id', resolvedStoreId)
        .eq('is_active', true)
        .maybeSingle();

      if (!store) {
        return NextResponse.json(
          { error: 'Invalid store' },
          { status: 400, headers: corsHeaders }
        );
      }
      organizationId = store.organization_id;
    }

    // Resolve contact if we have identification
    let contactId: string | null = null;

    if (email) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .maybeSingle();
      contactId = contact?.id || null;
    }

    if (!contactId && clientId) {
      // clientId is the Shopify customer ID
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('shopify_customer_id', String(clientId))
        .maybeSingle();
      contactId = contact?.id || null;
    }

    // Enrich properties with context
    const enrichedProperties = {
      ...properties,
      url: url || properties.url,
      user_agent: userAgent,
    };

    // Extract monetary value for checkout events
    let monetaryValue: number | null = null;
    if (properties.total_price) {
      monetaryValue = parseFloat(properties.total_price);
    } else if (properties.price) {
      monetaryValue = parseFloat(properties.price) * (properties.quantity || 1);
    }

    // Create event
    await createEvent({
      organization_id: organizationId,
      contact_id: contactId,
      store_id: resolvedStoreId,
      event_type: mappedEventType,
      event_source: EVENT_SOURCES.WORDER_PIXEL,
      properties: enrichedProperties,
      monetary_value: monetaryValue,
      currency: properties.currency || 'BRL',
      session_id: sessionId || null,
      anonymous_id: !contactId ? sessionId : null,
      occurred_at: timestamp || new Date().toISOString(),
      idempotency_key: sessionId
        ? `pixel:${sessionId}:${eventType}:${timestamp || Date.now()}`
        : null,
    });

    // Update last_active_at on contact
    if (contactId) {
      await supabase
        .from('contacts')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', contactId);
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('[Track Event] Error:', error);
    // Always return 200 to not break the pixel
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }
}
