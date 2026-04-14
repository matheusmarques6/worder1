// =============================================
// Shopify Custom Pixel Code Generator
// GET /api/integrations/shopify/pixel-code?shop={domain}
//
// Returns a ready-to-paste JavaScript snippet that merchants copy into
// Shopify Admin → Settings → Customer Events → Add custom pixel.
// The pixel listens to Shopify's standard analytics events via
// analytics.subscribe() and forwards them to our CDP tracking endpoint.
//
// Advantages over theme-embedded scripts:
// - Runs inside checkout (theme scripts don't)
// - Sandboxed (no DOM access)
// - Survives theme changes
// - Structured event data (no DOM scraping)
// - Captures email at checkout_contact_info_submitted
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  const shopDomain = request.nextUrl.searchParams.get('shop');
  if (!shopDomain) {
    return NextResponse.json({ error: 'shop parameter required' }, { status: 400 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const trackEndpoint = `${apiUrl}/api/shopify/track`;

  const code = generatePixelCode(trackEndpoint, shopDomain);

  return NextResponse.json({
    code,
    instructions: {
      step1: 'No admin da Shopify, vá em Configurações → Customer Events',
      step2: 'Clique em "Adicionar pixel personalizado"',
      step3: 'Nomeie como "Worder"',
      step4: 'Cole o código no editor',
      step5: 'Em "Privacidade do cliente", mantenha "Não obrigatório" (ou ajuste conforme sua política)',
      step6: 'Clique em Salvar e depois em Conectar',
    },
  });
}

function generatePixelCode(trackEndpoint: string, shopDomain: string): string {
  // NOTE: the returned string is JavaScript that runs inside Shopify's
  // sandboxed Custom Pixel environment — it has `analytics`, `browser`
  // (async storage), and `init` (page context) available globally.
  return `// Worder Tracking Pixel
// Envia eventos de comportamento do visitante para o Worder CDP
// NAO edite este codigo — ele e gerado automaticamente

const WORDER_CONFIG = {
  endpoint: '${trackEndpoint}',
  shopDomain: '${shopDomain}',
};

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let visitorId;
try {
  visitorId = await browser.localStorage.getItem('_worder_vid');
  if (!visitorId) {
    visitorId = generateId();
    await browser.localStorage.setItem('_worder_vid', visitorId);
  }
} catch (e) {
  visitorId = generateId();
}

let sessionId;
try {
  sessionId = await browser.sessionStorage.getItem('_worder_sid');
  if (!sessionId) {
    sessionId = generateId();
    await browser.sessionStorage.setItem('_worder_sid', sessionId);
  }
} catch (e) {
  sessionId = generateId();
}

function sendEvent(eventType, eventData, eventContext) {
  const ctx = eventContext || {};
  const payload = {
    event_type: eventType,
    shop_domain: WORDER_CONFIG.shopDomain,
    visitor_id: visitorId,
    session_id: sessionId,
    page_url: ctx?.document?.location?.href || (typeof init !== 'undefined' ? init.context?.document?.location?.href : '') || '',
    page_title: ctx?.document?.title || (typeof init !== 'undefined' ? init.context?.document?.title : '') || '',
    referrer: ctx?.document?.referrer || (typeof init !== 'undefined' ? init.context?.document?.referrer : '') || '',
    timestamp: new Date().toISOString(),
    data: eventData || {},
  };

  fetch(WORDER_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

// Page View
analytics.subscribe('page_viewed', (event) => {
  sendEvent('page_view', {
    page_type: 'page',
    url: event.context?.document?.location?.href,
    title: event.context?.document?.title,
    referrer: event.context?.document?.referrer,
  }, event.context);
});

// Product Viewed
analytics.subscribe('product_viewed', (event) => {
  const variant = event.data?.productVariant;
  sendEvent('viewed_product', {
    product_id: variant?.product?.id,
    product_title: variant?.product?.title || variant?.title,
    product_url: variant?.product?.url,
    product_type: variant?.product?.type,
    product_vendor: variant?.product?.vendor,
    price: variant?.price?.amount,
    currency: variant?.price?.currencyCode,
    variant_id: variant?.id,
    variant_title: variant?.title,
    image_url: variant?.image?.src || null,
    sku: variant?.sku,
  }, event.context);
});

// Collection Viewed
analytics.subscribe('collection_viewed', (event) => {
  const collection = event.data?.collection;
  sendEvent('viewed_collection', {
    collection_id: collection?.id,
    collection_title: collection?.title,
    collection_url: event.context?.document?.location?.href,
  }, event.context);
});

// Search Submitted
analytics.subscribe('search_submitted', (event) => {
  sendEvent('submitted_search', {
    query: event.data?.searchResult?.query,
    results_count: event.data?.searchResult?.productVariants?.length || 0,
  }, event.context);
});

// Product Added to Cart
analytics.subscribe('product_added_to_cart', (event) => {
  const cartLine = event.data?.cartLine;
  const merch = cartLine?.merchandise;
  sendEvent('added_to_cart', {
    product_id: merch?.product?.id,
    product_title: merch?.product?.title || merch?.title,
    variant_id: merch?.id,
    variant_title: merch?.title,
    price: cartLine?.cost?.totalAmount?.amount,
    currency: cartLine?.cost?.totalAmount?.currencyCode,
    quantity: cartLine?.quantity || 1,
    sku: merch?.sku,
    image_url: merch?.image?.src || null,
  }, event.context);
});

// Cart Viewed
analytics.subscribe('cart_viewed', (event) => {
  const cart = event.data?.cart;
  sendEvent('cart_viewed', {
    cart_total: cart?.cost?.totalAmount?.amount,
    currency: cart?.cost?.totalAmount?.currencyCode,
    item_count: cart?.lines?.length || 0,
    items: (cart?.lines || []).map((line) => ({
      product_id: line.merchandise?.product?.id,
      title: line.merchandise?.product?.title || line.merchandise?.title,
      quantity: line.quantity,
      price: line.cost?.totalAmount?.amount,
    })),
  }, event.context);
});

// Checkout Started
analytics.subscribe('checkout_started', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('checkout_started', {
    checkout_id: checkout?.token,
    total_price: checkout?.totalPrice?.amount,
    subtotal_price: checkout?.subtotalPrice?.amount,
    currency: checkout?.currencyCode,
    item_count: checkout?.lineItems?.length || 0,
    items: (checkout?.lineItems || []).map((item) => ({
      product_id: item.variant?.product?.id,
      title: item.title,
      quantity: item.quantity,
      price: item.variant?.price?.amount,
      variant_title: item.variant?.title,
      sku: item.variant?.sku,
      image_url: item.variant?.image?.src || null,
    })),
  }, event.context);
});

// Email captured at checkout
analytics.subscribe('checkout_contact_info_submitted', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('email_captured', {
    email: checkout?.email,
    phone: checkout?.phone,
    checkout_id: checkout?.token,
    total_price: checkout?.totalPrice?.amount,
    currency: checkout?.currencyCode,
  }, event.context);
});

// Shipping info
analytics.subscribe('checkout_shipping_info_submitted', (event) => {
  const checkout = event.data?.checkout;
  const address = checkout?.shippingAddress;
  sendEvent('checkout_shipping_submitted', {
    checkout_id: checkout?.token,
    city: address?.city,
    province: address?.province,
    country: address?.country,
    zip: address?.zip,
  }, event.context);
});

// Payment info
analytics.subscribe('payment_info_submitted', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('payment_submitted', {
    checkout_id: checkout?.token,
    total_price: checkout?.totalPrice?.amount,
    currency: checkout?.currencyCode,
  }, event.context);
});

// Checkout Completed
analytics.subscribe('checkout_completed', (event) => {
  const checkout = event.data?.checkout;
  sendEvent('checkout_completed', {
    checkout_id: checkout?.token,
    order_id: checkout?.order?.id,
    email: checkout?.email,
    phone: checkout?.phone,
    total_price: checkout?.totalPrice?.amount,
    subtotal_price: checkout?.subtotalPrice?.amount,
    total_shipping: checkout?.shippingLine?.price?.amount,
    total_tax: checkout?.totalTax?.amount,
    currency: checkout?.currencyCode,
    item_count: checkout?.lineItems?.length || 0,
    discount_codes: (checkout?.discountApplications || []).map((d) => d.title),
    first_name: checkout?.shippingAddress?.firstName,
    last_name: checkout?.shippingAddress?.lastName,
    city: checkout?.shippingAddress?.city,
    country: checkout?.shippingAddress?.country,
    items: (checkout?.lineItems || []).map((item) => ({
      product_id: item.variant?.product?.id,
      title: item.title,
      quantity: item.quantity,
      price: item.variant?.price?.amount,
      variant_title: item.variant?.title,
      sku: item.variant?.sku,
    })),
  }, event.context);
});
`;
}
