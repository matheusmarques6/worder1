// =============================================
// Worder Web Pixel Extension
// extensions/worder-pixel/src/index.ts
//
// Runs in Shopify's sandboxed Web Pixel environment.
// Subscribes to standard customer events and sends
// them to the Worder tracking endpoint.
// =============================================

import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser, settings, init }) => {
  const { accountId, storeId, trackingEndpoint } = settings;

  if (!trackingEndpoint || !accountId) {
    console.warn('[Worder Pixel] Missing settings: trackingEndpoint or accountId');
    return;
  }

  // =============================================
  // HELPER: Send event to Worder backend
  // =============================================

  function sendEvent(eventType: string, properties: Record<string, any>, customerData?: any) {
    const payload = {
      accountId,
      storeId,
      eventType,
      properties,
      clientId: customerData?.id || init.data?.customer?.id || null,
      email: customerData?.email || init.data?.customer?.email || null,
      timestamp: new Date().toISOString(),
      url: properties._url || null,
      userAgent: navigator.userAgent,
      sessionId: getSessionId(),
    };

    // Remove internal fields
    delete properties._url;

    fetch(trackingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Silently fail — tracking should never break the store
    });
  }

  function getSessionId(): string {
    // Generate a simple session ID persisted for the tab session
    try {
      let sid = sessionStorage.getItem('__worder_sid');
      if (!sid) {
        sid = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('__worder_sid', sid);
      }
      return sid;
    } catch {
      return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  // =============================================
  // PRODUCT VIEWED
  // =============================================

  analytics.subscribe('product_viewed', (event) => {
    const product = event.data?.productVariant;
    sendEvent('viewed_product', {
      product_id: product?.product?.id,
      product_title: product?.product?.title,
      product_url: product?.product?.url,
      variant_id: product?.id,
      variant_title: product?.title,
      price: product?.price?.amount,
      currency: product?.price?.currencyCode,
      image_url: product?.image?.src || null,
      _url: event.context?.document?.location?.href,
    });
  });

  // =============================================
  // PRODUCT ADDED TO CART
  // =============================================

  analytics.subscribe('product_added_to_cart', (event) => {
    const item = event.data?.cartLine;
    const merchandise = item?.merchandise;
    sendEvent('added_to_cart', {
      product_id: merchandise?.product?.id,
      product_title: merchandise?.product?.title,
      variant_id: merchandise?.id,
      variant_title: merchandise?.title,
      price: merchandise?.price?.amount,
      currency: merchandise?.price?.currencyCode,
      quantity: item?.quantity || 1,
      image_url: merchandise?.image?.src || null,
      _url: event.context?.document?.location?.href,
    });
  });

  // =============================================
  // CHECKOUT STARTED
  // =============================================

  analytics.subscribe('checkout_started', (event) => {
    const checkout = event.data?.checkout;
    sendEvent(
      'checkout_started',
      {
        checkout_id: checkout?.token,
        total_price: checkout?.totalPrice?.amount,
        currency: checkout?.totalPrice?.currencyCode,
        item_count: checkout?.lineItems?.length || 0,
        items: (checkout?.lineItems || []).map((li: any) => ({
          product_id: li.variant?.product?.id,
          title: li.title,
          quantity: li.quantity,
          price: li.variant?.price?.amount,
          variant_title: li.variant?.title,
          image_url: li.variant?.image?.src || null,
        })),
        _url: event.context?.document?.location?.href,
      },
      checkout?.order?.customer
    );
  });

  // =============================================
  // CHECKOUT COMPLETED
  // =============================================

  analytics.subscribe('checkout_completed', (event) => {
    const checkout = event.data?.checkout;
    sendEvent(
      'checkout_completed',
      {
        checkout_id: checkout?.token,
        order_id: checkout?.order?.id,
        total_price: checkout?.totalPrice?.amount,
        currency: checkout?.totalPrice?.currencyCode,
        item_count: checkout?.lineItems?.length || 0,
        _url: event.context?.document?.location?.href,
      },
      checkout?.order?.customer
    );
  });

  // =============================================
  // COLLECTION VIEWED
  // =============================================

  analytics.subscribe('collection_viewed', (event) => {
    const collection = event.data?.collection;
    sendEvent('viewed_collection', {
      collection_id: collection?.id,
      collection_title: collection?.title,
      collection_url: event.context?.document?.location?.href,
      _url: event.context?.document?.location?.href,
    });
  });

  // =============================================
  // SEARCH SUBMITTED
  // =============================================

  analytics.subscribe('search_submitted', (event) => {
    const search = event.data?.searchResult;
    sendEvent('submitted_search', {
      query: search?.query || '',
      results_count: search?.productVariants?.length || 0,
      _url: event.context?.document?.location?.href,
    });
  });

  // =============================================
  // CART VIEWED
  // =============================================

  analytics.subscribe('cart_viewed', (event) => {
    const cart = event.data?.cart;
    sendEvent('cart_viewed', {
      total_price: cart?.cost?.totalAmount?.amount,
      currency: cart?.cost?.totalAmount?.currencyCode,
      item_count: cart?.lines?.length || 0,
      _url: event.context?.document?.location?.href,
    });
  });

  // =============================================
  // PAGE VIEWED
  // =============================================

  analytics.subscribe('page_viewed', (event) => {
    sendEvent('page_viewed', {
      url: event.context?.document?.location?.href || '',
      title: event.context?.document?.title || '',
      referrer: event.context?.document?.referrer || '',
      _url: event.context?.document?.location?.href,
    });
  });
});
