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
        products = items.slice(0, limit).map((it: any) => ({
          title: it.ProductName || it.title || it.name || 'Product',
          price: parseFloat(it.ItemPrice || it.price || '0'),
          compare_at_price: it.CompareAtPrice ? parseFloat(it.CompareAtPrice) : null,
          image_url: it.ImageURL || it.image_url || it.image?.src || null,
          url: it.ProductURL || it.url || '#',
        }))
        break
      }

      case 'trigger_viewed_product': {
        if (event_data) {
          products = [{
            title: event_data?.ProductName || event_data?.product_title || event_data?.title || 'Product',
            price: parseFloat(event_data?.Price || event_data?.price || '0'),
            image_url: event_data?.ImageURL || event_data?.image_url || null,
            url: event_data?.ProductURL || event_data?.product_url || '#',
          }]
        }
        break
      }

      case 'trigger_order': {
        const items = event_data?.Items || event_data?.line_items || []
        products = items.slice(0, limit).map((it: any) => ({
          title: it.ProductName || it.title || it.name || 'Product',
          price: parseFloat(it.ItemPrice || it.price || '0'),
          image_url: it.ImageURL || it.image_url || it.image?.src || null,
          url: it.ProductURL || it.url || '#',
          quantity: it.Quantity || it.quantity || 1,
        }))
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
