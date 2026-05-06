// =============================================================
// GET /api/pixel/worder-pixel.js?shop={domain}
//
// Serves the Worder tracking pixel as an external JS file. Loaded
// inside Shopify's Custom Pixel sandbox via a 3-line loader pasted
// at Shopify Admin → Customer Events.
//
// CRITICAL: analytics.subscribe(...) calls MUST be synchronous at the
// top level. Shopify's pixel sandbox registers your subscribers when
// the script first runs synchronously; any subscribe scheduled after
// an `await` arrives too late and either misses early events or fails
// to register at all. Async work (identity resolve, localStorage
// restore) runs in parallel after subscribers are wired.
//
// Loader to paste in Shopify Custom Pixel:
//   !function(t,w,d){var s=d.createElement("script");
//   s.async=!0;s.src="https://app.worder.com.br/api/pixel/worder-pixel.js?shop="+t.init.data.shop.myshopifyDomain;
//   d.head.append(s);w.__worder_ctx=t}(this,window,document);
// =============================================================

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop') || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br';
  const trackEndpoint = `${appUrl}/api/track/event`;
  const identityEndpoint = `${appUrl}/api/identity/resolve`;

  const js = `// Worder Tracking Pixel v4 — sync subscribe + async identity
// Shop: ${shop}
(function(){
var ctx = window.__worder_ctx;
if (!ctx) { try { console.warn('[Worder] No pixel context. Loader did not run first.'); } catch(_){} return; }
var analytics = ctx.analytics;
var browser = ctx.browser;
var init = ctx.init;

var TRACK = '${trackEndpoint}';
var RESOLVE = '${identityEndpoint}';
var SHOP = '${shop}' || (init && init.data && init.data.shop && init.data.shop.myshopifyDomain) || '';

// =============================================
// Mutable identity state — populated asynchronously after subscribes
// register. First few events may fire before identity is restored;
// that's fine because the server-side resolver will stitch them by
// fingerprint+UA+IP fallback. Once identityResolved=true, the canonical
// worder_visitor_id is attached on every subsequent event.
// =============================================
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
var sessionId = uuid();
var clientVisitorId = uuid();
var worderVisitorId = null;
var knownEmail = null;
var knownPhone = null;
var fingerprintHash = null;
var identityResolved = false;

// =============================================
// Send event to /api/track/event. Best-effort: never throws, never
// blocks navigation. Browser uses keepalive so the request survives
// page unload (e.g. checkout_completed firing on order-thank-you redirect).
// =============================================
function send(eventType, data, ectx) {
  try {
    var d = data || {};
    if (d.email && d.email !== knownEmail) {
      knownEmail = d.email;
      try { browser.localStorage.setItem('_worder_email', d.email); } catch(_){}
    }
    if (d.phone && d.phone !== knownPhone) {
      knownPhone = d.phone;
      try { browser.localStorage.setItem('_worder_phone', d.phone); } catch(_){}
    }
    var enriched = Object.assign({}, d);
    if (knownEmail && !enriched.email) enriched.email = knownEmail;
    if (knownPhone && !enriched.phone) enriched.phone = knownPhone;

    var payload = {
      eventType: eventType,
      event_type: eventType,
      storeDomain: SHOP,
      shop_domain: SHOP,
      visitorId: worderVisitorId || clientVisitorId,
      visitor_id: worderVisitorId || clientVisitorId,
      sessionId: sessionId,
      session_id: sessionId,
      fingerprintHash: fingerprintHash,
      properties: enriched,
      data: enriched,
      page_url: (ectx && ectx.document && ectx.document.location && ectx.document.location.href) || '',
      page_title: (ectx && ectx.document && ectx.document.title) || '',
      referrer: (ectx && ectx.document && ectx.document.referrer) || '',
      timestamp: new Date().toISOString(),
      email: knownEmail || undefined,
      phone: knownPhone || undefined,
      source: 'shopify_pixel',
    };

    fetch(TRACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'include',
    }).catch(function(){});
  } catch(_) { /* never throw from a subscriber */ }
}

// =============================================
// Synchronous event subscriptions — register IMMEDIATELY at script
// load. Must come before any await. References mutable identity vars
// declared above; those vars get filled in by the async restore that
// follows, but events fired before restore still ship (just without
// the cached identity, which the server-side resolver fills in).
// =============================================

analytics.subscribe('page_viewed', function(e) {
  var ectx = e && e.context || {};
  send('page_view', {
    url: ectx.document && ectx.document.location ? ectx.document.location.href : '',
    title: ectx.document ? ectx.document.title : '',
    referrer: ectx.document ? ectx.document.referrer : '',
  }, ectx);
});

analytics.subscribe('product_viewed', function(e) {
  try {
    var v = e && e.data && e.data.productVariant;
    if (!v) return;
    send('viewed_product', {
      product_id: v.product && v.product.id,
      product_title: (v.product && v.product.title) || v.title,
      product_url: v.product && v.product.url,
      product_type: v.product && v.product.type,
      product_vendor: v.product && v.product.vendor,
      price: v.price && v.price.amount,
      currency: v.price && v.price.currencyCode,
      variant_id: v.id,
      variant_title: v.title,
      image_url: v.image ? v.image.src : null,
      sku: v.sku,
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('collection_viewed', function(e) {
  try {
    var c = e && e.data && e.data.collection;
    if (!c) return;
    send('viewed_collection', { collection_id: c.id, collection_title: c.title }, e.context);
  } catch(_) {}
});

analytics.subscribe('search_submitted', function(e) {
  try {
    var sr = e && e.data && e.data.searchResult;
    if (!sr) return;
    send('submitted_search', {
      query: sr.query,
      results_count: sr.productVariants ? sr.productVariants.length : 0,
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('product_added_to_cart', function(e) {
  try {
    var cl = e && e.data && e.data.cartLine;
    if (!cl) return;
    var m = cl.merchandise || {};
    send('added_to_cart', {
      product_id: m.product && m.product.id,
      product_title: (m.product && m.product.title) || m.title,
      variant_id: m.id,
      variant_title: m.title,
      price: cl.cost && cl.cost.totalAmount && cl.cost.totalAmount.amount,
      currency: cl.cost && cl.cost.totalAmount && cl.cost.totalAmount.currencyCode,
      quantity: cl.quantity || 1,
      sku: m.sku,
      image_url: m.image ? m.image.src : null,
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('cart_viewed', function(e) {
  try {
    var c = e && e.data && e.data.cart;
    if (!c) return;
    send('cart_viewed', {
      total_price: c.cost && c.cost.totalAmount ? c.cost.totalAmount.amount : null,
      currency: c.cost && c.cost.totalAmount ? c.cost.totalAmount.currencyCode : null,
      item_count: (c.lines || []).length,
      items: (c.lines || []).map(function(l) {
        var m = l.merchandise || {};
        return {
          product_id: m.product && m.product.id,
          title: m.product && m.product.title,
          variant_id: m.id,
          price: m.price && m.price.amount,
          quantity: l.quantity || 1,
        };
      }),
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('checkout_started', function(e) {
  try {
    var co = e && e.data && e.data.checkout;
    if (!co) return;
    send('checkout_started', {
      checkout_id: co.token,
      total_price: co.totalPrice && co.totalPrice.amount,
      subtotal_price: co.subtotalPrice && co.subtotalPrice.amount,
      currency: co.currencyCode,
      item_count: (co.lineItems || []).length,
      items: (co.lineItems || []).map(function(i) {
        return {
          product_id: i.variant && i.variant.product && i.variant.product.id,
          title: i.title,
          quantity: i.quantity,
          price: i.variant && i.variant.price && i.variant.price.amount,
          variant_title: i.variant && i.variant.title,
          sku: i.variant && i.variant.sku,
        };
      }),
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('checkout_contact_info_submitted', function(e) {
  try {
    var co = e && e.data && e.data.checkout;
    if (!co) return;
    send('email_captured', {
      email: co.email,
      phone: co.phone,
      checkout_id: co.token,
      total_price: co.totalPrice && co.totalPrice.amount,
      currency: co.currencyCode,
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('payment_info_submitted', function(e) {
  try {
    var co = e && e.data && e.data.checkout;
    if (!co) return;
    send('payment_submitted', {
      checkout_id: co.token,
      total_price: co.totalPrice && co.totalPrice.amount,
      currency: co.currencyCode,
    }, e.context);
  } catch(_) {}
});

analytics.subscribe('checkout_completed', function(e) {
  try {
    var co = e && e.data && e.data.checkout;
    if (!co) return;
    send('checkout_completed', {
      checkout_id: co.token,
      order_id: co.order ? co.order.id : null,
      email: co.email,
      phone: co.phone,
      total_price: co.totalPrice && co.totalPrice.amount,
      subtotal_price: co.subtotalPrice && co.subtotalPrice.amount,
      currency: co.currencyCode,
      item_count: (co.lineItems || []).length,
    }, e.context);
  } catch(_) {}
});

// Optional: bridge from popup runtime (custom event published on the
// merchant page). Subscribed defensively; not all sandboxes accept
// custom events. We don't want a single subscribe failure to break
// the rest, so this is wrapped.
try {
  analytics.subscribe('worder_identified', function(e) {
    try {
      var d = (e && (e.customData || e.data)) || {};
      if (d.email && d.email !== knownEmail) {
        knownEmail = d.email;
        try { browser.localStorage.setItem('_worder_email', d.email); } catch(_){}
        // re-resolve so the server attaches contact_id to our identity row
        identityResolved = false;
        resolveIdentity();
      }
      if (d.phone && d.phone !== knownPhone) {
        knownPhone = d.phone;
        try { browser.localStorage.setItem('_worder_phone', d.phone); } catch(_){}
      }
    } catch(_) {}
  });
} catch(_) {}

// =============================================
// Active-on-Site (heartbeat-style — fires once every 30 min for
// identified visitors). Registered as a second page_viewed subscriber
// so it doesn't compete with the primary tracking call.
// =============================================
analytics.subscribe('page_viewed', function(e) {
  if (!knownEmail) return;
  try {
    browser.localStorage.getItem('_worder_active_session').then(function(last) {
      var now = Date.now();
      if (last && (now - parseInt(last, 10) < 30 * 60 * 1000)) return;
      browser.localStorage.setItem('_worder_active_session', String(now));
      send('active_on_site', {
        url: e.context && e.context.document && e.context.document.location ? e.context.document.location.href : '',
        referrer: e.context && e.context.document ? e.context.document.referrer : '',
        session_start: new Date().toISOString(),
      }, e.context);
    }).catch(function(){});
  } catch(_) {}
});

// =============================================
// ASYNC IDENTITY RESTORE
// Runs after subscribes are wired. Restores cached IDs from
// localStorage and calls /api/identity/resolve to get the canonical
// worder_visitor_id. Any events that fired before this completes ship
// without the canonical ID; the server resolves them by fingerprint.
// =============================================
function generateFingerprint() {
  try {
    var ectx = init && init.context;
    var win = ectx && ectx.window;
    if (!win) return null;
    var nav = win.navigator || {};
    var scr = win.screen || {};
    var parts = [
      String(nav.userAgent || ''),
      String((nav.languages || [nav.language || '']).join(',')),
      String(new Date().getTimezoneOffset()),
      String(scr.width || ''),
      String(scr.height || ''),
      String(scr.colorDepth || ''),
      String(nav.hardwareConcurrency || ''),
      String(nav.deviceMemory || ''),
      String(nav.platform || ''),
    ];
    var s = parts.join('|');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  } catch(_) { return null; }
}

function resolveIdentity() {
  if (identityResolved) return;
  var customerId = null;
  try {
    var c = init && init.data && init.data.customer;
    customerId = c && c.id ? String(c.id) : null;
  } catch(_) {}
  fetch(RESOLVE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeDomain: SHOP,
      clientVisitorId: clientVisitorId,
      fingerprintHash: fingerprintHash,
      email: knownEmail,
      phone: knownPhone,
      shopifyCustomerId: customerId,
      source: 'pixel',
    }),
    credentials: 'include',
    keepalive: true,
  }).then(function(r) {
    return r && r.ok ? r.json() : null;
  }).then(function(j) {
    if (j && j.worderVisitorId) {
      worderVisitorId = j.worderVisitorId;
      try { browser.localStorage.setItem('_worder_canonical', worderVisitorId); } catch(_){}
    }
    identityResolved = true;
  }).catch(function(){ identityResolved = true; });
}

// Kick off identity restore. Fire-and-forget — does not block the
// subscribe registration above.
(async function restoreAndResolve(){
  try {
    fingerprintHash = generateFingerprint();
  } catch(_) {}
  try {
    var v = await browser.localStorage.getItem('_worder_vid');
    if (v) clientVisitorId = v;
    else await browser.localStorage.setItem('_worder_vid', clientVisitorId);
  } catch(_) {}
  try {
    var wv = await browser.localStorage.getItem('_worder_canonical');
    if (wv) worderVisitorId = wv;
  } catch(_) {}
  try {
    var s = await browser.sessionStorage.getItem('_worder_sid');
    if (s) sessionId = s;
    else await browser.sessionStorage.setItem('_worder_sid', sessionId);
  } catch(_) {}
  try {
    var em = await browser.localStorage.getItem('_worder_email'); if (em) knownEmail = em;
  } catch(_) {}
  try {
    var ph = await browser.localStorage.getItem('_worder_phone'); if (ph) knownPhone = ph;
  } catch(_) {}
  // Cart attribute identity bridge (popup → pixel)
  try {
    var cart = init && init.data && init.data.cart;
    if (cart && cart.attributes) {
      for (var i = 0; i < cart.attributes.length; i++) {
        var a = cart.attributes[i];
        if (a.key === '_worder_email' && a.value && !knownEmail) {
          knownEmail = a.value;
          try { browser.localStorage.setItem('_worder_email', a.value); } catch(_){}
        }
        if (a.key === '_worder_phone' && a.value && !knownPhone) {
          knownPhone = a.value;
          try { browser.localStorage.setItem('_worder_phone', a.value); } catch(_){}
        }
      }
    }
  } catch(_) {}
  // Shopify customer (logged in)
  try {
    var cust = init && init.data && init.data.customer;
    if (cust && cust.email && !knownEmail) {
      knownEmail = cust.email;
      try { browser.localStorage.setItem('_worder_email', cust.email); } catch(_){}
    }
    if (cust && cust.phone && !knownPhone) {
      knownPhone = cust.phone;
      try { browser.localStorage.setItem('_worder_phone', cust.phone); } catch(_){}
    }
  } catch(_) {}
  resolveIdentity();
})();

})();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
