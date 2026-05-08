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
}

const ENRICH_EVENT_TYPES = new Set([
  'checkout_started',
  'checkout_completed',
  'placed_order',
  'order_paid',
  'added_to_cart',
  'viewed_product',
  'cart_viewed',
]);

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

  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const productIds = Array.from(new Set(
      rawItems
        .map((it) => String(it.product_id || it.productId || it.ProductID || '').trim())
        .filter(Boolean)
    ));

    let productMap = new Map<string, any>();
    if (productIds.length > 0) {
      try {
        const { data } = await opts.supabase
          .from('shopify_products')
          .select('shopify_product_id, title, handle, vendor, product_type, tags, images, variants, price, status')
          .eq('store_id', opts.storeId)
          .in('shopify_product_id', productIds);
        for (const p of (data || []) as any[]) {
          productMap.set(String(p.shopify_product_id), p);
        }
      } catch { /* best-effort */ }
    }

    const shopUrl = opts.shopDomain ? `https://${opts.shopDomain}` : null;

    const enrichedItems = rawItems.map((it) => {
      const productId = String(it.product_id || it.productId || it.ProductID || '');
      const variantId = String(it.variant_id || it.variantId || it.VariantID || '');
      const dbProduct = productMap.get(productId);

      const images: string[] = (dbProduct?.images || [])
        .map((img: any) => img?.src || img?.url || img)
        .filter(Boolean);

      const variants: any[] = Array.isArray(dbProduct?.variants) ? dbProduct.variants : [];
      const matchedVariant = variantId
        ? variants.find((v: any) => String(v.id) === variantId)
        : variants[0];

      // Pick variant image when the variant has one, fall back to first product image
      let variantImageUrl: string | null = null;
      if (matchedVariant?.image_id) {
        const variantImg = (dbProduct?.images || []).find((img: any) => String(img?.id) === String(matchedVariant.image_id));
        variantImageUrl = variantImg?.src || variantImg?.url || null;
      }
      variantImageUrl = variantImageUrl || images[0] || null;

      // Build the rich product object Omnisend ships in raw.line_items[].product
      const productObj = dbProduct ? {
        id: String(dbProduct.shopify_product_id),
        title: dbProduct.title,
        handle: dbProduct.handle,
        vendor: dbProduct.vendor,
        product_type: dbProduct.product_type,
        tags: dbProduct.tags
          ? (typeof dbProduct.tags === 'string' ? dbProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : dbProduct.tags)
          : [],
        product_image_urls: images,
        product_url: dbProduct.handle && shopUrl ? `${shopUrl}/products/${dbProduct.handle}` : null,
        variant_images_url: variantImageUrl,
      } : null;

      return {
        // Omnisend-shape fields (full)
        product_id: productId ? Number(productId) || productId : null,
        variant_id: variantId ? Number(variantId) || variantId : null,
        title: it.title || it.name || it.ProductName || dbProduct?.title || null,
        variant_title: it.variant_title || it.variantTitle || it.VariantName || matchedVariant?.title || null,
        sku: it.sku || it.SKU || matchedVariant?.sku || null,
        quantity: it.quantity || it.Quantity || 1,
        price: parseFloat(it.price || it.Price || it.ItemPrice || matchedVariant?.price || '0'),
        line_price: parseFloat(it.line_price || ((it.price || matchedVariant?.price || 0) * (it.quantity || 1))),
        compare_at_price: it.compare_at_price || matchedVariant?.compare_at_price || null,
        vendor: it.vendor || dbProduct?.vendor || null,
        requires_shipping: it.requires_shipping ?? matchedVariant?.requires_shipping ?? true,
        taxable: it.taxable ?? matchedVariant?.taxable ?? true,
        properties: it.properties || {},
        // Klaviyo-style flat fields (preserve what was already there)
        ImageURL: it.ImageURL || it.image_url || variantImageUrl || images[0] || null,
        // The richer product nested object — what Omnisend ships
        product: productObj,
      };
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
