// =============================================
// GET /api/diagnostics/checkout-trace?id=<checkout_id_or_token>&storeId=<id>
//
// Traces a single Shopify checkout end-to-end through Worder's pipeline
// so the merchant can see exactly where it stopped:
//
//   1. Did Shopify deliver checkouts/create webhook?
//      → shopify_webhook_log row with topic='checkouts/create'
//   2. Did the webhook handler save the row?
//      → shopify_checkouts row with shopify_checkout_id matching
//   3. Did createEvent fire successfully?
//      → contact_event row with event_type='checkout_started'
//      and shopify_resource_id matching
//   4. Was a placed_order ever recorded for the same checkout token?
//      → contact_event with event_type='placed_order' and
//      properties.extra.checkout_token matching
//   5. Eligibility for the Recovery list:
//      → has email/phone? has linked contact with email/phone?
//      → was it completed (canonical or timestamp-aware)?
//
// Body: ?id=<id>&storeId=<id>
// id = either Shopify checkout id (numeric like 40364168642834) or token
//      Or order_number (#1234) — we normalize.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const sp = request.nextUrl.searchParams;
  const rawId = (sp.get('id') || '').trim().replace(/^#/, '');
  const storeIdParam = sp.get('storeId');
  if (!rawId) {
    return NextResponse.json({ error: 'Forneça ?id=<checkout_id_or_token>' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Resolve store
  let store: any;
  if (storeIdParam) {
    const { data } = await admin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, shop_domain_aliases')
      .eq('id', storeIdParam)
      .eq('organization_id', orgId)
      .maybeSingle();
    store = data;
  } else {
    // Sem storeId só serve a ÚNICA loja ativa da organização.
    const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<any>(admin, {
      orgIds: [orgId], select: 'id, organization_id, shop_domain, shop_domain_aliases',
    });
    if (!picked.store) {
      const err = pickStoreError(picked.reason);
      return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
    }
    store = picked.store;
  }
  if (!store) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });

  // Normalize: try both raw and stripped, in case user pasted "#40364168642834"
  // or a checkout token (32-char hex). We search across multiple possible keys
  // because Shopify's `id` and `token` are different identifiers.
  const candidates = Array.from(new Set([
    rawId,
    rawId.replace(/[^0-9a-zA-Z]/g, ''),
  ])).filter(Boolean);

  // ============================================================
  // STEP 1: webhook delivery log
  //   Look for any shopify_webhook_log row matching this id as
  //   shopify_resource_id, regardless of topic — gives the user
  //   the full delivery history for this resource.
  // ============================================================
  const { data: webhookRows } = await admin
    .from('shopify_webhook_log')
    .select('id, topic, status, shopify_resource_id, error_message, attempts, received_at, processed_at')
    .eq('store_id', store.id)
    .in('shopify_resource_id', candidates)
    .order('received_at', { ascending: false })
    .limit(20);

  // ============================================================
  // STEP 2: shopify_checkouts row
  //   The webhook handler upserts this row on every checkouts/create
  //   and checkouts/update. Existence here = webhook reached us AND
  //   the upsert succeeded. status='converted' = order fired.
  // ============================================================
  const { data: checkoutRows } = await admin
    .from('shopify_checkouts')
    .select('id, shopify_checkout_id, shopify_checkout_token, email, phone, total_price, currency, status, contact_id, converted_order_id, converted_at, created_at, shopify_created_at, line_items')
    .eq('store_id', store.id)
    .or(candidates.map(c => `shopify_checkout_id.eq.${c},shopify_checkout_token.eq.${c}`).join(','))
    .limit(5);

  // ============================================================
  // STEP 3: contact_event with event_type=checkout_started
  //   What the Recovery page actually queries. Existence here =
  //   the CDP layer saw the event. Absence = createEvent failed
  //   (caught error) or the webhook handler bailed before reaching it.
  // ============================================================
  const { data: startedEvents } = await admin
    .from('contact_events')
    .select('id, event_type, event_source, contact_id, anonymous_id, session_id, properties, monetary_value, currency, occurred_at, received_at, shopify_resource_id, store_id')
    .eq('organization_id', orgId)
    .eq('store_id', store.id)
    .eq('event_type', 'checkout_started')
    .in('shopify_resource_id', candidates)
    .order('occurred_at', { ascending: false })
    .limit(5);

  // ============================================================
  // STEP 4: matching placed_order — checks the canonical link
  //   that Shopify uses (order.checkout_token == checkout.token).
  //   We scan by extra.checkout_token / checkout_id to mirror the
  //   recovery code's match logic.
  // ============================================================
  const { data: orderEvents } = await admin
    .from('contact_events')
    .select('id, event_type, event_source, contact_id, properties, monetary_value, currency, occurred_at, shopify_resource_id')
    .eq('organization_id', orgId)
    .eq('store_id', store.id)
    .in('event_type', ['placed_order', 'order_paid', 'checkout_completed'])
    .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .limit(2000);

  const matchedOrders: any[] = [];
  for (const r of (orderEvents || []) as any[]) {
    const p = r.properties || {};
    const extra = p.extra || {};
    const tokens = [extra.checkout_token, extra.checkout_id, p.CheckoutId, p.checkout_id, p.checkout_token]
      .filter(Boolean)
      .map(String);
    if (tokens.some(t => candidates.includes(t))) {
      matchedOrders.push({
        id: r.id,
        event_type: r.event_type,
        order_id: r.shopify_resource_id,
        contact_id: r.contact_id,
        value: r.monetary_value,
        currency: r.currency,
        occurred_at: r.occurred_at,
      });
    }
  }

  // ============================================================
  // STEP 5: orphan webhook deliveries from this domain
  //   If shopify_webhook_log is empty for this id but the audit
  //   table has 'orphan_store' entries from the shop_domain, the
  //   webhook IS arriving but for a domain we haven't aliased.
  // ============================================================
  const aliasDomains = [
    store.shop_domain,
    ...(Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : []),
  ].filter(Boolean);
  const { data: auditRows } = await admin
    .from('shopify_webhook_audit')
    .select('id, shop_domain, topic, status, error_message, received_at')
    .in('shop_domain', aliasDomains)
    .order('received_at', { ascending: false })
    .limit(10);

  // ============================================================
  // Diagnosis: synthesize the verdict so the merchant doesn't
  // have to interpret raw rows. Walks the funnel and reports the
  // FIRST step that broke.
  // ============================================================
  const verdict: { stage: string; status: 'ok' | 'missing' | 'failed' | 'completed'; message: string }[] = [];

  if (!webhookRows || webhookRows.length === 0) {
    verdict.push({
      stage: 'webhook_delivery',
      status: 'missing',
      message: 'Nenhuma entrega registrada para este checkout. Possíveis causas: (1) Shopify não enviou o webhook (URL errada ou topic não registrado), (2) HMAC inválido — entregas voltam 401 mas só logamos quando temos o store_id resolvido, (3) shop_domain não bate com aliases. Confira "Webhooks recebidos" e "Webhooks registrados na Shopify" no painel de tracking.',
    });
  } else {
    const success = webhookRows.find((w: any) => w.status === 'processed' || w.status === 'success');
    const failed = webhookRows.find((w: any) => w.status !== 'processed' && w.status !== 'success');
    if (success) {
      verdict.push({
        stage: 'webhook_delivery',
        status: 'ok',
        message: `Webhook recebido e processado em ${success.processed_at || success.received_at}.`,
      });
    } else if (failed) {
      verdict.push({
        stage: 'webhook_delivery',
        status: 'failed',
        message: `Webhook recebido mas falhou: ${failed.status} — ${failed.error_message || 'sem detalhes'}.`,
      });
    }
  }

  if (!checkoutRows || checkoutRows.length === 0) {
    verdict.push({
      stage: 'shopify_checkouts_row',
      status: 'missing',
      message: 'Sem linha em shopify_checkouts. O upsert do webhook falhou ou o webhook nem chegou.',
    });
  } else {
    const row = checkoutRows[0];
    const hasContactInfo = !!(row.email || row.phone);
    verdict.push({
      stage: 'shopify_checkouts_row',
      status: row.status === 'converted' || row.status === 'recovered' ? 'completed' : 'ok',
      message: `Linha encontrada (status=${row.status}, email=${row.email || 'null'}, phone=${row.phone || 'null'}, total=${row.total_price} ${row.currency}, contact=${row.contact_id ? 'linkado' : 'null'}). ${!hasContactInfo ? '⚠ Sem email/phone — Shopify não considera abandonado.' : ''}`,
    });
  }

  if (!startedEvents || startedEvents.length === 0) {
    verdict.push({
      stage: 'contact_event',
      status: 'missing',
      message: 'Nenhum evento checkout_started em contact_events. Provavelmente createEvent falhou (erro silencioso) OU o webhook bailou antes da chamada.',
    });
  } else {
    const ev = startedEvents[0];
    const hasContact = !!ev.contact_id;
    const propsAny = ev.properties as any;
    const hasEmail = !!(propsAny?.email || propsAny?.Email || propsAny?.CustomerEmail || propsAny?.raw?.email);
    verdict.push({
      stage: 'contact_event',
      status: 'ok',
      message: `Evento checkout_started criado em ${ev.occurred_at}. contact_id=${hasContact ? 'sim' : 'null'}, email_in_props=${hasEmail ? 'sim' : 'não'}. Source=${ev.event_source}.`,
    });
  }

  if (matchedOrders.length > 0) {
    const o = matchedOrders[0];
    verdict.push({
      stage: 'completion',
      status: 'completed',
      message: `Pedido associado em ${o.occurred_at} (${o.event_type}, order_id=${o.order_id}, valor=${o.value} ${o.currency}). Checkout não é abandonado, foi convertido — por isso some da Recovery.`,
    });
  } else {
    verdict.push({
      stage: 'completion',
      status: 'ok',
      message: 'Nenhum pedido associado por checkout_token. Se o evento existe e tem contact info, deveria aparecer na Recovery.',
    });
  }

  return NextResponse.json({
    query: { id: rawId, candidates },
    store: { id: store.id, shop_domain: store.shop_domain },
    verdict,
    webhookDeliveries: (webhookRows || []).map((w: any) => ({
      topic: w.topic,
      status: w.status,
      error_message: w.error_message,
      attempts: w.attempts,
      received_at: w.received_at,
      processed_at: w.processed_at,
    })),
    shopifyCheckoutsRow: (checkoutRows || []).map((c: any) => ({
      shopify_checkout_id: c.shopify_checkout_id,
      shopify_checkout_token: c.shopify_checkout_token,
      email: c.email,
      phone: c.phone,
      status: c.status,
      total_price: c.total_price,
      currency: c.currency,
      contact_id: c.contact_id,
      converted_order_id: c.converted_order_id,
      converted_at: c.converted_at,
      shopify_created_at: c.shopify_created_at,
    })),
    contactEvents: (startedEvents || []).map((e: any) => ({
      id: e.id,
      event_source: e.event_source,
      contact_id: e.contact_id,
      session_id: e.session_id,
      monetary_value: e.monetary_value,
      currency: e.currency,
      occurred_at: e.occurred_at,
      received_at: e.received_at,
      email_in_props: !!(e.properties?.email || e.properties?.Email || e.properties?.CustomerEmail || e.properties?.raw?.email),
    })),
    matchedOrders,
    auditFromShopDomain: (auditRows || []).map((a: any) => ({
      shop_domain: a.shop_domain,
      topic: a.topic,
      status: a.status,
      error_message: a.error_message,
      received_at: a.received_at,
    })),
  });
}
