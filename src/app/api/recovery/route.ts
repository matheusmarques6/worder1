// =============================================
// WORDER: Recovery API
// /src/app/api/recovery/route.ts
//
// GET: returns abandoned checkouts (and other recovery items) from
// shopify_checkouts — the table actually populated by the webhook.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || 'cart';
    const storeId = searchParams.get('store_id');
    const statusFilter = searchParams.get('status'); // pending | abandoned | converted | recovered
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Multi-org
    const { data: memberships } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = [
      ...new Set([
        user.organization_id,
        ...(memberships?.map((m: any) => m.organization_id) || []),
      ]),
    ];

    if (type !== 'cart' && type !== 'checkout' && type !== 'pix' && type !== 'boleto' && type !== 'card') {
      return NextResponse.json({
        items: [],
        total: 0,
        stats: { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0, revenue_recovered: 0, recovery_rate: '0.0' },
      });
    }

    // Only consider active stores — eliminates phantom rows from deleted/inactive integrations
    const { data: activeStores } = await supabaseAdmin
      .from('shopify_stores')
      .select('id')
      .in('organization_id', orgIds)
      .eq('is_active', true);

    const activeStoreIds = (activeStores || []).map((s: any) => s.id);

    // Don't bail early — cart tab works with org_id alone even without store IDs

    // =====================================================================
    // CART tab: aggregate added_to_cart pixel events from contact_events that
    // weren't followed by a checkout_started within the same session window.
    // This is the true "customer added to cart but never checked out" metric.
    // =====================================================================
    if (type === 'cart') {
      return await handleCartTab({
        orgIds,
        activeStoreIds,
        storeId,
        limit,
        offset,
      });
    }

    // =====================================================================
    // PIX / BOLETO / CARTÃO tabs: orders with financial_status='pending'
    // filtered by payment gateway. These are real conversion opportunities —
    // customer completed checkout but payment hasn't settled yet.
    // =====================================================================
    if (type === 'pix' || type === 'boleto' || type === 'card') {
      return await handlePaymentPendingTab({
        paymentType: type,
        orgIds,
        activeStoreIds,
        storeId,
        limit,
        offset,
      });
    }

    // =====================================================================
    // CHECKOUT tab: source-of-truth is the EVENT LOG (contact_events).
    //
    // Every checkout_started event that doesn't have a follow-up
    // checkout_completed / placed_order / order_paid within 15 minutes
    // is considered abandoned. This way the recovery list reflects
    // exactly what the tracking layer captured — same source as
    // every other downstream metric — and doesn't depend on
    // shopify_checkouts being kept in sync via webhooks.
    //
    // shopify_checkouts is used as an OPTIONAL enrichment when present
    // (recovery_url, contact_id, status='converted' from the cron) but
    // never as the primary list. Webhook deliveries that miss
    // (HMAC mismatch, network drop, pre-alias era) no longer cause
    // checkouts to disappear from this view.
    // =====================================================================
    return await handleCheckoutFromEvents({
      orgIds,
      activeStoreIds,
      storeId,
      limit,
      offset,
    });
    // (legacy shopify_checkouts code path retained below for reference;
    //  unreachable now that events are the source of truth.)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


