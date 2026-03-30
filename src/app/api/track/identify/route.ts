// =============================================
// Track Identify Endpoint
// src/app/api/track/identify/route.ts
//
// Identifies an anonymous visitor and links their
// session events to a known contact.
// PUBLIC endpoint — used by storefront scripts.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { linkAnonymousEvents, linkAnonymousEventsByAnonymousId, createEvent } from '@/lib/shopify/event-service';
import { WORDER_SHOPIFY_EVENTS, EVENT_SOURCES } from '@/lib/shopify/event-types';

export const dynamic = 'force-dynamic';

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
      email,
      phone,
      sessionId,
      anonymousId,
      firstName,
      lastName,
      properties,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'At least email or phone is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = getSupabaseAdmin();

    // Resolve organization
    let organizationId = accountId;
    if (storeId) {
      const { data: store } = await supabase
        .from('shopify_stores')
        .select('organization_id')
        .eq('id', storeId)
        .eq('is_active', true)
        .maybeSingle();

      if (store) {
        organizationId = store.organization_id;
      }
    }

    // Find or create contact
    let contactId: string | null = null;

    if (email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;

        // Update contact with new info
        const updates: Record<string, any> = {
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (firstName) updates.first_name = firstName;
        if (lastName) updates.last_name = lastName;
        if (phone) updates.phone = phone;
        if (properties?.utm_source) updates.utm_source = properties.utm_source;
        if (properties?.utm_medium) updates.utm_medium = properties.utm_medium;
        if (properties?.utm_campaign) updates.utm_campaign = properties.utm_campaign;

        await supabase.from('contacts').update(updates).eq('id', contactId);
      }
    }

    if (!contactId && phone) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone', phone)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
      }
    }

    // Create new contact if not found
    if (!contactId) {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          organization_id: organizationId,
          email: email || null,
          phone: phone || null,
          first_name: firstName || null,
          last_name: lastName || null,
          source: 'pixel',
          tags: ['pixel-identified'],
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
            .eq('organization_id', organizationId)
            .ilike('email', email)
            .maybeSingle();
          contactId = retryContact?.id || null;
        } else {
          console.error('[Track Identify] Failed to create contact:', error);
          return NextResponse.json(
            { ok: false, error: 'Failed to create contact' },
            { status: 500, headers: corsHeaders }
          );
        }
      } else {
        contactId = newContact.id;

        // Create profile_created event
        await createEvent({
          organization_id: organizationId,
          contact_id: contactId,
          store_id: storeId || null,
          event_type: WORDER_SHOPIFY_EVENTS.PROFILE_CREATED,
          event_source: EVENT_SOURCES.WORDER_PIXEL,
          properties: {
            email,
            phone,
            first_name: firstName,
            last_name: lastName,
            source: 'pixel_identify',
          },
          occurred_at: new Date().toISOString(),
          idempotency_key: `profile_created:pixel:${email || phone}`,
        });
      }
    }

    // Link anonymous events to the now-identified contact
    let linkedCount = 0;
    if (contactId) {
      if (sessionId) {
        linkedCount += await linkAnonymousEvents(sessionId, contactId);
      }
      if (anonymousId && anonymousId !== sessionId) {
        linkedCount += await linkAnonymousEventsByAnonymousId(anonymousId, contactId);
      }
    }

    // Set cookie with contact ID
    const response = NextResponse.json(
      {
        ok: true,
        contactId,
        eventsLinked: linkedCount,
      },
      { headers: corsHeaders }
    );

    if (contactId) {
      response.cookies.set('__worder_id', contactId, {
        httpOnly: false, // Readable by JS for the pixel
        secure: true,
        sameSite: 'none', // Cross-site (Shopify → Worder)
        maxAge: 365 * 24 * 60 * 60, // 1 year
        path: '/',
      });
    }

    return response;
  } catch (error: any) {
    console.error('[Track Identify] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
