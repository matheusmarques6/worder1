// =============================================
// enrich-shopify-event
//
// Pixel/storefront-tracker events arrive with the bare minimum the
// Custom Pixel sandbox or DOM scrape can see. The Shopify
// `checkouts/create` webhook, by contrast, ships a rich payload with
// nested customer, line_items[].product, billing_address, etc.
//
// To make pixel events feel as rich as Omnisend (so {{ trigger.raw.* }}
// flow variables resolve consistently regardless of source), this
// helper enriches the event in-place from local DB caches:
//   - shopify_products → product description, tags, vendor, image URLs,
//     variant images, product_url
//   - contacts          → orders_count, total_spent, accepts_marketing,
//     tags, default_address
//
// Builds a `raw`-shape mirror so flow-builder paths like
//   {{ trigger.raw.line_items[0].product.product_image_urls[0] }}
//   {{ trigger.raw.customer.tags }}
// resolve identically across pixel and webhook sources.
//
// Best-effort: missing rows or columns return un-enriched data —
// never throws, never blocks event ingestion.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js';

interface EnrichOpts {
  supabase: SupabaseClient<any, any, any>;
  storeId: string;
  organizationId: string;
  shopDomain?: string | null;
  contactId?: string | null;
  email?: string | null;
  // Session/visitor for aggregating recent cart events (added_to_cart
  // doesn't carry full cart state, so we synthesize it from session history).
  sessionId?: string | null;
  visitorId?: string | null;
  anonymousId?: string | null;
}

const ENRICH_EVENT_TYPES = new Set([
  'checkout_started',
  'checkout_completed',
  'placed_order',
  'order_paid',
  'added_to_cart',
  'add_to_cart',
  'viewed_product',
  'product_viewed',
  'cart_viewed',
  'browse_abandoned',
  'back_in_stock',
]);

// Build the rich product object Omnisend ships in raw.line_items[].product.
// Pulls every field we have stored on shopify_products so flow templates
// can address description, collections, image URLs, variant images, etc.
function buildRichProductObject(dbProduct: any | null, shopUrl: string | null) {
  if (!dbProduct) return null;
  const images: string[] = (dbProduct.images || [])
    .map((img: any) => img?.src || img?.url || img)
    .filter(Boolean);
  const tags = dbProduct.tags
    ? (typeof dbProduct.tags === 'string'
      ? dbProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : dbProduct.tags)
    : [];
  const collections = Array.isArray(dbProduct.collections) ? dbProduct.collections : [];
  return {
    id: String(dbProduct.shopify_product_id),
    title: dbProduct.title,
    handle: dbProduct.handle,
    vendor: dbProduct.vendor,
    product_type: dbProduct.product_type,
    tags,
    collections,
    description: dbProduct.description || null,
    body_html: dbProduct.body_html || null,
    product_image_urls: images,
    product_url: dbProduct.handle && shopUrl ? `${shopUrl}/products/${dbProduct.handle}` : null,
  };
}

