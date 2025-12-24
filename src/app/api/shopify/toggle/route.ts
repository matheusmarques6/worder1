// =============================================
// API: Toggle Shopify Store Active Status
// src/app/api/shopify/toggle/route.ts
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
    const { storeId, isActive } = body

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    // Atualizar status
    const { data: store, error } = await supabase
      .from('shopify_stores')
      .update({
        is_active: isActive,
        connection_status: isActive ? 'active' : 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      store,
      message: isActive ? 'Integração ativada' : 'Integração pausada' 
    })
  } catch (error: any) {
    console.error('Error toggling Shopify store:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
