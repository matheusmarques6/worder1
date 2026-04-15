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

    // 4. Dispara automation_runs para interests cujo produto está em estoque
    let notified = 0
    for (const interest of interests) {
      if (!interest.product_id) continue
      if (!stockMap.get(String(interest.product_id))) continue

      // Busca automações com trigger_type = 'trigger_back_in_stock' para esta org
      const { data: automations } = await supabaseAdmin
        .from('automations')
        .select('id, trigger_config')
        .eq('organization_id', interest.organization_id)
        .eq('trigger_type', 'trigger_back_in_stock')
        .eq('status', 'active')

      for (const auto of automations || []) {
        await supabaseAdmin.from('automation_runs').insert({
          organization_id: interest.organization_id,
          automation_id: auto.id,
          contact_id: interest.contact_id,
          status: 'pending',
          metadata: {
            trigger_data: {
              product_id: interest.product_id,
              product_title: interest.product_title,
              variant_id: interest.variant_id,
              source: 'back_in_stock',
            },
          },
        })
      }

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
