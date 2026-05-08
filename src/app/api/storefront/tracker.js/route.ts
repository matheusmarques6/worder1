// =============================================================
// GET /api/storefront/tracker.js?store_id=<id>
//
// Main-page-context tracking script. Installed via Shopify's
// ScriptTag API (scriptTagId saved on shopify_stores.settings).
// Runs in the regular page DOM — NOT in the Custom Pixel sandbox —
// so it has full access to:
//   - cookies (for _fbp/_fbc/_ga/_kx etc)
//   - localStorage / sessionStorage (persistent visitor IDs)
//   - canvas + webgl + audio fingerprinting
//   - window.Shopify (cart, customer, checkout objects)
//   - DOM events (form submits, button clicks, scrolls)
//
// Companion to the Custom Pixel: pixel handles checkout-flow events
// inside Shopify's hosted checkout (where ScriptTag can't reach),
// tracker.js handles everything on the storefront. Both POST to
// /api/track/event with the same payload schema, so events from
// either source land in contact_events identically.
//
// Identity stitching: the basic fingerprintHash uses the SAME
// FNV-1a algorithm as the Custom Pixel, so a browser carrying both
// scripts produces matching hashes and the identity graph collapses
// them into a single visitor row. The richer canvas+webgl signature
// rides along in properties.fingerprint_rich for later use as a
// stronger match key.
//
// Adapted from the AdTracked tracker pattern, fitted to Worder's
// /api/track/event payload schema.
// =============================================================

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get('store_id') || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br';
  const trackEndpoint = `${appUrl}/api/track/event`;

  // Best-effort fetch log so the diagnostic dashboard can confirm the
  // ScriptTag actually reaches a real browser. Same audit table the
  // Custom Pixel uses, with topic='tracker.fetched' as the sentinel.
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
    const ua = request.headers.get('user-agent') || '';
    const ref = request.headers.get('referer') || '';
    getSupabaseAdmin()
      .from('shopify_webhook_audit')
      .insert({
        shop_domain: storeId || 'unknown',
        topic: 'tracker.fetched',
        status: 'served',
        error_message: `${ua.slice(0, 200)} | ref=${ref.slice(0, 200)}`,
        received_at: new Date().toISOString(),
      })
      .then(() => {}, () => {});
  } catch { /* never block on logging */ }

  const js = `// Worder Storefront Tracker v1
// Store: ${storeId}
(function(){
'use strict';
if (window.__worderTracker) return;
window.__worderTracker = true;

var STORE_ID = ${JSON.stringify(storeId)};
var TRACK = ${JSON.stringify(trackEndpoint)};
var PFX = '_worder_';
var DEBUG = (location.search.indexOf('worder_debug=1') > -1);

function log(){ if (DEBUG && console && console.log) console.log.apply(console, ['[Worder]'].concat([].slice.call(arguments))); }

// =============================================================
// Storage: cookie + localStorage with the same prefix the Custom
// Pixel uses (_worder_), so values written by either side are
// readable by the other when both run on the storefront.
// =============================================================
function setCookie(n, v, days) {
  try {
    var d = new Date();
    d.setTime(d.getTime() + (days || 180) * 86400000);
    document.cookie = n + '=' + encodeURIComponent(v) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
  } catch (_) {}
}
function getCookie(n) {
  var m = document.cookie.match(new RegExp('(^| )' + n.replace(/[$()*+.?^|]/g, '\\\\$&') + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}
function setStore(k, v, days) {
  setCookie(PFX + k, v, days || 180);
  try { localStorage.setItem(PFX + k, JSON.stringify({ v: v, e: Date.now() + (days || 180) * 86400000 })); } catch (_) {}
}
function getStore(k) {
  var c = getCookie(PFX + k);
  if (c) return c;
  try {
    var s = localStorage.getItem(PFX + k);
    if (s) {
      var d = JSON.parse(s);
      if (d.e > Date.now()) return d.v;
      localStorage.removeItem(PFX + k);
    }
  } catch (_) {}
  return null;
}

// =============================================================
// IDs — UUIDv4-ish + FNV-1a hash compatible with the Custom Pixel
// =============================================================
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function fnv1a(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// =============================================================
// Fingerprint — basic (compatible with Custom Pixel's hash so
// stitching works) + rich (canvas + webgl + audio for stronger
// uniqueness, posted alongside as properties.fingerprint_rich).
// =============================================================
function basicFingerprint() {
  try {
    var nav = navigator || {};
    var scr = screen || {};
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
    return fnv1a(parts.join('|'));
  } catch (_) { return null; }
}
function richFingerprint() {
  var parts = [];
  try {
    parts.push(navigator.userAgent || '');
    parts.push((navigator.languages || []).join(','));
    parts.push(navigator.platform || '');
    parts.push(navigator.hardwareConcurrency || 0);
    parts.push(navigator.deviceMemory || 0);
    parts.push(navigator.maxTouchPoints || 0);
    parts.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
    parts.push(new Date().getTimezoneOffset());
    try { parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch(_) {}
  } catch (_) {}

  // Canvas — text rendering varies per OS+font stack
  try {
    var c = document.createElement('canvas');
    c.width = 200; c.height = 50;
    var ctx = c.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Worder', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Worder', 4, 17);
      parts.push(c.toDataURL());
    }
  } catch (_) { parts.push('canvas-err'); }

  // WebGL — GPU vendor + renderer when exposed
  try {
    var gc = document.createElement('canvas');
    var gl = gc.getContext('webgl') || gc.getContext('experimental-webgl');
    if (gl) {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        parts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)));
        parts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)));
      }
      parts.push(String(gl.getParameter(gl.VERSION)));
      parts.push(String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)));
    }
  } catch (_) { parts.push('webgl-err'); }

  return fnv1a(parts.join('||'));
}

// =============================================================
// URL params + click IDs cascade. Captures every paid-traffic
// click ID into cookies + localStorage so subsequent /api/track
// posts can attribute the visit even after refresh / cross-page nav.
// =============================================================
function getQS() {
  var p = {};
  try {
    new URLSearchParams(location.search).forEach(function(v, k) { p[k] = v; });
  } catch (_) {
    var q = location.search.replace(/^\\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      var kv = q[i].split('=');
      if (kv[0]) p[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    }
  }
  return p;
}

function captureClickIds() {
  var qs = getQS();
  var cl = {};

  // Facebook
  if (qs.fbclid) {
    cl.fbclid = qs.fbclid;
    setStore('fbclid', qs.fbclid, 90);
    var fbc = 'fb.1.' + Date.now() + '.' + qs.fbclid;
    setCookie('_fbc', fbc, 90);
    cl.fbc = fbc;
  } else {
    cl.fbclid = getStore('fbclid');
    cl.fbc = getCookie('_fbc') || getStore('fbc');
  }
  // _fbp — generate if missing so server-side can match it on FB CAPI
  var fbp = getCookie('_fbp') || getStore('fbp');
  if (!fbp) {
    fbp = 'fb.1.' + Date.now() + '.' + Math.floor(Math.random() * 1e10);
    setCookie('_fbp', fbp, 90);
    setStore('fbp', fbp, 90);
  }
  cl.fbp = fbp;

  // Google
  if (qs.gclid) { cl.gclid = qs.gclid; setStore('gclid', qs.gclid, 90); }
  else cl.gclid = getStore('gclid');
  if (qs.gbraid) { cl.gbraid = qs.gbraid; setStore('gbraid', qs.gbraid, 90); }
  else cl.gbraid = getStore('gbraid');
  if (qs.wbraid) { cl.wbraid = qs.wbraid; setStore('wbraid', qs.wbraid, 90); }
  else cl.wbraid = getStore('wbraid');
  if (qs.dclid) { cl.dclid = qs.dclid; setStore('dclid', qs.dclid, 90); }
  else cl.dclid = getStore('dclid');

  // TikTok / Microsoft / LinkedIn / Twitter / Snapchat / Klaviyo
  ['ttclid','msclkid','li_fat_id','twclid','sccid','_kx'].forEach(function(k){
    if (qs[k]) { cl[k] = qs[k]; setStore(k, qs[k], 90); }
    else { var s = getStore(k); if (s) cl[k] = s; }
  });

  // GA cookie — read but never overwrite
  cl.ga_id = getCookie('_ga');
  return cl;
}

function captureUtms() {
  var qs = getQS();
  var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  var u = {};
  for (var i = 0; i < keys.length; i++) {
    if (qs[keys[i]]) {
      u[keys[i]] = qs[keys[i]];
      setStore(keys[i], qs[keys[i]], 90);
    } else {
      var s = getStore(keys[i]);
      if (s) u[keys[i]] = s;
    }
  }
  return u;
}

// =============================================================
// Identity bootstrap
// =============================================================
var visitorId = getStore('vid') || (function(){ var v = uuid(); setStore('vid', v, 365); return v; })();
var sessionId = (function(){
  var stored = getStore('sid');
  var last = parseInt(getStore('last') || '0', 10);
  // 30-min session window
  if (stored && (Date.now() - last) < 30 * 60 * 1000) {
    return stored;
  }
  var s = uuid();
  setStore('sid', s, 1);
  return s;
})();
setStore('last', String(Date.now()), 1);

var fingerprintHash = basicFingerprint();
if (fingerprintHash) setStore('fp', fingerprintHash, 365);
var fingerprintRich = richFingerprint();

var clickIds = captureClickIds();
var utmParams = captureUtms();

// User identity restored from prior page / popup capture
var knownEmail = getStore('em');
var knownPhone = getStore('ph');
var knownFirstName = getStore('fn');
var knownLastName = getStore('ln');

// Logged-in Shopify customer — every storefront page exposes this on
// the global ShopifyAnalytics.meta when the customer is signed in.
var shopifyCustomerId = null;
try {
  var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
  if (meta && meta.page && meta.page.customerId) {
    shopifyCustomerId = String(meta.page.customerId);
  }
} catch (_) {}

// =============================================================
// Send event — best-effort, never blocks navigation.
// Uses sendBeacon when available so the request survives unload
// (critical for thank-you page redirect after Purchase).
// =============================================================
function send(eventType, properties) {
  try {
    var props = Object.assign({}, properties || {});
    if (knownEmail && !props.email) props.email = knownEmail;
    if (knownPhone && !props.phone) props.phone = knownPhone;
    if (knownFirstName && !props.first_name) props.first_name = knownFirstName;
    if (knownLastName && !props.last_name) props.last_name = knownLastName;
    if (fingerprintRich) props.fingerprint_rich = fingerprintRich;

    var payload = {
      event_type: eventType,
      eventType: eventType,
      store_id: STORE_ID,
      storeId: STORE_ID,
      shop_domain: (window.Shopify && window.Shopify.shop) || location.host,
      storeDomain: (window.Shopify && window.Shopify.shop) || location.host,
      visitor_id: visitorId,
      visitorId: visitorId,
      session_id: sessionId,
      sessionId: sessionId,
      anonymous_id: visitorId,
      anonymousId: visitorId,
      fingerprint: fingerprintHash,
      fingerprintHash: fingerprintHash,
      shopify_customer_id: shopifyCustomerId,
      shopifyCustomerId: shopifyCustomerId,
      page_url: location.href,
      page_title: document.title,
      page_path: location.pathname,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      utmParams: utmParams,
      clickIds: clickIds,
      properties: props,
      data: props,
      source: 'storefront_tracker',
      timestamp: new Date().toISOString(),
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(TRACK, blob);
    } else {
      fetch(TRACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit',
      }).catch(function(){});
    }
    log('sent', eventType, props);
  } catch (e) { log('send error', e); }
}
window.__worderSend = send;

// Public capture API for popups / forms to hand identity over.
window.__worderIdentify = function(d) {
  if (!d) return;
  if (d.email) { knownEmail = d.email; setStore('em', d.email, 365); }
  if (d.phone) { knownPhone = d.phone; setStore('ph', d.phone, 365); }
  if (d.first_name) { knownFirstName = d.first_name; setStore('fn', d.first_name, 365); }
  if (d.last_name) { knownLastName = d.last_name; setStore('ln', d.last_name, 365); }
  send('identified', d);
};

// =============================================================
// Event sources on the storefront
// =============================================================

// 1. page_view — fires once per pageload
send('page_viewed', {
  page_type: detectPageType(),
});

function detectPageType() {
  var p = location.pathname;
  if (p === '/' || p === '') return 'home';
  if (p.indexOf('/products/') === 0) return 'product';
  if (p.indexOf('/collections/') === 0) return 'collection';
  if (p.indexOf('/cart') === 0) return 'cart';
  if (p.indexOf('/account') === 0) return 'account';
  if (p.indexOf('/search') === 0) return 'search';
  if (p.indexOf('/blogs/') === 0 || p.indexOf('/articles/') === 0) return 'blog';
  if (p.indexOf('/checkouts/') === 0 && p.indexOf('/thank_you') > -1) return 'thank_you';
  if (p.indexOf('/checkouts/') === 0) return 'checkout';
  if (p.indexOf('/orders/') === 0) return 'order_status';
  return 'other';
}

// 2. viewed_product — when on a /products/<handle> page, scrape ProductJson
function trackViewedProduct() {
  if (!/^\\/products\\//.test(location.pathname)) return;
  var product = null;
  try {
    if (window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) {
      product = ShopifyAnalytics.meta.product;
    }
  } catch (_) {}
  if (!product) {
    // Fallback: Liquid templates often expose product as JSON in <script type="application/json">
    try {
      var el = document.querySelector('script[type="application/json"][data-product-json], #ProductJson-product-template, [data-product-json]');
      if (el) product = JSON.parse(el.textContent || el.innerText || '{}');
    } catch (_) {}
  }
  if (!product) return;
  var v = (product.variants && product.variants[0]) || {};
  send('viewed_product', {
    product_id: String(product.id || ''),
    title: product.title || '',
    name: product.title || '',
    handle: product.handle || '',
    vendor: product.vendor || '',
    product_type: product.type || product.product_type || '',
    variant_id: v.id ? String(v.id) : null,
    sku: v.sku || null,
    price: parseFloat(v.price || 0) / (typeof v.price === 'number' && v.price > 1000 ? 100 : 1),
    currency: (window.Shopify && window.Shopify.currency && Shopify.currency.active) || 'BRL',
    image_url: (product.featured_image && product.featured_image.src) || product.image || null,
    url: location.origin + '/products/' + (product.handle || ''),
  });
}
trackViewedProduct();

// 3. cart polling — detect added_to_cart by diffing cart.js item_count
var lastItemCount = -1;
var lastCartFetch = 0;
function fetchCart() {
  if (Date.now() - lastCartFetch < 1500) return;
  lastCartFetch = Date.now();
  fetch('/cart.js', { credentials: 'same-origin' })
    .then(function(r){ return r.json(); })
    .then(function(cart) {
      var newCount = cart.item_count || 0;
      if (lastItemCount === -1) {
        lastItemCount = newCount;
        return;
      }
      if (newCount > lastItemCount) {
        // The new item is the most recently added — usually the last
        // in cart.items (Shopify appends to the end).
        var items = cart.items || [];
        var added = items[items.length - 1];
        if (added) {
          send('added_to_cart', {
            product_id: String(added.product_id || ''),
            variant_id: String(added.variant_id || ''),
            title: added.product_title || added.title || '',
            name: added.product_title || added.title || '',
            quantity: added.quantity || 1,
            price: (added.price || 0) / 100,
            currency: cart.currency || 'BRL',
            image_url: added.image || added.featured_image || null,
            sku: added.sku || null,
            vendor: added.vendor || null,
            url: location.origin + '/products/' + (added.handle || ''),
            cart_total: (cart.total_price || 0) / 100,
            cart_count: newCount,
          });
        }
      }
      lastItemCount = newCount;
    })
    .catch(function(){});
}
fetchCart();
// Refetch cart on relevant events
['click', 'submit'].forEach(function(ev){
  document.addEventListener(ev, function(e){
    var t = e.target;
    if (!t) return;
    var s = (t.tagName || '').toLowerCase();
    var name = (t.name || '').toLowerCase();
    var attr = ((t.getAttribute && t.getAttribute('data-action')) || '').toLowerCase();
    if (name.indexOf('add') > -1 || attr.indexOf('add') > -1 || s === 'form') {
      setTimeout(fetchCart, 800);
      setTimeout(fetchCart, 2000);
    }
  }, true);
});

// 4. checkout_started — clicks on common checkout buttons
(function(){
  var fired = false;
  var SELECTORS = [
    'button[name="checkout"]',
    'input[name="checkout"]',
    'a[href*="/checkout"]',
    '[data-checkout-button]',
    '.cart__checkout-button',
    '.checkout-btn',
    '#checkout',
  ];
  document.addEventListener('click', function(e) {
    if (fired) return;
    var el = e.target;
    for (var i = 0; i < 6 && el; i++) {
      try {
        for (var j = 0; j < SELECTORS.length; j++) {
          if (el.matches && el.matches(SELECTORS[j])) {
            fired = true;
            send('checkout_started', { trigger: 'button_click' });
            setTimeout(function(){ fired = false; }, 5000);
            return;
          }
        }
      } catch (_) {}
      el = el.parentElement;
    }
  }, true);
})();

// 5. Form submits — scrape email/phone before navigation
document.addEventListener('submit', function(e) {
  try {
    var f = e.target;
    if (!f || !f.elements) return;
    var d = {};
    for (var i = 0; i < f.elements.length; i++) {
      var inp = f.elements[i];
      var type = (inp.type || '').toLowerCase();
      var n = (inp.name || '').toLowerCase();
      var v = inp.value;
      if (!v) continue;
      if (type === 'email' || n.indexOf('email') > -1) d.email = String(v).toLowerCase();
      else if (type === 'tel' || n.indexOf('phone') > -1 || n.indexOf('telefone') > -1 || n.indexOf('celular') > -1) d.phone = String(v);
      else if (n.indexOf('first') > -1 || n === 'fname' || n === 'nome') d.first_name = String(v);
      else if (n.indexOf('last') > -1 || n === 'lname' || n === 'sobrenome') d.last_name = String(v);
    }
    if (d.email || d.phone) {
      window.__worderIdentify(d);
    }
  } catch (_) {}
}, true);

// 6. thank-you page → purchase
(function(){
  var p = location.pathname;
  var isThankYou = (p.indexOf('/thank_you') > -1) ||
                   (p.indexOf('/orders/') === 0 && /\\/orders\\/[a-zA-Z0-9-]+/.test(p));
  if (!isThankYou) return;
  // Extract order from Shopify.checkout when available
  var checkout = (window.Shopify && Shopify.checkout) || null;
  if (!checkout) return;
  var orderId = String(checkout.order_id || '');
  if (!orderId) return;
  // Dedupe: don't fire twice if user reloads thank-you page
  var sentKey = 'order_sent_' + orderId;
  if (getStore(sentKey)) return;
  setStore(sentKey, '1', 30);

  var lineItems = (checkout.line_items || []).map(function(it){
    return {
      product_id: String(it.product_id || ''),
      variant_id: String(it.variant_id || ''),
      title: it.title || '',
      quantity: it.quantity || 1,
      price: parseFloat(it.price || 0),
      sku: it.sku || null,
    };
  });
  var bill = checkout.billing_address || {};
  send('checkout_completed', {
    order_id: orderId,
    order_number: String(checkout.order_number || checkout.name || ''),
    total_price: parseFloat(checkout.total_price || 0),
    subtotal_price: parseFloat(checkout.subtotal_price || 0),
    total_tax: parseFloat(checkout.total_tax || 0),
    currency: checkout.currency || 'BRL',
    email: checkout.email || bill.email || null,
    phone: checkout.phone || bill.phone || null,
    first_name: bill.first_name || null,
    last_name: bill.last_name || null,
    city: bill.city || null,
    province: bill.province_code || bill.province || null,
    country: bill.country_code || bill.country || null,
    zip: bill.zip || null,
    line_items: lineItems,
    item_count: lineItems.reduce(function(a, b){ return a + (b.quantity || 0); }, 0),
  });
})();

log('init', { vid: visitorId, sid: sessionId, fp: fingerprintHash, store: STORE_ID });
})();
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
