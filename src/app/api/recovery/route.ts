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
    // CHECKOUT tab: query shopify_checkouts table (webhook-backed)
    // Falls back to contact_events if shopify_checkouts is empty (e.g.
    // sync_checkouts not enabled, or table doesn't exist).
    // =====================================================================
    let items: any[] | null = null;
    let count: number | null = null;
    let checkoutError: any = null;

    try {
      let query = supabaseAdmin
        .from('shopify_checkouts')
        .select('id, store_id, shopify_checkout_id, shopify_checkout_token, email, phone, total_price, currency, line_items, abandoned_checkout_url, recovery_url, status, abandoned_at, converted_at, recovered_at, contact_id, shopify_created_at, created_at, updated_at, contacts(id, email, first_name, last_name, phone)', { count: 'exact' })
        .in('organization_id', orgIds)
        .in('store_id', activeStoreIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (storeId) query = query.eq('store_id', storeId);
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      } else {
        query = query.in('status', ['pending', 'abandoned', 'recovered']);
      }

      query = query.not('email', 'is', null).neq('email', '');

      const result = await query;
      items = result.data;
      count = result.count;
      checkoutError = result.error;
    } catch {
      checkoutError = { code: '42P01' };
    }

    // Fallback: if shopify_checkouts is empty or missing, derive abandoned
    // checkouts from contact_events (checkout_started without checkout_completed).
    if ((!items || items.length === 0) && (!checkoutError || checkoutError.code === '42P01' || checkoutError.code === '42703' || checkoutError.message?.includes('relation'))) {
      return await handleCheckoutFallback({
        orgIds,
        activeStoreIds,
        storeId,
        limit,
        offset,
      });
    }

    if (checkoutError) {
      console.error('[Recovery] Error fetching checkouts:', checkoutError);
      return NextResponse.json({ error: checkoutError.message || 'Failed to fetch' }, { status: 500 });
    }

    // ── Live conversion check: catch checkouts whose customer already placed ──
    // an order but our webhook/cron didn't update status yet. Cross-reference
    // emails against shopify_orders so Shopify + Worder lists match perfectly.
    const checkoutEmails = [...new Set(
      (items || []).map((c: any) => c.email?.toLowerCase()).filter(Boolean)
    )] as string[];
    const convertedEmails = new Set<string>();
    if (checkoutEmails.length > 0) {
      try {
        const { data: orders } = await supabaseAdmin
          .from('shopify_orders')
          .select('email')
          .in('store_id', activeStoreIds)
          .in('email', checkoutEmails);
        for (const o of (orders || []) as any[]) {
          if (o.email) convertedEmails.add(String(o.email).toLowerCase());
        }
      } catch {}
      // Also check contact_events for placed_order events
      if (convertedEmails.size < checkoutEmails.length) {
        try {
          const remaining = checkoutEmails.filter(e => !convertedEmails.has(e));
          if (remaining.length > 0) {
            const { data: events } = await supabaseAdmin
              .from('contact_events')
              .select('properties')
              .in('organization_id', orgIds)
              .in('event_type', ['placed_order', 'order_paid'])
              .in('store_id', activeStoreIds)
              .limit(500);
            for (const ev of (events || []) as any[]) {
              const evEmail = (ev.properties?.email || ev.properties?.Email || '').toLowerCase();
              if (evEmail && remaining.includes(evEmail)) convertedEmails.add(evEmail);
            }
          }
        } catch {}
      }
      // Fire-and-forget: mark the stale rows as converted in the DB
      if (convertedEmails.size > 0) {
        for (const c of (items || []) as any[]) {
          if (c.email && convertedEmails.has(c.email.toLowerCase()) && c.status !== 'converted') {
            supabaseAdmin.from('shopify_checkouts')
              .update({ status: 'converted', converted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', c.id)
              .then(() => {}, () => {});
          }
        }
      }
    }

    // Filter out the converted ones from the results
    const filteredItems = (items || []).filter((c: any) =>
      !(c.email && convertedEmails.has(c.email.toLowerCase()))
    );

    // Stats are computed after the conversion check below so they match
    let stats = { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0 };
    let revenueRecovered = 0;

    // Backfill contact_id by email when the checkout wasn't linked at webhook time
    // (Shopify often fires checkouts/create BEFORE the customer submits email)
    const unlinkedByEmail = new Map<string, string>() // email -> checkout_id
    for (const c of (items || [])) {
      const ci = (c as any).contacts
      const has = Array.isArray(ci) ? ci[0] : ci
      if (!has && c.email) unlinkedByEmail.set(String(c.email).toLowerCase(), c.id)
    }
    const emailsToLookup = Array.from(unlinkedByEmail.keys())
    const contactsByEmail = new Map<string, any>()
    if (emailsToLookup.length > 0) {
      const { data: foundContacts } = await supabaseAdmin
        .from('contacts')
        .select('id, email, first_name, last_name, phone')
        .in('organization_id', orgIds)
        .in('email', emailsToLookup)
      for (const fc of (foundContacts || [])) {
        if (fc.email) contactsByEmail.set(String(fc.email).toLowerCase(), fc)
      }
      // Fire-and-forget: persist the contact_id link back to shopify_checkouts
      if (contactsByEmail.size > 0) {
        for (const [email, checkoutId] of unlinkedByEmail.entries()) {
          const fc = contactsByEmail.get(email)
          if (fc) {
            supabaseAdmin.from('shopify_checkouts').update({ contact_id: fc.id }).eq('id', checkoutId).then(() => {}, () => {})
          }
        }
      }
    }

    // Compute stats from the filtered (post-conversion-check) items
    const abandonmentCutoff = Date.now() - 15 * 60 * 1000;
    for (const it of filteredItems as any[]) {
      const createdMs = it.created_at ? new Date(it.created_at).getTime() : 0;
      const effectiveStatus = (it.status === 'pending' && createdMs && createdMs < abandonmentCutoff)
        ? 'abandoned' : it.status;
      if (effectiveStatus === 'pending') stats.pending++;
      else if (effectiveStatus === 'abandoned') stats.abandoned++;
      else if (effectiveStatus === 'recovered') {
        stats.recovered++;
        revenueRecovered += Number(it.total_price) || 0;
      }
    }
    stats.total = filteredItems.length;

    // Normalize items to a simpler shape — use filteredItems (excludes live-detected converts)
    const normalized = filteredItems.map((c: any) => {
      const ci = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
      const contact = ci || (c.email ? contactsByEmail.get(String(c.email).toLowerCase()) : null)
      const name =
        [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
        contact?.email ||
        c.email ||
        'Desconhecido';
      const items = Array.isArray(c.line_items) ? c.line_items : [];
      // Show "abandoned" for old pending rows that the cron hasn't processed yet —
      // UX-wise they are effectively abandoned. Keeps the UI consistent with Shopify.
      const createdMs = c.created_at ? new Date(c.created_at).getTime() : 0;
      const effectiveStatus = (c.status === 'pending' && createdMs && createdMs < abandonmentCutoff)
        ? 'abandoned'
        : c.status;
      return {
        id: c.id,
        type,
        status: effectiveStatus,
        email: c.email || contact?.email || null,
        phone: c.phone || contact?.phone || null,
        contact_id: c.contact_id,
        contact_name: name,
        value: Number(c.total_price) || 0,
        currency: c.currency || 'BRL',
        items_count: items.length,
        items_preview: items.slice(0, 3).map((i: any) => ({
          title: i.title || i.name || '',
          quantity: i.quantity || 1,
          price: Number(i.price || 0),
          image_url: i.image?.src || i.product?.image?.src || null,
        })),
        recovery_url: c.recovery_url || c.abandoned_checkout_url || null,
        abandoned_at: c.abandoned_at,
        converted_at: c.converted_at,
        recovered_at: c.recovered_at,
        created_at: c.shopify_created_at || c.created_at,
        store_id: c.store_id,
      };
    });

    return NextResponse.json({
      items: normalized,
      total: filteredItems.length,
      stats: {
        ...stats,
        revenue_recovered: revenueRecovered,
        recovery_rate:
          stats.total > 0
            ? (((stats.recovered + stats.converted) / stats.total) * 100).toFixed(1)
            : '0.0',
      },
    });
  } catch (error: any) {
    console.error('[Recovery] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
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
async function handleCheckoutFallback(opts: {
  orgIds: string[];
  activeStoreIds: string[];
  storeId: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { orgIds, activeStoreIds, storeId, limit, offset } = opts;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let q = supabaseAdmin
    .from('contact_events')
    .select('id, contact_id, store_id, organization_id, properties, session_id, anonymous_id, monetary_value, currency, occurred_at, event_type')
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

  // Group by contact_id or session_id
  const buckets = new Map<string, { key: string; contact_id: string | null; session_id: string | null; events: any[]; last_at: string; first_at: string; store_id: string }>();
  for (const e of startedEvents) {
    const key = e.contact_id ? `c:${e.contact_id}` : e.session_id ? `s:${e.session_id}` : `e:${e.id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(e);
      if (e.occurred_at > existing.last_at) existing.last_at = e.occurred_at;
      if (e.occurred_at < existing.first_at) existing.first_at = e.occurred_at;
      if (!existing.contact_id && e.contact_id) existing.contact_id = e.contact_id;
    } else {
      buckets.set(key, { key, contact_id: e.contact_id, session_id: e.session_id, events: [e], last_at: e.occurred_at, first_at: e.occurred_at, store_id: e.store_id });
    }
  }

  // Check which of these have a matching checkout_completed / placed_order
  const contactIds = [...new Set([...buckets.values()].map(b => b.contact_id).filter(Boolean))] as string[];
  const sessionIds = [...new Set([...buckets.values()].map(b => b.session_id).filter(Boolean))] as string[];

  const completedSessions = new Set<string>();
  const completedContacts = new Set<string>();

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

  const cutoff15min = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const abandoned = [...buckets.values()].filter(b => {
    if (b.last_at > cutoff15min) return false;
    if (b.session_id && completedSessions.has(b.session_id)) return false;
    if (b.contact_id && completedContacts.has(b.contact_id)) return false;
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
    const lineItems: any[] = [];
    for (const ev of b.events) {
      const p = ev.properties || {};
      if (!propEmail) propEmail = (p.email || p.Email || p.customer?.email || '').toLowerCase() || null;
      if (!propPhone) propPhone = p.phone || p.Phone || p.customer?.phone || null;
      if (p.totalPrice != null) value = Math.max(value, Number(p.totalPrice) || 0);
      if (ev.monetary_value) value = Math.max(value, Number(ev.monetary_value));
      const lis = p.lineItems || p.line_items || [];
      for (const li of (Array.isArray(lis) ? lis : [])) {
        lineItems.push({ title: li.title || li.name || 'Produto', quantity: li.quantity || 1, price: Number(li.price || li.lineTotal || 0), image_url: li.imageUrl || li.image?.src || null });
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
      currency: 'BRL',
      items_count: lineItems.length || b.events.length,
      items_preview: lineItems.slice(0, 3),
      recovery_url: null,
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
