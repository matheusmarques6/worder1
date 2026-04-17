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

    // Query the checkouts table
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
      // Default: only show checkouts that matter (not brand-new pending)
      query = query.in('status', ['pending', 'abandoned', 'recovered', 'converted']);
    }

    // Differentiate cart (no email captured) vs checkout (email captured).
    // Klaviyo/Omnisend parity: a "cart" is anonymous added-to-cart, a "checkout"
    // means the visitor reached the checkout step and submitted contact info.
    if (type === 'cart') {
      query = query.or('email.is.null,email.eq.');
    } else if (type === 'checkout') {
      query = query.not('email', 'is', null).neq('email', '');
    }

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

    // Compute stats scoped to the active tab (cart vs checkout) so KPIs match the table
    let stats = { total: 0, pending: 0, abandoned: 0, converted: 0, recovered: 0 };
    let revenueRecovered = 0;

    try {
      let statsQuery = supabaseAdmin
        .from('shopify_checkouts')
        .select('status, total_price, email')
        .in('organization_id', orgIds)
        .in('store_id', activeStoreIds);

      if (type === 'cart') {
        statsQuery = statsQuery.or('email.is.null,email.eq.');
      } else if (type === 'checkout') {
        statsQuery = statsQuery.not('email', 'is', null).neq('email', '');
      }

      const { data: allItems } = await statsQuery;

      if (allItems) {
        stats.total = allItems.length;
        for (const it of allItems) {
          if (it.status === 'pending') stats.pending++;
          else if (it.status === 'abandoned') stats.abandoned++;
          else if (it.status === 'converted') stats.converted++;
          else if (it.status === 'recovered') {
            stats.recovered++;
            revenueRecovered += Number(it.total_price) || 0;
          }
        }
      }
    } catch {}

    // Normalize items to a simpler shape
    const normalized = (items || []).map((c: any) => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
      const name =
        [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
        contact?.email ||
        c.email ||
        'Desconhecido';
      const items = Array.isArray(c.line_items) ? c.line_items : [];
      return {
        id: c.id,
        type,
        status: c.status,
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
