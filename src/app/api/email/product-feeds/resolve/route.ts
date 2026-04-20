import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const { feed_id, feed_type, contact_id, organization_id, max_products = 4 } = await request.json()

    if (!organization_id) {
      return NextResponse.json({ products: [] })
    }

    const orgId = organization_id
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
          .select('filters').eq('id', feed_id).single()
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