// =====================================================================
// CART tab: Aggregates added_to_cart pixel events into real cart-abandonment
// rows. A "cart" is a session that added products but never started checkout
// (or started checkout but did NOT place the order) within 24h.
// =====================================================================
async function handleCartTab(opts: {
  orgIds: string[];
  activeStoreIds: string[];
  storeId: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { orgIds, activeStoreIds, storeId, limit, offset } = opts;

  // Fetch recent cart events (last 30 days window).
  // Matches multiple variants because different pixel versions use different names:
  // - modern pixel:    'added_to_cart' (normalized from product_added_to_cart)
  // - legacy theme:    'add_to_cart'
  // - checkout-level:  'checkout_started' (started checkout but didn't complete)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let q = supabaseAdmin
    .from('contact_events')
    .select('id, contact_id, store_id, organization_id, properties, session_id, anonymous_id, monetary_value, currency, occurred_at, created_at, event_type')
    .in('organization_id', orgIds)
    .in('event_type', ['added_to_cart', 'add_to_cart', 'checkout_started'])
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(2000);

  // Store filter
  if (storeId) {
    q = q.eq('store_id', storeId);
  }

  const { data: rawEvents, error: evErr } = await q;
  if (evErr) {
    if (evErr.code === '42P01') {
      return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
    }
    console.error('[Recovery] Cart query error:', evErr);
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  const events = rawEvents || [];
  if (events.length === 0) {
    return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
  }

  // Group events: prefer contact_id (dedupes across sessions for known customers),
  // fall back to session_id, then anonymous_id. This collapses a contact's
  // multiple cart sessions into one bucket — avoids showing "Kim Brown" 3x.
  type CartBucket = {
    key: string;
    contact_id: string | null;
    session_id: string | null;
    anonymous_id: string | null;
    store_id: string;
    events: any[];
    first_at: string;
    last_at: string;
  };
  const buckets = new Map<string, CartBucket>();
  for (const e of events) {
    const key = e.contact_id
      ? `c:${e.contact_id}`
      : e.session_id
        ? `s:${e.session_id}`
        : e.anonymous_id
          ? `a:${e.anonymous_id}`
          : `e:${e.id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(e);
      if (e.occurred_at < existing.first_at) existing.first_at = e.occurred_at;
      if (e.occurred_at > existing.last_at) existing.last_at = e.occurred_at;
      if (!existing.contact_id && e.contact_id) existing.contact_id = e.contact_id;
      if (!existing.session_id && e.session_id) existing.session_id = e.session_id;
    } else {
      buckets.set(key, {
        key,
        contact_id: e.contact_id || null,
        session_id: e.session_id || null,
        anonymous_id: e.anonymous_id || null,
        store_id: e.store_id,
        events: [e],
        first_at: e.occurred_at,
        last_at: e.occurred_at,
      });
    }
  }

  const bucketList = Array.from(buckets.values());
  const sessionIds = Array.from(new Set(bucketList.map(b => b.session_id).filter(Boolean))) as string[];
  const contactIds = Array.from(new Set(bucketList.map(b => b.contact_id).filter(Boolean))) as string[];

  // Fetch purchases once per key — two separate queries are simpler and more
  // robust than stitching .or() filters with .in.() (which is fragile for
  // UUIDs with dashes/strings). We'll filter in JS.
  type PurchaseRow = { session_id: string | null; contact_id: string | null; occurred_at: string };
  const purchasesBySession = new Map<string, string>(); // session_id -> occurred_at
  const purchasesByContact = new Map<string, string>(); // contact_id -> occurred_at

  if (sessionIds.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('session_id, occurred_at')
        .in('organization_id', orgIds)
        .in('event_type', ['placed_order', 'order_paid', 'checkout_completed'])
        .in('session_id', sessionIds)
        .gte('occurred_at', since);
      for (const p of (data || []) as PurchaseRow[]) {
        if (p.session_id && !purchasesBySession.has(p.session_id)) {
          purchasesBySession.set(p.session_id, p.occurred_at);
        }
      }
    } catch {}
  }
  if (contactIds.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('contact_id, occurred_at')
        .in('organization_id', orgIds)
        .in('event_type', ['placed_order', 'order_paid', 'checkout_completed'])
        .in('contact_id', contactIds)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false });
      for (const p of (data || []) as PurchaseRow[]) {
        if (p.contact_id && !purchasesByContact.has(p.contact_id)) {
          purchasesByContact.set(p.contact_id, p.occurred_at);
        }
      }
    } catch {}
  }

  // A cart is abandoned if:
  // 1. Last cart event was >= 15min ago (Shopify's default threshold), AND
  // 2. No purchase happened after the last cart event.
  const cartAbandonmentCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const abandoned = bucketList.filter(b => {
    if (b.last_at > cartAbandonmentCutoff) return false; // still active
    const sessionPurchase = b.session_id ? purchasesBySession.get(b.session_id) : null;
    if (sessionPurchase && sessionPurchase >= b.last_at) return false;
    const contactPurchase = b.contact_id ? purchasesByContact.get(b.contact_id) : null;
    if (contactPurchase && contactPurchase >= b.last_at) return false;
    return true;
  });

  // Resolve contacts for the buckets that have contact_id
  const uniqueContactIds = Array.from(new Set(abandoned.map(b => b.contact_id).filter(Boolean))) as string[];
  const contactMap = new Map<string, any>();
  if (uniqueContactIds.length > 0) {
    const { data: cs } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone')
      .in('id', uniqueContactIds);
    for (const c of (cs || [])) contactMap.set(c.id, c);
  }

  // Secondary identity lookup: for buckets WITHOUT contact_id, try to pull
  // email/phone from the event properties themselves. checkout_started events
  // often carry email when the customer typed it but didn't submit, and cart
  // events sometimes include it if a returning visitor was pre-identified.
  const extraEmails = new Set<string>();
  for (const b of abandoned) {
    if (b.contact_id) continue;
    for (const ev of b.events) {
      const p = ev.properties || {};
      const em = (p.email || p._email || p.Email || p.customer?.email || '').toLowerCase();
      if (em && /\S+@\S+\.\S+/.test(em)) {
        extraEmails.add(em);
        break;
      }
    }
  }
  const emailContactMap = new Map<string, any>();
  if (extraEmails.size > 0) {
    const { data: cs } = await supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, phone')
      .in('organization_id', orgIds)
      .in('email', Array.from(extraEmails));
    for (const c of (cs || [])) {
      if (c.email) emailContactMap.set(String(c.email).toLowerCase(), c);
    }
  }

  // Sort by most recent activity
  abandoned.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));

  const paged = abandoned.slice(offset, offset + limit);

  const normalized = paged.map(b => {
    // Extract email/phone/name from event properties as a fallback
    let propEmail: string | null = null;
    let propPhone: string | null = null;
    let propName: string | null = null;
    for (const ev of b.events) {
      const p = ev.properties || {};
      if (!propEmail) {
        const em = p.email || p._email || p.Email || p.customer?.email;
        if (em && /\S+@\S+\.\S+/.test(em)) propEmail = String(em).toLowerCase();
      }
      if (!propPhone) {
        const ph = p.phone || p._phone || p.Phone || p.customer?.phone;
        if (ph) propPhone = String(ph);
      }
      if (!propName) {
        const fn = p._first_name || p.first_name || p.FirstName || p.customer?.first_name;
        const ln = p._last_name || p.last_name || p.LastName || p.customer?.last_name;
        const full = [fn, ln].filter(Boolean).join(' ').trim();
        if (full) propName = full;
      }
    }

    const contact = (b.contact_id && contactMap.get(b.contact_id))
      || (propEmail && emailContactMap.get(propEmail))
      || null;

    const name =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() ||
      propName ||
      contact?.email ||
      propEmail ||
      'Desconhecido';

    const email = contact?.email || propEmail || null;
    const phone = contact?.phone || propPhone || null;

    // Dedupe products by product_id/title — prefer most recent event's properties
    const itemsMap = new Map<string, any>();
    let value = 0;
    for (const ev of b.events) {
      const p = ev.properties || {};
      // Skip non-product events like checkout_started with no line_items
      if (ev.event_type === 'checkout_started') {
        // checkout_started carries line_items in properties
        const lis = p.line_items || p.lineItems || [];
        for (const li of (Array.isArray(lis) ? lis : [])) {
          const pid = String(li.product_id || li.variant_id || li.title || Math.random());
          if (itemsMap.has(pid)) continue;
          const qty = Number(li.quantity || 1);
          const price = Number(li.price || li.ItemPrice || 0);
          const title = li.title || li.product_title || li.name || 'Produto';
          const img = li.image_url || li.image?.src || null;
          itemsMap.set(pid, { title, quantity: qty, price, image_url: img });
          value += price * qty;
        }
        if (typeof p.total_price === 'number' || typeof p.total_price === 'string') {
          const tp = Number(p.total_price);
          if (!isNaN(tp) && tp > 0) value = Math.max(value, tp);
        }
        continue;
      }
      const pid = String(p.product_id || p.ProductID || p.title || p.ProductName || Math.random());
      const prev = itemsMap.get(pid);
      const qty = Number(p.quantity || p.Quantity || 1);
      const price = Number(p.price || p.ItemPrice || 0);
      const title = p.product_title || p.ProductName || p.title || p.name || 'Produto';
      const img = p.image_url || p.ImageURL || p.image?.src || null;
      if (prev) {
        prev.quantity = Math.max(prev.quantity, qty);
      } else {
        itemsMap.set(pid, { title, quantity: qty, price, image_url: img });
      }
      value += price * qty;
    }
    const itemList = Array.from(itemsMap.values());

    return {
      id: `cart-${b.key}`,
      type: 'cart' as const,
      status: 'abandoned' as const,
      email,
      phone,
      contact_id: b.contact_id,
      contact_name: name,
      value,
      currency: 'BRL',
      items_count: itemList.length,
      items_preview: itemList.slice(0, 3),
      recovery_url: null,
      abandoned_at: b.last_at,
      converted_at: null,
      recovered_at: null,
      created_at: b.first_at,
      store_id: b.store_id,
    };
  });

  // Stats
  const stats = {
    total: abandoned.length,
    pending: 0,
    abandoned: abandoned.length,
    converted: 0,
    recovered: 0,
  };

  return NextResponse.json({
    items: normalized,
    total: abandoned.length,
    stats: { ...stats, revenue_recovered: 0, recovery_rate: '0.0' },
  });
}

function zeroStats() {
  return { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0, revenue_recovered: 0, recovery_rate: '0.0' };
}

// =====================================================================
// CHECKOUT tab fallback: derive abandoned checkouts from contact_events
// when shopify_checkouts table is empty (sync_checkouts not enabled).
// Finds checkout_started events that were never followed by
// checkout_completed / placed_order / order_paid.
// =====================================================================
async function handleCheckoutFromEvents(opts: {
  orgIds: string[];
  activeStoreIds: string[];
  storeId: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { orgIds, activeStoreIds, storeId, limit, offset } = opts;
  // 90-day window matches Shopify Admin's 3-month auto-deletion of
  // abandoned checkouts. Older than that, Shopify itself drops the
  // record from its abandoned list, so we mirror the behavior.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Pull every checkout_started event in window. We also include
  // shopify_resource_id so we can match completion by canonical
  // checkout id (Shopify's source of truth) instead of relying on
  // session_id alone.
  let q = supabaseAdmin
    .from('contact_events')
    .select('id, contact_id, store_id, organization_id, properties, session_id, anonymous_id, monetary_value, currency, occurred_at, event_type, shopify_resource_id')
    .in('organization_id', orgIds)
    .eq('event_type', 'checkout_started')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(2000);

  if (storeId) {
    q = q.eq('store_id', storeId);
  } else if (activeStoreIds.length > 0) {
    q = q.in('store_id', activeStoreIds);
  }

  const { data: startedEvents, error } = await q;
  if (error || !startedEvents || startedEvents.length === 0) {
    return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
  }

  // ============================================================
  // Shopify's abandonment rule:
  //   "A checkout is abandoned when the customer added items AND
  //    provided contact information AND didn't complete the purchase."
  //   Source: shopify.dev — AbandonedCheckout GraphQL object
  //
  // Hard requirement: contact info (email or phone) MUST be present.
  // Checkouts without contact info don't appear in Shopify Admin's
  // "Checkouts abandonados" list, so we mirror that behavior.
  // ============================================================
  function extractEmail(ev: any): string | null {
    const p = ev?.properties || {};
    const raw = p.raw || {};
    const e =
      p.email ||
      p.Email ||
      p.CustomerEmail ||
      raw.email ||
      raw.contact_email ||
      raw.customer?.email ||
      raw.billing_address?.email ||
      null;
    return e ? String(e).toLowerCase() : null;
  }
  function extractPhone(ev: any): string | null {
    const p = ev?.properties || {};
    const raw = p.raw || {};
    return (
      p.phone ||
      p.Phone ||
      p.CustomerPhone ||
      raw.phone ||
      raw.customer?.phone ||
      raw.billing_address?.phone ||
      null
    );
  }
  function extractCheckoutId(ev: any): string | null {
    const p = ev?.properties || {};
    const raw = p.raw || {};
    return String(
      ev.shopify_resource_id ||
      p.CheckoutId ||
      p.checkout_id ||
      raw.id ||
      raw.token ||
      ''
    ) || null;
  }

  // Filter at the source: only events with email/phone qualify.
  // contact_id alone is NOT enough because we sometimes attach
  // contact_id from earlier identity, but the merchant cares about
  // checkouts where the buyer ACTUALLY entered contact info on the
  // checkout form.
  const eligibleEvents = startedEvents.filter((e: any) => {
    return !!extractEmail(e) || !!extractPhone(e);
  });

  // Group by canonical checkout_id when available, falling back to
  // contact_id then session_id. Same checkout fired by both pixel
  // and webhook collapses into a single bucket.
  const buckets = new Map<string, { key: string; contact_id: string | null; session_id: string | null; checkout_id: string | null; events: any[]; last_at: string; first_at: string; store_id: string }>();
  for (const e of eligibleEvents) {
    const checkoutId = extractCheckoutId(e);
    const key = checkoutId
      ? `ck:${checkoutId}`
      : e.contact_id
        ? `c:${e.contact_id}`
        : e.session_id
          ? `s:${e.session_id}`
          : `e:${e.id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(e);
      if (e.occurred_at > existing.last_at) existing.last_at = e.occurred_at;
      if (e.occurred_at < existing.first_at) existing.first_at = e.occurred_at;
      if (!existing.contact_id && e.contact_id) existing.contact_id = e.contact_id;
      if (!existing.checkout_id && checkoutId) existing.checkout_id = checkoutId;
    } else {
      buckets.set(key, {
        key,
        contact_id: e.contact_id,
        session_id: e.session_id,
        checkout_id: checkoutId,
        events: [e],
        last_at: e.occurred_at,
        first_at: e.occurred_at,
        store_id: e.store_id,
      });
    }
  }

  // ============================================================
  // Detect completion. Shopify marks a checkout complete by setting
  // completedAt — we mirror that by looking for any event that
  // represents the order placement for the same checkout.
  //
  // Match strategy in priority order:
  //   1. shopify_resource_id (canonical checkout/order id)
  //   2. contact_id (same buyer placed an order in the window)
  //   3. session_id (same browsing session converted)
  //   4. email (same email on a placed_order event)
  // ============================================================
  const contactIds = [...new Set([...buckets.values()].map(b => b.contact_id).filter(Boolean))] as string[];
  const sessionIds = [...new Set([...buckets.values()].map(b => b.session_id).filter(Boolean))] as string[];
  const checkoutIds = [...new Set([...buckets.values()].map(b => b.checkout_id).filter(Boolean))] as string[];
  const emails = [...new Set([...buckets.values()].map(b => extractEmail(b.events[0])).filter(Boolean))] as string[];

  const completedCheckouts = new Set<string>();
  const completedSessions = new Set<string>();
  const completedContacts = new Set<string>();
  const completedEmails = new Set<string>();

  if (checkoutIds.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('shopify_resource_id, properties')
        .in('organization_id', orgIds)
        .in('event_type', ['checkout_completed', 'placed_order', 'order_paid'])
        .in('shopify_resource_id', checkoutIds)
        .gte('occurred_at', since);
      for (const r of (data || []) as any[]) {
        if (r.shopify_resource_id) completedCheckouts.add(String(r.shopify_resource_id));
      }
    } catch {}
  }

  if (sessionIds.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('session_id')
        .in('organization_id', orgIds)
        .in('event_type', ['checkout_completed', 'placed_order', 'order_paid'])
        .in('session_id', sessionIds)
        .gte('occurred_at', since);
      for (const r of (data || []) as any[]) {
        if (r.session_id) completedSessions.add(r.session_id);
      }
    } catch {}
  }

  if (contactIds.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('contact_id')
        .in('organization_id', orgIds)
        .in('event_type', ['checkout_completed', 'placed_order', 'order_paid'])
        .in('contact_id', contactIds)
        .gte('occurred_at', since);
      for (const r of (data || []) as any[]) {
        if (r.contact_id) completedContacts.add(r.contact_id);
      }
    } catch {}
  }

  // Email-based fallback: catches the case where a guest checkout
  // was abandoned, then later the same email placed an order via a
  // different session/contact id (cross-device).
  if (emails.length > 0) {
    try {
      const { data } = await supabaseAdmin
        .from('contact_events')
        .select('properties')
        .in('organization_id', orgIds)
        .in('event_type', ['checkout_completed', 'placed_order', 'order_paid'])
        .gte('occurred_at', since)
        .limit(2000);
      for (const r of (data || []) as any[]) {
        const p = r.properties || {};
        const e = (p.email || p.CustomerEmail || p.raw?.email || p.raw?.customer?.email || '').toLowerCase();
        if (e && emails.includes(e)) completedEmails.add(e);
      }
    } catch {}
  }

  // ============================================================
  // Filter to abandoned. Shopify shows abandoned checkouts as soon
  // as the email is provided — no minimum wait time. We use a small
  // 5-min grace so events still in the active checkout flow (user
  // typing payment info) don't flicker into the abandoned list and
  // back out when they complete a few seconds later.
  // ============================================================
  const cutoff5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const abandoned = [...buckets.values()].filter(b => {
    if (b.last_at > cutoff5min) return false;
    if (b.checkout_id && completedCheckouts.has(b.checkout_id)) return false;
    if (b.session_id && completedSessions.has(b.session_id)) return false;
    if (b.contact_id && completedContacts.has(b.contact_id)) return false;
    const email = extractEmail(b.events[0]);
    if (email && completedEmails.has(email)) return false;
    return true;
  });

  // Resolve contacts
  const uniqueContactIds = [...new Set(abandoned.map(b => b.contact_id).filter(Boolean))] as string[];
  const contactMap = new Map<string, any>();
  if (uniqueContactIds.length > 0) {
    const { data } = await supabaseAdmin.from('contacts').select('id, email, first_name, last_name, phone').in('id', uniqueContactIds);
    for (const c of (data || [])) contactMap.set(c.id, c);
  }

  abandoned.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  const paged = abandoned.slice(offset, offset + limit);

  const normalized = paged.map(b => {
    const contact = b.contact_id ? contactMap.get(b.contact_id) : null;
    let propEmail: string | null = null;
    let propPhone: string | null = null;
    let value = 0;
    let currency: string | null = null;
    let recoveryUrl: string | null = null;
    const lineItems: any[] = [];
    for (const ev of b.events) {
      const p = ev.properties || {};
      const raw = p.raw || {};
      // Email/phone: properties → raw → customer nested. Pixel events
      // use lowercase, webhook events Klaviyo-style.
      if (!propEmail) propEmail = (
        p.email || p.Email || p.CustomerEmail ||
        raw.email || raw.contact_email || raw.customer?.email ||
        ''
      ).toLowerCase() || null;
      if (!propPhone) propPhone = (
        p.phone || p.Phone || p.CustomerPhone ||
        raw.phone || raw.customer?.phone || raw.billing_address?.phone ||
        null
      );
      // Total: row-level monetary_value first (already in storage currency),
      // then properties.TotalPrice (Klaviyo top-level), then raw.total_price,
      // then pixel-side total_price/totalPrice.
      const eventTotal = (
        Number(ev.monetary_value || 0) ||
        Number(p.TotalPrice || 0) ||
        Number(p.total_price || 0) ||
        Number(p.totalPrice || 0) ||
        Number(raw.total_price || 0) ||
        0
      );
      if (eventTotal > value) value = eventTotal;
      // Currency: each event row carries its own (GBP, USD, EUR, BRL, …).
      // Don't hardcode — recovery list mixes currencies for multi-store orgs.
      if (!currency) currency = (
        ev.currency ||
        p.Currency ||
        p.currency ||
        raw.currency ||
        raw.presentment_currency ||
        null
      );
      // Recovery URL — checkouts/create webhooks save it as
      // raw.abandoned_checkout_url or raw.recovery_url. Pixel events
      // sometimes carry it as CheckoutURL (Klaviyo top-level).
      if (!recoveryUrl) recoveryUrl = (
        p.CheckoutURL ||
        p.AbandonedCheckoutURL ||
        p.checkout_url ||
        raw.abandoned_checkout_url ||
        raw.recovery_url ||
        null
      );
      // Line items — accept every shape we ship from pixel/webhook/raw.
      const lis =
        p.Items ||
        p.items ||
        p.lineItems ||
        p.line_items ||
        raw.line_items ||
        [];
      for (const li of (Array.isArray(lis) ? lis : [])) {
        const imageUrl =
          li.ImageURL ||
          li.image_url ||
          li.imageUrl ||
          li.image?.src ||
          li.product?.image?.src ||
          li.product?.images?.[0]?.src ||
          li.product?.product_image_urls?.[0] ||
          li.product?.variant_images_url ||
          null;
        lineItems.push({
          title: li.ProductName || li.title || li.name || li.product?.title || 'Produto',
          quantity: li.Quantity || li.quantity || 1,
          price: Number(li.ItemPrice || li.price || li.variant_price || li.lineTotal || 0),
          image_url: imageUrl,
        });
      }
    }
    const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || contact?.email || propEmail || 'Desconhecido';

    return {
      id: `ckf-${b.key}`,
      type: 'checkout' as const,
      status: 'abandoned' as const,
      email: contact?.email || propEmail || null,
      phone: contact?.phone || propPhone || null,
      contact_id: b.contact_id,
      contact_name: name,
      value,
      currency: currency || 'BRL',
      items_count: lineItems.length || b.events.length,
      items_preview: lineItems.slice(0, 3),
      recovery_url: recoveryUrl,
      abandoned_at: b.last_at,
      converted_at: null,
      recovered_at: null,
      created_at: b.first_at,
      store_id: b.store_id,
    };
  });

  return NextResponse.json({
    items: normalized,
    total: abandoned.length,
    stats: {
      total: abandoned.length,
      pending: 0,
      abandoned: abandoned.length,
      converted: 0,
      recovered: 0,
      revenue_recovered: 0,
      recovery_rate: '0.0',
    },
  });
}

