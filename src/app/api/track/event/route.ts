// =============================================
// Track Event Endpoint
// src/app/api/track/event/route.ts
//
// Receives behavioral events from BOTH:
// - App Embed (theme extension) — has cookies, DOM access
// - Web Pixel (sandbox) — no cookies, limited context
//
// PUBLIC endpoint — no auth required.
// Target: <100ms response time.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { WorderShopifyEventType } from '@/lib/shopify/event-types';
import { EVENT_SOURCES } from '@/lib/shopify/event-types';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeTimezoneInput } from '@/lib/scheduling/timezone';

export const dynamic = 'force-dynamic';

// Map incoming event types to our CDP event types
const EVENT_TYPE_MAP: Record<string, WorderShopifyEventType> = {
  // App Embed events
  active_on_site: 'active_on_site',
  viewed_product: 'viewed_product',
  viewed_collection: 'viewed_collection',
  page_viewed: 'page_viewed',
  page_view: 'page_viewed', // legacy alias from worder-pixel.js v3-

  // Web Pixel events
  added_to_cart: 'added_to_cart',
  removed_from_cart: 'removed_from_cart',
  checkout_started: 'checkout_started',
  checkout_completed: 'checkout_completed',
  submitted_search: 'submitted_search',
  cart_viewed: 'cart_viewed',
  email_captured: 'email_captured' as any,

  // Pixel-only checkout progress events
  checkout_contact_submitted: 'checkout_contact_submitted',
  payment_submitted: 'payment_submitted',

  // Diagnostic ping from the pixel — confirms the script loaded and
  // can POST. Stored as a regular contact_event so the diagnostic
  // dashboard surfaces it without needing a separate table.
  pixel_loaded: 'pixel_loaded' as any,
};

// CORS headers for cross-origin requests from Shopify stores.
// Echoes the request Origin so the browser sends cookies (we use a
// first-party __worder_id cookie set by /api/identity/resolve to
// re-identify visitors across sessions). With a wildcard origin the
// browser silently drops the cookie.
const CORS_HEADERS_BASE = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
};
function corsForRequest(request: NextRequest) {
  const origin = request.headers.get('origin');
  return {
    ...CORS_HEADERS_BASE,
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': origin ? 'true' : 'false',
  };
}
// Simple UA parser for device/browser/os
function parseUserAgent(ua: string | undefined | null) {
  if (!ua) return { device_type: null, browser: null, os: null };

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const device_type = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'other';
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
  else if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Edge/i.test(ua)) browser = 'edge';
  else if (/OPR|Opera/i.test(ua)) browser = 'opera';

  let os = 'other';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac OS/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'linux';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';

  return { device_type, browser, os };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsForRequest(request) });
}

