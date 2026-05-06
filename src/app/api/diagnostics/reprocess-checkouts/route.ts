// =============================================
// POST /api/diagnostics/reprocess-checkouts
//
// Materializes every existing shopify_checkouts row into a
// contact_events row with event_type='checkout_started'. Useful when:
//   - The webhook handler dropped the events silently
//   - Checkouts were saved by the cron but never produced events
//   - The merchant wants to backfill behavioral data
//
// Idempotent: only inserts events that don't already exist (matched
// by idempotency_key = `checkout_started:${shopify_checkout_id}`).
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
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

  // Pull all checkouts saved for this store (Shopify keeps abandoned
  // checkouts visible for ~3 months, but our table holds whatever the
  // webhooks already gave us).
  const { data: checkouts } = await admin
    .from('shopify_checkouts')
    .select('shopify_checkout_id, email, phone, total_price, subtotal_price, currency, line_items, contact_id, recovery_url, abandoned_checkout_url, shopify_created_at, status')
    .eq('store_id', store.id)
    .order('shopify_created_at', { ascending: false })
    .limit(500);

  if (!checkouts || checkouts.length === 0) {
    return NextResponse.json({ success: true, processed: 0, skipped: 0, errors: 0 });
  }

  // Find which checkouts already have an event so we don't dup
  const ids = checkouts.map(c => c.shopify_checkout_id).filter(Boolean);
  const { data: existing } = await admin
    .from('contact_events')
    .select('idempotency_key')
    .eq('organization_id', orgId)
    .in('idempotency_key', ids.map(id => `checkout_started:${id}`));
  const existingKeys = new Set((existing || []).map(e => e.idempotency_key));

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of checkouts) {
    const key = `checkout_started:${c.shopify_checkout_id}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    // Resolve contact: prefer existing checkout.contact_id, otherwise look up by email
    let contactId = c.contact_id || null;
    if (!contactId && c.email) {
      const { data: foundContact } = await admin
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('email', c.email)
        .maybeSingle();
      contactId = foundContact?.id || null;
    }

    const totalPrice = Number(c.total_price) || 0;
    const itemsCount = Array.isArray(c.line_items) ? c.line_items.length : 0;

    const { error } = await admin.from('contact_events').insert({
      organization_id: orgId,
      contact_id: contactId,
      store_id: store.id,
      event_type: 'checkout_started',
      event_source: 'shopify_webhook',
      properties: {
        checkout_id: c.shopify_checkout_id,
        email: c.email,
        phone: c.phone,
        total_price: totalPrice,
        subtotal_price: Number(c.subtotal_price) || 0,
        currency: c.currency || 'BRL',
        items_count: itemsCount,
        items: c.line_items || [],
        recovery_url: c.recovery_url || c.abandoned_checkout_url,
        backfilled: true,
      },
      monetary_value: totalPrice,
      currency: c.currency || 'BRL',
      shopify_resource_id: c.shopify_checkout_id,
      shopify_resource_type: 'checkout',
      occurred_at: c.shopify_created_at || new Date().toISOString(),
      received_at: new Date().toISOString(),
      idempotency_key: key,
    });

    if (error) {
      errors++;
      console.error('[Diag reprocess] insert failed:', error.message, 'for', c.shopify_checkout_id);
    } else {
      processed++;
    }
  }

  return NextResponse.json({ success: true, processed, skipped, errors, total: checkouts.length });
}
