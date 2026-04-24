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

  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.worder.com.br';

  // Generate simple 3-line loader (like WeTracked) instead of 300+ line inline code
  const loaderCode = `// Worder Tracking Pixel
// Instale como Custom Pixel no Shopify Admin → Settings → Customer Events
!function(t,w,d){var s=d.createElement("script");s.async=!0;s.src="${apiUrl}/api/pixel/worder-pixel.js?shop="+t.init.data.shop.myshopifyDomain;d.head.append(s);w.__worder_ctx=t}(this,window,document);`;

  // Also generate the full inline version as fallback
  const trackEndpoint = `${apiUrl}/api/shopify/track`;
  const inlineCode = generatePixelCode(trackEndpoint, shopDomain);

  return NextResponse.json({
    code: loaderCode,
    inlineCode,
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
  return `// Worder Tracking Pixel
// Envia eventos de comportamento do visitante para o Worder CDP
// NAO edite este codigo — ele e gerado automaticamente

const WORDER_CONFIG = {
  endpoint: '${trackEndpoint}',
  shopDomain: '${shopDomain}',
};

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

var visitorId = generateId();
var sessionId = generateId();
var knownEmail = null;
var knownPhone = null;

// Restore persisted IDs + contact info (async — runs before first event fires)
(async function() {
  try {
    var stored = await browser.localStorage.getItem('_worder_vid');
    if (stored) { visitorId = stored; }
    else { await browser.localStorage.setItem('_worder_vid', visitorId); }
  } catch(e) {}
  try {
    var sid = await browser.sessionStorage.getItem('_worder_sid');
    if (sid) { sessionId = sid; }
    else { await browser.sessionStorage.setItem('_worder_sid', sessionId); }
  } catch(e) {}
  try {
    var em = await browser.localStorage.getItem('_worder_email');
    if (em) knownEmail = em;
  } catch(e) {}
  try {
    var ph = await browser.localStorage.getItem('_worder_phone');
    if (ph) knownPhone = ph;
  } catch(e) {}
})();

function persistContactInfo(email, phone) {
  if (email) {
    knownEmail = email;
    try { browser.localStorage.setItem('_worder_email', email); } catch(e) {}
  }
  if (phone) {
    knownPhone = phone;
    try { browser.localStorage.setItem('_worder_phone', phone); } catch(e) {}
  }
}

function sendEvent(eventType, eventData, eventContext) {
  var ctx = eventContext || {};
  // Capture email/phone from event data when present (checkout steps)
  if (eventData) {
    if (eventData.email || eventData.phone) {
      persistContactInfo(eventData.email, eventData.phone);
    }
  }
  // Attach last-known email/phone to every event so downstream can identify
  // the visitor even when the current event itself doesn't carry contact data.
  var dataWithIdentity = Object.assign({}, eventData || {});
  if (knownEmail && !dataWithIdentity.email) dataWithIdentity.email = knownEmail;
  if (knownPhone && !dataWithIdentity.phone) dataWithIdentity.phone = knownPhone;

  var payload = {
    event_type: eventType,
    shop_domain: WORDER_CONFIG.shopDomain,
    visitor_id: visitorId,
    session_id: sessionId,
    page_url: (ctx.document && ctx.document.location && ctx.document.location.href) || '',
    page_title: (ctx.document && ctx.document.title) || '',
    referrer: (ctx.document && ctx.document.referrer) || '',
    timestamp: new Date().toISOString(),
    data: dataWithIdentity,
    email: knownEmail || undefined,
    phone: knownPhone || undefined,
  };

  fetch(WORDER_CONFIG.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(function() {});
}

analytics.subscribe('page_viewed', function(event) {
  sendEvent('page_view', {
    page_type: 'page',
    url: event.context.document.location.href,
    title: event.context.document.title,
    referrer: event.context.document.referrer,
  }, event.context);
});

analytics.subscribe('product_viewed', function(event) {
  var variant = event.data.productVariant;
  sendEvent('viewed_product', {
    product_id: variant.product.id,
    product_title: variant.product.title || variant.title,
    product_url: variant.product.url,
    product_type: variant.product.type,
    product_vendor: variant.product.vendor,
    price: variant.price.amount,
    currency: variant.price.currencyCode,
    variant_id: variant.id,
    variant_title: variant.title,
    image_url: variant.image ? variant.image.src : null,
    sku: variant.sku,
  }, event.context);
});

analytics.subscribe('collection_viewed', function(event) {
  var collection = event.data.collection;
  sendEvent('viewed_collection', {
    collection_id: collection.id,
    collection_title: collection.title,
    collection_url: event.context.document.location.href,
  }, event.context);
});

analytics.subscribe('search_submitted', function(event) {
  sendEvent('submitted_search', {
    query: event.data.searchResult.query,
    results_count: event.data.searchResult.productVariants ? event.data.searchResult.productVariants.length : 0,
  }, event.context);
});

analytics.subscribe('product_added_to_cart', function(event) {
  var cartLine = event.data.cartLine;
  var merch = cartLine.merchandise;
  sendEvent('added_to_cart', {
    product_id: merch.product.id,
    product_title: merch.product.title || merch.title,
    variant_id: merch.id,
    variant_title: merch.title,
    price: cartLine.cost.totalAmount.amount,
    currency: cartLine.cost.totalAmount.currencyCode,
    quantity: cartLine.quantity || 1,
    sku: merch.sku,
    image_url: merch.image ? merch.image.src : null,
  }, event.context);
});

analytics.subscribe('checkout_started', function(event) {
  var checkout = event.data.checkout;
  sendEvent('checkout_started', {
    checkout_id: checkout.token,
    total_price: checkout.totalPrice.amount,
    subtotal_price: checkout.subtotalPrice.amount,
    currency: checkout.currencyCode,
    item_count: checkout.lineItems.length,
    items: checkout.lineItems.map(function(item) {
      return {
        product_id: item.variant.product.id,
        title: item.title,
        quantity: item.quantity,
        price: item.variant.price.amount,
        variant_title: item.variant.title,
        sku: item.variant.sku,
      };
    }),
  }, event.context);
});

analytics.subscribe('checkout_contact_info_submitted', function(event) {
  var checkout = event.data.checkout;
  sendEvent('email_captured', {
    email: checkout.email,
    phone: checkout.phone,
    checkout_id: checkout.token,
    total_price: checkout.totalPrice.amount,
    currency: checkout.currencyCode,
  }, event.context);
});

analytics.subscribe('checkout_shipping_info_submitted', function(event) {
  var checkout = event.data.checkout;
  var address = checkout.shippingAddress;
  sendEvent('checkout_shipping_submitted', {
    checkout_id: checkout.token,
    city: address.city,
    province: address.province,
    country: address.country,
    zip: address.zip,
  }, event.context);
});

analytics.subscribe('payment_info_submitted', function(event) {
  var checkout = event.data.checkout;
  sendEvent('payment_submitted', {
    checkout_id: checkout.token,
    total_price: checkout.totalPrice.amount,
    currency: checkout.currencyCode,
  }, event.context);
});

analytics.subscribe('checkout_completed', function(event) {
  var checkout = event.data.checkout;
  sendEvent('checkout_completed', {
    checkout_id: checkout.token,
    order_id: checkout.order ? checkout.order.id : null,
    email: checkout.email,
    phone: checkout.phone,
    total_price: checkout.totalPrice.amount,
    subtotal_price: checkout.subtotalPrice.amount,
    total_shipping: checkout.shippingLine ? checkout.shippingLine.price.amount : null,
    total_tax: checkout.totalTax ? checkout.totalTax.amount : null,
    currency: checkout.currencyCode,
    item_count: checkout.lineItems.length,
    discount_codes: (checkout.discountApplications || []).map(function(d) { return d.title; }),
    first_name: checkout.shippingAddress ? checkout.shippingAddress.firstName : null,
    last_name: checkout.shippingAddress ? checkout.shippingAddress.lastName : null,
    city: checkout.shippingAddress ? checkout.shippingAddress.city : null,
    country: checkout.shippingAddress ? checkout.shippingAddress.country : null,
    items: checkout.lineItems.map(function(item) {
      return {
        product_id: item.variant.product.id,
        title: item.title,
        quantity: item.quantity,
        price: item.variant.price.amount,
        variant_title: item.variant.title,
        sku: item.variant.sku,
      };
    }),
  }, event.context);
});
`;
}
