// =============================================
// API: Back-in-Stock Worker
// POST /api/whatsapp/back-in-stock
//   - Shopify inventory_levels/update webhook target
//   - Or called by cron to process recently restocked products
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { processProductBackInStock } from '@/lib/services/whatsapp/back-in-stock-service'
import { isInternalAuthorized } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ✅ P1 v2: verifica Bearer secret para rotas server-to-server (admin/cron).
// Item 25 da auditoria: cópia local unificada com process/document/route.ts
// em src/lib/internal-auth.ts, fail-closed sem exceção de ambiente.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Case 1: Shopify webhook payload (inventory_levels/update)
    // Org derived from shop domain → store lookup — NOT from client body (already safe)
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

      // Emit event_log so flow automations with trigger_back_in_stock fire
      await supabaseAdmin.from('event_logs').insert({
        organization_id: store.organization_id,
        event_type: 'back_in_stock',
        contact_id: null,
        payload: {
          product_id: String(variant.product_id),
          variant_id: String(variant.variant_id),
          product_title: variant.product_title,
          store_id: store.id,
          inventory_item_id,
          available,
          location_id,
        },
        source: 'shopify_webhook',
        processed: false,
      })

      return NextResponse.json({ status: 'processed', notified: result.data?.notified || 0 })
    }

    // Case 2: Direct call (admin or cron) — ✅ P1 v2: requer Bearer secret
    if (!isInternalAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Emit event_log so flow automations with trigger_back_in_stock fire
    await supabaseAdmin.from('event_logs').insert({
      organization_id: organizationId,
      event_type: 'back_in_stock',
      contact_id: null,
      payload: {
        product_id: productId,
        variant_id: variantId,
        product_title: productTitle,
        product_url: productUrl,
        store_id: storeId,
      },
      source: 'manual',
      processed: false,
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
  // ✅ P1 v2: rota de cron — requer Bearer secret (INTERNAL_API_SECRET || CRON_SECRET)
  // ou x-cron-secret legado; organizationId da query é aceito pois só cron acessa
  if (!isInternalAuthorized(request)) {
    // fallback: accept legacy x-cron-secret header
    const cronSecret = request.headers.get('x-cron-secret')
    const expectedSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const { searchParams } = new URL(request.url)

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
