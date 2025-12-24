// =============================================
// API: Configure Shopify Store
// src/app/api/shopify/configure/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const {
      storeId,
      defaultPipelineId,
      defaultStageId,
      contactType,
      syncOrders,
      syncCustomers,
      syncCheckouts,
      syncRefunds,
      autoTags,
      stageMapping,
    } = body

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    // Atualizar configurações
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .update({
        default_pipeline_id: defaultPipelineId || null,
        default_stage_id: defaultStageId || null,
        contact_type: contactType || 'auto',
        sync_orders: syncOrders ?? true,
        sync_customers: syncCustomers ?? true,
        sync_checkouts: syncCheckouts ?? true,
        sync_refunds: syncRefunds ?? false,
        auto_tags: autoTags || ['shopify'],
        stage_mapping: stageMapping || {},
        is_configured: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      store,
      message: 'Configurações salvas com sucesso' 
    })
  } catch (error: any) {
    console.error('Error configuring Shopify store:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
