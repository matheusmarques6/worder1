// =============================================
// WORDER: Recovery Detail API
// /src/app/api/recovery/[id]/route.ts
//
// GET: returns a single shopify_checkouts row with
// contact, store and timeline data — used by the
// recovery detail drawer/page.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

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

    const { data: checkout, error } = await supabaseAdmin
      .from('shopify_checkouts')
      .select(
        'id, organization_id, store_id, shopify_checkout_id, shopify_checkout_token, email, phone, total_price, subtotal_price, total_tax, total_discounts, currency, line_items, abandoned_checkout_url, recovery_url, status, abandoned_at, converted_at, recovered_at, contact_id, shopify_created_at, shopify_updated_at, created_at, updated_at, contacts(id, email, first_name, last_name, phone, total_orders, total_spent), shopify_stores(id, shop_domain, shop_name, currency)'
      )
      .eq('id', params.id)
      .in('organization_id', orgIds)
      .maybeSingle();

    if (error) {
      console.error('[Recovery Detail] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!checkout) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const contact = Array.isArray(checkout.contacts)
      ? checkout.contacts[0]
      : (checkout as any).contacts;
    const store = Array.isArray(checkout.shopify_stores)
      ? checkout.shopify_stores[0]
      : (checkout as any).shopify_stores;

    // Pull related events from contact_events for the timeline
    let events: any[] = [];
    try {
      const { data: ev } = await supabaseAdmin
        .from('contact_events')
        .select('id, event_type, occurred_at, properties, monetary_value, currency')
        .eq('organization_id', checkout.organization_id)
        .eq('shopify_resource_id', checkout.shopify_checkout_id)
        .eq('shopify_resource_type', 'checkout')
        .order('occurred_at', { ascending: false })
        .limit(20);
      events = ev || [];
    } catch {}

    const items = Array.isArray(checkout.line_items) ? checkout.line_items : [];

    const name =
      [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
      contact?.email ||
      checkout.email ||
      'Desconhecido';

    return NextResponse.json({
      id: checkout.id,
      type: checkout.email ? 'checkout' : 'cart',
      status: checkout.status,
      contact_id: checkout.contact_id,
      contact: contact
        ? {
            id: contact.id,
            name,
            email: contact.email || checkout.email,
            phone: contact.phone || checkout.phone,
            total_orders: contact.total_orders ?? null,
            total_spent: contact.total_spent ?? null,
          }
        : {
            id: null,
            name,
            email: checkout.email,
            phone: checkout.phone,
            total_orders: null,
            total_spent: null,
          },
      store: store
        ? {
            id: store.id,
            shop_domain: store.shop_domain,
            shop_name: store.shop_name,
          }
        : null,
      totals: {
        total_price: Number(checkout.total_price) || 0,
        subtotal_price: Number(checkout.subtotal_price) || 0,
        total_tax: Number(checkout.total_tax) || 0,
        total_discounts: Number(checkout.total_discounts) || 0,
        currency: checkout.currency || 'BRL',
      },
      items: items.map((i: any) => ({
        title: i.title || i.name || '',
        variant_title: i.variant_title || null,
        quantity: i.quantity || 1,
        price: Number(i.price || 0),
        image_url: i.image?.src || i.product?.image?.src || i.image_url || null,
        sku: i.sku || null,
        product_id: i.product_id || null,
        variant_id: i.variant_id || null,
      })),
      recovery_url: checkout.recovery_url || checkout.abandoned_checkout_url || null,
      timestamps: {
        created_at: checkout.shopify_created_at || checkout.created_at,
        updated_at: checkout.shopify_updated_at || checkout.updated_at,
        abandoned_at: checkout.abandoned_at,
        recovered_at: checkout.recovered_at,
        converted_at: checkout.converted_at,
      },
      events,
    });
  } catch (err: any) {
    console.error('[Recovery Detail] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
