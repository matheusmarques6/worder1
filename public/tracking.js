/**
 * WORDER TRACKING PIXEL
 *
 * Instale no seu site adicionando o seguinte código antes do </head>:
 *
 * <script>
 *   window.worderConfig = {
 *     organizationId: 'SEU_ORGANIZATION_ID',
 *     apiUrl: 'https://seudominio.com',
 *     storeDomain: 'opcional-sualoja.myshopify.com'
 *   };
 * </script>
 * <script src="https://seudominio.com/tracking.js" async></script>
 *
 * Alternativa via CDN com data-attributes:
 * <script
 *   src="https://cdn.worder.app/tracking.min.js"
 *   data-org="SEU_ORGANIZATION_ID"
 *   data-store-domain="opcional-sualoja.myshopify.com"
 *   async></script>
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------
  var cfg = window.worderConfig || {};
  var currentScript = document.currentScript || null;
  var ds = (currentScript && currentScript.dataset) || {};

  var orgId = cfg.organizationId || ds.org || null;
  var apiUrl = cfg.apiUrl || 'https://worder1.vercel.app';
  var storeDomain = cfg.storeDomain || ds.storeDomain || null;
  var storeId = cfg.storeId || ds.storeId || null;

  if (!orgId && !storeId && !storeDomain) {
    console.warn('[Worder] organizationId/storeId/storeDomain não configurado');
    return;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function genId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? m[2] : null;
  }
  function setCookie(name, value, days) {
    var d = days || 365;
    var exp = new Date(Date.now() + d * 864e5).toUTCString();
    document.cookie = name + '=' + value + '; expires=' + exp + '; path=/; SameSite=Lax';
  }

  // IDs persistentes
  var visitorId = getCookie('_worder_vid');
  if (!visitorId) {
    visitorId = genId();
    setCookie('_worder_vid', visitorId);
  }
  var sessionId;
  try {
    sessionId = sessionStorage.getItem('_worder_sid');
    if (!sessionId) {
      sessionId = genId();
      sessionStorage.setItem('_worder_sid', sessionId);
    }
  } catch (e) {
    sessionId = genId();
  }

  // UTM & click ids
  var qs = new URLSearchParams(window.location.search);
  var utmParams = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
    var v = qs.get(k);
    if (v) utmParams[k] = v;
  });
  var clickIds = {};
  ['gclid', 'fbclid', 'ttclid', 'msclkid'].forEach(function (k) {
    var v = qs.get(k);
    if (v) clickIds[k] = v;
  });

  // ------------------------------------------------------------------
  // Envio para o endpoint PÚBLICO /api/track/event
  // ------------------------------------------------------------------
  function send(eventType, overrides) {
    var props = (overrides && overrides.properties) || {};
    var payload = {
      // Identificação do tenant
      accountId: orgId,
      storeId: storeId,
      storeDomain: storeDomain,

      // Visitante / sessão
      visitorId: visitorId,
      sessionId: sessionId,

      // Evento
      eventType: eventType,
      eventId: (overrides && overrides.eventId) || genId(),
      properties: props,

      // Contato (opcional)
      email: (overrides && overrides.email) || getCookie('_worder_email') || null,
      phone: (overrides && overrides.phone) || getCookie('_worder_phone') || null,
      firstName: overrides && overrides.firstName,
      lastName: overrides && overrides.lastName,
      shopifyCustomerId: overrides && overrides.shopifyCustomerId,

      // Atribuição
      utmParams: Object.keys(utmParams).length ? utmParams : undefined,
      clickIds: Object.keys(clickIds).length ? clickIds : undefined,

      // Contexto
      source: 'worder_pixel',
      url: window.location.href,
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    var body = JSON.stringify(payload);
    var endpoint = apiUrl + '/api/track/event';

    try {
      if (navigator.sendBeacon) {
        // sendBeacon exige Blob com content-type correto
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(endpoint, blob)) {
          if (cfg.debug) console.log('[Worder] beacon sent:', eventType);
          return;
        }
      }
    } catch (e) {
      // fall through pro fetch
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    }).catch(function () {
      /* silent */
    });

    if (cfg.debug) console.log('[Worder] fetch sent:', eventType);
  }

  // ------------------------------------------------------------------
  // API pública
  // ------------------------------------------------------------------
  var worder = {
    track: function (eventType, properties) {
      send(eventType, { properties: properties || {} });
    },
    identify: function (data) {
      data = data || {};
      if (data.email) setCookie('_worder_email', data.email);
      if (data.phone) setCookie('_worder_phone', data.phone);
      send('identify', {
        email: data.email,
        phone: data.phone,
        firstName: data.first_name || data.firstName,
        lastName: data.last_name || data.lastName,
        shopifyCustomerId: data.shopify_customer_id,
        properties: data,
      });
    },
    pageView: function () {
      send('page_viewed', { properties: {} });
    },
    productView: function (product) {
      product = product || {};
      send('viewed_product', {
        properties: {
          product_id: product.id,
          product_name: product.name,
          product_price: product.price,
          product_category: product.category,
        },
      });
    },
    addToCart: function (product) {
      product = product || {};
      send('added_to_cart', {
        properties: {
          product_id: product.id,
          product_name: product.name,
          product_price: product.price,
          product_quantity: product.quantity || 1,
        },
      });
    },
    removeFromCart: function (product) {
      product = product || {};
      send('removed_from_cart', {
        properties: {
          product_id: product.id,
          product_name: product.name,
        },
      });
    },
    checkout: function (data) {
      data = data || {};
      send('checkout_started', {
        email: data.email,
        properties: {
          order_total: data.total,
          items: data.items,
        },
      });
    },
    purchase: function (order) {
      order = order || {};
      send('checkout_completed', {
        email: order.email,
        properties: {
          order_id: order.id,
          total_price: order.total,
          items: order.items,
          Currency: order.currency,
        },
      });
    },
  };

  // Auto page view
  worder.pageView();

  // Expor
  window.worder = worder;

  // ------------------------------------------------------------------
  // Integração Shopify (opcional)
  // ------------------------------------------------------------------
  if (window.Shopify) {
    try {
      if (window.location.pathname.indexOf('/products/') !== -1) {
        var pd = window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product;
        if (pd) {
          worder.productView({
            id: pd.id,
            name: pd.title,
            price: pd.price / 100,
            category: pd.type,
          });
        }
      }
    } catch (e) {
      /* silent */
    }

    // Hook no /cart/add
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function () {
        try {
          var url = arguments[0];
          var opts = arguments[1];
          if (typeof url === 'string' && url.indexOf('/cart/add') !== -1 && opts && opts.body) {
            try {
              var d = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
              worder.addToCart({ id: d.id, quantity: d.quantity || 1 });
            } catch (e2) {}
          }
        } catch (e3) {}
        return origFetch.apply(this, arguments);
      };
    }
  }

  console.log('[Worder] Tracking initialized for org:', orgId);
})();
