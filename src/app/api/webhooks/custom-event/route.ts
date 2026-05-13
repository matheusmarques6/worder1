// =============================================
// Custom Event API
//
// POST /api/webhooks/custom-event
//
// Lets merchants (and external systems) fire arbitrary triggers from
// outside Worder — landing pages, Zapier, Shopify Functions, in-store
// kiosks, anything that can speak HTTP. Mirrors Klaviyo's
// "Custom Event" / "Server-side Event" feature: the merchant defines
// the event_type in a flow's trigger config (trigger_custom_event)
// with a `matchConfig.eventName` filter, and any POST here whose
// payload matches that name fires the flow.
//
// Auth: requires WORDER_API_KEY header OR session auth (for internal
// dashboards). Multi-tenant by extracting organization_id from the
// API key's row in api_keys.
//
// Payload shape:
//   {
//     event_name: "ordered_pizza"           // required, what the flow filters on
//     contact: {                            // required, identifies who
//       email?: string,
//       phone?: string,
//       external_id?: string                // your system's id
//     },
//     properties?: { ... }                  // any merge-tag values
//     idempotency_key?: string              // dedupes the same event
//   }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface CustomEventPayload {
  event_name?: string;
  contact?: {
    email?: string;
    phone?: string;
    external_id?: string;
    first_name?: string;
    last_name?: string;
  };
  properties?: Record<string, any>;
  idempotency_key?: string;
}

async function resolveOrg(req: NextRequest): Promise<string | null> {
  // 1) API key (preferred for server-to-server)
  const apiKey = req.headers.get('x-worder-api-key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (apiKey) {
    try {
      const { data } = await supabaseAdmin
        .from('api_keys')
        .select('organization_id, status')
        .eq('key', apiKey)
        .eq('status', 'active')
        .maybeSingle();
      if (data?.organization_id) return data.organization_id;
    } catch { /* fall through */ }
  }

  // 2) Session auth (for in-app testing from the dashboard)
  try {
    const { getAuthClient } = await import('@/lib/api-utils');
    const auth = await getAuthClient();
    if (auth?.user?.organization_id) return auth.user.organization_id;
  } catch { /* fall through */ }

  return null;
}

async function resolveContactId(
  organizationId: string,
  contact: CustomEventPayload['contact']
): Promise<string | null> {
  if (!contact) return null;

  // Match by email (canonical), then phone, then external_id stored in
  // contacts.metadata.external_id.
  const supabase = supabaseAdmin;

  if (contact.email) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', contact.email)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (contact.phone) {
    const cleanPhone = String(contact.phone).replace(/\D/g, '');
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`phone.eq.${cleanPhone},phone.eq.${contact.phone}`)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (contact.external_id) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('metadata->>external_id', contact.external_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // No match. Auto-create only when we have an email — otherwise the
  // contact record is too thin to be useful and would pollute the CRM.
  if (contact.email) {
    const { data: created } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        email: contact.email,
        phone: contact.phone || null,
        first_name: contact.first_name || null,
        last_name: contact.last_name || null,
        source: 'custom_event_api',
        metadata: contact.external_id ? { external_id: contact.external_id } : {},
      })
      .select('id')
      .single();
    return created?.id || null;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const organizationId = await resolveOrg(req);
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Unauthorized — provide x-worder-api-key header or sign in' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as CustomEventPayload;
    if (!body?.event_name || typeof body.event_name !== 'string') {
      return NextResponse.json({ error: 'event_name is required' }, { status: 400 });
    }
    if (!body.contact || (!body.contact.email && !body.contact.phone && !body.contact.external_id)) {
      return NextResponse.json({ error: 'contact.email or contact.phone or contact.external_id is required' }, { status: 400 });
    }

    const contactId = await resolveContactId(organizationId, body.contact);
    if (!contactId) {
      return NextResponse.json({
        received: true,
        dispatched: false,
        reason: 'Could not resolve contact — provide email so we can create one',
      });
    }

    // Stamp the event in contact_events for the activity feed + analytics
    // before dispatching so reports see it even if the trigger fizzles.
    try {
      await supabaseAdmin.from('contact_events').insert({
        organization_id: organizationId,
        contact_id: contactId,
        event_type: 'custom_event',
        event_source: 'custom_api',
        properties: {
          event_name: body.event_name,
          ...(body.properties || {}),
        },
        idempotency_key:
          body.idempotency_key || `custom_event:${organizationId}:${body.event_name}:${contactId}:${Date.now()}`,
        occurred_at: new Date().toISOString(),
      });
    } catch (cdpErr) {
      console.warn('[CustomEvent] contact_events insert failed:', cdpErr);
    }

    const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher');
    const dispatchResult = await dispatchTrigger({
      organizationId,
      triggerType: 'trigger_custom_event',
      contactId,
      triggerData: {
        event_type: 'custom_event',
        event_name: body.event_name,
        properties: body.properties || {},
        ...(body.properties || {}),
      },
      idempotencyKey:
        body.idempotency_key || `custom_event:${organizationId}:${body.event_name}:${contactId}`,
    });

    return NextResponse.json({
      received: true,
      contact_id: contactId,
      event_name: body.event_name,
      dispatched: true,
      runs: dispatchResult,
    });
  } catch (err: any) {
    console.error('[CustomEvent] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
