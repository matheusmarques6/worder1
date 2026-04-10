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
    // If action is list_events, return recent events matching the trigger
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

      const { data: events } = await supabase
        .from('contact_events')
        .select('id, contact_id, event_type, properties, occurred_at')
        .eq('organization_id', organizationId)
        .eq('event_type', eventType)
        .order('occurred_at', { ascending: false })
        .limit(10);

      if (events && events.length > 0) {
        return NextResponse.json({ events });
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
    if (!contactId) {
      return NextResponse.json({ error: 'contactId required for preview' }, { status: 400 });
    }

    // 1. Fetch template
    const { data: template } = await supabase
      .from('email_templates')
      .select('html, design_json, name')
      .eq('id', templateId)
      .single();

    if (!template?.html) {
      return NextResponse.json({ error: 'Template not found or has no HTML' }, { status: 404 });
    }

    // 2. Fetch contact
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('organization_id', organizationId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
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

    const { data: recentEvent } = await supabase
      .from('contact_events')
      .select('*')
      .eq('contact_id', contactId)
      .eq('event_type', eventType)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentEvent) {
      eventData = recentEvent.properties || {};
    }

    // 4. Resolve merge tags in HTML
    let html = template.html;
    const contactProps: Record<string, string> = {
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
    };

    // Replace {{contact.*}} tags
    html = html.replace(/\{\{contact\.(\w+)\}\}/g, (_match: string, key: string) => {
      return contactProps[key] || '';
    });

    // Replace {{event.*}} tags
    html = html.replace(/\{\{event\.(\w+)\}\}/g, (_match: string, key: string) => {
      return String(eventData[key] || '');
    });

    // 5. Build response with all properties for the side panel
    return NextResponse.json({
      html,
      subject: template.name,
      contact: {
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
      },
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
