// =============================================
// Track Identify Endpoint
// src/app/api/track/identify/route.ts
//
// Identifies an anonymous visitor and links their
// session events to a known contact.
// Called by App Embed when:
// - Shopify login ({{ customer }})
// - UTM email (?utm_email=)
// - Cookie recall
// - Custom form (window.worder.identify)
//
// PUBLIC endpoint — no auth required.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { linkAnonymousEvents, linkAnonymousEventsByAnonymousId, createEvent } from '@/lib/shopify/event-service';
import { WORDER_SHOPIFY_EVENTS, EVENT_SOURCES } from '@/lib/shopify/event-types';

export const dynamic = 'force-dynamic';

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
      storeDomain,
      email,
      phone,
      firstName,
      lastName,
      shopifyCustomerId,
      // Accept both anonymousId (canonical) and visitorId (worder.js legacy name)
      anonymousId: anonymousIdRaw,
      visitorId,
      sessionId,
      source,
      properties,
    } = body;
    const anonymousId = anonymousIdRaw || visitorId;

    if ((!accountId && !storeId && !storeDomain) || (!email && !phone)) {
      return NextResponse.json(
        { error: 'Missing required fields (store identifier + email or phone)' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = getSupabaseAdmin();

    // Resolve store: storeId → storeDomain → accountId (só com uma loja
    // na organização). A identidade fica presa à loja resolvida, então
    // "qualquer loja da organização" prendia o visitante à loja errada.
    const { resolveTrackingStore } = await import('@/lib/shopify/resolve-store-by-domain');
    const store = await resolveTrackingStore<{ id: string; organization_id: string }>(
      supabase,
      { storeId, storeDomain, accountId },
      'id, organization_id'
    );

    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const orgId = store.organization_id;

    // Try to find existing contact by email, phone, or shopifyCustomerId
    let contact: { id: string } | null = null;

    if (email) {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('email', email)
        .maybeSingle();
      contact = data;
    }

    if (!contact && phone) {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone', phone)
        .maybeSingle();
      contact = data;
    }

    if (!contact && shopifyCustomerId) {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('shopify_customer_id', String(shopifyCustomerId))
        .maybeSingle();
      contact = data;
    }

    if (contact) {
      // Update existing contact with any new data
      const updates: Record<string, any> = {
        last_active_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (firstName) updates.first_name = firstName;
      if (lastName) updates.last_name = lastName;
      if (phone) updates.phone = phone;
      if (email) updates.email = email.toLowerCase();
      if (shopifyCustomerId) updates.shopify_customer_id = String(shopifyCustomerId);
      if (properties?.utm_source) updates.utm_source = properties.utm_source;
      if (properties?.utm_medium) updates.utm_medium = properties.utm_medium;
      if (properties?.utm_campaign) updates.utm_campaign = properties.utm_campaign;
      if (properties?.ordersCount != null) updates.total_orders = properties.ordersCount;
      if (properties?.totalSpent != null) updates.total_spent = parseFloat(properties.totalSpent);

      await supabase.from('contacts').update(updates).eq('id', contact.id);
    } else {
      // Create new contact
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          organization_id: orgId,
          email: email ? email.toLowerCase() : null,
          phone: phone || null,
          first_name: firstName || null,
          last_name: lastName || null,
          shopify_customer_id: shopifyCustomerId ? String(shopifyCustomerId) : null,
          source: source || 'app_embed',
          tags: [],
          custom_fields: {},
          total_orders: 0,
          total_spent: 0,
          lifecycle_stage: 'subscriber',
          last_active_at: new Date().toISOString(),
          utm_source: properties?.utm_source || null,
          utm_medium: properties?.utm_medium || null,
          utm_campaign: properties?.utm_campaign || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        // Handle unique constraint (race condition)
        if (error.code === '23505' && email) {
          const { data: retryContact } = await supabase
            .from('contacts')
            .select('id')
            .eq('organization_id', orgId)
            .ilike('email', email)
            .maybeSingle();
          contact = retryContact;
        } else {
          console.error('[Track Identify] Failed to create contact:', error);
          return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
        }
      } else {
        contact = newContact;

        // Create profile_created event
        try {
          await createEvent({
            organization_id: orgId,
            contact_id: contact!.id,
            store_id: store.id,
            event_type: WORDER_SHOPIFY_EVENTS.PROFILE_CREATED,
            event_source: 'app_embed' as any,
            properties: {
              email,
              phone,
              first_name: firstName,
              last_name: lastName,
              shopify_customer_id: shopifyCustomerId,
              source: source || 'app_embed',
            },
            occurred_at: new Date().toISOString(),
            idempotency_key: `profile_created:embed:${email || phone}`,
          });
        } catch {
          // Idempotency — event may already exist
        }
      }
    }

    // Link anonymous events to the identified contact
    let linkedCount = 0;
    if (contact?.id) {
      if (anonymousId) {
        linkedCount += await linkAnonymousEventsByAnonymousId(anonymousId, contact.id);
      }
      if (sessionId && sessionId !== anonymousId) {
        linkedCount += await linkAnonymousEvents(sessionId, contact.id);
      }

      // Update the identity graph too: this is where Klaviyo's "Extended ID"
      // shines — by writing email_hash + phone_hash here, future page loads
      // (even from a different device, or after Safari ITP wipes localStorage)
      // can re-match by deterministic identifier. Also backfills any historic
      // events under aliases that the legacy linkers above missed.
      try {
        const { resolveIdentity, linkContactToIdentity } = await import('@/lib/identity/resolver');
        const ua = request.headers.get('user-agent') || null;
        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
        const identity = await resolveIdentity({
          organizationId: orgId,
          storeId: store.id,
          clientVisitorId: anonymousId || null,
          fingerprintHash: (body as any).fingerprintHash || null,
          userAgent: ua,
          ip,
          email: email || null,
          phone: phone || null,
          shopifyCustomerId: shopifyCustomerId ? String(shopifyCustomerId) : null,
          source: 'identify',
        });
        const backfilled = await linkContactToIdentity(identity.identityId, contact.id, orgId);
        linkedCount += backfilled.eventsLinked;
      } catch (idErr) {
        console.error('[Track Identify] identity graph link failed:', idErr);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        contactId: contact?.id || null,
        eventsLinked: linkedCount,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('[Track Identify] Error:', error);
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  }
}
