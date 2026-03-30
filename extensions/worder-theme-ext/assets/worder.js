/**
 * Worder Tracking Script
 *
 * Loaded by the App Embed on every page of the theme.
 * Responsible for:
 * 1. Identifying visitors (cookie __worder_id)
 * 2. Tracking Active on Site
 * 3. Tracking Viewed Product (product pages via Liquid {{ product }})
 * 4. Tracking Viewed Collection (collection pages via Liquid {{ collection }})
 * 5. Identifying via UTM email (?utm_email=)
 * 6. Identifying via Shopify login ({{ customer }})
 * 7. Exposing public API: window.worder.identify() / window.worder.track()
 */
(function () {
  'use strict';

  var config = window.__worder && window.__worder.config;
  if (!config || !config.accountId || !config.storeId) return;

  var ENDPOINT = config.endpoint || 'https://app.worder.com/api/track';
  var COOKIE_NAME = '__worder_id';
  var COOKIE_EMAIL = '__worder_id_email';
  var COOKIE_DAYS = 365 * 2; // 2 years (like Klaviyo)
  var SESSION_KEY = '__worder_sid';

  // ============================================
  // UTILITIES
  // ============================================

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      ';expires=' +
      d.toUTCString() +
      ';path=/;SameSite=Lax;Secure';
  }

  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch (e) {
      return 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  }

  function getAnonymousId() {
    var aid = getCookie(COOKIE_NAME);
    if (!aid) {
      aid = 'wa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      setCookie(COOKIE_NAME, aid, COOKIE_DAYS);
    }
    return aid;
  }

  function getUrlParam(param) {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get(param);
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // SEND DATA
  // ============================================

  function sendEvent(eventType, properties) {
    var payload = {
      accountId: config.accountId,
      storeId: config.storeId,
      eventType: eventType,
      properties: properties || {},
      anonymousId: getAnonymousId(),
      sessionId: getSessionId(),
      source: 'app_embed',
      url: window.location.href,
      referrer: document.referrer,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    // Include logged-in customer data if available
    if (window.__worder && window.__worder.customer) {
      payload.email = window.__worder.customer.email;
      payload.shopifyCustomerId = String(window.__worder.customer.shopifyCustomerId);
    }

    // Use sendBeacon (non-blocking, works even on page close)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        ENDPOINT + '/event',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    } else {
      // Fallback to fetch
      fetch(ENDPOINT + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    }
  }

  function sendIdentify(data) {
    var payload = {
      accountId: config.accountId,
      storeId: config.storeId,
      anonymousId: getAnonymousId(),
      sessionId: getSessionId(),
      email: data.email,
      phone: data.phone,
      firstName: data.firstName,
      lastName: data.lastName,
      shopifyCustomerId: data.shopifyCustomerId ? String(data.shopifyCustomerId) : null,
      properties: data.properties || {},
      source: data.source || 'app_embed',
      timestamp: new Date().toISOString(),
    };

    fetch(ENDPOINT + '/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function () {});
  }

  // ============================================
  // AUTOMATIC IDENTIFICATION
  // ============================================

  // 1. Logged-in Shopify customer
  if (window.__worder && window.__worder.customer && window.__worder.customer.email) {
    var c = window.__worder.customer;
    // Save email in cookie for future identification
    setCookie(COOKIE_EMAIL, c.email, COOKIE_DAYS);
    sendIdentify({
      email: c.email,
      phone: c.phone,
      firstName: c.firstName,
      lastName: c.lastName,
      shopifyCustomerId: c.shopifyCustomerId,
      source: 'shopify_login',
      properties: {
        ordersCount: c.ordersCount,
        totalSpent: c.totalSpent,
        tags: c.tags,
        acceptsMarketing: c.acceptsMarketing,
      },
    });
  }

  // 2. UTM Email (clicked link in Worder email/whatsapp)
  var utmEmail = getUrlParam('utm_email') || getUrlParam('worder_email');
  if (utmEmail && utmEmail.indexOf('@') > -1) {
    setCookie(COOKIE_EMAIL, utmEmail, COOKIE_DAYS);
    sendIdentify({
      email: utmEmail,
      source: 'utm_email',
    });
  }

  // 3. Recall from cookie (not logged in but previously identified)
  if (!(window.__worder && window.__worder.customer && window.__worder.customer.email)) {
    var savedEmail = getCookie(COOKIE_EMAIL);
    if (savedEmail) {
      sendIdentify({ email: savedEmail, source: 'cookie_recall' });
    }
  }

  // ============================================
  // EVENT TRACKING
  // ============================================

  // Active on Site — every page (throttle: 1x per session per page)
  var pageKey = 'worder_aos_' + window.location.pathname;
  try {
    if (!sessionStorage.getItem(pageKey)) {
      sendEvent('active_on_site', {
        url: window.location.href,
        title: window.__worder.pageTitle,
        template: window.__worder.template,
        referrer: document.referrer,
      });
      sessionStorage.setItem(pageKey, '1');
    }
  } catch (e) {
    // sessionStorage not available
    sendEvent('active_on_site', {
      url: window.location.href,
      title: window.__worder.pageTitle,
      template: window.__worder.template,
      referrer: document.referrer,
    });
  }

  // Viewed Product — only on product pages
  if (window.__worder && window.__worder.product) {
    var p = window.__worder.product;
    sendEvent('viewed_product', {
      ProductID: String(p.id),
      ProductName: p.title,
      ProductURL: window.location.origin + p.url,
      ImageURL: p.imageUrl,
      Price: p.price,
      CompareAtPrice: p.compareAtPrice,
      Brand: p.vendor,
      Categories: [p.type],
      Tags: p.tags,
      VariantID: String(p.selectedVariantId),
      VariantName: p.selectedVariantTitle,
      SKU: p.sku,
      Handle: p.handle,
      Available: p.available,
    });
  }

  // Viewed Collection — only on collection pages
  if (window.__worder && window.__worder.collection) {
    var col = window.__worder.collection;
    sendEvent('viewed_collection', {
      CollectionID: String(col.id),
      CollectionTitle: col.title,
      CollectionURL: window.location.origin + col.url,
      CollectionHandle: col.handle,
      ProductCount: col.productsCount,
    });
  }

  // ============================================
  // PUBLIC API (for custom forms)
  // ============================================

  window.worder = {
    identify: function (data) {
      if (data.email) setCookie(COOKIE_EMAIL, data.email, COOKIE_DAYS);
      sendIdentify(data);
    },
    track: function (eventType, properties) {
      sendEvent(eventType, properties);
    },
  };
})();
