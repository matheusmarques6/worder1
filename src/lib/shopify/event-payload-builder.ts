// =============================================
// Event payload builder
// src/lib/shopify/event-payload-builder.ts
//
// Builds the properties object stored on every contact_events row,
// matching Omnisend's pattern: full raw Shopify payload preserved
// alongside top-level structured fields for fast access by flow
// builder variables.
//
// Why store raw + structured?
//   - structured top-level fields (Items, Value, CheckoutId, etc.) are
//     used by 95% of flow templates and need to be cheap to read
//   - raw lets the merchant build NEW automations that reference
//     fields we hadn't anticipated, without us having to ship a
//     migration every time. Same as Klaviyo's "view raw payload" and
//     Omnisend's "raw" field.
//   - the variable picker auto-discovers paths under raw.* so every
//     field becomes a usable variable: {{ trigger.raw.order.foo.bar }}
// =============================================

import type { ShopifyStoreConfig } from '@/lib/services/shopify/types';

export interface OrderEventPayload {
  // Top-level structured fields (Klaviyo/Omnisend convention)
  $value: number;
  OrderId: string;
  OrderNumber: string | number;
  CheckoutId: string | null;
  Currency: string;
  ItemCount: number;
  Items: any[];
  ItemNames: string[];
  SubtotalPrice: number;
  TotalPrice: number;
  TotalDiscounts: number;
  TotalTax: number;
  TotalShipping: number;
  DiscountCodes: string[];
  PaymentGateway: string | null;
  FinancialStatus: string | null;
  FulfillmentStatus: string | null;
  CustomerEmail: string | null;
  CustomerPhone: string | null;
  CustomerFirstName: string | null;
  CustomerLastName: string | null;
  CustomerOrdersCount: number | null;
  CustomerTotalSpent: number | null;
  CustomerLocale: string | null;
  ShippingAddress: any | null;
  BillingAddress: any | null;
  ReferringSite: string | null;
  LandingSite: string | null;
  SourceName: string | null;
  Tags: string[];
  Note: string | null;
  // Full raw payload — enables flow builder variables to reach any
  // Shopify field via trigger.raw.<path>
  raw: any;
}

export function buildOrderEventPayload(
  order: any,
  store: ShopifyStoreConfig,
  extra: { transaction?: any } = {}
): OrderEventPayload {
  const items = (order.line_items || []).map((item: any) => ({
    ProductID: item.product_id ? String(item.product_id) : undefined,
    ProductName: item.title || item.name || '',
    Quantity: item.quantity || 1,
    ItemPrice: parseFloat(item.price || '0'),
    RowTotal: parseFloat(item.price || '0') * (item.quantity || 1),
    SKU: item.sku,
    VariantName: item.variant_title,
    VariantID: item.variant_id ? String(item.variant_id) : undefined,
    Brand: item.vendor,
    ImageURL: item.product?.product_image_urls?.[0] || item.product?.images?.[0]?.src || item.product?.image?.src || '',
    ProductURL: item.product?.product_url || (item.product?.handle ? `https://${store.shop_domain}/products/${item.product.handle}` : ''),
    Description: item.product?.description || '',
    Tags: item.product?.tags || [],
    Collections: item.product?.collections?.map((c: any) => c.title) || [],
  }));

  const shippingPrice = order.shipping_lines && order.shipping_lines[0]
    ? parseFloat(order.shipping_lines[0].price || '0')
    : 0;

  // Ship the full payload as `raw`. We add `_transaction` when present
  // (paid_for_order events) so the flow builder can reference payment
  // method, gateway, transaction id, etc.
  const raw: any = { ...order };
  if (extra.transaction) raw._transaction = extra.transaction;

  return {
    $value: parseFloat(order.total_price || '0'),
    OrderId: String(order.id || ''),
    OrderNumber: order.order_number || order.number || order.name || '',
    CheckoutId: order.checkout_id ? String(order.checkout_id) : (order.checkout_token || null),
    Currency: order.currency || 'BRL',
    ItemCount: items.length,
    Items: items,
    ItemNames: items.map((i: any) => i.ProductName).filter(Boolean),
    SubtotalPrice: parseFloat(order.subtotal_price || '0'),
    TotalPrice: parseFloat(order.total_price || '0'),
    TotalDiscounts: parseFloat(order.total_discounts || '0'),
    TotalTax: parseFloat(order.total_tax || '0'),
    TotalShipping: shippingPrice,
    DiscountCodes: (order.discount_codes || []).map((d: any) => d.code || d).filter(Boolean),
    PaymentGateway: (order.payment_gateway_names && order.payment_gateway_names[0]) || null,
    FinancialStatus: order.financial_status || null,
    FulfillmentStatus: order.fulfillment_status || null,
    CustomerEmail:
      order.email ||
      order.customer?.email ||
      order.contact_email ||
      order.billing_address?.email ||
      null,
    CustomerPhone:
      order.phone ||
      order.customer?.phone ||
      order.billing_address?.phone ||
      order.shipping_address?.phone ||
      null,
    CustomerFirstName:
      order.customer?.first_name ||
      order.billing_address?.first_name ||
      order.shipping_address?.first_name ||
      null,
    CustomerLastName:
      order.customer?.last_name ||
      order.billing_address?.last_name ||
      order.shipping_address?.last_name ||
      null,
    CustomerOrdersCount: order.customer?.orders_count ?? null,
    CustomerTotalSpent: order.customer?.total_spent ? parseFloat(order.customer.total_spent) : null,
    CustomerLocale: order.customer_locale || null,
    ShippingAddress: order.shipping_address || null,
    BillingAddress: order.billing_address || null,
    ReferringSite: order.referring_site || null,
    LandingSite: order.landing_site || null,
    SourceName: order.source_name || null,
    Tags: typeof order.tags === 'string'
      ? order.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : (Array.isArray(order.tags) ? order.tags : []),
    Note: order.note || null,
    raw,
  };
}

