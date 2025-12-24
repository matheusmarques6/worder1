// =============================================
// API: Get Shopify Store
// src/app/api/shopify/store/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  try {
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .select(`
        id,
        shop_name,
        shop_domain,
        shop_email,
        currency,
        timezone,
        is_active,
        is_configured,
        connection_status,
        default_pipeline_id,
        default_stage_id,
        contact_type,
        auto_tags,
        sync_orders,
        sync_customers,
        sync_checkouts,
        sync_refunds,
        stage_mapping,
        last_sync_at,
        last_reconcile_at,
        total_customers_imported,
        total_orders_imported,
        created_at
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ store })
  } catch (error: any) {
    console.error('Error fetching Shopify store:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