// =====================================================================
// PIX / BOLETO / CARTÃO tab: pending-payment orders by gateway.
// These are Shopify orders with financial_status='pending' where the
// selected gateway matches. The customer committed to buy but payment
// didn't settle — a high-intent recovery opportunity.
// =====================================================================
async function handlePaymentPendingTab(opts: {
  paymentType: 'pix' | 'boleto' | 'card';
  orgIds: string[];
  activeStoreIds: string[];
  storeId: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { paymentType, orgIds, activeStoreIds, storeId, limit, offset } = opts;

  // Gateway keyword matching — different gateways name themselves
  // differently (pagarme_pix, gerencianet_pix, mercadopago_pix, etc.)
  const GATEWAY_KEYWORDS: Record<typeof paymentType, string[]> = {
    pix: ['pix'],
    boleto: ['boleto', 'bank_slip', 'bankslip'],
    card: ['cartao', 'card', 'credit', 'stripe', 'adyen', 'cielo', 'getnet', 'rede', 'pagseguro', 'mercadopago_cc', 'pagarme_credit'],
  };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let q = supabaseAdmin
    .from('shopify_orders')
    .select('id, store_id, shopify_order_id, shopify_order_number, email, phone, total_price, currency, line_items, financial_status, payment_gateway_names, contact_id, shopify_created_at, created_at, contacts(id, email, first_name, last_name, phone)', { count: 'exact' })
    .in('organization_id', orgIds)
    .in('store_id', activeStoreIds)
    .eq('financial_status', 'pending')
    .gte('shopify_created_at', since)
    .order('shopify_created_at', { ascending: false })
    .limit(500);

  if (storeId) q = q.eq('store_id', storeId);

  let rows: any[] = [];
  try {
    const { data, error } = await q;
    if (error) {
      // If column doesn't exist yet (migration not run), fail gracefully
      if (error.code === '42703' || error.message?.includes('payment_gateway_names')) {
        return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
      }
      console.error('[Recovery] Payment tab query error:', error);
      return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
    }
    rows = data || [];
  } catch {
    return NextResponse.json({ items: [], total: 0, stats: zeroStats() });
  }

  // Filter rows by gateway keyword
  const keywords = GATEWAY_KEYWORDS[paymentType];
  const filtered = rows.filter(r => {
    const gateways: string[] = Array.isArray(r.payment_gateway_names) ? r.payment_gateway_names : [];
    const joined = gateways.join(' ').toLowerCase();
    return keywords.some(kw => joined.includes(kw));
  });

  const paged = filtered.slice(offset, offset + limit);

  const normalized = paged.map((o: any) => {
    const ci = Array.isArray(o.contacts) ? o.contacts[0] : o.contacts;
    const name = [ci?.first_name, ci?.last_name].filter(Boolean).join(' ').trim() || ci?.email || o.email || 'Desconhecido';
    const items = Array.isArray(o.line_items) ? o.line_items : [];
    return {
      id: o.id,
      type: paymentType,
      status: 'abandoned' as const,
      email: o.email || ci?.email || null,
      phone: o.phone || ci?.phone || null,
      contact_id: o.contact_id,
      contact_name: name,
      value: Number(o.total_price) || 0,
      currency: o.currency || 'BRL',
      items_count: items.length,
      items_preview: items.slice(0, 3).map((i: any) => ({
        title: i.title || i.name || '',
        quantity: i.quantity || 1,
        price: Number(i.price || 0),
        image_url: i.image?.src || null,
      })),
      recovery_url: null,
      abandoned_at: o.shopify_created_at,
      converted_at: null,
      recovered_at: null,
      created_at: o.shopify_created_at || o.created_at,
      store_id: o.store_id,
    };
  });

  return NextResponse.json({
    items: normalized,
    total: filtered.length,
    stats: {
      total: filtered.length,
      pending: filtered.length,
      abandoned: filtered.length,
      converted: 0,
      recovered: 0,
      revenue_recovered: 0,
      recovery_rate: '0.0',
    },
  });
}