// =============================================
// Checkout payload builder
// Used for checkouts/create + checkouts/update events. Same pattern.
// =============================================

export interface CheckoutEventPayload {
  $value: number;
  CheckoutId: string;
  CheckoutURL: string | null;
  CheckoutToken: string | null;
  AbandonedCheckoutURL: string | null;
  Currency: string;
  ItemCount: number;
  Items: any[];
  ItemNames: string[];
  SubtotalPrice: number;
  TotalPrice: number;
  TotalDiscounts: number;
  DiscountCodes: string[];
  CustomerEmail: string | null;
  CustomerPhone: string | null;
  CustomerFirstName: string | null;
  CustomerLastName: string | null;
  CustomerLocale: string | null;
  ReferringSite: string | null;
  LandingSite: string | null;
  SourceName: string | null;
  CartToken: string | null;
  Note: string | null;
  raw: any;
}

export function buildCheckoutEventPayload(
  checkout: any,
  store: ShopifyStoreConfig
): CheckoutEventPayload {
  const items = (checkout.line_items || []).map((item: any) => ({
    ProductID: item.product_id ? String(item.product_id) : (item.variant?.product?.id ? String(item.variant.product.id) : undefined),
    ProductName: item.title || item.name || item.presentment_title || '',
    Quantity: item.quantity || 1,
    ItemPrice: parseFloat(item.price || item.variant_price || '0'),
    RowTotal: parseFloat(item.line_price || '0') || (parseFloat(item.price || '0') * (item.quantity || 1)),
    CompareAtPrice: item.compare_at_price ? parseFloat(item.compare_at_price) : null,
    SKU: item.sku,
    VariantName: item.variant_title || item.presentment_variant_title,
    VariantID: item.variant_id ? String(item.variant_id) : undefined,
    Brand: item.vendor,
    ImageURL: item.product?.variant_images_url || item.product?.product_image_urls?.[0] || '',
    ProductURL: item.product?.product_url || '',
    Description: item.product?.description || '',
    Tags: item.product?.tags || [],
    Collections: item.product?.collections?.map((c: any) => c.title) || [],
  }));

  const recoveryUrl =
    checkout.abandoned_checkout_url ||
    checkout.recovery_url ||
    (checkout.token ? `https://${store.shop_domain}/checkouts/${checkout.token}` : null);

  return {
    $value: parseFloat(checkout.total_price || '0'),
    CheckoutId: String(checkout.id || checkout.token || ''),
    CheckoutURL: recoveryUrl,
    CheckoutToken: checkout.token || null,
    AbandonedCheckoutURL: checkout.abandoned_checkout_url || null,
    Currency: checkout.currency || 'BRL',
    ItemCount: items.length,
    Items: items,
    ItemNames: items.map((i: any) => i.ProductName).filter(Boolean),
    SubtotalPrice: parseFloat(checkout.subtotal_price || '0'),
    TotalPrice: parseFloat(checkout.total_price || '0'),
    TotalDiscounts: parseFloat(checkout.total_discounts || '0'),
    DiscountCodes: (checkout.discount_codes || []).map((d: any) => d.code || d).filter(Boolean),
    CustomerEmail:
      checkout.email ||
      checkout.customer?.email ||
      checkout.contact_email ||
      checkout.billing_address?.email ||
      null,
    CustomerPhone:
      checkout.phone ||
      checkout.customer?.phone ||
      checkout.billing_address?.phone ||
      null,
    CustomerFirstName:
      checkout.customer?.first_name ||
      checkout.billing_address?.first_name ||
      checkout.shipping_address?.first_name ||
      null,
    CustomerLastName:
      checkout.customer?.last_name ||
      checkout.billing_address?.last_name ||
      checkout.shipping_address?.last_name ||
      null,
    CustomerLocale: checkout.customer_locale || null,
    ReferringSite: checkout.referring_site || null,
    LandingSite: checkout.landing_site || null,
    SourceName: checkout.source_name || null,
    CartToken: checkout.cart_token || null,
    Note: checkout.note || null,
    raw: checkout,
  };
}

// =============================================
// Page-view enrichment for pixel events
// Adds device/os/language/sessionId to match Omnisend's structure.
// Called from /api/track/event when storing page_viewed events.
// =============================================

function parseUA(ua: string | null | undefined) {
  if (!ua) return { device: null, browser: null, os: null };
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  let browser = 'other';
  if (/Chrome/i.test(ua) && !/Edge|OPR/i.test(ua)) browser = 'chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
  else if (/Firefox/i.test(ua)) browser = 'firefox';
  else if (/Edge/i.test(ua)) browser = 'edge';
  let os = 'other';
  if (/Windows/i.test(ua)) os = 'windows';
  else if (/Mac OS/i.test(ua)) os = 'macos';
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'linux';
  else if (/Android/i.test(ua)) os = 'android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
  return { device, browser, os };
}

function langFromAcceptLang(al: string | null | undefined): string | null {
  if (!al) return null;
  const first = al.split(',')[0];
  if (!first) return null;
  return first.split('-')[0].toLowerCase();
}

export function buildPageViewExtras(input: {
  userAgent?: string | null;
  ip?: string | null;
  acceptLanguage?: string | null;
  url?: string | null;
  title?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
}) {
  const { device, browser, os } = parseUA(input.userAgent);
  return {
    device,
    browser,
    os,
    language: langFromAcceptLang(input.acceptLanguage),
    sessionId: input.sessionId || null,
    url: input.url || null,
    title: input.title || null,
    referrer: input.referrer || null,
    user_agent: input.userAgent || null,
    ip: input.ip || null,
  };
}
