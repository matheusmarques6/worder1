// =============================================
// normalize-to-canonical
//
// Maps any incoming event payload (Shopify pixel, Shopify webhook,
// storefront tracker, future Yampi/WooCommerce integrations) to the
// WorderCanonicalEvent shape. All downstream consumers — cart blocks,
// merge tags, automations, metrics — read from the canonical fields,
// so renaming a field in one source can't break templates.
//
// Adding a new integration: write a thin source-specific extractor
// (or just feed it through this function — the cascades already cover
// most shapes) and call it before createEvent().
// =============================================

import type {
  WorderCanonicalEvent,
  WorderCanonicalItem,
  WorderCanonicalCustomer,
  WorderCanonicalAddress,
} from './canonical-schema';
import { EVENT_TYPE_MAP } from './canonical-schema';

// Pull a value through several candidate paths. First non-empty wins.
// CRITICAL: takes ALL args as candidates (previous version had `obj` as
// first parameter which silently dropped the first candidate from
// every call site — pick(it.ProductID, it.product_id) ignored
// it.ProductID entirely).
function pick(...candidates: any[]): any {
  for (const p of candidates) {
    if (p === undefined || p === null) continue;
    if (typeof p === 'string' && p.length > 0) return p;
    if (typeof p === 'number') return p;
    if (typeof p === 'boolean') return p;
    if (Array.isArray(p) && p.length > 0) return p;
    if (typeof p === 'object' && p !== null && Object.keys(p).length > 0) return p;
  }
  return undefined;
}

function toNumber(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : undefined;
}

