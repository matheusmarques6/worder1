/**
 * CRON: Check back-in-stock
 * /api/cron/check-back-in-stock
 *
 * Verifica produtos com interesse pendente (`whatsapp_product_interests`).
 * Quando inventory_quantity > 0, dispara automação (trigger_back_in_stock)
 * para cada contato interessado e marca como notificado.
 *
 * Roda a cada 10 min.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const start = Date.now()
  try {
    // 1. Busca interests pendentes (não notificados)
    const { data: interests, error } = await supabaseAdmin
      .from('whatsapp_product_interests')
      .select('id, organization_id, contact_id, phone, product_id, variant_id, product_title')
      .eq('notified', false)
      .limit(500)

    if (error) {
      console.error('[back-in-stock] fetch error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!interests || interests.length === 0) {
      return NextResponse.json({ checked: 0, notified: 0 })
    }

    // 2. Agrupa por product_id/variant para minimizar queries ao estoque
    const productIds = Array.from(new Set(interests.map((i) => i.product_id).filter(Boolean)))

    // 3. Busca produtos em estoque (shopify_products.inventory_quantity > 0 OR variants contém em estoque)
    const { data: products } = await supabaseAdmin
      .from('shopify_products')
      .select('shopify_product_id, inventory_quantity, variants, organization_id')
      .in('shopify_product_id', productIds as string[])

    const stockMap = new Map<string, boolean>()
    for (const p of products || []) {
      let inStock = (p.inventory_quantity || 0) > 0
      if (!inStock && Array.isArray(p.variants)) {
        inStock = p.variants.some((v: any) => (v.inventory_quantity || 0) > 0)
      }
      stockMap.set(String(p.shopify_product_id), inStock)
    }

    // 4. Dispatch via dispatchTrigger so trigger_filters / audience_filters
    // / frequency_config / idempotencyKey all apply consistently with the
    // rest of the trigger surface. The previous direct insert bypassed
    // every filter and could create the same run twice if the cron ran
    // back-to-back.
    const { dispatchTrigger } = await import('@/lib/automation/trigger-dispatcher')
    let notified = 0
    for (const interest of interests) {
      if (!interest.product_id) continue
      if (!stockMap.get(String(interest.product_id))) continue

      await dispatchTrigger({
        organizationId: interest.organization_id,
        triggerType: 'trigger_back_in_stock',
        contactId: interest.contact_id,
        triggerData: {
          event_type: 'back_in_stock',
          product_id: interest.product_id,
          ProductID: interest.product_id,
          product_name: interest.product_title,
          ProductName: interest.product_title,
          variant_id: interest.variant_id,
          VariantID: interest.variant_id,
          Items: [{
            ProductID: interest.product_id,
            ProductName: interest.product_title,
            VariantID: interest.variant_id,
          }],
          properties: {
            product_id: interest.product_id,
            product_title: interest.product_title,
            variant_id: interest.variant_id,
            source: 'back_in_stock',
          },
        },
        // Idempotency: contact + product + day. Same product back in
        // stock today won't double-fire even if cron runs every 10min.
        idempotencyKey: `back_in_stock:${interest.contact_id}:${interest.product_id}:${new Date().toISOString().slice(0, 10)}`,
      }).catch((e) => console.error('[back-in-stock] dispatch failed:', e))

      // Marca como notificado
      await supabaseAdmin
        .from('whatsapp_product_interests')
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', interest.id)

      notified++
    }

    return NextResponse.json({
      checked: interests.length,
      notified,
      productsChecked: productIds.length,
      durationMs: Date.now() - start,
    })
  } catch (err: any) {
    console.error('[back-in-stock] error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
