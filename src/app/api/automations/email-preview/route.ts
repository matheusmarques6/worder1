import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { renderMergeTags, resolveOrderBlocks, enrichOrderItemImages } from '@/lib/email/render';

export const dynamic = 'force-dynamic';

// Maps a flow-builder trigger_type to the real event_type(s) stored in contact_events.
// A trigger may accept multiple underlying event types (e.g. "order paid" matches both
// the webhook-originated `order_paid` and the legacy `placed_order`).
const TRIGGER_TO_EVENT_TYPES: Record<string, string[]> = {
  trigger_abandon: ['abandoned_cart', 'checkout_abandoned'],
  trigger_checkout_abandoned: ['checkout_abandoned', 'checkout_started'],
  trigger_order: ['placed_order', 'order_paid'],
  trigger_order_paid: ['order_paid', 'placed_order'],
  trigger_fulfilled_order: ['fulfilled_order'],
  trigger_cancelled_order: ['cancelled_order'],
  trigger_viewed_product: ['viewed_product'],
  trigger_added_to_cart: ['added_to_cart'],
  trigger_signup: ['profile_created', 'customer_created', 'contact_created', 'subscribed_email'],
  trigger_form_submitted: ['form_submitted'],
};

function resolveEventTypes(triggerType: string | undefined): string[] {
  return TRIGGER_TO_EVENT_TYPES[triggerType || ''] || ['placed_order', 'order_paid'];
}

