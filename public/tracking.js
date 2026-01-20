/**
 * WORDER TRACKING PIXEL
 * 
 * Instale no seu site adicionando o seguinte código antes do </head>:
 * 
 * <script>
 *   window.worderConfig = { 
 *     organizationId: 'SEU_ORGANIZATION_ID',
 *     apiUrl: 'https://seudominio.com'
 *   };
 * </script>
 * <script src="https://seudominio.com/tracking.js" async></script>
 * 
 * OU use via CDN:
 * <script src="https://cdn.worder.app/tracking.min.js" data-org="SEU_ORGANIZATION_ID" async></script>
 */

(function() {
  'use strict';

  // Configuração
  const config = window.worderConfig || {};
  const orgId = config.organizationId || document.currentScript?.dataset?.org;
  const apiUrl = config.apiUrl || 'https://worder1.vercel.app';
  
  if (!orgId) {
    console.warn('[Worder] organizationId não configurado');
    return;
  }

  // Utilitários
  const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);
  
  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  };
  
  const setCookie = (name, value, days = 365) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
  };

  // IDs de visitante e sessão
  let visitorId = getCookie('_worder_vid');
  if (!visitorId) {
    visitorId = generateId();
    setCookie('_worder_vid', visitorId);
  }

  let sessionId = sessionStorage.getItem('_worder_sid');
  if (!sessionId) {
    sessionId = generateId();
    sessionStorage.setItem('_worder_sid', sessionId);
  }

  // Capturar UTM params
  const urlParams = new URLSearchParams(window.location.search);
  const utm = {
    source: urlParams.get('utm_source'),
    medium: urlParams.get('utm_medium'),
    campaign: urlParams.get('utm_campaign'),
  };

  // API de tracking
  const worder = {
    track: function(eventType, data = {}) {
      const payload = {
        organization_id: orgId,
        event_type: eventType,
        event_source: 'web',
        visitor_id: visitorId,
        session_id: sessionId,
        page_url: window.location.href,
        referrer_url: document.referrer,
        utm_source: utm.source,
        utm_medium: utm.medium,
        utm_campaign: utm.campaign,
        ...data,
      };

      // Enviar via Beacon API (não bloqueia)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `${apiUrl}/api/tracking/events`,
          JSON.stringify(payload)
        );
      } else {
        // Fallback para fetch
        fetch(`${apiUrl}/api/tracking/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }

      if (config.debug) {
        console.log('[Worder] Event:', eventType, payload);
      }
    },

    // Identificar usuário
    identify: function(data) {
      if (data.email) setCookie('_worder_email', data.email, 365);
      if (data.phone) setCookie('_worder_phone', data.phone, 365);
      this.track('identify', data);
    },

    // Eventos de e-commerce
    pageView: function() {
      this.track('page_view');
    },

    productView: function(product) {
      this.track('product_view', {
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        product_category: product.category,
      });
    },

    addToCart: function(product) {
      this.track('add_to_cart', {
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        product_quantity: product.quantity || 1,
      });
    },

    removeFromCart: function(product) {
      this.track('remove_from_cart', {
        product_id: product.id,
        product_name: product.name,
      });
    },

    checkout: function(data) {
      this.track('checkout_started', {
        order_total: data.total,
        customer_email: data.email,
        event_data: { items: data.items },
      });
    },

    purchase: function(order) {
      this.track('purchase', {
        order_id: order.id,
        order_total: order.total,
        customer_email: order.email,
        event_data: { items: order.items },
      });
    },
  };

  // Auto-track page views
  worder.pageView();

  // Restaurar identidade de cookies
  const savedEmail = getCookie('_worder_email');
  const savedPhone = getCookie('_worder_phone');
  if (savedEmail || savedPhone) {
    worder.customer_email = savedEmail;
    worder.customer_phone = savedPhone;
  }

  // Expor globalmente
  window.worder = worder;

  // Auto-tracking para Shopify (se detectado)
  if (window.Shopify) {
    // Detectar página de produto
    if (window.location.pathname.includes('/products/')) {
      const productData = window.ShopifyAnalytics?.meta?.product;
      if (productData) {
        worder.productView({
          id: productData.id,
          name: productData.title,
          price: productData.price / 100,
          category: productData.type,
        });
      }
    }

    // Hook no carrinho
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      
      if (typeof url === 'string' && url.includes('/cart/add')) {
        const body = options?.body;
        if (body) {
          try {
            const data = JSON.parse(body);
            worder.addToCart({
              id: data.id,
              quantity: data.quantity || 1,
            });
          } catch (e) {}
        }
      }

      return originalFetch.apply(this, args);
    };
  }

  console.log('[Worder] Tracking initialized for org:', orgId);
})();
