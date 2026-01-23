// =============================================
// API: Configure Shopify Store (SEGURO)
// src/app/api/shopify/configure/route.ts
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

    // ✅ SEGURO: Validar que a loja pertence à organização do usuário
    const validation = await validateStoreAccess(auth.supabase, organizationId, storeId)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 403 }
      )
    }

    // Atualizar configurações (agora seguro - validado acima)
    const { data: store, error } = await supabaseAdmin
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
      .eq('organization_id', organizationId) // ✅ Double-check
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

// =============================================
// GET: Obter configurações atuais
// =============================================

export async function GET(request: NextRequest) {
  // ✅ SEGURO: Autenticação obrigatória
  const auth = await getAuthClient()
  if (!auth) return authError()
  
  const { user, supabase } = auth
  const organizationId = user.organization_id

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')

  try {
    if (storeId) {
      // ✅ SEGURO: RLS filtra automaticamente
      const { data: store, error } = await supabase
        .from('shopify_stores')
        .select(`
          id,
          shop_name,
          shop_domain,
          default_pipeline_id,
          default_stage_id,
          contact_type,
          sync_orders,
          sync_customers,
          sync_checkouts,
          sync_refunds,
          auto_tags,
          stage_mapping,
          is_configured
        `)
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .single()

      if (error) throw error
      
      return NextResponse.json({ store })
    }

    // Listar todas as lojas da organização
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, is_configured, is_active')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ stores: stores || [] })
  } catch (error: any) {
    console.error('Error getting Shopify config:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
