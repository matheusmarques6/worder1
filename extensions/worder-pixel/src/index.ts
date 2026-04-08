// =============================================
// Worder Web Pixel Extension
// extensions/worder-pixel/src/index.ts
//
// Runs in Shopify's sandboxed Web Pixel environment.
// Captures events that the App Embed cannot:
// - Added to Cart / Removed from Cart
// - Checkout Started / Completed
// - Search Submitted / Cart Viewed
// - Payment Info Submitted
// - Checkout Contact Info Submitted
//
// NOTE: Viewed Product, Viewed Collection, Active on Site
// are tracked by the App Embed (which has DOM/cookie access).
// =============================================

import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser, settings, init }) => {
  const ENDPOINT = settings.trackingEndpoint || 'https://app.worder.com/api/track/event';
  const ACCOUNT_ID = settings.accountId;
  const STORE_ID = settings.storeId;

  if (!ENDPOINT || !ACCOUNT_ID) return;

  const sendEvent = (eventType: string, data: any) => {
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: ACCOUNT_ID,
          storeId: STORE_ID,
          eventType,
          properties: data,
          source: 'shopify_pixel',
          email: init.data?.customer?.email || null,
          shopifyCustomerId: init.data?.customer?.id || null,
          timestamp: new Date().toISOString(),
          url: init.context?.document?.location?.href || null,
        }),
        keepalive: true,
      });
    } catch (err) {
      /* sandbox — silently fail */
    }
  };

  // =============================================
  // Added to Cart (ONLY the pixel captures this)
  // =============================================
  analytics.subscribe('product_added_to_cart', (event: any) => {
    const line = event.data?.cartLine;
    const merch = line?.merchandise;
    sendEvent('added_to_cart', {
      ProductID: merch?.product?.id,
      ProductName: merch?.product?.title,
      VariantID: merch?.id,
      VariantName: merch?.title,
      Price: parseFloat(merch?.price?.amount || '0'),
      Quantity: line?.quantity,
      ImageURL: merch?.image?.src,
      CartTotal: parseFloat(line?.cost?.totalAmount?.amount || '0'),
      Currency: line?.cost?.totalAmount?.currencyCode,
    });
  });

  // =============================================
  // Removed from Cart
  // =============================================
  analytics.subscribe('product_removed_from_cart', (event: any) => {
    const line = event.data?.cartLine;
    const merch = line?.merchandise;
    sendEvent('removed_from_cart', {
      ProductID: merch?.product?.id,
      ProductName: merch?.product?.title,
      VariantID: merch?.id,
      Price: parseFloat(merch?.price?.amount || '0'),
      Quantity: line?.quantity,
    });
  });

  // =============================================
  // Checkout Started
  // =============================================
  analytics.subscribe('checkout_started', (event: any) => {
    const checkout = event.data?.checkout;
    sendEvent('checkout_started', {
      $value: parseFloat(checkout?.totalPrice?.amount || '0'),
      ItemCount: checkout?.lineItems?.length || 0,
      Currency: checkout?.currencyCode,
      Items: (checkout?.lineItems || []).map((item: any) => ({
        ProductID: item.variant?.product?.id,
        ProductName: item.title,
        VariantName: item.variant?.title,
        Quantity: item.quantity,
        Price: parseFloat(item.variant?.price?.amount || '0'),
        ImageURL: item.variant?.image?.src,
      })),
    });
  });

  // =============================================
  // Checkout Completed
  // =============================================
  analytics.subscribe('checkout_completed', (event: any) => {
    const checkout = event.data?.checkout;
    sendEvent('checkout_completed', {
      $value: parseFloat(checkout?.totalPrice?.amount || '0'),
      OrderId: checkout?.order?.id,
      Email: checkout?.email,
      Phone: checkout?.phone,
      Currency: checkout?.currencyCode,
    });
  });

  // =============================================
  // Search Submitted
  // =============================================
  analytics.subscribe('search_submitted', (event: any) => {
    sendEvent('submitted_search', {
      SearchQuery: event.data?.searchResult?.query,
      ResultCount: event.data?.searchResult?.productVariants?.length || 0,
    });
  });

  // =============================================
  // Cart Viewed
  // =============================================
  analytics.subscribe('cart_viewed', (event: any) => {
    sendEvent('cart_viewed', {
      CartTotal: parseFloat(event.data?.cart?.cost?.totalAmount?.amount || '0'),
      ItemCount: event.data?.cart?.lines?.length || 0,
      Currency: event.data?.cart?.cost?.totalAmount?.currencyCode,
    });
  });

  // =============================================
  // Checkout Contact Info Submitted (email entered at checkout)
  // =============================================
  analytics.subscribe('checkout_contact_info_submitted', (event: any) => {
    const checkout = event.data?.checkout;
    sendEvent('checkout_contact_submitted', {
      Email: checkout?.email,
      Phone: checkout?.phone,
      $value: parseFloat(checkout?.totalPrice?.amount || '0'),
    });
  });

  // =============================================
  // Payment Info Submitted
  // =============================================
  analytics.subscribe('payment_info_submitted', (event: any) => {
    const checkout = event.data?.checkout;
    sendEvent('payment_submitted', {
      $value: parseFloat(checkout?.totalPrice?.amount || '0'),
      Currency: checkout?.currencyCode,
    });
  });
});