function buildMergeData(
  contact: Record<string, any> | null,
  eventProps: Record<string, any>,
  store: Record<string, any> | null,
): Record<string, string> {
  const c = contact || {};
  const s = store || {};
  const firstName = c.first_name || '';
  const lastName = c.last_name || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Cliente';

  const data: Record<string, string> = {
    // Contact
    first_name: firstName || 'Cliente',
    last_name: lastName,
    full_name: fullName,
    email: c.email || '',
    phone: c.phone || '',
    company: c.company || '',
    city: c.city || '',
    state: c.state || '',
    country: c.country || '',
    birthday: c.birthday || '',
    source: c.source || '',
    tags: Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags || ''),

    // Purchase history
    total_orders: String(c.total_orders || 0),
    total_spent: typeof c.total_spent === 'number'
      ? `R$ ${c.total_spent.toFixed(2).replace('.', ',')}`
      : String(c.total_spent || '0'),
    average_order_value: c.average_order_value ? String(c.average_order_value) : '',
    last_order_at: c.last_order_at
      ? new Date(c.last_order_at).toLocaleDateString('pt-BR')
      : '',

    // Store
    store_name: s.name || s.shop_name || '',
    store_url: s.domain || s.url || '',
    store_email: s.email || '',
    store_phone: s.phone || '',

    // Last order (from event props when available)
    order_number: String(eventProps.order_number || eventProps.order_id || ''),
    order_total: String(eventProps.total_price || eventProps.order_total || ''),
    order_date: eventProps.created_at
      ? new Date(eventProps.created_at).toLocaleDateString('pt-BR')
      : '',
    order_status: String(eventProps.financial_status || eventProps.order_status || ''),
    tracking_url: String(eventProps.tracking_url || ''),
    tracking_number: String(eventProps.tracking_number || ''),

    // Cart / checkout — read from every place the URL can live in the
    // event payload. New webhook events store the URL at .CheckoutURL
    // (Klaviyo/Omnisend convention), legacy at .checkout_url, and the
    // full Shopify payload's recovery URL is under .raw.abandoned_checkout_url.
    checkout_url: String(
      eventProps.CheckoutURL ||
      eventProps.checkout_url ||
      eventProps.abandoned_checkout_url ||
      eventProps.raw?.abandoned_checkout_url ||
      eventProps.raw?.recovery_url ||
      ''
    ),
    cart_total: String(
      eventProps.TotalPrice ||
      eventProps.cart_total ||
      eventProps.total_price ||
      eventProps.raw?.total_price ||
      ''
    ),
    cart_item_count: String(
      eventProps.ItemCount ||
      eventProps.item_count ||
      (Array.isArray(eventProps.Items) ? eventProps.Items.length : null) ||
      eventProps.items?.length ||
      ''
    ),
    cart_first_item: String(
      eventProps.Items?.[0]?.ProductName ||
      eventProps.items?.[0]?.title ||
      ''
    ),
    cart_first_item_price: String(
      eventProps.Items?.[0]?.ItemPrice ||
      eventProps.items?.[0]?.price ||
      ''
    ),
    cart_first_item_image: String(
      eventProps.Items?.[0]?.ImageURL ||
      eventProps.items?.[0]?.image_url ||
      ''
    ),
  };

  // Event-scoped tags ({{event.OrderId}}, {{event.ProductName}}, …)
  for (const [k, v] of Object.entries(eventProps || {})) {
    if (v === null || v === undefined) continue;
    data[`event.${k}`] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }

  return data;
}

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
      const eventTypes = resolveEventTypes(triggerType);

      // Get recent events of these types, then deduplicate by contact_id
      const { data: rawEvents } = await supabase
        .from('contact_events')
        .select('id, contact_id, event_type, properties, occurred_at')
        .eq('organization_id', organizationId)
        .in('event_type', eventTypes)
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

      // Return even when empty — showing wrong-type events here caused the
      // preview panel to display unrelated events (e.g. checkout_completed
      // for an order_paid automation).
      return NextResponse.json({ events: enrichedEvents, eventTypes });
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

      // Resolve merge tags using the production render engine so {{first_name}},
      // {{store_name}}, {{event.*}}, etc. all get replaced consistently.
      let testContact: Record<string, any> | null = null;
      let testEvent: Record<string, any> = {};
      if (contactId) {
        const { data: c } = await supabase.from('contacts').select('*').eq('id', contactId).maybeSingle();
        testContact = c;
        const eventTypes = resolveEventTypes(triggerType);
        const { data: ev } = await supabase
          .from('contact_events')
          .select('properties, occurred_at')
          .eq('organization_id', organizationId)
          .eq('contact_id', contactId)
          .in('event_type', eventTypes)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        testEvent = (ev?.properties as Record<string, any>) || {};
        if (ev?.occurred_at && !testEvent.occurred_at) testEvent.occurred_at = ev.occurred_at;
      }
      const { data: testStore } = await supabase
        .from('shopify_stores')
        .select('name, domain, email, phone')
        .eq('organization_id', organizationId)
        .limit(1)
        .maybeSingle();
      if (html.includes('WORDER_ORDER_BLOCK')) {
        await enrichOrderItemImages(testEvent, supabase, undefined, organizationId);
        html = resolveOrderBlocks(html, testEvent);
      }
      // Run the SAME resolvers production uses, in the SAME order. Without
      // this, send-test emails ship with raw <!-- WORDER_CART_BLOCK -->
      // comments and unresolved {{ trigger.link }} smart tags — broken
      // images, broken links. Now byte-for-byte matches what the
      // recipient sees from a real campaign send.
      try {
        const { resolveProductBlocks, resolveCartBlocks } = await import('@/lib/email/render');
        html = await resolveProductBlocks(html, organizationId, contactId, testEvent);
        html = await resolveCartBlocks(html, organizationId, contactId, testEvent);
      } catch (e: any) {
        console.warn('[email-preview send_test] dynamic block resolve failed:', e?.message);
      }
      try {
        const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
        // HTML context → escape substituted values (XSS parity with prod).
        html = resolveTriggerSmartTags(html, testEvent, undefined, { escapeHtml: true });
      } catch { /* best-effort */ }
      html = renderMergeTags(html, buildMergeData(testContact, testEvent, testStore));

      // Send via Resend usando remetente configurado da org
      try {
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
          return NextResponse.json({ error: 'Resend not configured' }, { status: 500 });
        }

        // Buscar remetente da org
        const { getOrgSender } = await import('@/lib/email/sender');
        const sender = await getOrgSender(organizationId);

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sender.from,
            to: testEmail,
            subject: `[TESTE] ${tpl.name || 'Preview'}`,
            html,
            reply_to: sender.replyTo,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          return NextResponse.json({
            error: err.message || 'Send failed',
            hint: err.message?.includes('verify') ? 'Verifique o domínio em Configurações → E-mail & Domínios' : undefined,
            from: sender.from,
          }, { status: 500 });
        }
        return NextResponse.json({ sent: true, from: sender.from });
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

    // 3. Fetch most recent event matching trigger type — prefer webhook
    // events (which carry properties.raw with the full Shopify payload)
    // over pixel events (sandbox-limited, lowercase, no images). When
    // only the pixel event exists, we enrich it from shopify_checkouts /
    // shopify_orders so the merchant sees the rich Klaviyo/Omnisend-
    // style payload regardless of source.
    const eventTypes = resolveEventTypes(triggerType);
    let eventData: Record<string, any> = {};

    // Try webhook events FIRST (event_source='shopify_webhook' carries
    // full raw payload). Then fall back to any other source.
    async function fetchEventWithSource(source: string | null) {
      let q = supabase
        .from('contact_events')
        .select('*')
        .in('event_type', eventTypes)
        .eq('organization_id', organizationId)
        .order('occurred_at', { ascending: false })
        .limit(1);
      if (contactId) q = q.eq('contact_id', contactId);
      if (source) q = q.eq('event_source', source);
      const { data } = await q.maybeSingle();
      return data;
    }

    let recentEvent = await fetchEventWithSource('shopify_webhook');
    if (!recentEvent) recentEvent = await fetchEventWithSource(null);

    if (recentEvent) {
      eventData = recentEvent.properties || {};
      // Inject the occurred_at timestamp so the order resolver can render the order date
      if (recentEvent.occurred_at && !eventData.occurred_at) {
        eventData.occurred_at = recentEvent.occurred_at;
      }
      // If this event doesn't already have raw (e.g. it's a pixel event),
      // enrich it from the matching shopify_checkouts / shopify_orders row.
      // The webhook handler stores the full Shopify payload columns, so
      // even pixel-source events end up with a rich raw to render against.
      if (!eventData.raw) {
        const checkoutId =
          eventData.checkout_id ||
          eventData.CheckoutId ||
          recentEvent.shopify_resource_id ||
          null;
        const orderId =
          eventData.order_id ||
          eventData.OrderId ||
          (recentEvent.shopify_resource_type === 'order' ? recentEvent.shopify_resource_id : null);

        try {
          if (checkoutId && (recentEvent.shopify_resource_type === 'checkout' || eventTypes.some((t: string) => t.startsWith('checkout_')))) {
            const { data: chk } = await supabase
              .from('shopify_checkouts')
              .select('shopify_checkout_id, shopify_checkout_token, email, phone, total_price, subtotal_price, total_tax, total_discounts, currency, line_items, recovery_url, abandoned_checkout_url, status, shopify_created_at')
              .eq('store_id', recentEvent.store_id)
              .eq('shopify_checkout_id', String(checkoutId))
              .maybeSingle();
            if (chk) {
              // Compose a Shopify-style raw object from the columns we
              // persisted, so {{ trigger.raw.<anything> }} resolves and
              // the cart block walks line_items with full product info.
              eventData.raw = {
                id: chk.shopify_checkout_id,
                token: chk.shopify_checkout_token,
                email: chk.email,
                phone: chk.phone,
                total_price: chk.total_price,
                subtotal_price: chk.subtotal_price,
                total_tax: chk.total_tax,
                total_discounts: chk.total_discounts,
                currency: chk.currency,
                line_items: chk.line_items || [],
                abandoned_checkout_url: chk.abandoned_checkout_url || chk.recovery_url,
                recovery_url: chk.recovery_url || chk.abandoned_checkout_url,
                status: chk.status,
                created_at: chk.shopify_created_at,
              };
            }
          } else if (orderId) {
            const { data: ord } = await supabase
              .from('shopify_orders')
              .select('shopify_order_id, shopify_order_number, email, phone, total_price, subtotal_price, total_tax, total_discounts, currency, line_items, financial_status, fulfillment_status, order_status_url, billing_address, shipping_address, shopify_created_at, payment_gateway')
              .eq('store_id', recentEvent.store_id)
              .eq('shopify_order_id', String(orderId))
              .maybeSingle();
            if (ord) {
              eventData.raw = {
                id: ord.shopify_order_id,
                order_number: ord.shopify_order_number,
                name: `#${ord.shopify_order_number}`,
                email: ord.email,
                phone: ord.phone,
                total_price: ord.total_price,
                subtotal_price: ord.subtotal_price,
                total_tax: ord.total_tax,
                total_discounts: ord.total_discounts,
                currency: ord.currency,
                line_items: ord.line_items || [],
                financial_status: ord.financial_status,
                fulfillment_status: ord.fulfillment_status,
                order_status_url: ord.order_status_url,
                billing_address: ord.billing_address,
                shipping_address: ord.shipping_address,
                payment_gateway_names: ord.payment_gateway ? [ord.payment_gateway] : [],
                created_at: ord.shopify_created_at,
              };
            }
          }
        } catch (e: any) {
          console.warn('[email-preview] raw enrichment failed:', e?.message);
        }
      }
    }

    // 4. Fetch store for {{store_*}} tags
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('name, domain, email, phone')
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();

    // 5. Resolve order-products blocks using event data
    let processedHtml = template.html;
    if (processedHtml.includes('WORDER_ORDER_BLOCK')) {
      await enrichOrderItemImages(eventData, supabase, undefined, organizationId);
      processedHtml = resolveOrderBlocks(processedHtml, eventData);
    }

    // 5b. Resolve dynamic product-grid + cart blocks the same way the
    // production sender does. Without this, the "Produtos do Gatilho"
    // block (and the older static product-grid blocks) render as empty
    // <!-- WORDER_CART_BLOCK:... --> comments and the merchant sees a
    // gap in the preview.
    try {
      const { resolveProductBlocks, resolveCartBlocks } = await import('@/lib/email/render');
      processedHtml = await resolveProductBlocks(processedHtml, organizationId, contactId, eventData);
      processedHtml = await resolveCartBlocks(processedHtml, organizationId, contactId, eventData);
    } catch (e: any) {
      console.warn('[email-preview] dynamic block resolve failed:', e?.message);
    }

    // 5c. Smart trigger merge tags ({{ trigger.link }}, etc) — adapt
    // checkout/product/order URL based on the active event.
    try {
      const { resolveTriggerSmartTags } = await import('@/lib/email/merge-tags');
      // HTML context → escape substituted values (XSS parity with prod).
      processedHtml = resolveTriggerSmartTags(processedHtml, eventData, undefined, { escapeHtml: true });
    } catch { /* best-effort */ }

    // 6. Resolve merge tags using the production engine — covers {{first_name}},
    // {{email}}, {{store_name}}, {{event.*}}, {{order_number}}, etc.
    const mergeData = buildMergeData(contact, eventData, store);
    const html = renderMergeTags(processedHtml, mergeData);

    // 7. Build response
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
      contactProperties: mergeData,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
