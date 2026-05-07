import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export async function POST(request: NextRequest) {
  try {
    // Allow internal calls (from send-batch worker) or authenticated users
    const isInternal = request.headers.get('X-Internal') === 'true'
    let orgId: string | null = null

    if (isInternal) {
      const body = await request.json()
      orgId = body.organization_id
      if (!orgId) return NextResponse.json({ products: [] })
      var { feed_id, feed_type, contact_id, max_products = 4, event_data } = body
    } else {
      const auth = await getAuthClient()
      if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const body = await request.json()
      orgId = auth.user.organization_id
      var { feed_id, feed_type, contact_id, max_products = 4, event_data } = body
    }
    const type = feed_type || 'bestsellers'
    const limit = max_products

    let products: any[] = []

    // Map a line item from any payload shape (pixel = lowercase,
    // webhook = capitalized, raw Shopify = nested under .product/.variant).
    const mapTriggerItem = (it: any) => {
      // Image URL — Shopify line items rarely embed images directly;
      // they often live at .product.images[0].src, .product.image.src,
      // or .product.product_image_urls[0]. Webhook handler sometimes
      // pre-flattens to ImageURL/image_url. Cascade through all of
      // them so we never end up with a blank product card.
      const imageUrl =
        it.ImageURL ||
        it.image_url ||
        it.imageUrl ||
        it.image?.src ||
        it.product?.image?.src ||
        it.product?.images?.[0]?.src ||
        it.product?.product_image_urls?.[0] ||
        it.product?.variant_images_url ||
        it.variant?.image?.src ||
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

      // trigger_auto — single feed type that adapts to whatever trigger
      // fired the email. The block in the editor uses this so the same
      // template works for cart-abandon, checkout-abandon, browse-abandon,
      // viewed-product, and placed-order without the merchant having to
      // pick a feed type per flow.
      //
      // Detection priority:
      //   1. event_data.event_type (new — set by execution-engine context)
      //   2. shape of the payload (Items[] vs single product properties)
      case 'trigger_auto': {
        const eventType = String(event_data?.event_type || event_data?.type || '').toLowerCase()
        // Pull items list from whichever shape the event uses. Pixel
        // events use lowercase `items`, webhook events use capitalized
        // `Items`, and the full Shopify payload uses `line_items`.
        // We check ALL of them so the same block resolves regardless
        // of source.
        const itemsList: any[] =
          event_data?.Items ||
          event_data?.items ||
          event_data?.line_items ||
          event_data?.extra?.line_items ||
          event_data?.raw?.line_items ||
          event_data?.properties?.Items ||
          event_data?.properties?.items ||
          event_data?.properties?.line_items ||
          event_data?.properties?.raw?.line_items ||
          []

        if (Array.isArray(itemsList) && itemsList.length > 0) {
          products = itemsList.slice(0, limit).map((it: any) => mapTriggerItem(it))
          // Enrich missing image_url + url from shopify_products.
          // Pixel events from the Custom Pixel sandbox don't carry
          // image URLs at all (Shopify's Customer Events sandbox only
          // exposes title/price/sku) so we fill them in by joining on
          // shopify_product_id. One batched query, not per-item.
          const needEnrichment = products.filter((p: any) => p.product_id && (!p.image_url || !p.url || p.url === '#'))
          if (needEnrichment.length > 0) {
            const ids = Array.from(new Set(needEnrichment.map((p: any) => String(p.product_id))))
            try {
              const { data: dbProducts } = await supabaseAdmin
                .from('shopify_products')
                .select('shopify_product_id, title, handle, images, price')
                .eq('organization_id', orgId)
                .in('shopify_product_id', ids)
              const byId = new Map<string, any>()
              for (const dp of dbProducts || []) {
                if (dp.shopify_product_id) byId.set(String(dp.shopify_product_id), dp)
              }
              // Look up store domain once for URL building
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
                if (!p.image_url && Array.isArray(dp.images) && dp.images.length > 0) {
                  p.image_url = dp.images[0]?.url || dp.images[0]?.src || null
                }
                if ((!p.url || p.url === '#') && shopDomain && dp.handle) {
                  p.url = `https://${shopDomain}/products/${dp.handle}`
                }
                if (!p.title || p.title === 'Product') {
                  p.title = dp.title || p.title
                }
                if ((!p.price || p.price === 0) && dp.price) {
                  p.price = parseFloat(String(dp.price))
                }
              }
            } catch { /* non-blocking */ }
          }
        } else if (
          eventType === 'viewed_product' ||
          eventType === 'product_viewed' ||
          eventType === 'browse_abandoned' ||
          eventType === 'back_in_stock' ||
          // Single-product shape (no items array but has product fields)
          event_data?.ProductName ||
          event_data?.product_title ||
          event_data?.properties?.product_id
        ) {
          // Single-product event — synthesize one item
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
        // Fallback: nothing in the trigger event → use contact's last
        // recovery cart, same as cart_items behavior. Lets browse-abandon
        // emails still surface SOMETHING when the event itself is empty.
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

    return NextResponse.json({ products: products.slice(0, limit) })
  } catch (error: any) {
    return NextResponse.json({ products: [], error: error.message }, { status: 200 })
  }
}
