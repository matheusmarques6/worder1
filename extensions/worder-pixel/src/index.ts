// =============================================
// Worder Web Pixel Extension
// extensions/worder-pixel/src/index.ts
//
// Runs in Shopify's sandboxed Web Pixel environment.
// Captures cart, checkout, search, and browse events.
//
// NOTE: Viewed Product, Viewed Collection, Active on Site,
// and fingerprinting are tracked by the Theme App Extension
// (which has full DOM/cookie access).
// =============================================

import { register } from '@shopify/web-pixels-extension';

register(({ analytics, browser, settings, init }) => {
  const ENDPOINT =
    settings.trackingEndpoint ||
    init.data?.app?.metafields?.trackingEndpoint ||
    'https://app.worder.com/api/track/event';
  const ACCOUNT_ID = settings.accountId;
  const STORE_ID = settings.storeId;

  if (!ENDPOINT || !ACCOUNT_ID) return;

  // =============================================
  // UUID generation (RFC4122-ish v4)
  // =============================================
  function generateUUID(): string {
    let d = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // =============================================
  // Persistent Visitor ID (365 days via localStorage)
  // =============================================
  const VISITOR_KEY = '__worder_visitor_id';
  const SESSION_KEY = '__worder_session_id';
  const SESSION_TS_KEY = '__worder_session_ts';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  let visitorId: string;
  let sessionId: string;
  let storageAvailable = false;

  function initIds(): void {
    try {
      // Test localStorage availability in sandbox
      const testKey = '__worder_test';
      browser.localStorage.setItem(testKey, '1');
      browser.localStorage.removeItem(testKey);
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }

    if (storageAvailable) {
      // Visitor ID - persistent (365 days conceptually, stored in localStorage)
      try {
        const stored = browser.localStorage.getItem(VISITOR_KEY);
        if (stored) {
          visitorId = stored;
        } else {
          visitorId = generateUUID();
          browser.localStorage.setItem(VISITOR_KEY, visitorId);
        }
      } catch {
        visitorId = generateUUID();
      }

      // Session ID - refreshed after 30 min inactivity
      try {
        const storedSession = browser.localStorage.getItem(SESSION_KEY);
        const storedTs = browser.localStorage.getItem(SESSION_TS_KEY);
        const now = Date.now();

        if (storedSession && storedTs && now - parseInt(storedTs, 10) < SESSION_TIMEOUT_MS) {
          sessionId = storedSession;
        } else {
          sessionId = generateUUID();
          browser.localStorage.setItem(SESSION_KEY, sessionId);
        }
        browser.localStorage.setItem(SESSION_TS_KEY, String(now));
      } catch {
        sessionId = generateUUID();
      }
    } else {
      // Fallback: new IDs per pixel load
      visitorId = generateUUID();
      sessionId = generateUUID();
    }
  }

  initIds();

  // Touch session timestamp on every event
  function touchSession(): void {
    if (storageAvailable) {
      try {
        browser.localStorage.setItem(SESSION_TS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    }
  }

  // =============================================
  // Send event via sendBeacon (preferred) with fetch fallback
  // =============================================
  function sendEvent(eventType: string, data: Record<string, any>, customerData?: Record<string, any>): void {
    touchSession();

    const payload: Record<string, any> = {
      eventId: generateUUID(),
      accountId: ACCOUNT_ID,
      storeId: STORE_ID,
      eventType,
      visitorId,
      sessionId,
      properties: data,
      source: 'shopify_pixel',
      timestamp: new Date().toISOString(),
      url: init.context?.document?.location?.href || null,
    };

    // Attach customer info from init data or checkout
    if (customerData) {
      payload.customer = customerData;
    } else if (init.data?.customer) {
      payload.customer = {
        email: init.data.customer.email || null,
        phone: init.data.customer.phone || null,
        firstName: init.data.customer.firstName || null,
        lastName: init.data.customer.lastName || null,
        shopifyCustomerId: init.data.customer.id || null,
      };
    }

    const body = JSON.stringify(payload);

    try {
      // Prefer sendBeacon for reliability on navigation
      const sent = browser.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (!sent) {
        throw new Error('sendBeacon returned false');
      }
    } catch {
      // Fallback to fetch with keepalive
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      } catch {
        /* sandbox - silently fail */
      }
    }
  }

  // =============================================
  // Helpers: extract rich data from Shopify events
  // =============================================
  function extractProduct(merch: any): Record<string, any> {
    if (!merch) return {};
    return {
      productId: merch.product?.id || null,
      title: merch.product?.title || null,
      vendor: merch.product?.vendor || null,
      price: parseFloat(merch.price?.amount || '0'),
      currency: merch.price?.currencyCode || null,
      compareAtPrice: merch.compareAtPrice ? parseFloat(merch.compareAtPrice.amount || '0') : null,
      imageUrl: merch.image?.src || null,
      variantId: merch.id || null,
      variantTitle: merch.title || null,
      sku: merch.sku || null,
      productUrl: merch.product?.url || null,
    };
  }

  function extractLineItems(lineItems: any[]): Record<string, any>[] {
    if (!lineItems || !Array.isArray(lineItems)) return [];
    return lineItems.map((item: any) => ({
      productId: item.variant?.product?.id || item.id || null,
      title: item.title || item.variant?.product?.title || null,
      vendor: item.variant?.product?.vendor || null,
      variantId: item.variant?.id || null,
      variantTitle: item.variant?.title || null,
      sku: item.variant?.sku || null,
      price: parseFloat(item.variant?.price?.amount || item.price?.amount || '0'),
      compareAtPrice: item.variant?.compareAtPrice
        ? parseFloat(item.variant.compareAtPrice.amount || '0')
        : null,
      imageUrl: item.variant?.image?.src || null,
      productUrl: item.variant?.product?.url || null,
      quantity: item.quantity || 1,
      lineTotal: parseFloat(item.totalPrice?.amount || item.cost?.totalAmount?.amount || '0'),
    }));
  }

  function extractCheckout(checkout: any): Record<string, any> {
    if (!checkout) return {};
    return {
      subtotalPrice: checkout.subtotalPrice ? parseFloat(checkout.subtotalPrice.amount || '0') : null,
      totalTax: checkout.totalTax ? parseFloat(checkout.totalTax.amount || '0') : null,
      totalPrice: parseFloat(checkout.totalPrice?.amount || '0'),
      currency: checkout.currencyCode || null,
      discountCodes: checkout.discountApplications?.map((d: any) => d.title || d.code) || [],
      lineItems: extractLineItems(checkout.lineItems || []),
      itemCount: checkout.lineItems?.length || 0,
      orderId: checkout.order?.id || null,
      orderNumber: checkout.order?.name || null,
      token: checkout.token || null,
    };
  }

  function extractCustomerFromCheckout(checkout: any): Record<string, any> | undefined {
    if (!checkout) return undefined;
    const email = checkout.email;
    const phone = checkout.phone;
    const shipping = checkout.shippingAddress;
    if (!email && !phone) return undefined;
    return {
      email: email || null,
      phone: phone || null,
      firstName: shipping?.firstName || null,
      lastName: shipping?.lastName || null,
      shopifyCustomerId: checkout.order?.customer?.id || null,
    };
  }

  // =============================================
  // Event Subscriptions
  // =============================================

  // --- Page Viewed ---
  analytics.subscribe('page_viewed', (event: any) => {
    sendEvent('page_viewed', {
      url: event.context?.document?.location?.href || null,
      title: event.context?.document?.title || null,
      referrer: event.context?.document?.referrer || null,
      pathname: event.context?.document?.location?.pathname || null,
    });
  });

  // --- Collection Viewed ---
  analytics.subscribe('collection_viewed', (event: any) => {
    const collection = event.data?.collection;
    sendEvent('collection_viewed', {
      collectionId: collection?.id || null,
      collectionTitle: collection?.title || null,
      collectionHandle: collection?.handle || null,
      productVariants: (collection?.productVariants || []).map((v: any) => ({
        productId: v.product?.id || null,
        title: v.product?.title || null,
        variantId: v.id || null,
        price: parseFloat(v.price?.amount || '0'),
        imageUrl: v.image?.src || null,
      })),
    });
  });

  // --- Product Added to Cart ---
  analytics.subscribe('product_added_to_cart', (event: any) => {
    const line = event.data?.cartLine;
    const merch = line?.merchandise;
    sendEvent('added_to_cart', {
      ...extractProduct(merch),
      quantity: line?.quantity || 1,
      lineTotal: parseFloat(line?.cost?.totalAmount?.amount || '0'),
      lineCurrency: line?.cost?.totalAmount?.currencyCode || null,
    });
  });

  // --- Product Removed from Cart ---
  analytics.subscribe('product_removed_from_cart', (event: any) => {
    const line = event.data?.cartLine;
    const merch = line?.merchandise;
    sendEvent('removed_from_cart', {
      ...extractProduct(merch),
      quantity: line?.quantity || 1,
      lineTotal: parseFloat(line?.cost?.totalAmount?.amount || '0'),
    });
  });

  // --- Cart Viewed ---
  analytics.subscribe('cart_viewed', (event: any) => {
    const cart = event.data?.cart;
    sendEvent('cart_viewed', {
      totalPrice: parseFloat(cart?.cost?.totalAmount?.amount || '0'),
      currency: cart?.cost?.totalAmount?.currencyCode || null,
      itemCount: cart?.lines?.length || 0,
      lineItems: (cart?.lines || []).map((line: any) => {
        const merch = line?.merchandise;
        return {
          ...extractProduct(merch),
          quantity: line?.quantity || 1,
          lineTotal: parseFloat(line?.cost?.totalAmount?.amount || '0'),
        };
      }),
    });
  });

  // --- Checkout Started ---
  analytics.subscribe('checkout_started', (event: any) => {
    const checkout = event.data?.checkout;
    const customerData = extractCustomerFromCheckout(checkout);
    sendEvent('checkout_started', extractCheckout(checkout), customerData);
  });

  // --- Checkout Contact Info Submitted ---
  analytics.subscribe('checkout_contact_info_submitted', (event: any) => {
    const checkout = event.data?.checkout;
    const customerData = extractCustomerFromCheckout(checkout);
    sendEvent(
      'checkout_contact_submitted',
      {
        ...extractCheckout(checkout),
        email: checkout?.email || null,
        phone: checkout?.phone || null,
      },
      customerData
    );
  });

  // --- Payment Info Submitted ---
  analytics.subscribe('payment_info_submitted', (event: any) => {
    const checkout = event.data?.checkout;
    const customerData = extractCustomerFromCheckout(checkout);
    sendEvent('payment_submitted', extractCheckout(checkout), customerData);
  });

  // --- Checkout Completed ---
  analytics.subscribe('checkout_completed', (event: any) => {
    const checkout = event.data?.checkout;
    const customerData = extractCustomerFromCheckout(checkout);
    sendEvent('checkout_completed', extractCheckout(checkout), customerData);
  });

  // --- Search Submitted ---
  analytics.subscribe('search_submitted', (event: any) => {
    const searchResult = event.data?.searchResult;
    sendEvent('search_submitted', {
      query: searchResult?.query || null,
      resultCount: searchResult?.productVariants?.length || 0,
      results: (searchResult?.productVariants || []).slice(0, 10).map((v: any) => ({
        productId: v.product?.id || null,
        title: v.product?.title || null,
        variantId: v.id || null,
        price: parseFloat(v.price?.amount || '0'),
        imageUrl: v.image?.src || null,
      })),
    });
  });
});
