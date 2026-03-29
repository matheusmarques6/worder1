(function() {
  'use strict';
  var script = document.currentScript;
  if (!script) return;

  var orgId = script.getAttribute('data-org');
  var baseUrl = script.src.replace('/worder-shopify-pixel.js', '');

  var vid = localStorage.getItem('_wdr_vid');
  if (!vid) {
    vid = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('_wdr_vid', vid);
  }

  var sid = sessionStorage.getItem('_wdr_sid');
  if (!sid) {
    sid = 's_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('_wdr_sid', sid);
  }

  function send(event, data) {
    fetch(baseUrl + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        visitor_id: vid,
        session_id: sid,
        event_name: event,
        page_url: window.location.href,
        referrer: document.referrer,
        custom_data: data || {}
      }),
      keepalive: true
    }).catch(function() {});
  }

  // Shopify events integration
  if (window.Shopify && window.Shopify.analytics) {
    // Modern Shopify Web Pixels
    try {
      analytics.subscribe('page_viewed', function(event) { send('page_view', { shopify: true }); });
      analytics.subscribe('product_viewed', function(event) {
        var p = event.data.productVariant;
        send('product_viewed', { product_id: p.product.id, product_title: p.product.title, variant_id: p.id, price: p.price.amount, currency: p.price.currencyCode });
      });
      analytics.subscribe('collection_viewed', function(event) {
        send('collection_viewed', { collection_id: event.data.collection.id, collection_title: event.data.collection.title });
      });
      analytics.subscribe('cart_viewed', function(event) { send('cart_viewed', {}); });
      analytics.subscribe('checkout_started', function(event) {
        var c = event.data.checkout;
        send('checkout_started', { checkout_token: c.token, total: c.totalPrice.amount, item_count: c.lineItems.length });
      });
      analytics.subscribe('checkout_completed', function(event) {
        var c = event.data.checkout;
        send('checkout_completed', { order_id: c.order.id, total: c.totalPrice.amount, email: c.email, item_count: c.lineItems.length });
      });
    } catch(e) {}
  } else {
    // Fallback: just track page views
    send('page_view', { shopify_fallback: true });
  }
})();
