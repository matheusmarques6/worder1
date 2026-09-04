// =============================================
// GET /api/diagnostics/tracking?store_id=X
//
// One-shot diagnostic endpoint for the tracking-debug dashboard.
// Returns:
//   - Install status: pixel, ScriptTag (loader), Theme App Embed, webhooks
//   - Recent events (last 50) for this store with compact summary
//   - Event counts per type for the last 24h
//   - Resolved-vs-anonymous contact ratio
//
// The dashboard polls this every 5s while the merchant tests their
// storefront in another tab — they see events stream in live.
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const admin = getSupabaseAdmin();

  const { searchParams } = request.nextUrl;
  const storeIdParam = searchParams.get('store_id') || searchParams.get('storeId');

  // Resolve store
  let store: any;
  if (storeIdParam) {
    const { data } = await admin
      .from('shopify_stores')
      .select('*')
      .eq('id', storeIdParam)
      .eq('organization_id', orgId)
      .single();
    store = data;
  } else {
    // Sem storeId só serve a ÚNICA loja ativa da organização — o
    // diagnóstico da loja errada é pior que nenhum.
    const { pickStore, pickStoreError } = await import('@/lib/stores/pick-store');
    const picked = await pickStore<any>(admin, { orgIds: [orgId], select: '*' });
    if (!picked.store) {
      const err = pickStoreError(picked.reason);
      return NextResponse.json({ error: err.error, code: err.code }, { status: err.status });
    }
    store = picked.store;
  }

  if (!store) {
    return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Identity graph stats — surface how many visitors we're tracking and
  // how many were re-stitched by fingerprint/email after losing localStorage.
  const { count: totalIdentities } = await admin
    .from('visitor_identities')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('merged_into_id', null);
  const { count: identifiedCount } = await admin
    .from('visitor_identities')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('merged_into_id', null)
    .not('contact_id', 'is', null);
  const { count: stitchedByFingerprint } = await admin
    .from('visitor_identities')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('merged_into_id', null)
    .gt('match_count', 1)
    .not('fingerprint_hash', 'is', null);

  // Recommendation cron output — count rows per type so the merchant
  // sees if collaborative filtering has materialized anything yet.
  const { count: recsCount } = await admin
    .from('product_recommendations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  // Recent events — last 50 for live feed
  const { data: recentEvents } = await admin
    .from('contact_events')
    .select('id, event_type, event_source, contact_id, anonymous_id, session_id, properties, monetary_value, currency, occurred_at, received_at')
    .eq('organization_id', orgId)
    .eq('store_id', store.id)
    .order('received_at', { ascending: false })
    .limit(50);

  // Event counts last 24h grouped by type
  const { data: eventsLast24h } = await admin
    .from('contact_events')
    .select('event_type, event_source, contact_id, anonymous_id')
    .eq('organization_id', orgId)
    .eq('store_id', store.id)
    .gte('received_at', since24h)
    .limit(5000);

  const last24hCount = eventsLast24h?.length || 0;
  const last1hCount = (recentEvents || []).filter(e => e.received_at >= since1h).length;
  const eventsByType: Record<string, number> = {};
  const eventsBySource: Record<string, number> = {};
  let resolvedCount = 0;
  let anonymousCount = 0;
  for (const e of (eventsLast24h || [])) {
    eventsByType[e.event_type] = (eventsByType[e.event_type] || 0) + 1;
    if (e.event_source) eventsBySource[e.event_source] = (eventsBySource[e.event_source] || 0) + 1;
    if (e.contact_id) resolvedCount++; else anonymousCount++;
  }

  // Most recent identified contacts (last 10)
  const { data: recentContacts } = await admin
    .from('contacts')
    .select('id, email, first_name, last_name, total_orders, total_spent, created_at, last_event_at')
    .eq('organization_id', orgId)
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Recent webhook deliveries from Shopify (last 30) — helps diagnose
  // when Shopify IS sending events (e.g. orders/create, checkouts/create)
  // but our handler is silently dropping them. If this list is empty
  // and the storefront has clearly had activity, the problem is at the
  // delivery layer (HMAC mismatch, wrong endpoint URL, etc).
  const { data: recentWebhooks } = await admin
    .from('shopify_webhook_log')
    .select('id, topic, status, shopify_resource_id, received_at, processed_at, error_message, attempts')
    .eq('store_id', store.id)
    .order('received_at', { ascending: false })
    .limit(30);

  // Recent abandoned checkouts saved by the webhook (so the merchant can
  // confirm checkouts/create reached the DB even if no contact_event was
  // produced — that's a different layer of failure).
  const { data: recentCheckouts } = await admin
    .from('shopify_checkouts')
    .select('id, shopify_checkout_id, email, total_price, currency, status, contact_id, created_at, shopify_created_at')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Pixel diagnostic activity — every fetch of /api/pixel/worder-pixel.js
  // is logged in shopify_webhook_audit with topic='pixel.fetched'. If
  // this list is empty for a store the merchant believes has the pixel
  // installed, the sandbox isn't even reaching us (CSP, network block,
  // wrong domain, etc).
  const { data: pixelFetches } = await admin
    .from('shopify_webhook_audit')
    .select('id, shop_domain, topic, status, error_message, received_at')
    .eq('topic', 'pixel.fetched')
    .or(`shop_domain.eq.${store.shop_domain},shop_domain.in.(${(Array.isArray(store.shop_domain_aliases) && store.shop_domain_aliases.length > 0 ? store.shop_domain_aliases : ['__none__']).map((d: string) => `"${d}"`).join(',')})`)
    .order('received_at', { ascending: false })
    .limit(10);

  // Pixel-loaded ping events — fired synchronously by the pixel script
  // right after subscribes are wired. If we see fetches but no
  // pixel_loaded events, the script is being downloaded but failing to
  // execute (JS error, sandbox restriction, etc).
  const { data: pixelLoadedPings } = await admin
    .from('contact_events')
    .select('id, event_type, occurred_at, properties')
    .eq('store_id', store.id)
    .eq('event_type', 'pixel_loaded')
    .order('occurred_at', { ascending: false })
    .limit(5);

  // Storefront tracker fetches — same audit table, topic='tracker.fetched'.
  // Confirms the ScriptTag is being downloaded by real browsers on the
  // storefront (independent of the Custom Pixel sandbox).
  const { data: trackerFetches } = await admin
    .from('shopify_webhook_audit')
    .select('id, topic, status, error_message, received_at')
    .eq('topic', 'tracker.fetched')
    .order('received_at', { ascending: false })
    .limit(5);
  // storefront_tracker events — events with event_source='storefront_tracker'
  // confirm the script not only loaded but successfully POSTed to /api/track.
  const { data: trackerEvents } = await admin
    .from('contact_events')
    .select('id, event_type, occurred_at, properties')
    .eq('store_id', store.id)
    .eq('event_source', 'storefront_tracker')
    .order('occurred_at', { ascending: false })
    .limit(5);

  // Webhooks registered on Shopify
  let webhookCount: number | null = null;
  let webhookList: any[] = [];
  let webhookCheckoutTopicsRegistered = false;
  let webhookUrlMismatchCount = 0;
  // Expect the URL to carry ?store_id=<id> so the handler resolves the
  // store from the URL itself (bulletproof against multi-domain shops).
  // Webhooks registered before this URL pattern shipped show up as
  // "doesn't match expected" — they still work via shop_domain header
  // fallback but should be re-registered via "Reinstalar tudo".
  const expectedWebhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/shopify?store_id=${store.id}`;
  // Old format — what previous installs used. We treat URLs matching
  // this prefix (without store_id) as "ours but stale" so the merchant
  // sees them flagged in the dashboard.
  const legacyWebhookPrefix = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/webhooks/shopify`;
  try {
    const apiVersion = store.api_version || '2026-04';
    const wRes = await fetch(
      `https://${store.shop_domain}/admin/api/${apiVersion}/webhooks.json`,
      { headers: { 'X-Shopify-Access-Token': store.access_token } }
    );
    if (wRes.ok) {
      const json = await wRes.json();
      const all = json.webhooks || [];
      // Only show OUR webhooks (matching our domain prefix), not third-party ones
      const ours = all.filter((w: any) => typeof w.address === 'string' && w.address.startsWith(legacyWebhookPrefix));
      webhookCount = ours.length;
      webhookList = ours.map((w: any) => ({
        topic: w.topic,
        address: w.address,
        matches_expected: w.address === expectedWebhookUrl,
      }));
      webhookCheckoutTopicsRegistered = ours.some((w: any) =>
        (w.topic === 'checkouts/create' || w.topic === 'checkouts/update')
      );
      // Only count OUR webhooks that use the old URL format as mismatches
      webhookUrlMismatchCount = ours.filter((w: any) => w.address !== expectedWebhookUrl).length;
    }
  } catch { /* best-effort */ }

  return NextResponse.json({
    store: {
      id: store.id,
      shop_domain: store.shop_domain,
      shop_name: store.shop_name,
      connection_type: store.connection_type,
      api_version: store.api_version,
    },
    install: {
      pixelInstalled: !!store.pixel_installed,
      embedInstalled: !!store.embed_installed,
      loaderInstalled: !!(store.settings?.script_tag_id),
      scriptTagId: store.settings?.script_tag_id || null,
      webhooksRegistered: webhookCount,
      webhooks: webhookList,
      checkoutTopicsRegistered: webhookCheckoutTopicsRegistered,
      webhookUrlMismatchCount,
      expectedWebhookUrl,
      apiSecretConfigured: !!store.api_secret,
      syncCheckoutsEnabled: store.sync_checkouts !== false,
      scopes: Array.isArray(store.scopes) ? store.scopes : [],
      // Domain aliases — secondary myshopifyDomains under which Shopify
      // may send webhooks (canonical/permanent domain, expansion store
      // subdomains, custom domains added later). Without these stored,
      // webhooks for non-primary domains return 410.
      shopDomainAliases: Array.isArray(store.shop_domain_aliases) ? store.shop_domain_aliases : [],
      trackerInstalled: !!store.settings?.tracker_tag_id,
      trackerTagId: store.settings?.tracker_tag_id || null,
      // Manual install fallback — when auto webPixelCreate fails (the
      // store is on a Custom App without our extension installed), the
      // merchant has to paste this snippet into Shopify Admin → Settings
      // → Customer Events → Add custom pixel. The diagnostic dashboard
      // surfaces it inline when pixelInstalled=false so the merchant
      // doesn't have to dig through the integrations page.
      manualPixelLoaderCode: `!function(t,w,d){var s=d.createElement("script");s.async=!0;s.src="${process.env.NEXT_PUBLIC_APP_URL || ''}/api/pixel/worder-pixel.js?shop="+t.init.data.shop.myshopifyDomain;d.head.append(s);w.__worder_ctx=t}(this,window,document);`,
    },
    counts: {
      last1h: last1hCount,
      last24h: last24hCount,
      resolved: resolvedCount,
      anonymous: anonymousCount,
      byType: eventsByType,
      bySource: eventsBySource,
    },
    identity: {
      totalIdentities: totalIdentities || 0,
      identifiedCount: identifiedCount || 0,
      anonymousCount: (totalIdentities || 0) - (identifiedCount || 0),
      stitchedByFingerprint: stitchedByFingerprint || 0,
    },
    recommendations: {
      totalRecsRows: recsCount || 0,
    },
    trackerDiagnostics: {
      // ScriptTag fetches by real browsers (independent of the Custom Pixel
      // sandbox path — surfaces issues like CSP blocks or wrong store_id).
      fetchCount: (trackerFetches || []).length,
      lastFetchAt: trackerFetches && trackerFetches.length > 0 ? trackerFetches[0].received_at : null,
      // Events with event_source='storefront_tracker' — confirms POST works.
      eventCount: (trackerEvents || []).length,
      lastEventAt: trackerEvents && trackerEvents.length > 0 ? trackerEvents[0].occurred_at : null,
      hint: (trackerFetches || []).length === 0
        ? 'ScriptTag não foi baixado pelo navegador. Confirme que tracker_tag_id existe (rode "Reinstalar tudo") e que o tema não bloqueia <script src> via CSP.'
        : (trackerEvents || []).length === 0
        ? 'Script é baixado mas nenhum evento POSTa em /api/track/event. Pode ser bloqueio do navegador a sendBeacon ou CORS — abra o storefront com ?worder_debug=1 e veja o console.'
        : 'Tracker carrega e envia eventos — fallback storefront 100%.',
    },
    pixelDiagnostics: {
      // Did the sandbox even fetch the pixel JS in the last 30 days?
      fetchCount: (pixelFetches || []).length,
      lastFetchAt: pixelFetches && pixelFetches.length > 0 ? pixelFetches[0].received_at : null,
      lastFetchUserAgent: pixelFetches && pixelFetches.length > 0 ? (pixelFetches[0].error_message || '').split(' | ref=')[0] : null,
      // Did the loaded pixel manage to execute and POST a heartbeat?
      pingCount: (pixelLoadedPings || []).length,
      lastPingAt: pixelLoadedPings && pixelLoadedPings.length > 0 ? pixelLoadedPings[0].occurred_at : null,
      // Diagnosis hint
      hint: (pixelFetches || []).length === 0
        ? 'O sandbox não está nem buscando o script — verifique se o Custom Pixel está com status "Conectado" no Shopify Admin → Customer Events e que a privacidade está como "Não obrigatório".'
        : (pixelLoadedPings || []).length === 0
        ? 'O script é baixado mas não executa o ping inicial — pode ser erro de JS no sandbox, CSP bloqueando fetch ou problema de rede. Veja o painel "Atividade do pixel" abaixo.'
        : 'Pixel carrega e executa. Se eventos comportamentais (page_view, viewed_product) ainda não chegam, o problema está nos subscribers da Shopify.',
    },
    recentEvents: (recentEvents || []).map(e => ({
      id: e.id,
      event_type: e.event_type,
      event_source: e.event_source,
      contact_id: e.contact_id,
      anonymous_id: e.anonymous_id,
      session_id: e.session_id,
      page_url: e.properties?.page_url || e.properties?.url || null,
      product_title: e.properties?.product_title || e.properties?.title || null,
      product_id: e.properties?.product_id || null,
      email: e.properties?.email || null,
      monetary_value: e.monetary_value,
      currency: e.currency,
      occurred_at: e.occurred_at,
      received_at: e.received_at,
    })),
    recentContacts: (recentContacts || []).map(c => ({
      id: c.id,
      email: c.email,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
      total_orders: c.total_orders,
      total_spent: c.total_spent,
      last_event_at: c.last_event_at,
      created_at: c.created_at,
    })),
    recentWebhooks: (recentWebhooks || []).map(w => ({
      id: w.id,
      topic: w.topic,
      status: w.status,
      shopify_resource_id: w.shopify_resource_id,
      received_at: w.received_at,
      processed_at: w.processed_at,
      error_message: w.error_message,
      attempts: w.attempts,
    })),
    recentCheckouts: (recentCheckouts || []).map(c => ({
      id: c.id,
      shopify_checkout_id: c.shopify_checkout_id,
      email: c.email,
      total_price: c.total_price,
      currency: c.currency,
      status: c.status,
      has_contact: !!c.contact_id,
      saved_at: c.created_at,
      shopify_created_at: c.shopify_created_at,
    })),
  });
}