export async function POST(request: NextRequest) {
  const CORS = corsForRequest(request);
  try {
    // ---- Rate limit anti-DoS (pixel público) ----
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`pixel:${ip}`, {
      limit: 300, // 300 eventos/min por IP (permite high-traffic mas bloqueia spam)
      windowSec: 60,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limited', retryAfterSec: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { ...CORS, 'Retry-After': '60' } }
      );
    }

    const body = await request.json();

    const {
      // Identification
      accountId,
      storeId,
      storeDomain,
      visitorId,
      sessionId,
      fingerprint,
      fingerprintHash,
      // Event
      eventType,
      eventId,
      properties,
      // Contact fields (root-level OR nested under customer object)
      email: emailRoot,
      phone: phoneRoot,
      firstName: firstNameRoot,
      lastName: lastNameRoot,
      shopifyCustomerId: shopifyCustomerIdRoot,
      customer,
      // Attribution
      utmParams,
      clickIds,
      // Email attribution from URL params (worderContactID/SendID/CampaignID)
      // — set by the email click redirect at /api/t/c/<sendId>. The pixel
      // captures these on page load, persists 90 days, and echos every
      // event so cross-device clicks land on the right contact.
      attribution,
      // contactId set explicitly by the embed when worderContactID is in
      // the URL. Lets us bind visitor → contact without any email match.
      contactId: contactIdFromBody,
      // Context
      source,
      url,
      referrer,
      userAgent,
      timestamp,
      title,
      // Legacy
      clientId,
      anonymousId,
    } = body;

    // Merge root-level and customer-nested fields (root takes precedence)
    const email = emailRoot || customer?.email || null;
    const phone = phoneRoot || customer?.phone || null;
    const firstName = firstNameRoot || customer?.firstName || null;
    const lastName = lastNameRoot || customer?.lastName || null;
    const shopifyCustomerId = shopifyCustomerIdRoot || customer?.shopifyCustomerId || null;

    // Validate: need at least an event type and a way to resolve the store
    if (!eventType) {
      return NextResponse.json(
        { error: 'Missing eventType' },
        { status: 400, headers: CORS }
      );
    }

    if (!accountId && !storeId && !storeDomain) {
      return NextResponse.json(
        { error: 'Missing store identifier (accountId, storeId, or storeDomain)' },
        { status: 400, headers: CORS }
      );
    }

    const supabase = getSupabaseAdmin();

    // ---- Resolve store ----
    // storeId → storeDomain → accountId (só com uma loja na organização).
    // A ordem antiga tentava accountId antes do domínio e pegava
    // "qualquer loja da organização": eventos da loja B carimbados na
    // loja A. Ver resolveTrackingStore.
    const { resolveTrackingStore } = await import('@/lib/shopify/resolve-store-by-domain');
    const store = await resolveTrackingStore<{ id: string; organization_id: string }>(
      supabase,
      { storeId, storeDomain, accountId },
      'id, organization_id'
    );

    if (!store) {
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404, headers: CORS }
      );
    }

    const organizationId = store.organization_id;
    const resolvedCustomerId = shopifyCustomerId || clientId;

    // ---- Resolve stable identity via the identity graph (NEW) ----
    // Maps any combination of (clientVisitorId, fingerprintHash, UA, IP,
    // email, phone, shopifyCustomerId) to a single worder_visitor_id row
    // in visitor_identities. Survives Safari ITP localStorage wipes by
    // re-matching on fingerprint+UA hash. Falls back gracefully when no
    // fingerprint is present (legacy clients).
    let identityResult: Awaited<ReturnType<typeof import('@/lib/identity/resolver').resolveIdentity>> | null = null;
    try {
      const { resolveIdentity } = await import('@/lib/identity/resolver');
      const { getClientIp: getIp } = await import('@/lib/rate-limit');
      identityResult = await resolveIdentity({
        organizationId,
        storeId: store.id,
        clientVisitorId: visitorId || anonymousId || null,
        fingerprintHash: fingerprintHash || (typeof fingerprint === 'string' ? fingerprint : null),
        userAgent: userAgent || null,
        ip: getIp(request) || null,
        email: email || null,
        phone: phone || null,
        shopifyCustomerId: resolvedCustomerId ? String(resolvedCustomerId) : null,
        source: source === 'shopify_pixel' ? 'pixel' : 'embed',
      });
    } catch (idErr) {
      // Identity resolver failures must NEVER drop events. Log and fall
      // back to the legacy resolution paths below.
      console.error('[Track Event] Identity resolver failed:', idErr);
    }

    // ---- Resolve contact ----
    let contactId: string | null = identityResult?.contactId || null;

    // Direct contactId binding from email-click attribution. Highest
    // priority because it's the strongest signal we have: the visitor
    // clicked a tracked email link addressed to this exact contact.
    // Verifies the contact actually belongs to this org so a tampered
    // URL can't bind to a foreign contact.
    const directContactId = contactIdFromBody || attribution?.contactId || null;
    if (!contactId && directContactId) {
      const { data: verifyContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', directContactId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (verifyContact?.id) {
        contactId = verifyContact.id;
      }
    }

    if (email && !contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('email', email)
        .maybeSingle();
      contactId = contact?.id || null;

      // When we identify a contact by email (e.g. from checkout), retroactively
      // link ALL prior anonymous events from this visitor to the contact.
      // This bridges the gap between Web Pixel (sandbox) and Theme Extension
      // (main page) which have different visitorIds.
      if (contactId) {
        const visitorAnonId = anonymousId || visitorId;
        if (visitorAnonId) {
          supabase.from('contact_events')
            .update({ contact_id: contactId })
            .is('contact_id', null)
            .eq('anonymous_id', visitorAnonId)
            .then(() => {}, () => {});
        }
        if (sessionId && sessionId !== visitorAnonId) {
          supabase.from('contact_events')
            .update({ contact_id: contactId })
            .is('contact_id', null)
            .eq('session_id', sessionId)
            .then(() => {}, () => {});
        }
      }
    }

    if (!contactId && resolvedCustomerId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('shopify_customer_id', String(resolvedCustomerId))
        .maybeSingle();
      contactId = contact?.id || null;
    }

    // Returning-visitor re-identification:
    // A visitor we've identified before will have prior events with the same
    // anonymous_id (visitorId) that are linked to a contact. Look that up so
    // a new "added_to_cart" from the same browser attaches to the known contact.
    const visitorAnonId = anonymousId || visitorId;
    if (!contactId && visitorAnonId) {
      const { data: prior } = await supabase
        .from('contact_events')
        .select('contact_id')
        .eq('organization_id', organizationId)
        .eq('anonymous_id', visitorAnonId)
        .not('contact_id', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      contactId = (prior as any)?.contact_id || null;
    }

    // Secondary fallback: match by session_id when visitor cookie changed
    if (!contactId && sessionId) {
      const { data: prior } = await supabase
        .from('contact_events')
        .select('contact_id')
        .eq('organization_id', organizationId)
        .eq('session_id', sessionId)
        .not('contact_id', 'is', null)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      contactId = (prior as any)?.contact_id || null;
    }

    // ---- Map event type ----
    const mappedEventType = EVENT_TYPE_MAP[eventType] || eventType;

    // ---- Determine source ----
    const eventSource = source === 'shopify_pixel'
      ? EVENT_SOURCES.WORDER_PIXEL
      : source === 'app_embed'
        ? EVENT_SOURCES.APP_EMBED
        : EVENT_SOURCES.WORDER_PIXEL;

    // ---- Enrich properties ----
    // Top-level convenience fields PLUS the same set under `raw` so the
    // flow builder can reach the full payload via {{ trigger.raw.<path> }}
    // — same pattern as the webhook events for consistency.
    const acceptLanguage = request.headers.get('accept-language');
    const browserLang = (() => {
      if (!acceptLanguage) return null;
      const first = acceptLanguage.split(',')[0];
      return first ? first.split('-')[0].toLowerCase() : null;
    })();

    const enrichedProperties: Record<string, any> = {
      ...properties,
      url: url || properties?.url,
      referrer: referrer || properties?.referrer,
      title: title || properties?.title,
      user_agent: userAgent,
      // Klaviyo/Omnisend-style top-level context fields. Auto-discovered
      // by the variable picker so {{ trigger.device }}, {{ trigger.os }},
      // {{ trigger.country }} all resolve in flow templates.
      device: null as string | null,    // filled below from UA
      browser: null as string | null,
      os: null as string | null,
      language: browserLang,
      sessionId: sessionId || null,
      visitorId: visitorId || null,
      _original_event_type: eventType,
    };

    // Attach contact info if provided
    if (firstName) enrichedProperties._first_name = firstName;
    if (lastName) enrichedProperties._last_name = lastName;
    if (phone) enrichedProperties._phone = phone;
    if (fingerprint) enrichedProperties._fingerprint = fingerprint;

    // Attach UTM params
    if (utmParams && typeof utmParams === 'object') {
      enrichedProperties._utm = utmParams;
    }

    // Attach click IDs (gclid, fbclid, etc.)
    if (clickIds && typeof clickIds === 'object') {
      enrichedProperties._click_ids = clickIds;
    }

    // ---- Extract monetary value ----
    let monetaryValue: number | null = null;
    if (properties?.$value != null) {
      monetaryValue = parseFloat(properties.$value);
    } else if (properties?.total_price != null) {
      monetaryValue = parseFloat(properties.total_price);
    } else if (properties?.Price != null) {
      const qty = properties?.Quantity || 1;
      monetaryValue = parseFloat(properties.Price) * qty;
    }

    const currency = properties?.Currency || properties?.currency || 'BRL';

    // ---- Build idempotency key ----
    let idempotencyKey: string | null = null;
    if (eventId) {
      idempotencyKey = eventId;
    } else {
      const resourceId = properties?.shopify_resource_id
        || properties?.product_id
        || properties?.order_id
        || properties?.checkout_id;
      if (resourceId) {
        idempotencyKey = `${eventType}:${resourceId}:${sessionId || visitorId || anonymousId || ''}`;
      } else if (sessionId || anonymousId) {
        idempotencyKey = `${source || 'pixel'}:${sessionId || anonymousId}:${eventType}:${timestamp || Date.now()}`;
      }
    }

    // ---- Deduplication check ----
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('contact_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, deduplicated: true }, { status: 200, headers: CORS });
      }
    }

    // ---- Parse UA ----
    const { device_type, browser, os } = parseUserAgent(userAgent);
    // Backfill top-level device fields on enriched properties so the
    // variable picker can surface them as {{ trigger.device }} etc.
    enrichedProperties.device = device_type;
    enrichedProperties.browser = browser;
    enrichedProperties.os = os;

    // ---- Enrich checkout/cart/product events from local DB caches ----
    // Pixel events arrive flat (just title, price, product_id). Webhook
    // events ship a rich raw payload with nested customer + line_items[].
    // To make pixel events feel as rich as Omnisend (so flow templates
    // resolve {{ trigger.raw.line_items[0].product.tags }} the same way
    // regardless of source), we enrich line items from shopify_products
    // and customer info from contacts. Best-effort, never blocks insert.
    try {
      const { enrichShopifyEvent } = await import('@/lib/cdp/enrich-shopify-event');
      // shopDomain for product_url construction
      let shopDomain: string | null = null;
      try {
        const { data: storeRow } = await supabase
          .from('shopify_stores')
          .select('shop_domain')
          .eq('id', store.id)
          .maybeSingle();
        shopDomain = storeRow?.shop_domain || null;
      } catch { /* best-effort */ }
      const enrichedFull = await enrichShopifyEvent(mappedEventType, enrichedProperties, {
        supabase,
        storeId: store.id,
        organizationId,
        shopDomain,
        contactId: contactId || null,
        email: email || null,
        sessionId: sessionId || null,
        visitorId: visitorId || null,
        anonymousId: anonymousId || null,
      });
      // Merge enrichment back — preserves anything the caller already set.
      Object.assign(enrichedProperties, enrichedFull);
    } catch (enrichErr) {
      console.warn('[track/event] enrichment failed (non-fatal):', enrichErr);
    }

    // ---- Normalize to canonical Worder schema ----
    // Every event in the system flows through this — Shopify pixel,
    // storefront tracker, future Yampi/WooCommerce handlers all converge
    // on the same WorderCanonicalEvent shape. Templates reference stable
    // names ({{ CheckoutURL }}, {{ Items[0].ProductName }}, etc.) that
    // never change regardless of source. Original payload is preserved
    // on `raw` so power-user templates can still drill in.
    try {
      const { normalizeToCanonical } = await import('@/lib/cdp/normalize-to-canonical');
      const canonical = normalizeToCanonical(enrichedProperties, {
        source: eventSource,
        storeDomain: storeDomain || null,
        rawEventType: eventType,
      });
      // Stamp the canonical fields onto the properties at the top level
      // so {{ trigger.CheckoutURL }} resolves directly without traversing
      // raw.* — the canonical layer is the contract.
      Object.assign(enrichedProperties, canonical);
    } catch (canonErr) {
      console.warn('[track/event] canonical normalization failed (non-fatal):', canonErr);
    }

    // ---- Insert event ----
    const now = new Date().toISOString();
    // Prefer the canonical worder_visitor_id from the identity graph when
    // available — this is the stable ID across Safari ITP wipes / device
    // changes. Fall back to whatever the client sent for legacy paths.
    const canonicalAnonId = identityResult?.worderVisitorId
      || visitorId
      || anonymousId
      || sessionId;
    const eventData: Record<string, any> = {
      organization_id: organizationId,
      contact_id: contactId,
      store_id: store.id,
      event_type: mappedEventType,
      event_source: eventSource,
      properties: enrichedProperties,
      monetary_value: monetaryValue,
      currency,
      session_id: sessionId || null,
      anonymous_id: !contactId ? canonicalAnonId : null,
      occurred_at: timestamp || now,
      received_at: now,
      idempotency_key: idempotencyKey,
    };
    if (identityResult?.identityId) {
      enrichedProperties._identity_id = identityResult.identityId;
      enrichedProperties._identity_match_source = identityResult.matchSource;
      if (identityResult.stitched) enrichedProperties._identity_stitched = true;
    }

    // Add optional shopify resource fields if present
    if (properties?.shopify_resource_id) {
      eventData.shopify_resource_id = properties.shopify_resource_id;
    }
    if (properties?.shopify_resource_type) {
      eventData.shopify_resource_type = properties.shopify_resource_type;
    }

    await supabase.from('contact_events').insert(eventData);

    // ---- Link contact to identity row when newly resolved (NEW) ----
    // If we just resolved a contact_id for an identity that didn't have
    // one before, persist the link AND backfill historic anonymous events
    // under any of this identity's aliases.
    if (contactId && identityResult && !identityResult.contactId) {
      try {
        const { linkContactToIdentity } = await import('@/lib/identity/resolver');
        await linkContactToIdentity(identityResult.identityId, contactId, organizationId);
      } catch (linkErr) {
        console.error('[Track Event] Identity link failed:', linkErr);
      }
    }

    // ---- Attribution touchpoints (first/last touch) ----
    // Broader cascade than just gclid/fbclid/ttclid — any paid-traffic
    // signal counts as a touchpoint. The dedicated columns still only
    // store the big three (others ride along in event properties._click_ids
    // so they aren't lost). Adapted from AdTracked.
    const hasUtm = utmParams && (utmParams.utm_source || utmParams.utm_medium || utmParams.utm_campaign);
    const hasClickIds = clickIds && (
      clickIds.gclid || clickIds.fbclid || clickIds.ttclid ||
      clickIds.gbraid || clickIds.wbraid || clickIds.dclid ||
      clickIds.msclkid || clickIds.li_fat_id || clickIds.twclid ||
      clickIds.sccid || clickIds._kx
    );
    // Email attribution counts as a touchpoint even without utm params
    // — the worderContactID alone (which the click redirect stamps)
    // means this visit came from a Worder email and should anchor
    // last-touch attribution to that send/campaign.
    const hasEmailAttribution = attribution && (attribution.sendId || attribution.campaignId);
    if (hasUtm || hasClickIds || hasEmailAttribution) {
      const touchpointBase = {
        organization_id: organizationId,
        contact_id: contactId || null,
        visitor_id: visitorId || anonymousId || null,
        session_id: sessionId || null,
        utm_source: utmParams?.utm_source || (hasEmailAttribution ? 'worder' : null),
        utm_medium: utmParams?.utm_medium || (hasEmailAttribution ? 'email' : null),
        utm_campaign: utmParams?.utm_campaign || attribution?.campaignId || null,
        utm_term: utmParams?.utm_term || null,
        utm_content: utmParams?.utm_content || attribution?.sendId || null,
        gclid: clickIds?.gclid || null,
        fbclid: clickIds?.fbclid || null,
        ttclid: clickIds?.ttclid || null,
        occurred_at: timestamp || now,
      };

      // First touch: só grava se não existe nenhum pra este visitor/contact
      const existingKey = contactId || visitorId || anonymousId;
      if (existingKey) {
        const idField = contactId ? 'contact_id' : 'visitor_id';
        const { data: existing } = await supabase
          .from('attribution_touchpoints')
          .select('id')
          .eq(idField, existingKey)
          .eq('touchpoint_type', 'first')
          .maybeSingle();

        if (!existing) {
          supabase.from('attribution_touchpoints').insert({
            ...touchpointBase,
            touchpoint_type: 'first',
          }).then(() => {});
        }
      }

      // Last touch: sempre upsert (último click antes de conversão)
      supabase.from('attribution_touchpoints').insert({
        ...touchpointBase,
        touchpoint_type: 'last',
        // Se é checkout_completed/purchase, vincula revenue
        ...(monetaryValue && ['checkout_completed', 'purchase'].includes(mappedEventType)
          ? { revenue: monetaryValue, currency, order_id: properties?.order_id || null }
          : {}),
      }).then(() => {});
    }

    // ---- Disparar automações baseadas no tipo de evento (fire-and-forget) ----
    // Mapeia event types do pixel para trigger_types de automação
    const triggerMap: Record<string, string> = {
      viewed_product: 'trigger_viewed_product',
      viewed_collection: 'trigger_viewed_collection',
      page_viewed: 'trigger_viewed_page',
      added_to_cart: 'trigger_added_to_cart',
      checkout_started: 'trigger_checkout_abandoned',
      checkout_completed: 'trigger_order',
      active_on_site: 'trigger_active_on_site',
    };
    const triggerType = triggerMap[mappedEventType];
    if (triggerType && contactId) {
      // Normalize pixel lineItems to Items format for consistency with webhook triggers
      const pixelLineItems = enrichedProperties.lineItems || enrichedProperties.line_items || [];
      const normalizedItems = Array.isArray(pixelLineItems) ? pixelLineItems.map((it: any) => ({
        ProductID: it.productId || it.product_id ? String(it.productId || it.product_id) : undefined,
        ProductName: it.title || it.name || '',
        Quantity: it.quantity || 1,
        ItemPrice: it.price || parseFloat(it.lineTotal || '0') / (it.quantity || 1),
        RowTotal: it.lineTotal || (it.price * (it.quantity || 1)),
        CompareAtPrice: it.compareAtPrice || it.compare_at_price || null,
        ImageURL: it.imageUrl || it.image_url || '',
        ProductURL: it.productUrl || it.product_url || '',
        SKU: it.sku || '',
        VariantName: it.variantTitle || it.variant_title || '',
        VariantID: it.variantId || it.variant_id ? String(it.variantId || it.variant_id) : undefined,
        Brand: it.vendor || it.brand || '',
      })) : [];

      // Cart-style triggers wait before considering it abandoned, just
      // like the Shopify checkouts/create path. Other triggers (viewed
      // product, active on site) fire immediately.
      const cartLikeTrigger =
        triggerType === 'trigger_added_to_cart' || triggerType === 'trigger_checkout_abandoned';
      // Defaults: cart-add 60 min (Omnisend default), checkout-abandoned
      // 5 min — both overridable per-automation via
      // trigger_config.abandonTime. Lowered checkout from 30 to 5 to
      // match the Shopify webhook default.
      let pixelDelayMinutes: number | undefined;
      if (cartLikeTrigger) {
        const triggerDefault = triggerType === 'trigger_added_to_cart' ? 60 : 5;
        try {
          const { supabaseAdmin } = await import('@/lib/supabase-admin');
          const { data: autos } = await supabaseAdmin
            .from('automations')
            .select('trigger_config')
            .eq('organization_id', organizationId)
            .eq('trigger_type', triggerType)
            .eq('status', 'active')
            .limit(1);
          const cfg: any = (autos as any[])?.[0]?.trigger_config || {};
          pixelDelayMinutes = cfg.abandonUnit === 'hours'
            ? (cfg.abandonTime || 1) * 60
            : (cfg.abandonTime || triggerDefault);
        } catch { pixelDelayMinutes = triggerDefault; }
      }

      // Idempotency: for cart/checkout-abandoned triggers we MUST use a
      // resource-only key (no sessionId/visitorId in it) so pixel +
      // Shopify webhook converge on the same dedup. Without this, one
      // checkout could spawn two runs — one via pixel, one via webhook
      // — because their per-source idempotency suffixes never match.
      const checkoutId =
        enrichedProperties.checkoutId ||
        enrichedProperties.checkout_id ||
        enrichedProperties.CheckoutId ||
        enrichedProperties.checkout_token ||
        enrichedProperties.cart_token;
      const productId =
        enrichedProperties.product_id || enrichedProperties.productId;
      let triggerIdempotencyKey: string | undefined;
      if (triggerType === 'trigger_checkout_abandoned' && checkoutId) {
        triggerIdempotencyKey = `trigger:checkout_abandoned:${checkoutId}`;
      } else if (triggerType === 'trigger_added_to_cart' && checkoutId) {
        triggerIdempotencyKey = `trigger:added_to_cart:${checkoutId}`;
      } else if (triggerType === 'trigger_viewed_product' && productId && contactId) {
        triggerIdempotencyKey = `trigger:viewed_product:${contactId}:${productId}`;
      } else if (triggerType === 'trigger_viewed_collection' && contactId) {
        // Collection page: dedupe per (contact, collection_handle, day) so
        // browsing 5 products in the same collection only fires once a day.
        const collectionHandle =
          enrichedProperties.collection_handle ||
          enrichedProperties.collectionHandle ||
          enrichedProperties.collection_id ||
          'unknown';
        const dayBucket = new Date().toISOString().slice(0, 10);
        triggerIdempotencyKey = `trigger:viewed_collection:${contactId}:${collectionHandle}:${dayBucket}`;
      } else if (triggerType === 'trigger_viewed_page' && contactId) {
        // Page view triggers are noisy by design — Klaviyo's equivalent
        // dedupes per (contact, url, day) to keep flow re-entry sane.
        const pageUrl = enrichedProperties.page_url || enrichedProperties.url || 'unknown';
        const dayBucket = new Date().toISOString().slice(0, 10);
        triggerIdempotencyKey = `trigger:viewed_page:${contactId}:${pageUrl}:${dayBucket}`;
      } else if (triggerType === 'trigger_order') {
        // Mesma chave do webhook Shopify (`trigger:placed_order:<id>`) e do
        // EventBus: o pedido chega por três caminhos e só o primeiro cria
        // run — antes o contato entrava três vezes no mesmo fluxo.
        const pixelOrderId =
          enrichedProperties.order_id ||
          enrichedProperties.orderId ||
          enrichedProperties.checkout_id ||
          enrichedProperties.checkoutId;
        if (pixelOrderId) {
          triggerIdempotencyKey = `trigger:placed_order:${pixelOrderId}`;
        }
      } else if (triggerType === 'trigger_active_on_site' && contactId) {
        // Klaviyo Active on Site: 1x per session per contact. Without
        // session-level dedup the same browsing session re-triggers on
        // every page navigation; with ${timestamp} in the key (the old
        // behaviour) every page view was a fresh "active" event and the
        // flow re-entered the contact dozens of times per visit.
        const sid = sessionId || anonymousId || visitorId || 'no-session';
        triggerIdempotencyKey = `trigger:active_on_site:${contactId}:${sid}`;
      } else if (idempotencyKey) {
        triggerIdempotencyKey = `trigger:${triggerType}:${idempotencyKey}`;
      }

      import('@/lib/automation/trigger-dispatcher').then(({ dispatchTrigger }) =>
        dispatchTrigger({
          organizationId,
          // Store-scope pixel-driven triggers so a shared (org-level) contact
          // isn't enrolled into another store's funnels (cross-store leak).
          storeId: store.id,
          triggerType,
          contactId,
          ...(pixelDelayMinutes ? { delayMinutes: pixelDelayMinutes } : {}),
          triggerData: {
            event_type: mappedEventType,
            product_id: productId,
            product_name: enrichedProperties.product_name || enrichedProperties.title,
            monetary_value: monetaryValue,
            Value: monetaryValue || enrichedProperties.totalPrice || enrichedProperties.$value,
            Currency: enrichedProperties.currency || enrichedProperties.lineCurrency || '',
            ItemCount: normalizedItems.length || enrichedProperties.itemCount || 0,
            Items: normalizedItems.length > 0 ? normalizedItems : undefined,
            ItemNames: normalizedItems.map((it: any) => it.ProductName).filter(Boolean),
            CheckoutURL: enrichedProperties.checkoutUrl || enrichedProperties.checkout_url || '',
            SubtotalPrice: enrichedProperties.subtotalPrice || 0,
            TotalDiscounts: enrichedProperties.totalDiscounts || 0,
            DiscountCodes: enrichedProperties.discountCodes || [],
            CustomerEmail: email || undefined,
            CheckoutId: checkoutId || undefined,
            properties: enrichedProperties,
          },
          idempotencyKey: triggerIdempotencyKey,
        }).catch(() => { /* silent */ })
      ).catch(() => { /* silent */ });
    }

    // ---- Update contact (fire-and-forget for speed) ----
    if (contactId) {
      const contactUpdate: Record<string, any> = {
        last_active_at: now,
        last_event_type: mappedEventType,
      };

      // UA-derived fields
      if (device_type) contactUpdate.device_type = device_type;
      if (browser) contactUpdate.browser = browser;
      if (os) contactUpdate.os = os;

      // Fuso do próprio navegador do contato — a informação mais
      // confiável que existe para "que horas são para ele". O pixel já
      // calculava isso, mas só jogava dentro do hash de fingerprint;
      // agora vira o dado que a campanha e o delay usam. Sobrescreve o
      // palpite por país, nunca o contrário (o país só preenche quando
      // timezone está vazio).
      const tzInformado = normalizeTimezoneInput(
        (body as any)?.tz ?? (body as any)?.timezone ?? (body as any)?.properties?.tz
      );
      if (tzInformado) {
        contactUpdate.timezone = tzInformado;
        contactUpdate.timezone_source = 'browser';
      }

      // UTM attribution
      if (utmParams) {
        if (utmParams.utm_source) contactUpdate.utm_source = utmParams.utm_source;
        if (utmParams.utm_medium) contactUpdate.utm_medium = utmParams.utm_medium;
        if (utmParams.utm_campaign) contactUpdate.utm_campaign = utmParams.utm_campaign;
      }

      // Update contact fields + increment total_events via RPC or plain update
      // We do the update and then a separate increment to keep it simple
      supabase
        .from('contacts')
        .update(contactUpdate)
        .eq('id', contactId)
        .then(() => {
          // Increment total_events
          supabase.rpc('increment_contact_events', { contact_id_input: contactId }).then(() => {});
        });
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  } catch (error: any) {
    console.error('[Track Event] Error:', error?.message || error);
    // Always return 200 to not break pixel/embed
    return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
  }
}
