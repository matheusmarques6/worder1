import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = await request.json();
  const { templateId, contactId, triggerType, organizationId, action } = body;

  if (!templateId || !organizationId) {
    return NextResponse.json({ error: 'templateId, organizationId required' }, { status: 400 });
  }

  try {
    // If action is list_events, return recent UNIQUE CONTACTS that had this event
    if (action === 'list_events') {
      const eventTypeMap: Record<string, string> = {
        trigger_abandon: 'cart_abandoned',
        trigger_checkout_abandoned: 'checkout_started',
        trigger_order: 'order',
        trigger_order_paid: 'order',
        trigger_fulfilled_order: 'fulfilled_order',
        trigger_cancelled_order: 'cancelled_order',
        trigger_viewed_product: 'viewed_product',
        trigger_added_to_cart: 'add_to_cart',
        trigger_signup: 'contact_created',
        trigger_form_submitted: 'form_submitted',
      };
      const eventType = eventTypeMap[triggerType || ''] || 'order';

      // Get recent events of this type, then deduplicate by contact_id
      const { data: rawEvents } = await supabase
        .from('contact_events')
        .select('id, contact_id, event_type, properties, occurred_at')
        .eq('organization_id', organizationId)
        .eq('event_type', eventType)
        .order('occurred_at', { ascending: false })
        .limit(50);

      // Deduplicate: keep only the most recent event per contact
      const seenContacts = new Set<string>();
      const uniqueEvents = (rawEvents || []).filter(e => {
        if (!e.contact_id || seenContacts.has(e.contact_id)) return false;
        seenContacts.add(e.contact_id);
        return true;
      }).slice(0, 10);

      // Fetch contact emails for each unique event
      const contactIds = uniqueEvents.map(e => e.contact_id).filter(Boolean);
      let contactMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, email, first_name')
          .in('id', contactIds);
        for (const c of contacts || []) {
          contactMap[c.id] = c.email || c.first_name || c.id;
        }
      }

      // Enrich events with contact email
      const enrichedEvents = uniqueEvents.map(e => ({
        ...e,
        contact_email: contactMap[e.contact_id] || e.contact_id,
      }));

      if (enrichedEvents.length > 0) {
        return NextResponse.json({ events: enrichedEvents, eventType });
      }

      // Fallback: get any recent events
      const { data: anyEvents } = await supabase
        .from('contact_events')
        .select('id, contact_id, event_type, properties, occurred_at')
        .eq('organization_id', organizationId)
        .order('occurred_at', { ascending: false })
        .limit(10);

      return NextResponse.json({ events: anyEvents || [] });
    }

    // Send test email action
    if (action === 'send_test') {
      const { testEmail } = body;
      if (!testEmail) {
        return NextResponse.json({ error: 'testEmail required' }, { status: 400 });
      }

      // Fetch template
      const { data: tpl } = await supabase
        .from('email_templates')
        .select('html, name')
        .eq('id', templateId)
        .single();

      if (!tpl?.html) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      let html = tpl.html;

      // Resolve merge tags with contact data if contactId provided
      if (contactId) {
        const { data: c } = await supabase.from('contacts').select('*').eq('id', contactId).single();
        if (c) {
          html = html.replace(/\{\{contact\.(\w+)\}\}/g, (_: string, k: string) => (c as Record<string, any>)[k] || '');
        }
      }

      // Send via Resend
      try {
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
          return NextResponse.json({ error: 'Resend not configured' }, { status: 500 });
        }
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Worder <noreply@worder.app>',
            to: testEmail,
            subject: `[TESTE] ${tpl.name || 'Preview'}`,
            html,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 });
        }
        return NextResponse.json({ sent: true });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    // Need contactId for preview rendering
    // 1. Fetch template
    const { data: template } = await supabase
      .from('email_templates')
      .select('html, design_json, name')
      .eq('id', templateId)
      .single();

    if (!template?.html) {
      return NextResponse.json({ error: 'Template not found or has no HTML' }, { status: 404 });
    }

    // 2. Fetch contact (optional — preview works without it)
    let contact: Record<string, any> | null = null;
    if (contactId) {
      const { data: c } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle();
      contact = c;
    }

    // If no contact found by ID, try to get any contact from org
    if (!contact) {
      const { data: anyContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .limit(1)
        .maybeSingle();
      contact = anyContact;
    }

    // 3. Fetch most recent event matching trigger type
    const eventTypeMap: Record<string, string> = {
      trigger_abandon: 'cart_abandoned',
      trigger_checkout_abandoned: 'checkout_started',
      trigger_order: 'order',
      trigger_order_paid: 'order',
      trigger_fulfilled_order: 'fulfilled_order',
      trigger_cancelled_order: 'cancelled_order',
      trigger_viewed_product: 'viewed_product',
      trigger_added_to_cart: 'add_to_cart',
      trigger_signup: 'contact_created',
      trigger_form_submitted: 'form_submitted',
    };

    const eventType = eventTypeMap[triggerType || ''] || 'order';
    let eventData: Record<string, any> = {};

    // Try to find event for this contact, fallback to any event of this type
    let eventQuery = supabase
      .from('contact_events')
      .select('*')
      .eq('event_type', eventType)
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (contactId) {
      eventQuery = eventQuery.eq('contact_id', contactId);
    }

    const { data: recentEvent } = await eventQuery.maybeSingle();

    if (recentEvent) {
      eventData = recentEvent.properties || {};
    }

    // 4. Resolve merge tags in HTML
    let html = template.html;
    const contactProps: Record<string, string> = contact ? {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      city: contact.city || '',
      state: contact.state || '',
      country: contact.country || '',
      company: contact.company || '',
      total_orders: String(contact.total_orders || 0),
      total_spent: String(contact.total_spent || 0),
    } : {};

    // Replace {{contact.*}} tags
    html = html.replace(/\{\{contact\.(\w+)\}\}/g, (_match: string, key: string) => {
      return contactProps[key] || '';
    });

    // Replace {{event.*}} tags
    html = html.replace(/\{\{event\.(\w+)\}\}/g, (_match: string, key: string) => {
      return String(eventData[key] || '');
    });

    // 5. Build response
    return NextResponse.json({
      html,
      subject: template.name,
      contact: contact ? {
        id: contact.id,
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone: contact.phone,
        city: contact.city,
        state: contact.state,
        country: contact.country,
        company: contact.company,
        tags: contact.tags,
        total_orders: contact.total_orders,
        total_spent: contact.total_spent,
        created_at: contact.created_at,
      } : null,
      event: recentEvent ? {
        id: recentEvent.id,
        type: recentEvent.event_type,
        properties: recentEvent.properties,
        occurred_at: recentEvent.occurred_at,
      } : null,
      eventProperties: eventData,
      contactProperties: contactProps,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
