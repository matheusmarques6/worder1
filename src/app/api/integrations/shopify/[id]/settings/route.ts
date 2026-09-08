// =============================================
// Shopify Store Settings API
// src/app/api/integrations/shopify/[id]/settings/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

// GET - Get store settings
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // A organização vinha na URL e nada exigia sessão: bastava informar o
  // par (id da loja, id da organização) de outra empresa.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
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
  // A organização vinha na URL e nada exigia sessão: bastava informar o
  // par (id da loja, id da organização) de outra empresa.
  const auth = await requireOrgFromAuth(request);
  if (auth instanceof NextResponse) return auth;
  const organizationId = auth.orgId;

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    // A organização é a do token, não a que o corpo mandar.
    const { tags, syncCustomers, syncOrders } = body


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
