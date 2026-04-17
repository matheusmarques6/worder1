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

    if (type !== 'cart' && type !== 'checkout') {
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

    if (activeStoreIds.length === 0) {
      return NextResponse.json({
        items: [],
        total: 0,
        stats: { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0, revenue_recovered: 0, recovery_rate: '0.0' },
      });
    }

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
        statusFilter,
        limit,
        offset,
      });
    }

    // =====================================================================
    // CHECKOUT tab: query shopify_checkouts table (webhook-backed)
    // =====================================================================
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
      // Default abandoned-checkouts view must EXCLUDE 'converted' rows —
      // those are customers that already paid and shouldn't appear in the
      // recovery funnel. 'recovered' means we brought them back through
      // a recovery email (we keep those for recovery-rate stats).
      query = query.in('status', ['pending', 'abandoned', 'recovered']);
    }

    // Only checkouts that reached the email step
    query = query.not('email', 'is', null).neq('email', '');

    const { data: items, count, error } = await query;

    if (error) {
      if (error.code === '42P01' || error.code === '42703' || error.message?.includes('relation')) {
        return NextResponse.json({
          items: [],
          total: 0,
          stats: { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0, revenue_recovered: 0, recovery_rate: '0.0' },
        });
      }
      console.error('[Recovery] Error fetching checkouts:', error);
      return NextResponse.json({ error: error.message || 'Failed to fetch' }, { status: 500 });
    }

    // Compute stats for the checkout tab (matching the filter of the displayed items)
    let stats = { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0 };
    let revenueRecovered = 0;

    try {
      const { data: allItems } = await supabaseAdmin
        .from('shopify_checkouts')
        .select('status, total_price, email, created_at')
        .in('organization_id', orgIds)
        .in('store_id', activeStoreIds)
        .not('email', 'is', null)
        .neq('email', '')
        .in('status', ['pending', 'abandoned', 'recovered']);

      if (allItems) {
        const abandonmentCutoff = Date.now() - 15 * 60 * 1000; // 15min threshold
        for (const it of allItems as any[]) {
          // Treat pending >15min old as effectively abandoned for stats
          const createdMs = it.created_at ? new Date(it.created_at).getTime() : 0;
          const effectiveStatus = (it.status === 'pending' && createdMs && createdMs < abandonmentCutoff)
            ? 'abandoned'
            : it.status;
          if (effectiveStatus === 'pending') stats.pending++;
          else if (effectiveStatus === 'abandoned') stats.abandoned++;
          else if (effectiveStatus === 'recovered') {
            stats.recovered++;
            revenueRecovered += Number(it.total_price) || 0;
          }
        }
        stats.total = stats.pending + stats.abandoned + stats.recovered;
      }
    } catch {}

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

    // Normalize items to a simpler shape
    const abandonmentCutoff = Date.now() - 15 * 60 * 1000;
    const normalized = (items || []).map((c: any) => {
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
      total: count || 0,
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
  statusFilter: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { orgIds, activeStoreIds, storeId, limit, offset } = opts;

  // Fetch recent added_to_cart events (last 30 days window)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let q = supabaseAdmin
    .from('contact_events')
    .select('id, contact_id, store_id, organization_id, properties, session_id, anonymous_id, monetary_value, currency, occurred_at, created_at')
    .in('organization_id', orgIds)
    .in('store_id', activeStoreIds)
    .eq('event_type', 'added_to_cart')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(1000);

  if (storeId) q = q.eq('store_id', storeId);

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
  // 1. Last cart event was >= 60min ago (customer is no longer actively shopping), AND
  // 2. No purchase happened after the last cart event.
  const cartAbandonmentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
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

  // Sort by most recent activity
  abandoned.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));

  const paged = abandoned.slice(offset, offset + limit);

  const normalized = paged.map(b => {
    const contact = b.contact_id ? contactMap.get(b.contact_id) : null;
    const name =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
      contact?.email ||
      'Desconhecido';

    // Dedupe products by product_id/title — prefer most recent event's properties
    const itemsMap = new Map<string, any>();
    let value = 0;
    for (const ev of b.events) {
      const p = ev.properties || {};
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
      email: contact?.email || null,
      phone: contact?.phone || null,
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
