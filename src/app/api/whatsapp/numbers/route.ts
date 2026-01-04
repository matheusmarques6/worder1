import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-route';

import { getSupabaseClient } from '@/lib/api-utils'

async function getOrgIdFromSession(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  return data?.organization_id
}

// GET - Lista números de WhatsApp
export async function GET(request: NextRequest) {
  // Primeiro tenta pegar organization_id da query string
  const orgIdFromQuery = request.nextUrl.searchParams.get('organization_id') || 
                          request.nextUrl.searchParams.get('organizationId')
  
  let supabase: any
  let orgId: string | null = null

  if (orgIdFromQuery) {
    // Usar client direto se organization_id foi fornecido
    supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }
    orgId = orgIdFromQuery
  } else {
    // Fallback para autenticação por sessão
    try {
      supabase = createSupabaseRouteClient()
      orgId = await getOrgIdFromSession(supabase)
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  
  if (!orgId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
  }

  try {
    // Parâmetros
    const includeStats = request.nextUrl.searchParams.get('include_stats') === 'true'
    const connectedOnly = request.nextUrl.searchParams.get('connected_only') === 'true'

    // Tenta a nova tabela primeiro
    let { data: numbers, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    // Se a nova tabela não existe, usa a antiga (whatsapp_instances)
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })

      if (result.data) {
        // Converter formato antigo para novo
        numbers = result.data.map((instance: any) => ({
          id: instance.id,
          organization_id: instance.organization_id,
          phone_number: instance.phone_number || instance.instance_name,
          phone_number_id: instance.phone_number_id,
          display_name: instance.display_name || instance.instance_name,
          provider: instance.provider || 'evolution',
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
        // Contar conversas
        const { count: conversationsCount } = await supabase
          .from('whatsapp_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('whatsapp_number_id', number.id)

        // Contar mensagens hoje
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const { count: messagesToday } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('whatsapp_number_id', number.id)
          .gte('created_at', today.toISOString())

        number.stats = {
          total_conversations: conversationsCount || 0,
          messages_today: messagesToday || 0,
        }
      }
    }

    return NextResponse.json({ numbers: result })

  } catch (error: any) {
    console.error('Error fetching WhatsApp numbers:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Adicionar número de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgIdFromSession(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      provider = 'evolution',
      phone_number,
      display_name,
      // Meta Cloud
      phone_number_id,
      access_token,
      business_account_id,
      webhook_verify_token,
      // Evolution
      instance_name,
      api_key,
      base_url,
    } = body

    if (!phone_number && !instance_name) {
      return NextResponse.json(
        { error: 'phone_number ou instance_name é obrigatório' },
        { status: 400 }
      )
    }

    // Dados do número
    const numberData: any = {
      organization_id: orgId,
      provider,
      phone_number: phone_number || instance_name,
      display_name: display_name || phone_number || instance_name,
      is_connected: false,
      is_active: true,
      connection_status: 'disconnected',
    }

    // Dados específicos por provider
    if (provider === 'meta_cloud') {
      numberData.phone_number_id = phone_number_id
      numberData.access_token = access_token
      numberData.business_account_id = business_account_id
      numberData.webhook_verify_token = webhook_verify_token || generateToken()
    } else if (provider === 'evolution') {
      numberData.instance_name = instance_name || phone_number
      numberData.api_key = api_key
      numberData.base_url = base_url || process.env.EVOLUTION_API_URL
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
        organization_id: orgId,
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
      return NextResponse.json({ number: result.data }, { status: 201 })
    }

    if (error) throw error

    return NextResponse.json({ number: data }, { status: 201 })

  } catch (error: any) {
    console.error('Error creating WhatsApp number:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar número de WhatsApp
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgIdFromSession(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
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

    // Atualizar
    let { data, error } = await supabase
      .from('whatsapp_numbers')
      .update(filtered)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single()

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .update(filtered)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ number: data })

  } catch (error: any) {
    console.error('Error updating WhatsApp number:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover número de WhatsApp
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient()
    const orgId = await getOrgIdFromSession(supabase)
    
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    }

    // Deletar
    let { error } = await supabase
      .from('whatsapp_numbers')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    // Tentar tabela antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId)

      error = result.error
    }

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Error deleting WhatsApp number:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para gerar token de verificação
function generateToken(): string {
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
}
