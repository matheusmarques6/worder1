import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ FASE 1: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// GET - Lista números de WhatsApp
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Parâmetros obrigatórios
    const organizationId = searchParams.get('organization_id') || searchParams.get('organizationId')
    const storeId = searchParams.get('store_id') || searchParams.get('storeId')
    
    // ✅ FASE 1: storeId OBRIGATÓRIO
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'store_id is required for multi-store isolation' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Parâmetros opcionais
    const includeStats = searchParams.get('include_stats') === 'true'
    const connectedOnly = searchParams.get('connected_only') === 'true'

    console.log('[Numbers API] Fetching for org:', organizationId, 'store:', storeId)

    // ✅ FASE 1: Query filtrada por organization_id E store_id
    let { data: numbers, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    // Se a nova tabela não existe, usa a antiga (whatsapp_instances)
    if (error && error.code === '42P01') {
      console.log('[Numbers API] Fallback to whatsapp_instances')
      
      const result = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })

      if (result.data) {
        // Converter formato antigo para novo
        numbers = result.data.map((instance: any) => ({
          id: instance.id,
          organization_id: instance.organization_id,
          store_id: instance.store_id,
          phone_number: instance.phone_number || instance.instance_name,
          phone_number_id: instance.phone_number_id,
          display_name: instance.display_name || instance.instance_name,
          provider: instance.provider || 'meta_cloud',
          is_connected: instance.status === 'connected' || instance.is_connected,
          is_active: instance.is_active !== false,
          connection_status: instance.status || (instance.is_connected ? 'connected' : 'disconnected'),
          // Credenciais
          access_token: instance.access_token,
          webhook_verify_token: instance.webhook_verify_token,
          instance_name: instance.instance_name,
          api_key: instance.api_key,
          // Meta
          business_account_id: instance.business_account_id,
          created_at: instance.created_at,
          updated_at: instance.updated_at,
        }))
      }
      error = result.error
    }

    if (error) throw error

    let result = numbers || []

    // Filtrar apenas conectados
    if (connectedOnly) {
      result = result.filter((n: any) => n.is_connected && n.is_active)
    }

    // Incluir estatísticas
    if (includeStats && result.length > 0) {
      for (const number of result) {
        // Contar conversas da mesma loja
        const { count: conversationsCount } = await supabase
          .from('whatsapp_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .or(`whatsapp_number_id.eq.${number.id},instance_id.eq.${number.id}`)

        // Contar mensagens hoje
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const { count: messagesToday } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .or(`whatsapp_number_id.eq.${number.id},instance_id.eq.${number.id}`)
          .gte('created_at', today.toISOString())

        number.stats = {
          total_conversations: conversationsCount || 0,
          messages_today: messagesToday || 0,
        }
      }
    }

    console.log('[Numbers API] Found', result.length, 'numbers for store:', storeId)

    return NextResponse.json(
      { numbers: result },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// POST - Adicionar número de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      organization_id,
      store_id,
      provider = 'meta_cloud',
      phone_number,
      display_name,
      // Meta Cloud
      phone_number_id,
      access_token,
      business_account_id,
      webhook_verify_token,
      // Legado (compat tabela antiga whatsapp_instances)
      instance_name,
      api_key,
    } = body

    // ✅ FASE 1: Validações obrigatórias
    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!store_id) {
      return NextResponse.json(
        { error: 'store_id is required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!phone_number && !instance_name) {
      return NextResponse.json(
        { error: 'phone_number ou instance_name é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Dados do número
    const numberData: any = {
      organization_id,
      store_id,
      provider,
      phone_number: phone_number || instance_name,
      display_name: display_name || phone_number || instance_name,
      is_connected: false,
      is_active: true,
      connection_status: 'disconnected',
    }

    // Dados específicos do provider Cloud (Meta)
    if (provider === 'meta_cloud') {
      numberData.phone_number_id = phone_number_id
      numberData.access_token = access_token
      numberData.business_account_id = business_account_id
      numberData.webhook_verify_token = webhook_verify_token || generateToken()
    }

    // Inserir
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .insert(numberData)
      .select()
      .single()

    // Se a tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const instanceData = {
        organization_id,
        store_id,
        instance_name: instance_name || phone_number,
        phone_number,
        display_name: display_name || phone_number,
        provider,
        status: 'disconnected',
        is_active: true,
        phone_number_id,
        access_token,
        business_account_id,
        webhook_verify_token: webhook_verify_token || generateToken(),
        api_key,
      }

      const result = await supabase
        .from('whatsapp_instances')
        .insert(instanceData)
        .select()
        .single()

      if (result.error) throw result.error
      return NextResponse.json(
        { number: result.data },
        { status: 201, headers: NO_CACHE_HEADERS }
      )
    }

    if (error) throw error

    return NextResponse.json(
      { number: data },
      { status: 201, headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] POST Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// PATCH - Atualizar número de WhatsApp
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, organization_id, store_id, ...updateData } = body

    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!organization_id || !store_id) {
      return NextResponse.json(
        { error: 'organization_id and store_id are required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Campos permitidos
    const allowed = [
      'display_name',
      'is_active',
      'is_connected',
      'connection_status',
      'access_token',
      'api_key',
    ]
    
    const filtered: any = {}
    allowed.forEach(f => {
      if (f in updateData) filtered[f] = updateData[f]
    })
    filtered.updated_at = new Date().toISOString()

    // ✅ FASE 1: Filtrar por organization_id E store_id
    let { data, error } = await supabase
      .from('whatsapp_numbers')
      .update(filtered)
      .eq('id', id)
      .eq('organization_id', organization_id)
      .eq('store_id', store_id)
      .select()
      .single()

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .update(filtered)
        .eq('id', id)
        .eq('organization_id', organization_id)
        .eq('store_id', store_id)
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json(
      { number: data },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] PATCH Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// DELETE - Remover número de WhatsApp
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const organizationId = searchParams.get('organization_id') || searchParams.get('organizationId')
    const storeId = searchParams.get('store_id') || searchParams.get('storeId')
    
    if (!id) {
      return NextResponse.json(
        { error: 'id é obrigatório' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    if (!organizationId || !storeId) {
      return NextResponse.json(
        { error: 'organization_id and store_id are required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 1: Filtrar por organization_id E store_id
    let { error } = await supabase
      .from('whatsapp_numbers')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('store_id', storeId)

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId)
        .eq('store_id', storeId)

      error = result.error
    }

    if (error) throw error

    return NextResponse.json(
      { success: true },
      { headers: NO_CACHE_HEADERS }
    )

  } catch (error: any) {
    console.error('[Numbers API] DELETE Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// Helper para gerar token de verificação
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
}
