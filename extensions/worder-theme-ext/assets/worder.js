/**
 * Worder Theme App Extension - Tracking Script
 *
 * Loaded on every storefront page via the App Embed block.
 * Responsible for:
 * 1. Persistent visitor identification (1st-party cookie, 730 days)
 * 2. Session management via sessionStorage (30 min inactivity timeout)
 * 3. Cookieless fingerprint generation (canvas, screen, timezone, language)
 * 4. Tracking: viewed_product, viewed_collection, active_on_site heartbeat
 * 5. Auto-identify logged-in Shopify customers
 * 6. UTM email capture
 * 7. Public API: window.worder.identify() / window.worder.track()
 */
(function () {
  'use strict';

  var config = window.__worder && window.__worder.config;
  if (!config || !config.shopDomain) return;

  var ENDPOINT = config.endpoint || 'https://worder1.vercel.app/api/track';
  var COOKIE_NAME = '__worder_id';
  var COOKIE_EMAIL = '__worder_id_email';
  var COOKIE_DAYS = 730; // 2 years
  var SESSION_KEY = '__worder_sid';
  var SESSION_TS_KEY = '__worder_sid_ts';
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  var HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // ============================================
  // UUID generation
  // ============================================
  function generateUUID() {
    var d = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ============================================
  // Cookie utilities
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

  // ============================================
  // Visitor ID (1st-party cookie, 730 days)
  // ============================================
  function getVisitorId() {
    var vid = getCookie(COOKIE_NAME);
    if (!vid) {
      vid = generateUUID();
      setCookie(COOKIE_NAME, vid, COOKIE_DAYS);
    }
    return vid;
  }

  var visitorId = getVisitorId();

  // ============================================
  // Session management (sessionStorage + 30 min timeout)
  // ============================================
  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      var ts = sessionStorage.getItem(SESSION_TS_KEY);
      var now = Date.now();

      if (sid && ts && now - parseInt(ts, 10) < SESSION_TIMEOUT_MS) {
        sessionStorage.setItem(SESSION_TS_KEY, String(now));
        return sid;
      }

      // New session
      sid = generateUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
      sessionStorage.setItem(SESSION_TS_KEY, String(now));
      return sid;
    } catch (e) {
      return generateUUID();
    }
  }

  function touchSession() {
    try {
      sessionStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    } catch (e) {
      /* ignore */
    }
  }

  var sessionId = getSessionId();

  // ============================================
  // Fingerprint generation (cookieless tracking)
  // ============================================
  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    // Convert to unsigned 32-bit and then to hex
    return (hash >>> 0).toString(16);
  }

  function getCanvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';

      // Draw text with specific styling
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(50, 0, 80, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('Worder fp', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Worder fp', 4, 17);

      // Arc
      ctx.beginPath();
      ctx.arc(100, 25, 10, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();

      return canvas.toDataURL();
    } catch (e) {
      return '';
    }
  }

  function generateFingerprint() {
    var components = [];

    // Canvas fingerprint
    components.push('canvas:' + getCanvasFingerprint());

    // Screen resolution + color depth
    var screen = window.screen || {};
    components.push('screen:' + (screen.width || 0) + 'x' + (screen.height || 0));
    components.push('depth:' + (screen.colorDepth || 0));
    components.push('avail:' + (screen.availWidth || 0) + 'x' + (screen.availHeight || 0));

    // Timezone
    try {
      components.push('tz:' + Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch (e) {
      components.push('tz:' + new Date().getTimezoneOffset());
    }

    // Language
    components.push('lang:' + (navigator.language || navigator.userLanguage || ''));
    components.push('langs:' + (navigator.languages ? navigator.languages.join(',') : ''));

    // Platform
    components.push('platform:' + (navigator.platform || ''));

    // Device pixel ratio
    components.push('dpr:' + (window.devicePixelRatio || 1));

    // Hardware concurrency
    components.push('cores:' + (navigator.hardwareConcurrency || ''));

    // Touch support
    components.push('touch:' + ('ontouchstart' in window ? 1 : 0));
    components.push('maxt:' + (navigator.maxTouchPoints || 0));

    return simpleHash(components.join('|'));
  }

  var fingerprint = generateFingerprint();

  // ============================================
  // URL param helper
  // ============================================
  function getUrlParam(param) {
    try {
      var url = new URL(window.location.href);
      return url.searchParams.get(param);
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // UTM & Click ID extraction
  // ============================================
  function extractUtmParams() {
    var params = {};
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    var clickKeys = ['gclid', 'fbclid', 'ttclid', 'msclkid', 'dclid', 'li_fat_id', 'twclid', 'scclid'];
    for (var i = 0; i < utmKeys.length; i++) {
      var v = getUrlParam(utmKeys[i]);
      if (v) params[utmKeys[i]] = v;
    }
    for (var j = 0; j < clickKeys.length; j++) {
      var cv = getUrlParam(clickKeys[j]);
      if (cv) params[clickKeys[j]] = cv;
    }
    return Object.keys(params).length > 0 ? params : null;
  }

  var cachedUtmParams = extractUtmParams();

  // Persist UTM/click IDs in sessionStorage so they survive internal navigation
  try {
    if (cachedUtmParams) {
      sessionStorage.setItem('__worder_utm', JSON.stringify(cachedUtmParams));
    } else {
      var stored = sessionStorage.getItem('__worder_utm');
      if (stored) cachedUtmParams = JSON.parse(stored);
    }
  } catch(e) {}

  // ============================================
  // Email Attribution (worderContactID / worderSendID / worderCampaignID)
  //
  // When a visitor clicks a link inside a Worder email, the click
  // redirect (/api/t/c/<sendId>) stamps the destination URL with
  // these params. We capture them on first pageview, persist for 90
  // days, and echo on every subsequent event so a) the storefront
  // pixel identifies the visitor as that exact contact even without
  // an email/cookie match, and b) any purchase within the window
  // gets attributed to the right send/campaign.
  //
  // 90-day window matches Klaviyo/Omnisend defaults. Cookie is 1st-
  // party so it survives Safari ITP (unlike the previous-gen pattern
  // of 3rd-party cookies that broke in 2020).
  // ============================================
  var ATTRIB_COOKIE = '__worder_attribution';
  var ATTRIB_DAYS = 90;

  function captureEmailAttribution() {
    var contactId = getUrlParam('worderContactID');
    var sendId = getUrlParam('worderSendID');
    var campaignId = getUrlParam('worderCampaignID');
    if (!contactId && !sendId && !campaignId) return null;
    var attrib = {
      contactId: contactId,
      sendId: sendId,
      campaignId: campaignId,
      capturedAt: Date.now(),
      source: 'email_link',
    };
    try {
      setCookie(ATTRIB_COOKIE, JSON.stringify(attrib), ATTRIB_DAYS);
    } catch (e) {}
    return attrib;
  }

  function loadEmailAttribution() {
    try {
      var raw = getCookie(ATTRIB_COOKIE);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      // 90-day TTL guard. The cookie's own expires also enforces this,
      // but Safari sometimes hands back stale cookies post-ITP — check
      // the timestamp in payload too.
      if (parsed.capturedAt && Date.now() - parsed.capturedAt > ATTRIB_DAYS * 86400000) {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  var cachedAttribution = captureEmailAttribution() || loadEmailAttribution();

  // ============================================
  // SEND EVENT
  // ============================================
  function sendEvent(eventType, properties) {
    touchSession();

    var payload = {
      eventId: generateUUID(),
      storeDomain: config.shopDomain,
      eventType: eventType,
      properties: properties || {},
      visitorId: visitorId,
      sessionId: sessionId,
      fingerprint: fingerprint,
      source: 'theme_ext',
      url: window.location.href,
      referrer: document.referrer,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    // Include UTM/click ID params
    if (cachedUtmParams) {
      payload.utm = cachedUtmParams;
    }

    // Include email attribution (worderContactID etc.). The server
    // uses payload.attribution.contactId to bind the visitor identity
    // to this contact even when no email/phone/customer is present —
    // which is the cross-device case (click email on phone, browse on
    // desktop). Echoed on every event for the 90-day window.
    if (cachedAttribution) {
      payload.attribution = cachedAttribution;
    }

    // Include customer/contact identity if available
    if (window.__worder && window.__worder.customer) {
      var c = window.__worder.customer;
      payload.customer = {
        email: c.email || null,
        phone: c.phone || null,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        shopifyCustomerId: c.shopifyCustomerId ? String(c.shopifyCustomerId) : null,
      };
    } else {
      // Fallback: use popup-identified email from cookie so server resolves
      // contact directly without needing the visitorId→contact lookup query.
      var idEmail = getCookie(COOKIE_EMAIL);
      if (idEmail) {
        payload.customer = { email: idEmail };
      }
    }

    var body = JSON.stringify(payload);
    var url = ENDPOINT + '/event';

    // Prefer sendBeacon (non-blocking, survives page unload)
    if (navigator.sendBeacon) {
      var sent = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (!sent) {
        fetchFallback(url, body);
      }
    } else {
      fetchFallback(url, body);
    }
  }

  function fetchFallback(url, body) {
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* silently fail */
    }
  }

  // ============================================
  // SEND IDENTIFY
  // ============================================
  function sendIdentify(data) {
    touchSession();

    var payload = {
      eventId: generateUUID(),
      storeDomain: config.shopDomain,
      visitorId: visitorId,
      sessionId: sessionId,
      fingerprint: fingerprint,
      email: data.email || null,
      phone: data.phone || null,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      shopifyCustomerId: data.shopifyCustomerId ? String(data.shopifyCustomerId) : null,
      // contactId is set when we already know the Worder contact UUID
      // (e.g. from the email click attribution). The server skips the
      // email/phone resolution step and binds visitor → contact
      // directly, which is what makes cross-device attribution work
      // even before the visitor types anything.
      contactId: data.contactId || null,
      properties: data.properties || {},
      source: data.source || 'theme_ext',
      timestamp: new Date().toISOString(),
    };

    var body = JSON.stringify(payload);

    try {
      fetch(ENDPOINT + '/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* silently fail */
    }
  }

  // ============================================
  // AUTOMATIC IDENTIFICATION
  // ============================================

  // 1. Logged-in Shopify customer: auto-identify
  if (window.__worder && window.__worder.customer && window.__worder.customer.email) {
    var cust = window.__worder.customer;
    setCookie(COOKIE_EMAIL, cust.email, COOKIE_DAYS);
    sendIdentify({
      email: cust.email,
      phone: cust.phone,
      firstName: cust.firstName,
      lastName: cust.lastName,
      shopifyCustomerId: cust.shopifyCustomerId,
      source: 'shopify_login',
      properties: {
        ordersCount: cust.ordersCount,
        totalSpent: cust.totalSpent,
        tags: cust.tags,
        acceptsMarketing: cust.acceptsMarketing,
      },
    });
  }

  // 2. UTM Email capture (clicked link from Worder email/whatsapp)
  var utmEmail = getUrlParam('utm_email') || getUrlParam('worder_email');
  if (utmEmail && utmEmail.indexOf('@') > -1) {
    setCookie(COOKIE_EMAIL, utmEmail, COOKIE_DAYS);
    sendIdentify({
      email: utmEmail,
      source: 'utm_email',
    });
  }

  // 2b. worderContactID from URL — fires a bind-only identify so the
  // visitor_identities row attaches to this contact even before any
  // event lands. Crucial for cross-device: user opened email on
  // mobile, clicked through, browses on desktop → that desktop
  // visitorId now points to the same contact, every viewed_product /
  // add_to_cart on the same session is attributed.
  if (cachedAttribution && cachedAttribution.contactId) {
    sendIdentify({
      contactId: cachedAttribution.contactId,
      source: 'email_link',
      properties: {
        worderSendID: cachedAttribution.sendId,
        worderCampaignID: cachedAttribution.campaignId,
      },
    });
  }

  // 3. Cookie recall (previously identified, not currently logged in)
  if (!(window.__worder && window.__worder.customer && window.__worder.customer.email)) {
    var savedEmail = getCookie(COOKIE_EMAIL);
    if (savedEmail) {
      sendIdentify({ email: savedEmail, source: 'cookie_recall' });
    }
  }

  // ============================================
  // EVENT TRACKING
  // ============================================

  // --- Viewed Product (only on product pages) ---
  if (window.__worder && window.__worder.product) {
    var p = window.__worder.product;
    sendEvent('viewed_product', {
      productId: String(p.id),
      title: p.title,
      url: window.location.origin + (p.url || ''),
      imageUrl: p.imageUrl,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      vendor: p.vendor,
      productType: p.type,
      tags: p.tags,
      variantId: String(p.selectedVariantId || ''),
      variantTitle: p.selectedVariantTitle,
      sku: p.sku,
      handle: p.handle,
      available: p.available,
    });
  }

  // --- Viewed Collection (only on collection pages) ---
  if (window.__worder && window.__worder.collection) {
    var col = window.__worder.collection;
    sendEvent('viewed_collection', {
      collectionId: String(col.id),
      collectionTitle: col.title,
      collectionUrl: window.location.origin + (col.url || ''),
      collectionHandle: col.handle,
      productCount: col.productsCount,
    });
  }

  // ============================================
  // HEARTBEAT: Active on Site (every 5 min while visible)
  // ============================================
  var heartbeatTimer = null;
  var pageLoadTime = Date.now();

  function sendHeartbeat() {
    var now = Date.now();
    sendEvent('active_on_site', {
      url: window.location.href,
      title: document.title,
      template: (window.__worder && window.__worder.template) || null,
      referrer: document.referrer,
      timeOnPageMs: now - pageLoadTime,
    });
  }

  // Send initial active_on_site immediately
  sendHeartbeat();

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      if (!document.hidden) {
        sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  startHeartbeat();

  // Pause heartbeat when page is hidden, resume when visible
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopHeartbeat();
    } else {
      // Refresh session on visibility return
      sessionId = getSessionId();
      startHeartbeat();
    }
  });

  // ============================================
  // PUBLIC API
  // ============================================
  window.worder = {
    /**
     * Identify a visitor with profile data.
     * @param {Object} data - { email, phone, firstName, lastName, properties }
     */
    identify: function (data) {
      if (!data) return;
      if (data.email) {
        setCookie(COOKIE_EMAIL, data.email, COOKIE_DAYS);
        // Set in-memory so same-page events include identity immediately
        if (!window.__worder) window.__worder = {};
        if (!window.__worder.customer) {
          window.__worder.customer = { email: data.email, phone: data.phone, firstName: data.firstName, lastName: data.lastName };
        }
      }
      sendIdentify({
        email: data.email,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        shopifyCustomerId: data.shopifyCustomerId,
        source: 'public_api',
        properties: data.properties || {},
      });
    },

    /**
     * Track a custom event.
     * @param {string} eventType - Event name
     * @param {Object} properties - Event properties
     */
    track: function (eventType, properties) {
      if (!eventType) return;
      sendEvent(eventType, properties || {});
    },

    /**
     * Get the current visitor ID.
     * @returns {string}
     */
    getVisitorId: function () {
      return visitorId;
    },

    /**
     * Get the current session ID.
     * @returns {string}
     */
    getSessionId: function () {
      return sessionId;
    },

    /**
     * Get the browser fingerprint hash.
     * @returns {string}
     */
    getFingerprint: function () {
      return fingerprint;
    },
  };

  // ============================================
  // AUTO-LOAD PUBLISHED POPUPS
  // ============================================
  // Ping the server so the dashboard can mark embed_installed=true.
  // Shopify doesn't fire a webhook when the merchant flips the App
  // Embed toggle, so this side-effect is our activation signal.
  // sessionStorage gate keeps it to one ping per tab session
  // (cheaper than once-per-pageview, more reliable than once-ever).
  (function pingEmbed() {
    try {
      var pingedKey = '__worder_embed_ping_v1';
      if (sessionStorage.getItem(pingedKey)) return;
      var endpoint = (config.endpoint || 'https://worder1.vercel.app/api/track').replace('/api/track', '');
      var payload = JSON.stringify({ shopDomain: config.shopDomain || window.location.host });
      // navigator.sendBeacon is non-blocking and survives page unloads,
      // perfect for fire-and-forget activation pings.
      var sent = false;
      if (navigator.sendBeacon) {
        try {
          sent = navigator.sendBeacon(
            endpoint + '/api/storefront/embed-ping',
            new Blob([payload], { type: 'application/json' })
          );
        } catch (e) {}
      }
      if (!sent) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', endpoint + '/api/storefront/embed-ping', true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(payload);
        } catch (e) {}
      }
      sessionStorage.setItem(pingedKey, '1');
    } catch (e) {}
  })();

  // Fetch published popups for this store and inject their scripts
  (function loadPopups() {
    var popupEndpoint = (config.endpoint || 'https://worder1.vercel.app/api/track').replace('/api/track', '');
    var domain = config.shopDomain || '';
    if (!domain) return;

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', popupEndpoint + '/api/public/forms?domain=' + encodeURIComponent(domain) + '&status=published', true);
      xhr.onload = function () {
        if (xhr.status !== 200) return;
        try {
          var data = JSON.parse(xhr.responseText);
          var forms = data.forms || data || [];
          forms.forEach(function (form) {
            if (!form.id) return;
            var s = document.createElement('script');
            s.src = popupEndpoint + '/api/public/forms/' + form.id + '/script';
            s.async = true;
            document.head.appendChild(s);
          });
        } catch (e) {}
      };
      xhr.send();
    } catch (e) {}
  })();
})();
