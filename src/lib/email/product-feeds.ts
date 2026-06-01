// =============================================
// Product feed resolution — shared library
//
// Extracted from /api/email/product-feeds/resolve so it can be called
// DIRECTLY (no internal HTTP round-trip) from the email render pipeline
// (resolveProductBlocks / resolveCartBlocks) as well as from the route.
//
// Pure data function: takes the org + feed descriptor and returns the
// resolved product list. No auth here — callers (route = session auth,
// render pipeline = trusted server context) authorize before calling.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface ResolveFeedOptions {
  orgId: string
  feedId?: string | null
  feedType?: string | null
  contactId?: string | null
  maxProducts?: number
  eventData?: Record<string, any> | null
}

// Map a line item from any payload shape (pixel = lowercase, webhook =
// capitalized, raw Shopify = nested under .product/.variant).
function mapTriggerItem(it: any) {
  const imageUrl =
    it.ImageURL ||
    it.image_url ||
    it.imageUrl ||
    it.featured_image?.url ||
    it.featured_image?.src ||
    (typeof it.image === 'string' ? it.image : null) ||
    it.image?.src ||
    it.image?.url ||
    it.product?.variant_images_url ||
    it.product?.image?.src ||
    it.product?.images?.[0]?.src ||
    it.product?.images?.[0]?.url ||
    it.product?.product_image_urls?.[0] ||
    it.variant?.image?.src ||
    it.Product?.VariantImage ||
    it.Product?.Images?.[0] ||
    null
  const productUrl =
    it.ProductURL ||
    it.product_url ||
    it.productUrl ||
    it.url ||
    it.product?.product_url ||
    it.product?.url ||
    '#'
  const productId =
    it.ProductID ||
    it.product_id ||
    it.productId ||
    it.product?.id ||
    it.variant?.product?.id ||
    null
  return {
    product_id: productId,
    title: it.ProductName || it.title || it.name || it.product?.title || 'Product',
    price: parseFloat(
      it.ItemPrice ||
      it.price ||
      it.variant?.price?.amount ||
      it.variant?.price ||
      '0'
    ),
    compare_at_price: it.CompareAtPrice
      ? parseFloat(it.CompareAtPrice)
      : it.compare_at_price
        ? parseFloat(it.compare_at_price)
        : it.compareAtPrice
          ? parseFloat(it.compareAtPrice)
          : null,
    image_url: imageUrl,
    url: productUrl,
    quantity: it.Quantity || it.quantity || 1,
    sku: it.SKU || it.sku || it.variant?.sku || null,
    variant_title: it.VariantName || it.variant_title || it.variantTitle || it.variant?.title || null,
    brand: it.Brand || it.vendor || it.product?.vendor || null,
  }
}

