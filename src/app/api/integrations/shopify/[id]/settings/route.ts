// =============================================
// Shopify Store Settings API
// src/app/api/integrations/shopify/[id]/settings/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET - Get store settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, settings')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (error || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const settings = store.settings || {}

    return NextResponse.json({
      tags: settings.auto_tags || [],
      syncCustomers: settings.sync_customers !== false,
      syncOrders: settings.sync_orders !== false,
    })
  } catch (error: any) {
    console.error('Error fetching store settings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Update store settings
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { organizationId, tags, syncCustomers, syncOrders } = body

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    // Get current settings
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('settings')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    const currentSettings = store?.settings || {}

    // Merge new settings
    const newSettings = {
      ...currentSettings,
      auto_tags: tags || currentSettings.auto_tags || [],
      sync_customers: syncCustomers !== undefined ? syncCustomers : currentSettings.sync_customers,
      sync_orders: syncOrders !== undefined ? syncOrders : currentSettings.sync_orders,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('shopify_stores')
      .update({ settings: newSettings })
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, settings: newSettings })
  } catch (error: any) {
    console.error('Error updating store settings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