function toString(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function normalizeAddress(a: any): WorderCanonicalAddress | null {
  if (!a || typeof a !== 'object') return null;
  return {
    FirstName: toString(a.FirstName ?? a.first_name),
    LastName: toString(a.LastName ?? a.last_name),
    Name: toString(a.Name ?? a.name) ||
      [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
    Address1: toString(a.Address1 ?? a.address1),
    Address2: toString(a.Address2 ?? a.address2),
    City: toString(a.City ?? a.city),
    Province: toString(a.Province ?? a.province),
    ProvinceCode: toString(a.ProvinceCode ?? a.province_code),
    Country: toString(a.Country ?? a.country),
    CountryCode: toString(a.CountryCode ?? a.country_code),
    Zip: toString(a.Zip ?? a.zip),
    Phone: toString(a.Phone ?? a.phone),
  };
}

// Map a single item from any source shape (Shopify line_item, Klaviyo
// Items[], pixel cart line) to the canonical Item shape.
export function normalizeItem(it: any): WorderCanonicalItem {
  const productObj = it.product || it.Product || {};
  const variantObj = it.variant || it.Variant || {};
  const productId = String(
    pick(it.ProductID, it.product_id, it.productId, productObj.id, variantObj.product?.id) || ''
  );
  const variantId = String(
    pick(it.VariantID, it.variant_id, it.variantId, variantObj.id, it.id) || ''
  );

  const itemPrice = toNumber(
    pick(it.ItemPrice, it.price, it.Price, variantObj.price?.amount, variantObj.price)
  ) ?? 0;
  const quantity = toNumber(pick(it.Quantity, it.quantity)) ?? 1;
  const rowTotal = toNumber(pick(it.RowTotal, it.line_price, it.final_line_price)) ?? (itemPrice * quantity);

  // Image cascade across every shape
  const imageUrl = pick(
    it.ImageURL,
    it.image_url,
    it.imageUrl,
    typeof it.image === 'string' ? it.image : null,
    it.featured_image?.url,
    it.featured_image?.src,
    it.image?.src,
    it.image?.url,
    productObj.image?.src,
    productObj.images?.[0]?.src,
    productObj.images?.[0]?.url,
    productObj.product_image_urls?.[0],
    productObj.variant_images_url
  );

  const productUrl = pick(
    it.ProductURL,
    it.product_url,
    it.url,
    productObj.product_url,
    productObj.url
  );

  // Tags + categories from product object when present
  const tags = (() => {
    const t = pick(productObj.tags, it.tags);
    if (!t) return [] as string[];
    if (Array.isArray(t)) return t.map((x) => String(x));
    return String(t).split(',').map((s) => s.trim()).filter(Boolean);
  })();

  const categories = (() => {
    const c = pick(productObj.collections, it.collections);
    if (!c || !Array.isArray(c)) return [] as string[];
    return c.map((col: any) => col?.title || col?.name || String(col)).filter(Boolean);
  })();

  return {
    ProductID: productId,
    VariantID: variantId || null,
    ProductName: toString(pick(it.ProductName, it.title, it.name, it.product_title, productObj.title)) || 'Produto',
    VariantName: toString(pick(it.VariantName, it.variant_title, it.variantTitle, variantObj.title)),
    SKU: toString(pick(it.SKU, it.sku, variantObj.sku)),
    Quantity: quantity,
    ItemPrice: itemPrice,
    RowTotal: rowTotal,
    CompareAtPrice: toNumber(pick(it.CompareAtPrice, it.compare_at_price, variantObj.compare_at_price)) ?? null,
    ImageURL: imageUrl ?? null,
    ProductURL: productUrl ?? null,
    Brand: toString(pick(it.Brand, it.vendor, productObj.vendor)),
    ProductType: toString(pick(productObj.product_type, it.product_type)),
    Categories: categories,
    Tags: tags,
    Description: stripHtml(pick(it.product_description, productObj.description, productObj.body_html, it.description)),
    Product: {
      Description: toString(pick(productObj.description, it.product_description, productObj.body_html)),
      BodyHTML: toString(pick(productObj.body_html, productObj.description_html)),
      Tags: tags,
      Collections: Array.isArray(productObj.collections)
        ? productObj.collections
            .filter((c: any) => c && (c.title || c.name))
            .map((c: any) => ({ id: String(c.id || ''), title: String(c.title || c.name) }))
        : [],
      Images: Array.isArray(productObj.images)
        ? productObj.images.map((img: any) => img?.src || img?.url || img).filter(Boolean)
        : Array.isArray(productObj.product_image_urls)
          ? productObj.product_image_urls
          : [],
      VariantImage: typeof imageUrl === 'string' ? imageUrl : null,
    },
  };
}

function normalizeCustomer(props: any): WorderCanonicalCustomer | null {
  const raw = props.raw || {};
  const cust = props.Customer || props.customer || raw.customer || {};
  const billing = raw.billing_address || props.BillingAddress || {};
  const email = pick(props.Customer?.Email, props.email, props.Email, cust.email, raw.email, raw.contact_email, billing.email);
  const phone = pick(props.Customer?.Phone, props.phone, cust.phone, raw.phone, billing.phone);
  if (!email && !phone && !cust.id && !cust.first_name && !cust.last_name) {
    return null;
  }
  const firstName = toString(pick(cust.FirstName, cust.first_name, props.first_name, props._first_name, billing.first_name));
  const lastName = toString(pick(cust.LastName, cust.last_name, props.last_name, props._last_name, billing.last_name));
  return {
    ID: toString(pick(cust.ID, cust.id, props.shopifyCustomerId)),
    Email: toString(email),
    Phone: toString(phone),
    FirstName: firstName,
    LastName: lastName,
    FullName: [firstName, lastName].filter(Boolean).join(' ') || null,
    AcceptsMarketing: !!pick(cust.AcceptsMarketing, cust.accepts_marketing, raw.buyer_accepts_marketing),
    AcceptsSmsMarketing: !!pick(cust.AcceptsSmsMarketing, raw.buyer_accepts_sms_marketing),
    TotalOrders: toNumber(pick(cust.orders_count, cust.TotalOrders, props.total_orders)),
    TotalSpent: toNumber(pick(cust.total_spent, cust.TotalSpent, props.total_spent)),
    Tags: (() => {
      const t = pick(cust.tags, cust.Tags);
      if (!t) return [];
      if (Array.isArray(t)) return t.map((x) => String(x));
      return String(t).split(',').map((s) => s.trim()).filter(Boolean);
    })(),
    Locale: toString(pick(cust.locale, props.customer_locale, raw.customer_locale, raw.locale)),
    DefaultAddress: cust.default_address ? normalizeAddress(cust.default_address) : null,
  };
}

// =============================================
// Public entry point
// =============================================
export interface NormalizeOpts {
  source?: string;                  // e.g. 'shopify_pixel' | 'shopify_webhook'
  storeDomain?: string | null;
  storeUrl?: string | null;
  rawEventType?: string;            // Source-specific event name (e.g. 'product_added_to_cart')
}

export function normalizeToCanonical(
  properties: any,
  opts: NormalizeOpts = {}
): WorderCanonicalEvent {
  const props = properties || {};
  const raw = props.raw || {};
  const source = opts.source || 'unknown';
  const incomingType = String(opts.rawEventType || props.event_type || props._original_event_type || '');
  const eventType = (EVENT_TYPE_MAP[incomingType] || incomingType || 'page_viewed') as any;

  const storeUrl = opts.storeUrl || (opts.storeDomain ? `https://${opts.storeDomain}` : null);

  // Pull every URL the source might have stashed
  const checkoutUrl = pick(
    props.CheckoutURL,
    props.checkout_url,
    props.AbandonedCheckoutURL,
    props.abandoned_checkout_url,
    raw.abandoned_checkout_url,
    raw.recovery_url,
    raw.checkout_url
  );
  const productUrl = pick(props.ProductURL, props.product_url, raw.product_url);
  const orderStatusUrl = pick(props.OrderStatusURL, props.order_status_url, raw.order_status_url);

  // Items: priority order — added_item (single) → enriched items → raw.line_items → Items → items
  const itemsSource: any[] = (() => {
    if (Array.isArray(props.Items) && props.Items.length > 0) return props.Items;
    if (Array.isArray(props.items) && props.items.length > 0) return props.items;
    if (Array.isArray(raw.line_items) && raw.line_items.length > 0) return raw.line_items;
    if (Array.isArray(props.line_items) && props.line_items.length > 0) return props.line_items;
    if (props.added_item) return [props.added_item];
    if (props.viewed_product) return [props.viewed_product];
    return [];
  })();
  const items = itemsSource.map(normalizeItem);

  // Money
  const totalPrice = toNumber(pick(
    props.TotalPrice, props.total_price, props.$value, props.value,
    raw.total_price, raw._total_price
  ));
  const subtotalPrice = toNumber(pick(props.SubtotalPrice, props.subtotal_price, raw.subtotal_price, raw._subtotal_price));
  const totalTax = toNumber(pick(props.TotalTax, props.total_tax, raw.total_tax));
  const totalDiscounts = toNumber(pick(props.TotalDiscounts, props['Total Discounts'], props.total_discounts, raw.total_discounts));
  const totalShipping = toNumber(pick(props.TotalShipping, props.total_shipping, raw.total_shipping)) ??
    (Array.isArray(raw.shipping_lines) ? raw.shipping_lines.reduce((s: number, l: any) => s + (parseFloat(l.price || '0') || 0), 0) : undefined);

  const customer = normalizeCustomer(props);
  const billingAddress = normalizeAddress(raw.billing_address || props.BillingAddress);
  const shippingAddress = normalizeAddress(raw.shipping_address || props.ShippingAddress);

  return {
    EventType: eventType,
    OccurredAt: pick(props.OccurredAt, props.occurred_at, raw.created_at, raw.updated_at) || new Date().toISOString(),
    Source: source,
    SourceEventID: toString(pick(props.SourceEventID, props.shopify_resource_id, raw.id, raw.token)),

    CheckoutID: toString(pick(props.CheckoutID, props.CheckoutId, props.checkout_id, raw.id, raw.token)),
    CartToken: toString(pick(props.CartToken, props.cart_token, raw.cart_token, raw.token)),
    OrderID: toString(pick(props.OrderID, props.OrderId, props.order_id, raw.order_id)),
    OrderNumber: toString(pick(props.OrderNumber, props.order_number, raw.order_number, raw.name)),
    ProductID: toString(pick(props.ProductID, props.product_id, items[0]?.ProductID)),

    Currency: toString(pick(props.Currency, props.currency, raw.currency, raw.presentment_currency)) || 'BRL',
    TotalPrice: totalPrice,
    SubtotalPrice: subtotalPrice,
    TotalTax: totalTax,
    TotalDiscounts: totalDiscounts,
    TotalShipping: totalShipping,

    CheckoutURL: checkoutUrl ?? null,
    ProductURL: productUrl ?? items[0]?.ProductURL ?? null,
    OrderStatusURL: orderStatusUrl ?? null,
    StoreURL: storeUrl,

    ItemCount: toNumber(pick(props.ItemCount, props.item_count, raw.item_count)) ?? items.reduce((s, it) => s + (it.Quantity || 0), 0),

    Items: items,
    Customer: customer,
    BillingAddress: billingAddress,
    ShippingAddress: shippingAddress,

    Source_Name: toString(pick(props['Source Name'], props.source_name, raw.source_name)),
    ReferringSite: toString(pick(props.ReferringSite, props.referring_site, raw.referring_site, props.extra?.referring_site)),
    LandingSite: toString(pick(props.LandingSite, props.landing_site, raw.landing_site, props.extra?.full_landing_site)),
    CustomerLocale: toString(pick(props['Customer Locale'], props.customer_locale, raw.customer_locale, raw.locale)),
    UTM: (() => {
      const u = pick(props.UTM, props._utm, props.utm_params) || {};
      // Filter to actual values
      const out: Record<string, string> = {};
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        if (u[k]) out[k] = String(u[k]);
      }
      return out;
    })(),
    ClickIDs: pick(props.ClickIDs, props._click_ids, props.click_ids) || {},

    DiscountCodes: (() => {
      const d = pick(props.DiscountCodes, props['Discount Codes'], props.discount_codes, raw.discount_codes) || [];
      if (!Array.isArray(d)) return [];
      return d.map((x: any) => typeof x === 'string' ? x : (x?.code || '')).filter(Boolean);
    })(),

    FinancialStatus: toString(pick(props.FinancialStatus, props.financial_status, raw.financial_status)),
    FulfillmentStatus: toString(pick(props.FulfillmentStatus, props.fulfillment_status, raw.fulfillment_status)),
    PaymentGateway: toString(pick(props.PaymentGateway, props.payment_gateway, raw.payment_gateway_names?.[0])),
    Tracking: (() => {
      const num = pick(props.tracking_number, raw.fulfillments?.[0]?.tracking_number);
      const url = pick(props.tracking_url, raw.fulfillments?.[0]?.tracking_url);
      const company = pick(props.tracking_company, raw.fulfillments?.[0]?.tracking_company);
      if (!num && !url) return null;
      return { Number: toString(num), URL: toString(url), Company: toString(company) };
    })(),

    raw,
  };
}