export async function resolveProductFeed(opts: ResolveFeedOptions): Promise<any[]> {
  const { orgId } = opts
  if (!orgId) return []
  const type = opts.feedType || 'bestsellers'
  const limit = opts.maxProducts ?? 4
  const contact_id = opts.contactId || null
  const event_data = opts.eventData || null
  const feed_id = opts.feedId || null

  let products: any[] = []

  switch (type) {
    case 'bestsellers':
    case 'most_viewed': {
      const { data } = await supabaseAdmin.from('products')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      products = data || []
      break
    }

    case 'newest': {
      const { data } = await supabaseAdmin.from('products')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)
      products = data || []
      break
    }

    case 'random': {
      const { data } = await supabaseAdmin.from('products')
        .select('*')
        .eq('organization_id', orgId)
        .limit(limit * 3)
      const shuffled = (data || []).sort(() => Math.random() - 0.5)
      products = shuffled.slice(0, limit)
      break
    }

    case 'recently_viewed': {
      if (contact_id) {
        try {
          const { data: events } = await supabaseAdmin.from('tracking_events')
            .select('properties')
            .eq('visitor_id', contact_id)
            .eq('event_type', 'product_viewed')
            .order('created_at', { ascending: false })
            .limit(limit)
          const productIds = (events || [])
            .map((e: any) => e.properties?.product_id)
            .filter(Boolean)
          if (productIds.length > 0) {
            const { data } = await supabaseAdmin.from('products')
              .select('*')
              .in('id', productIds)
            products = data || []
          }
        } catch {}
      }
      if (products.length === 0) {
        const { data } = await supabaseAdmin.from('products')
          .select('*').eq('organization_id', orgId)
          .order('created_at', { ascending: false }).limit(limit)
        products = data || []
      }
      break
    }

    case 'cart_items': {
      if (contact_id) {
        try {
          const { data: recovery } = await supabaseAdmin.from('recovery_carts')
            .select('items')
            .eq('contact_id', contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          if (recovery?.items && Array.isArray(recovery.items)) {
            products = recovery.items.slice(0, limit)
          }
        } catch {}
      }
      break
    }

    case 'trigger_cart': {
      const items = event_data?.Items || event_data?.line_items || event_data?.extra?.line_items || []
      products = items.slice(0, limit).map((it: any) => mapTriggerItem(it))
      break
    }

    case 'trigger_auto': {
      const eventType = String(event_data?.event_type || event_data?.type || '').toLowerCase()
      const itemsList: any[] =
        event_data?.raw?.line_items ||
        event_data?.properties?.raw?.line_items ||
        event_data?.Items ||
        event_data?.items ||
        event_data?.line_items ||
        event_data?.extra?.line_items ||
        event_data?.properties?.Items ||
        event_data?.properties?.items ||
        event_data?.properties?.line_items ||
        (event_data?.added_item ? [event_data.added_item] : null) ||
        (event_data?.properties?.added_item ? [event_data.properties.added_item] : null) ||
        (event_data?.viewed_product ? [event_data.viewed_product] : null) ||
        (event_data?.properties?.viewed_product ? [event_data.properties.viewed_product] : null) ||
        []

      if (Array.isArray(itemsList) && itemsList.length > 0) {
        products = itemsList.slice(0, limit).map((it: any, idx: number) => ({
          ...mapTriggerItem(it),
          _variant_id: String(it.VariantID || it.variant_id || it.variantId || it.id || '') || null,
          _idx: idx,
        }))
        const needEnrichment = products.filter((p: any) => p.product_id && (!p.image_url || !p.url || p.url === '#'))
        if (needEnrichment.length > 0) {
          const ids = Array.from(new Set(needEnrichment.map((p: any) => String(p.product_id))))
          try {
            const { data: dbProducts } = await supabaseAdmin
              .from('shopify_products')
              .select('shopify_product_id, title, handle, images, variants, price')
              .eq('organization_id', orgId)
              .in('shopify_product_id', ids)
            const byId = new Map<string, any>()
            for (const dp of dbProducts || []) {
              if (dp.shopify_product_id) byId.set(String(dp.shopify_product_id), dp)
            }
            const { data: storeRow } = await supabaseAdmin
              .from('shopify_stores')
              .select('shop_domain')
              .eq('organization_id', orgId)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle()
            const shopDomain = storeRow?.shop_domain || ''
            for (const p of products) {
              const pid = p.product_id ? String(p.product_id) : null
              if (!pid) continue
              const dp = byId.get(pid)
              if (!dp) continue
              if (!p.image_url) {
                const variantId = (p as any)._variant_id
                const variants: any[] = Array.isArray(dp.variants) ? dp.variants : []
                const matchedVariant = variantId
                  ? variants.find((v: any) => String(v.id) === String(variantId))
                  : null
                let pickedImage: string | null = null
                if (matchedVariant?.image_id && Array.isArray(dp.images)) {
                  const variantImg = dp.images.find((img: any) => String(img?.id) === String(matchedVariant.image_id))
                  pickedImage = variantImg?.src || variantImg?.url || null
                }
                if (!pickedImage && Array.isArray(dp.images) && dp.images.length > 0) {
                  pickedImage = dp.images[0]?.url || dp.images[0]?.src || null
                }
                if (pickedImage) p.image_url = pickedImage
              }
              if ((!p.url || p.url === '#') && shopDomain && dp.handle) {
                const variantId = (p as any)._variant_id
                p.url = variantId
                  ? `https://${shopDomain}/products/${dp.handle}?variant=${variantId}`
                  : `https://${shopDomain}/products/${dp.handle}`
              }
              if (!p.title || p.title === 'Product') {
                p.title = dp.title || p.title
              }
              if ((!p.price || p.price === 0) && dp.price) {
                p.price = parseFloat(String(dp.price))
              }
              delete (p as any)._variant_id
              delete (p as any)._idx
            }
          } catch { /* non-blocking */ }
        }
        for (const p of products) {
          delete (p as any)._variant_id
          delete (p as any)._idx
        }
      } else if (
        eventType === 'viewed_product' ||
        eventType === 'product_viewed' ||
        eventType === 'browse_abandoned' ||
        eventType === 'back_in_stock' ||
        event_data?.ProductName ||
        event_data?.product_title ||
        event_data?.properties?.product_id
      ) {
        const props = event_data?.properties || event_data || {}
        const raw = props.raw || event_data?.raw || {}
        products = [{
          id: props.ProductID || props.product_id || raw.product_id || null,
          title:
            props.ProductName ||
            props.product_title ||
            props.title ||
            raw.title ||
            'Produto',
          price: parseFloat(
            props.Price || props.price || props.ItemPrice ||
            raw.price || '0'
          ),
          compare_at_price: props.CompareAtPrice
            ? parseFloat(props.CompareAtPrice)
            : props.compare_at_price
              ? parseFloat(props.compare_at_price)
              : raw.compare_at_price
                ? parseFloat(raw.compare_at_price)
                : null,
          image_url: props.ImageURL || props.image_url || raw.image_url || null,
          url:
            props.ProductURL ||
            props.product_url ||
            raw.product_url ||
            raw.url ||
            '#',
          sku: props.SKU || props.sku || raw.sku || null,
          variant_title: props.VariantName || props.variant_title || raw.variant_title || null,
          brand: props.Brand || props.vendor || raw.vendor || null,
          description: props.Description || props.description || raw.description || null,
        }]
      }
      if (products.length === 0 && contact_id) {
        try {
          const { data: recovery } = await supabaseAdmin.from('recovery_carts')
            .select('items')
            .eq('contact_id', contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          if (recovery?.items && Array.isArray(recovery.items)) {
            products = recovery.items.slice(0, limit).map((it: any) => mapTriggerItem(it))
          }
        } catch {}
      }
      break
    }

    case 'trigger_viewed_product': {
      if (event_data) {
        const props = event_data.properties || event_data
        products = [{
          title: props.ProductName || props.product_title || props.title || 'Product',
          price: parseFloat(props.Price || props.price || props.ItemPrice || '0'),
          compare_at_price: props.CompareAtPrice ? parseFloat(props.CompareAtPrice) : (props.compare_at_price ? parseFloat(props.compare_at_price) : null),
          image_url: props.ImageURL || props.image_url || null,
          url: props.ProductURL || props.product_url || '#',
          sku: props.SKU || props.sku || null,
          variant_title: props.VariantName || props.variant_title || null,
          brand: props.Brand || props.vendor || null,
        }]
      }
      break
    }

    case 'trigger_order': {
      const items = event_data?.Items || event_data?.line_items || []
      products = items.slice(0, limit).map((it: any) => mapTriggerItem(it))
      break
    }

    case 'recommendations':
    default: {
      const { data } = await supabaseAdmin.from('products')
        .select('*').eq('organization_id', orgId)
        .limit(limit)
      products = data || []
    }
  }

  // If feed_id provided, load feed config for filters
  if (feed_id) {
    try {
      const { data: feed } = await supabaseAdmin.from('product_feeds')
        .select('filters').eq('id', feed_id).eq('organization_id', orgId).single()
      if (feed && feed.filters && Array.isArray(feed.filters) && feed.filters.length > 0) {
        for (const filter of feed.filters as any[]) {
          if (filter.field === 'category' && filter.value !== 'all') {
            products = products.filter((p: any) =>
              p.product_type === filter.value || p.category === filter.value
            )
          }
        }
      }
    } catch {}
  }

  return products.slice(0, limit)
}
