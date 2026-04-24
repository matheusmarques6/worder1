// =============================================================
// GET /api/pixel/worder-pixel.js?shop={domain}
//
// Serves the Worder tracking pixel as an external JS file.
// The merchant pastes a 3-line loader (like WeTracked) instead of
// 300+ lines of inline code. This lets us update tracking logic
// without merchants reinstalling the pixel.
//
// Loader code (pasted in Shopify Custom Pixel):
//   !function(t,w,d){var s=d.createElement("script");
//   s.async=!0;s.src="https://app.worder.com.br/api/pixel/worder-pixel.js?shop="+t.init.data.shop.myshopifyDomain;
//   d.head.append(s);w.__worder_ctx=t}(this,window,document);
// =============================================================

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop') || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br';
  const trackEndpoint = `${appUrl}/api/shopify/track`;

  const js = `// Worder Tracking Pixel v2 — loaded remotely
// Shop: ${shop}
(function(){
var ctx = window.__worder_ctx;
if (!ctx) { console.warn('[Worder] No pixel context. Ensure loader runs first.'); return; }
var analytics = ctx.analytics;
var browser = ctx.browser;
var init = ctx.init;

var ENDPOINT = '${trackEndpoint}';
var SHOP = '${shop}' || (init.data && init.data.shop && init.data.shop.myshopifyDomain) || '';

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

var visitorId = generateId();
var sessionId = generateId();
var knownEmail = null;
var knownPhone = null;

// Restore persisted IDs
(async function() {
  try { var v = await browser.localStorage.getItem('_worder_vid'); if (v) visitorId = v; else await browser.localStorage.setItem('_worder_vid', visitorId); } catch(e) {}
  try { var s = await browser.sessionStorage.getItem('_worder_sid'); if (s) sessionId = s; else await browser.sessionStorage.setItem('_worder_sid', sessionId); } catch(e) {}
  try { var em = await browser.localStorage.getItem('_worder_email'); if (em) knownEmail = em; } catch(e) {}
  try { var ph = await browser.localStorage.getItem('_worder_phone'); if (ph) knownPhone = ph; } catch(e) {}
  // Cart attributes identity bridge
  try {
    var cart = init.data && init.data.cart;
    if (cart && Array.isArray(cart.attributes)) {
      for (var i = 0; i < cart.attributes.length; i++) {
        var a = cart.attributes[i];
        if (a.key === '_worder_email' && a.value && !knownEmail) { knownEmail = a.value; browser.localStorage.setItem('_worder_email', a.value); }
        if (a.key === '_worder_phone' && a.value && !knownPhone) { knownPhone = a.value; browser.localStorage.setItem('_worder_phone', a.value); }
      }
    }
  } catch(e) {}
  // Shopify customer data
  try {
    var cust = init.data && init.data.customer;
    if (cust && cust.email && !knownEmail) { knownEmail = cust.email; browser.localStorage.setItem('_worder_email', cust.email); }
    if (cust && cust.phone && !knownPhone) { knownPhone = cust.phone; browser.localStorage.setItem('_worder_phone', cust.phone); }
  } catch(e) {}
})();

function persistContact(email, phone) {
  if (email) { knownEmail = email; try { browser.localStorage.setItem('_worder_email', email); } catch(e) {} }
  if (phone) { knownPhone = phone; try { browser.localStorage.setItem('_worder_phone', phone); } catch(e) {} }
}

function send(eventType, data, ctx) {
  if (data && (data.email || data.phone)) persistContact(data.email, data.phone);
  var d = Object.assign({}, data || {});
  if (knownEmail && !d.email) d.email = knownEmail;
  if (knownPhone && !d.phone) d.phone = knownPhone;

  var payload = {
    event_type: eventType,
    shop_domain: SHOP,
    visitor_id: visitorId,
    session_id: sessionId,
    page_url: (ctx && ctx.document && ctx.document.location && ctx.document.location.href) || '',
    page_title: (ctx && ctx.document && ctx.document.title) || '',
    referrer: (ctx && ctx.document && ctx.document.referrer) || '',
    timestamp: new Date().toISOString(),
    data: d,
    email: knownEmail || undefined,
    phone: knownPhone || undefined,
  };

  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(function(){});
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
  send('viewed_product', { product_id: v.product.id, product_title: v.product.title || v.title, product_url: v.product.url, product_type: v.product.type, product_vendor: v.product.vendor, price: v.price.amount, currency: v.price.currencyCode, variant_id: v.id, variant_title: v.title, image_url: v.image ? v.image.src : null, sku: v.sku }, e.context);
});

analytics.subscribe('collection_viewed', function(e) {
  var c = e.data.collection;
  send('viewed_collection', { collection_id: c.id, collection_title: c.title }, e.context);
});

analytics.subscribe('search_submitted', function(e) {
  send('submitted_search', { query: e.data.searchResult.query, results_count: e.data.searchResult.productVariants ? e.data.searchResult.productVariants.length : 0 }, e.context);
});

analytics.subscribe('product_added_to_cart', function(e) {
  var cl = e.data.cartLine, m = cl.merchandise;
  send('added_to_cart', { product_id: m.product.id, product_title: m.product.title || m.title, variant_id: m.id, variant_title: m.title, price: cl.cost.totalAmount.amount, currency: cl.cost.totalAmount.currencyCode, quantity: cl.quantity || 1, sku: m.sku, image_url: m.image ? m.image.src : null }, e.context);
});

analytics.subscribe('checkout_started', function(e) {
  var co = e.data.checkout;
  send('checkout_started', { checkout_id: co.token, total_price: co.totalPrice.amount, subtotal_price: co.subtotalPrice.amount, currency: co.currencyCode, item_count: co.lineItems.length, items: co.lineItems.map(function(i) { return { product_id: i.variant.product.id, title: i.title, quantity: i.quantity, price: i.variant.price.amount, variant_title: i.variant.title, sku: i.variant.sku }; }) }, e.context);
});

analytics.subscribe('checkout_contact_info_submitted', function(e) {
  var co = e.data.checkout;
  send('email_captured', { email: co.email, phone: co.phone, checkout_id: co.token, total_price: co.totalPrice.amount, currency: co.currencyCode }, e.context);
});

analytics.subscribe('payment_info_submitted', function(e) {
  var co = e.data.checkout;
  send('payment_submitted', { checkout_id: co.token, total_price: co.totalPrice.amount, currency: co.currencyCode }, e.context);
});

analytics.subscribe('checkout_completed', function(e) {
  var co = e.data.checkout;
  send('checkout_completed', { checkout_id: co.token, order_id: co.order ? co.order.id : null, email: co.email, phone: co.phone, total_price: co.totalPrice.amount, subtotal_price: co.subtotalPrice.amount, currency: co.currencyCode, item_count: co.lineItems.length }, e.context);
});

// Real-time identity bridge from popup
try {
  analytics.subscribe('worder_identified', function(e) {
    var d = e.customData || e.data || {};
    if (d.email) persistContact(d.email, d.phone);
  });
} catch(e) {}

})();`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
