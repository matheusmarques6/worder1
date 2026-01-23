// =============================================
// API: Toggle Shopify Store Active Status (SEGURO)
// src/app/api/shopify/toggle/route.ts
//
// ⚠️ CORRIGIDO: Usa autenticação obrigatória
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError, validateStoreAccess, getSupabaseClient } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // ✅ SEGURO: Autenticação obrigatória
  const auth = await getAuthClient()
  if (!auth) return authError()
  
  const { user } = auth
  const organizationId = user.organization_id

  // Usar service_role para update (após validação)
  const supabaseAdmin = getSupabaseClient()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { storeId, isActive } = body

    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    // ✅ SEGURO: Validar que a loja pertence à organização do usuário
    const validation = await validateStoreAccess(auth.supabase, organizationId, storeId)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      )
    }

    // Atualizar status (agora seguro - validado acima)
    const { data: store, error } = await supabaseAdmin
      .from('shopify_stores')
      .update({
        is_active: isActive,
        connection_status: isActive ? 'active' : 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId)
      .eq('organization_id', organizationId) // ✅ Double-check
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