// Build the rich line_item shape Omnisend ships, fed by the raw event
// item plus the matching shopify_products row.
function buildRichLineItem(it: any, dbProduct: any | null, shopUrl: string | null) {
  const variantId = String(it.variant_id || it.variantId || it.VariantID || it.id || '');
  const variants: any[] = Array.isArray(dbProduct?.variants) ? dbProduct.variants : [];
  const matchedVariant = variantId
    ? variants.find((v: any) => String(v.id) === variantId)
    : variants[0];

  // Pick variant image when the variant has one, fall back to product images
  let variantImageUrl: string | null = null;
  if (matchedVariant?.image_id) {
    const variantImg = (dbProduct?.images || []).find((img: any) => String(img?.id) === String(matchedVariant.image_id));
    variantImageUrl = variantImg?.src || variantImg?.url || null;
  }
  const productImages: string[] = (dbProduct?.images || [])
    .map((img: any) => img?.src || img?.url || img)
    .filter(Boolean);
  variantImageUrl =
    variantImageUrl ||
    it.ImageURL ||
    it.image_url ||
    it.imageUrl ||
    it.image?.src ||
    productImages[0] ||
    null;

  const productObj = buildRichProductObject(dbProduct, shopUrl);
  if (productObj && variantImageUrl) {
    (productObj as any).variant_images_url = variantImageUrl;
  }

  const price = parseFloat(
    String(it.price || it.Price || it.ItemPrice || matchedVariant?.price || '0')
  );
  const quantity = it.quantity || it.Quantity || 1;

  return {
    product_id: it.product_id || it.productId || it.ProductID || (dbProduct?.shopify_product_id ? Number(dbProduct.shopify_product_id) || dbProduct.shopify_product_id : null),
    variant_id: variantId ? (Number(variantId) || variantId) : null,
    title: it.title || it.name || it.ProductName || dbProduct?.title || null,
    product_title: it.product_title || dbProduct?.title || null,
    variant_title: it.variant_title || it.variantTitle || it.VariantName || matchedVariant?.title || null,
    sku: it.sku || it.SKU || matchedVariant?.sku || null,
    quantity,
    price,
    line_price: parseFloat(String(it.line_price || price * quantity)),
    final_line_price: parseFloat(String(it.final_line_price || price * quantity)),
    final_price: price,
    original_price: parseFloat(String(it.original_price || matchedVariant?.compare_at_price || price)),
    compare_at_price: it.compare_at_price || matchedVariant?.compare_at_price || null,
    vendor: it.vendor || dbProduct?.vendor || null,
    product_type: it.product_type || dbProduct?.product_type || null,
    handle: it.handle || dbProduct?.handle || null,
    url: it.url || (dbProduct?.handle ? `/products/${dbProduct.handle}${variantId ? `?variant=${variantId}` : ''}` : null),
    image: variantImageUrl,
    featured_image: variantImageUrl ? {
      url: variantImageUrl,
      alt: matchedVariant?.title || it.title || null,
    } : null,
    requires_shipping: it.requires_shipping ?? matchedVariant?.requires_shipping ?? true,
    taxable: it.taxable ?? matchedVariant?.taxable ?? true,
    properties: it.properties || {},
    options_with_values: matchedVariant?.option_values || it.options_with_values || null,
    variant_options: matchedVariant ? [matchedVariant.option1, matchedVariant.option2, matchedVariant.option3].filter(Boolean) : null,
    product_description: dbProduct?.description || null,
    product: productObj,
    // Klaviyo-style flat fields preserved for back-compat
    ImageURL: variantImageUrl,
  };
}

// Aggregate recent added_to_cart events from the same session/visitor
// into a synthesized cart state. Looks back 30 min — the typical cart
// session window. Removes variants the visitor later removed when
// removed_from_cart events exist.
async function aggregateRecentCart(opts: EnrichOpts): Promise<any[]> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const filters: string[] = [];
  if (opts.sessionId) filters.push(`session_id.eq.${opts.sessionId}`);
  if (opts.visitorId) filters.push(`anonymous_id.eq.${opts.visitorId}`);
  if (opts.anonymousId && opts.anonymousId !== opts.visitorId) {
    filters.push(`anonymous_id.eq.${opts.anonymousId}`);
  }
  if (opts.contactId) filters.push(`contact_id.eq.${opts.contactId}`);
  if (filters.length === 0) return [];

  try {
    const { data: addEvents } = await opts.supabase
      .from('contact_events')
      .select('properties, occurred_at')
      .eq('store_id', opts.storeId)
      .in('event_type', ['added_to_cart', 'add_to_cart'])
      .gte('occurred_at', since)
      .or(filters.join(','))
      .order('occurred_at', { ascending: false })
      .limit(50);

    const { data: removeEvents } = await opts.supabase
      .from('contact_events')
      .select('properties, occurred_at')
      .eq('store_id', opts.storeId)
      .eq('event_type', 'removed_from_cart')
      .gte('occurred_at', since)
      .or(filters.join(','))
      .order('occurred_at', { ascending: false })
      .limit(50);

    // Most recent add per variant_id wins (visitors can re-add same
    // variant with new quantity).
    const byVariant = new Map<string, any>();
    for (const ev of (addEvents || []) as any[]) {
      const p = ev.properties || {};
      const key = String(p.variant_id || p.variantId || p.product_id || p.productId || '');
      if (!key) continue;
      if (!byVariant.has(key)) {
        byVariant.set(key, { ...p, _added_at: ev.occurred_at });
      }
    }

    // Apply removals: a remove AFTER an add cancels the line.
    for (const ev of (removeEvents || []) as any[]) {
      const p = ev.properties || {};
      const key = String(p.variant_id || p.variantId || p.product_id || p.productId || '');
      if (!key) continue;
      const item = byVariant.get(key);
      if (item && ev.occurred_at > item._added_at) {
        byVariant.delete(key);
      }
    }

    return Array.from(byVariant.values()).map(it => {
      const { _added_at: _omit, ...rest } = it;
      return rest;
    });
  } catch {
    return [];
  }
}

