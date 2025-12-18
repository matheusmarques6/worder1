import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/conversations - Listar conversas
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const assignedTo = searchParams.get('assignedTo')
    const priority = searchParams.get('priority')
    const botActive = searchParams.get('botActive')
    const search = searchParams.get('search')
    const tag = searchParams.get('tag')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Se organizationId for default-org ou vazio, buscar a primeira organização real
    if (!organizationId || organizationId === 'default-org') {
      const { data: firstOrg } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .single()
      
      if (firstOrg) {
        organizationId = firstOrg.id
      } else {
        return NextResponse.json({ 
          conversations: [], 
          pagination: { page: 1, limit, total: 0, totalPages: 0 } 
        })
      }
    }

    console.log('📋 Fetching conversations for org:', organizationId)

    // Query base - Removido o join com auth.users que causa problemas
    // e o join com whatsapp_contacts que pode não existir
    let query = supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    // Filtros
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        query = query.is('assigned_agent_id', null)
      } else if (assignedTo !== 'all' && assignedTo !== 'me') {
        query = query.eq('assigned_agent_id', assignedTo)
      }
    }

    if (priority && priority !== 'all') {
      query = query.eq('priority', priority)
    }

    if (botActive !== null && botActive !== undefined) {
      query = query.eq('is_bot_active', botActive === 'true')
    }

    if (search) {
      // Busca por telefone ou nome do contato
      query = query.or(`phone_number.ilike.%${search}%,contact_name.ilike.%${search}%`)
    }

    // Paginação
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('❌ Error fetching conversations:', error)
      throw error
    }

    console.log(`✅ Found ${data?.length || 0} conversations`)

    // Formatar resposta - simplificado sem joins complexos
    const conversations = data?.map((conv: any) => ({
      id: conv.id,
      organization_id: conv.organization_id,
      contact_id: conv.contact_id,
      instance_id: conv.instance_id,
      phone_number: conv.phone_number,
      status: conv.status || 'open',
      priority: conv.priority || 'normal',
      unread_count: conv.unread_count || 0,
      is_bot_active: conv.is_bot_active ?? true,
      last_message_at: conv.last_message_at,
      last_message_preview: conv.last_message_preview,
      last_message_type: conv.last_message_type,
      last_message_direction: conv.last_message_direction,
      assigned_agent_id: conv.assigned_agent_id,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      total_messages: conv.total_messages || 0,
      // Dados do contato diretamente da conversa
      contact_name: conv.contact_name || null,
      contact_email: null,
      contact_avatar: null,
      contact_tags: [],
      contact_total_orders: 0,
      contact_total_spent: 0,
      contact_is_blocked: false,
      agent_name: null,
      tags: [],
      // Campos extras
      can_send_template_only: conv.can_send_template_only || false,
      window_expires_at: conv.window_expires_at,
    })) || []

    return NextResponse.json({
      conversations,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })

  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/conversations - Criar nova conversa
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { organizationId, phoneNumber, contactName, instanceId } = body

    if (!organizationId || !phoneNumber) {
      return NextResponse.json({ error: 'Organization ID and phone number required' }, { status: 400 })
    }

    // Verifica se já existe conversa
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_number', phoneNumber)
      .single()

    if (existing) {
      return NextResponse.json({ 
        conversation: existing,
        message: 'Conversation already exists' 
      })
    }

    // Cria ou busca contato
    let contactId = null
    const { data: existingContact } = await supabase
      .from('whatsapp_contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_number', phoneNumber)
      .single()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .insert({
          organization_id: organizationId,
          phone_number: phoneNumber,
          name: contactName || null,
          source: 'manual',
          first_message_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (contactError) throw contactError
      contactId = newContact.id
    }

    // Cria conversa
    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        phone_number: phoneNumber,
        instance_id: instanceId,
        status: 'open',
        is_bot_active: true,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ conversation })

  } catch (error) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
