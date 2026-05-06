// =============================================
// POST /api/diagnostics/test-event
//
// Creates a synthetic tracking event so the merchant can verify the
// pipeline end-to-end without leaving the dashboard. Inserts directly
// into contact_events with event_source='diagnostic' and a recognizable
// idempotency_key prefix so it's easy to filter out later.
//
// Body: { storeId, eventType?, email? }
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const { storeId, eventType = 'viewed_product', email } = body || {};

  if (!storeId) {
    return NextResponse.json({ error: 'storeId é obrigatório' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: store } = await admin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .single();

  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
  }

  // Resolve contact by email if provided
  let contactId: string | null = null;
  if (email) {
    const { data: c } = await admin
      .from('contacts')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('email', email)
      .maybeSingle();
    contactId = c?.id || null;
  }

  const now = new Date().toISOString();
  const idempotencyKey = `diagnostic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Synthetic properties depending on the event type so the dashboard
  // shows realistic-looking sample data.
  const properties: Record<string, any> = {
    page_url: `https://${store.shop_domain}/products/test-product`,
    page_title: 'Produto de Teste',
    diagnostic: true,
  };
  if (eventType === 'viewed_product') {
    properties.product_id = 'test-123';
    properties.product_title = 'Produto de Teste';
    properties.price = 99.9;
    properties.currency = 'BRL';
  } else if (eventType === 'added_to_cart') {
    properties.product_id = 'test-123';
    properties.product_title = 'Produto de Teste';
    properties.quantity = 1;
    properties.price = 99.9;
  } else if (eventType === 'checkout_started') {
    properties.checkout_id = `test-${Date.now()}`;
    properties.total_price = 99.9;
    properties.email = email || 'teste@worder.dev';
  } else if (eventType === 'placed_order') {
    properties.order_id = `test-${Date.now()}`;
    properties.total_price = 99.9;
    properties.email = email || 'teste@worder.dev';
  }

  const { data: inserted, error } = await admin
    .from('contact_events')
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      store_id: store.id,
      event_type: eventType,
      event_source: 'diagnostic',
      properties,
      monetary_value: properties.total_price || properties.price || null,
      currency: 'BRL',
      session_id: `diagnostic-${Date.now()}`,
      anonymous_id: contactId ? null : `diagnostic-${Date.now()}`,
      occurred_at: now,
      received_at: now,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    event: {
      id: inserted?.id,
      event_type: eventType,
      event_source: 'diagnostic',
      contact_id: contactId,
      properties,
    },
  });
}
