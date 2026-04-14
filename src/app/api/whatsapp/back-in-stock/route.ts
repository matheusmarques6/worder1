// =============================================
// API: Back-in-Stock Worker
// POST /api/whatsapp/back-in-stock
//   - Shopify inventory_levels/update webhook target
//   - Or called by cron to process recently restocked products
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { processProductBackInStock } from '@/lib/services/whatsapp/back-in-stock-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Case 1: Shopify webhook payload (inventory_levels/update)
    if (body.inventory_item_id !== undefined) {
      const { inventory_item_id, available, location_id } = body

      if (available <= 0) {
        return NextResponse.json({ status: 'skipped', reason: 'out of stock' })
      }

      // Find product for this inventory_item across all connected stores
      const shopDomain = request.headers.get('x-shopify-shop-domain')

      const { data: store } = await supabaseAdmin
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('shop_domain', shopDomain)
        .maybeSingle()

      if (!store) {
        return NextResponse.json({ status: 'skipped', reason: 'unknown store' })
      }

      // Find the product_id associated with this inventory_item
      const { data: variant } = await supabaseAdmin
        .from('shopify_variants')
        .select('product_id, variant_id, product_title')
        .eq('inventory_item_id', inventory_item_id)
        .maybeSingle()

      if (!variant) {
        return NextResponse.json({ status: 'skipped', reason: 'variant not found' })
      }

      const result = await processProductBackInStock({
        organizationId: store.organization_id,
        storeId: store.id,
        productId: String(variant.product_id),
        variantId: String(variant.variant_id),
        productTitle: variant.product_title,
      })

      return NextResponse.json({ status: 'processed', notified: result.data?.notified || 0 })
    }

    // Case 2: Direct call (admin or cron)
    const { organizationId, storeId, productId, variantId, productTitle, productUrl } = body

    if (!organizationId || !productId) {
      return NextResponse.json({ error: 'organizationId and productId required' }, { status: 400 })
    }

    const result = await processProductBackInStock({
      organizationId,
      storeId,
      productId,
      variantId,
      productTitle,
      productUrl,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ data: result.data })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * GET: Endpoint for cron to check recently updated products
 * Checks all products with active interests whose inventory > 0
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const cronSecret = request.headers.get('x-cron-secret')
    const expectedSecret = process.env.CRON_SECRET

    if (expectedSecret && cronSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = searchParams.get('organizationId')
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    // Get all distinct product_ids with pending interests
    const { data: interests } = await supabaseAdmin
      .from('whatsapp_product_interests')
      .select('product_id, store_id')
      .eq('organization_id', organizationId)
      .eq('notified', false)
      .limit(500)

    if (!interests || interests.length === 0) {
      return NextResponse.json({ data: { checked: 0, notified: 0 } })
    }

    // Deduplicate product_ids
    const uniqueProducts = Array.from(
      new Map(interests.map((i) => [`${i.store_id}:${i.product_id}`, i])).values()
    )

    let totalNotified = 0
    for (const p of uniqueProducts) {
      // Check if product is in stock via shopify_products
      const { data: product } = await supabaseAdmin
        .from('shopify_products')
        .select('total_inventory, title, handle, store_id')
        .eq('store_id', p.store_id)
        .eq('shopify_product_id', p.product_id)
        .maybeSingle()

      if (!product || (product.total_inventory || 0) <= 0) continue

      const result = await processProductBackInStock({
        organizationId,
        storeId: p.store_id,
        productId: p.product_id,
        productTitle: product.title,
      })

      totalNotified += result.data?.notified || 0
    }

    return NextResponse.json({
      data: { checked: uniqueProducts.length, notified: totalNotified },
    })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