// Walk backwards through the session for the most recent
// checkout_started event and return its recovery URL. Used to attach
// abandoned_checkout_url to added_to_cart events so cart-recovery flows
// have a working CTA.
async function findRecentCheckoutUrl(opts: EnrichOpts): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const filters: string[] = [];
  if (opts.sessionId) filters.push(`session_id.eq.${opts.sessionId}`);
  if (opts.contactId) filters.push(`contact_id.eq.${opts.contactId}`);
  if (opts.visitorId) filters.push(`anonymous_id.eq.${opts.visitorId}`);
  if (filters.length === 0) return null;
  try {
    const { data } = await opts.supabase
      .from('contact_events')
      .select('properties')
      .eq('store_id', opts.storeId)
      .eq('event_type', 'checkout_started')
      .gte('occurred_at', since)
      .or(filters.join(','))
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const p: any = data?.properties || {};
    const r: any = p.raw || {};
    return (
      p.CheckoutURL ||
      p.checkout_url ||
      p.AbandonedCheckoutURL ||
      r.abandoned_checkout_url ||
      r.recovery_url ||
      null
    );
  } catch {
    return null;
  }
}

export async function enrichShopifyEvent(
  eventType: string,
  properties: Record<string, any>,
  opts: EnrichOpts
): Promise<Record<string, any>> {
  if (!ENRICH_EVENT_TYPES.has(eventType)) return properties;

  const enriched: Record<string, any> = { ...properties };
  // Ensure raw container exists — webhook events use this pattern,
  // we mirror it so flow templates work the same way.
  enriched.raw = enriched.raw || {};
  const raw = enriched.raw;

  // --------------------------------------------------------
  // 1. Line items enrichment
  // --------------------------------------------------------
  const rawItems = (
    properties.items ||
    properties.Items ||
    properties.lineItems ||
    properties.line_items ||
    raw.line_items ||
    []
  ) as any[];

  const shopUrl = opts.shopDomain ? `https://${opts.shopDomain}` : null;

  // Helper: load shopify_products for a list of ids in one query
  async function loadProducts(productIds: string[]): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    if (productIds.length === 0) return map;
    try {
      // Try with all the new columns first; fall back if the migration
      // (description / body_html / collections) isn't applied yet.
      let cols = 'shopify_product_id, title, handle, vendor, product_type, tags, images, variants, price, status, description, body_html, collections';
      let { data, error } = await opts.supabase
        .from('shopify_products')
        .select(cols)
        .eq('store_id', opts.storeId)
        .in('shopify_product_id', productIds);
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        cols = 'shopify_product_id, title, handle, vendor, product_type, tags, images, variants, price, status';
        const fallback = await opts.supabase
          .from('shopify_products')
          .select(cols)
          .eq('store_id', opts.storeId)
          .in('shopify_product_id', productIds);
        data = fallback.data;
      }
      for (const p of (data || []) as any[]) {
        map.set(String(p.shopify_product_id), p);
      }
    } catch { /* best-effort */ }
    return map;
  }

  // ====================================================================
  // Branch by event type — added_to_cart / viewed_product need different
  // shaping (Omnisend "added_item" pattern) than checkout / order events.
  // ====================================================================
  const isAddToCart = eventType === 'added_to_cart' || eventType === 'add_to_cart';
  const isViewed = eventType === 'viewed_product' || eventType === 'product_viewed' || eventType === 'browse_abandoned' || eventType === 'back_in_stock';

  if (isAddToCart) {
    // Single-product event from the pixel. Build:
    //   1. added_item — the rich version of the just-added line
    //   2. raw.line_items — synthesized cart state by aggregating recent
    //      added_to_cart events from the same session/visitor
    const productId = String(properties.product_id || properties.productId || properties.ProductID || '');
    const productMap = productId ? await loadProducts([productId]) : new Map();
    const addedItemRich = buildRichLineItem(properties, productMap.get(productId) || null, shopUrl);
    enriched.added_item = addedItemRich;

    // Aggregate cart state from session/visitor history. We pull the
    // last 30min of added_to_cart events, dedupe by variant_id (the
    // most recent add wins for that variant), and remove items the
    // visitor explicitly removed (best-effort if removed_from_cart
    // events exist).
    const cartItems = await aggregateRecentCart(opts);
    if (cartItems.length > 0) {
      // Build product map for ALL cart items in one query
      const cartIds = Array.from(new Set(
        cartItems.map(it => String(it.product_id || '')).filter(Boolean)
      ));
      const cartProductMap = await loadProducts(cartIds);
      const richCart = cartItems.map(it =>
        buildRichLineItem(it, cartProductMap.get(String(it.product_id || '')) || null, shopUrl)
      );
      raw.line_items = richCart;
      enriched.items = richCart;
      raw.item_count = richCart.reduce((s, it) => s + (it.quantity || 1), 0);
      raw.total_price = String(richCart.reduce((s, it) => s + (Number(it.line_price) || 0), 0).toFixed(2));
      raw.items_subtotal_price = raw.total_price;
      raw.currency = raw.currency || properties.currency || properties.Currency || null;
    } else if (addedItemRich) {
      // No history to aggregate — at least put the added item in raw.line_items
      // so downstream cart-block resolvers find it.
      raw.line_items = [addedItemRich];
      enriched.items = [addedItemRich];
      raw.item_count = addedItemRich.quantity || 1;
      raw.total_price = String(addedItemRich.line_price || 0);
    }

    // Recovery URL: walk for a recent checkout_started event in the same
    // session. Falls through to nothing if the visitor never started a
    // checkout (legitimate cart abandonment with NO recovery URL —
    // Shopify's actual abandoned-checkout link only exists once the
    // visitor reaches the checkout page).
    const recoveryUrl = await findRecentCheckoutUrl(opts);
    if (recoveryUrl) {
      raw.abandoned_checkout_url = recoveryUrl;
      raw.recovery_url = recoveryUrl;
    }
  } else if (isViewed) {
    // Single-product event with no cart context. Build the rich version
    // of the viewed product — used by browse-abandoned / back-in-stock
    // flow templates.
    const productId = String(properties.product_id || properties.productId || properties.ProductID || '');
    if (productId) {
      const productMap = await loadProducts([productId]);
      const richItem = buildRichLineItem(properties, productMap.get(productId) || null, shopUrl);
      enriched.viewed_product = richItem;
      // Mirror to raw.line_items so the cart block resolver can pull it
      raw.line_items = [richItem];
      enriched.items = [richItem];
    }
  } else if (Array.isArray(rawItems) && rawItems.length > 0) {
    // Multi-item events: checkout_started, checkout_completed, placed_order,
    // order_paid, cart_viewed (where the cart object lists every line).
    const productIds = Array.from(new Set(
      rawItems
        .map((it) => String(it.product_id || it.productId || it.ProductID || '').trim())
        .filter(Boolean)
    ));
    const productMap = await loadProducts(productIds);
    const enrichedItems = rawItems.map((it) => {
      const productId = String(it.product_id || it.productId || it.ProductID || '');
      return buildRichLineItem(it, productMap.get(productId) || null, shopUrl);
    });
    enriched.items = enrichedItems;
    raw.line_items = enrichedItems;
  }

  // --------------------------------------------------------
  // 2. Customer enrichment from contacts
  // --------------------------------------------------------
  let contactRow: any = null;
  if (opts.contactId) {
    try {
      const { data } = await opts.supabase
        .from('contacts')
        .select('id, email, phone, first_name, last_name, total_orders, total_spent, accepts_marketing, tags, shopify_customer_id, address1, address2, city, province, country, zip, locale')
        .eq('id', opts.contactId)
        .maybeSingle();
      contactRow = data;
    } catch { /* best-effort */ }
  } else if (opts.email) {
    try {
      const { data } = await opts.supabase
        .from('contacts')
        .select('id, email, phone, first_name, last_name, total_orders, total_spent, accepts_marketing, tags, shopify_customer_id, address1, address2, city, province, country, zip, locale')
        .eq('organization_id', opts.organizationId)
        .ilike('email', opts.email)
        .maybeSingle();
      contactRow = data;
    } catch { /* best-effort */ }
  }

  if (contactRow) {
    raw.email = raw.email || contactRow.email || null;
    raw.phone = raw.phone || contactRow.phone || null;
    raw.customer = {
      id: contactRow.shopify_customer_id ? Number(contactRow.shopify_customer_id) || contactRow.shopify_customer_id : null,
      email: contactRow.email,
      phone: contactRow.phone,
      first_name: contactRow.first_name,
      last_name: contactRow.last_name,
      orders_count: contactRow.total_orders || 0,
      total_spent: String(contactRow.total_spent || '0.00'),
      accepts_marketing: !!contactRow.accepts_marketing,
      tags: contactRow.tags
        ? (typeof contactRow.tags === 'string' ? contactRow.tags : (Array.isArray(contactRow.tags) ? contactRow.tags.join(', ') : ''))
        : '',
      state: 'enabled',
    };

    // Build a default address block when we have one stored. Omnisend
    // /Klaviyo flow templates often reach into raw.billing_address.*
    const hasAddress = contactRow.address1 || contactRow.city || contactRow.country || contactRow.zip;
    if (hasAddress) {
      const billing = {
        first_name: contactRow.first_name || null,
        last_name: contactRow.last_name || null,
        name: [contactRow.first_name, contactRow.last_name].filter(Boolean).join(' ') || null,
        address1: contactRow.address1 || null,
        address2: contactRow.address2 || null,
        city: contactRow.city || null,
        province: contactRow.province || null,
        country: contactRow.country || null,
        zip: contactRow.zip || null,
        phone: contactRow.phone || null,
      };
      raw.billing_address = raw.billing_address || billing;
      raw.shipping_address = raw.shipping_address || billing;
    }

    // Top-level Klaviyo-style fields — useful for {{ trigger.email }} shortcuts
    enriched.email = enriched.email || contactRow.email || null;
    enriched.phone = enriched.phone || contactRow.phone || null;
  }

  // --------------------------------------------------------
  // 3. Top-level totals so Omnisend-style paths work
  //    (e.g. {{ trigger.raw.total_price }})
  // --------------------------------------------------------
  if (properties.total_price != null) raw.total_price = String(properties.total_price);
  if (properties.subtotal_price != null) raw.subtotal_price = String(properties.subtotal_price);
  if (properties.total_tax != null) raw.total_tax = String(properties.total_tax);
  if (properties.total_discounts != null) raw.total_discounts = String(properties.total_discounts);
  if (properties.currency) raw.currency = properties.currency;
  if (properties.checkout_id) {
    raw.id = raw.id || properties.checkout_id;
    raw.token = raw.token || properties.checkout_id;
  }
  if (properties.order_id) {
    raw.id = raw.id || properties.order_id;
  }

  enriched.raw = raw;
  return enriched;
}
