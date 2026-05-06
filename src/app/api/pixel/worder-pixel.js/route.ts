// =============================================================
// GET /api/pixel/worder-pixel.js?shop={domain}
//
// Serves the Worder tracking pixel as an external JS file.
// The merchant pastes a 3-line loader (like WeTracked) into Shopify
// Custom Pixel; that loader fetches this script which contains all
// event subscriptions + identity resolution.
//
// Identity flow:
//  1. On first event, generate a probabilistic fingerprint from
//     screen/timezone/language/canvas/UA (lightweight, no external deps).
//  2. Send fingerprint + clientVisitorId to /api/identity/resolve which
//     returns a stable worder_visitor_id. This survives Safari ITP wipes
//     (server-side fingerprint match restores prior identity).
//  3. Cache worder_visitor_id locally and use it as anonymous_id on
//     every subsequent event.
//
// Loader (paste in Shopify Custom Pixel):
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

  const js = `// Worder Tracking Pixel v3 — identity resolution + rich events
// Shop: ${shop}
(function(){
var ctx = window.__worder_ctx;
if (!ctx) { console.warn('[Worder] No pixel context. Ensure loader runs first.'); return; }
var analytics = ctx.analytics;
var browser = ctx.browser;
var init = ctx.init;

// If the Shopify Web Pixel extension is active, skip the remote pixel to avoid double-tracking.
(async function() {
try { var extFlag = await browser.localStorage.getItem('__worder_pixel_ext'); if (extFlag) { return; } } catch(e) {}
__worderRemotePixelInit();
})();
function __worderRemotePixelInit() {

var TRACK = '${trackEndpoint}';
var RESOLVE = '${identityEndpoint}';
var SHOP = '${shop}' || (init.data && init.data.shop && init.data.shop.myshopifyDomain) || '';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// =============================================
// Lightweight fingerprint (no external deps).
// Combines stable browser/device signals that change rarely:
//  - userAgent
//  - language list
//  - timezone offset
//  - screen dimensions + color depth
//  - hardwareConcurrency (CPU cores)
//  - deviceMemory
//  - canvas hash (renders test text and hashes pixel data)
// 80%+ uniqueness in normal traffic, comparable to ThumbmarkJS basic
// fingerprint without the bundle cost. Server uses this together with
// UA + IP subnet for additional matching robustness.
// =============================================
function generateFingerprint() {
  try {
    var doc = init.context && init.context.document;
    var win = init.context && init.context.window;
    if (!win) return null;
    var nav = win.navigator || {};
    var scr = win.screen || {};
    var parts = [
      String(nav.userAgent || ''),
      String((nav.languages || [nav.language]).join(',')),
      String(new Date().getTimezoneOffset()),
      String(scr.width || ''),
      String(scr.height || ''),
      String(scr.colorDepth || ''),
      String(nav.hardwareConcurrency || ''),
      String(nav.deviceMemory || ''),
      String(nav.platform || ''),
      String((nav.plugins && nav.plugins.length) || 0),
    ];
    // Canvas — sandbox may not allow, that's OK
    try {
      if (doc) {
        var c = doc.createElement('canvas');
        c.width = 200; c.height = 50;
        var x = c.getContext('2d');
        x.textBaseline = 'top';
        x.font = "14px 'Arial'";
        x.textBaseline = 'alphabetic';
        x.fillStyle = '#f60';
        x.fillRect(125, 1, 62, 20);
        x.fillStyle = '#069';
        x.fillText('Worder👁', 2, 15);
        x.fillStyle = 'rgba(102, 204, 0, 0.7)';
        x.fillText('Worder👁', 4, 17);
        parts.push(c.toDataURL().slice(-100));
      }
    } catch(e) {}
    var s = parts.join('|');
    // Simple FNV-1a 32-bit hash → hex
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  } catch(e) { return null; }
}

var fingerprintHash = generateFingerprint();

// =============================================
// Identity state
// =============================================
var sessionId = uuid();
var clientVisitorId = uuid();      // legacy — what we cache locally
var worderVisitorId = null;        // canonical — set by /identity/resolve
var knownEmail = null;
var knownPhone = null;
var identityResolved = false;

// Restore persisted IDs
(async function() {
  try {
    var v = await browser.localStorage.getItem('_worder_vid');
    if (v) clientVisitorId = v; else await browser.localStorage.setItem('_worder_vid', clientVisitorId);
  } catch(e) {}
  try {
    var wv = await browser.localStorage.getItem('_worder_canonical');
    if (wv) worderVisitorId = wv;
  } catch(e) {}
  try {
    var s = await browser.sessionStorage.getItem('_worder_sid');
    if (s) sessionId = s; else await browser.sessionStorage.setItem('_worder_sid', sessionId);
  } catch(e) {}
  try {
    var em = await browser.localStorage.getItem('_worder_email'); if (em) knownEmail = em;
  } catch(e) {}
  try {
    var ph = await browser.localStorage.getItem('_worder_phone'); if (ph) knownPhone = ph;
  } catch(e) {}
  // Cart attribute identity bridge (popup → Web Pixel)
  try {
    var cart = init.data && init.data.cart;
    if (cart && Array.isArray(cart.attributes)) {
      for (var i = 0; i < cart.attributes.length; i++) {
        var a = cart.attributes[i];
        if (a.key === '_worder_email' && a.value && !knownEmail) {
          knownEmail = a.value; browser.localStorage.setItem('_worder_email', a.value);
        }
        if (a.key === '_worder_phone' && a.value && !knownPhone) {
          knownPhone = a.value; browser.localStorage.setItem('_worder_phone', a.value);
        }
      }
    }
  } catch(e) {}
  // Shopify customer (logged in)
  try {
    var cust = init.data && init.data.customer;
    if (cust && cust.email && !knownEmail) { knownEmail = cust.email; browser.localStorage.setItem('_worder_email', cust.email); }
    if (cust && cust.phone && !knownPhone) { knownPhone = cust.phone; browser.localStorage.setItem('_worder_phone', cust.phone); }
  } catch(e) {}

  // Resolve canonical identity once at boot. Server will return our stable
  // worder_visitor_id and (if it can match by fingerprint) restore it
  // even after Safari ITP wiped localStorage.
  resolveIdentity();
})();

function resolveIdentity() {
  if (identityResolved) return;
  var customerId = null;
  try {
    var c = init.data && init.data.customer;
    customerId = c && c.id ? String(c.id) : null;
  } catch(e) {}
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
      try { browser.localStorage.setItem('_worder_canonical', worderVisitorId); } catch(e) {}
    }
    identityResolved = true;
  }).catch(function(){ identityResolved = true; });
}

function persistContact(email, phone) {
  if (email && email !== knownEmail) {
    knownEmail = email;
    try { browser.localStorage.setItem('_worder_email', email); } catch(e) {}
    // Re-resolve identity to link contact to this canonical visitor server-side
    identityResolved = false;
    resolveIdentity();
  }
  if (phone && phone !== knownPhone) {
    knownPhone = phone;
    try { browser.localStorage.setItem('_worder_phone', phone); } catch(e) {}
  }
}

function send(eventType, data, ctx) {
  if (data && (data.email || data.phone)) persistContact(data.email, data.phone);
  var d = Object.assign({}, data || {});
  if (knownEmail && !d.email) d.email = knownEmail;
  if (knownPhone && !d.phone) d.phone = knownPhone;

  var payload = {
    event_type: eventType,
    storeDomain: SHOP,
    shop_domain: SHOP,                       // legacy
    visitorId: worderVisitorId || clientVisitorId,
    visitor_id: worderVisitorId || clientVisitorId, // legacy
    sessionId: sessionId,
    session_id: sessionId,                   // legacy
    fingerprintHash: fingerprintHash,
    eventType: eventType,                    // canonical key for /api/track/event
    properties: d,
    page_url: (ctx && ctx.document && ctx.document.location && ctx.document.location.href) || '',
    page_title: (ctx && ctx.document && ctx.document.title) || '',
    referrer: (ctx && ctx.document && ctx.document.referrer) || '',
    timestamp: new Date().toISOString(),
    data: d,
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
}

// === EVENT SUBSCRIPTIONS ===

analytics.subscribe('page_viewed', function(e) {
  send('page_view', { url: e.context.document.location.href, title: e.context.document.title, referrer: e.context.document.referrer }, e.context);
});

// Active on Site — fires once per session for identified visitors
analytics.subscribe('page_viewed', function(e) {
  if (!knownEmail) return;
  try {
    var key = '_worder_active_session';
    browser.localStorage.getItem(key).then(function(last) {
      if (last) {
        var lastTs = parseInt(last, 10);
        if (Date.now() - lastTs < 30 * 60 * 1000) return;
      }
      browser.localStorage.setItem(key, String(Date.now()));
      send('active_on_site', {
        url: e.context.document.location.href,
        referrer: e.context.document.referrer,
        session_start: new Date().toISOString(),
      }, e.context);
    });
  } catch(ex) {}
});

analytics.subscribe('product_viewed', function(e) {
  var v = e.data.productVariant;
  send('viewed_product', {
    product_id: v.product.id, product_title: v.product.title || v.title,
    product_url: v.product.url, product_type: v.product.type, product_vendor: v.product.vendor,
    price: v.price.amount, currency: v.price.currencyCode,
    variant_id: v.id, variant_title: v.title,
    image_url: v.image ? v.image.src : null, sku: v.sku,
  }, e.context);
});

analytics.subscribe('collection_viewed', function(e) {
  var c = e.data.collection;
  send('viewed_collection', { collection_id: c.id, collection_title: c.title }, e.context);
});

analytics.subscribe('search_submitted', function(e) {
  send('submitted_search', {
    query: e.data.searchResult.query,
    results_count: e.data.searchResult.productVariants ? e.data.searchResult.productVariants.length : 0,
  }, e.context);
});

analytics.subscribe('product_added_to_cart', function(e) {
  var cl = e.data.cartLine, m = cl.merchandise;
  send('added_to_cart', {
    product_id: m.product.id, product_title: m.product.title || m.title,
    variant_id: m.id, variant_title: m.title,
    price: cl.cost.totalAmount.amount, currency: cl.cost.totalAmount.currencyCode,
    quantity: cl.quantity || 1, sku: m.sku,
    image_url: m.image ? m.image.src : null,
  }, e.context);
});

analytics.subscribe('cart_viewed', function(e) {
  var c = e.data.cart;
  send('cart_viewed', {
    total_price: c.cost && c.cost.totalAmount ? c.cost.totalAmount.amount : null,
    currency: c.cost && c.cost.totalAmount ? c.cost.totalAmount.currencyCode : null,
    item_count: (c.lines || []).length,
    items: (c.lines || []).map(function(l) {
      var m = l.merchandise || {};
      return {
        product_id: m.product && m.product.id, title: m.product && m.product.title,
        variant_id: m.id, variant_title: m.title,
        price: m.price && m.price.amount,
        quantity: l.quantity || 1,
      };
    }),
  }, e.context);
});

analytics.subscribe('checkout_started', function(e) {
  var co = e.data.checkout;
  send('checkout_started', {
    checkout_id: co.token, total_price: co.totalPrice.amount, subtotal_price: co.subtotalPrice.amount,
    currency: co.currencyCode, item_count: co.lineItems.length,
    items: co.lineItems.map(function(i) {
      return { product_id: i.variant.product.id, title: i.title, quantity: i.quantity, price: i.variant.price.amount, variant_title: i.variant.title, sku: i.variant.sku };
    }),
  }, e.context);
});

analytics.subscribe('checkout_contact_info_submitted', function(e) {
  var co = e.data.checkout;
  send('email_captured', {
    email: co.email, phone: co.phone, checkout_id: co.token,
    total_price: co.totalPrice.amount, currency: co.currencyCode,
  }, e.context);
});

analytics.subscribe('payment_info_submitted', function(e) {
  var co = e.data.checkout;
  send('payment_submitted', { checkout_id: co.token, total_price: co.totalPrice.amount, currency: co.currencyCode }, e.context);
});

analytics.subscribe('checkout_completed', function(e) {
  var co = e.data.checkout;
  send('checkout_completed', {
    checkout_id: co.token, order_id: co.order ? co.order.id : null,
    email: co.email, phone: co.phone,
    total_price: co.totalPrice.amount, subtotal_price: co.subtotalPrice.amount, currency: co.currencyCode,
    item_count: co.lineItems.length,
  }, e.context);
});

// Real-time identity bridge from popup
try {
  analytics.subscribe('worder_identified', function(e) {
    var d = e.customData || e.data || {};
    if (d.email) persistContact(d.email, d.phone);
  });
} catch(e) {}

} // end __worderRemotePixelInit

})();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
