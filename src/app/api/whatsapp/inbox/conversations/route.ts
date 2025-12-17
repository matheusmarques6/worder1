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
    const organizationId = searchParams.get('organizationId')
    const status = searchParams.get('status')
    const assignedTo = searchParams.get('assignedTo')
    const priority = searchParams.get('priority')
    const botActive = searchParams.get('botActive')
    const search = searchParams.get('search')
    const tag = searchParams.get('tag')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    // Query base
    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(
          id,
          name,
          email,
          phone_number,
          profile_picture_url,
          tags,
          total_orders,
          total_spent,
          is_blocked,
          shopify_customer_id
        ),
        tags:whatsapp_conversation_tags(
          tag:whatsapp_tags(id, name, color)
        ),
        assigned_agent:auth.users(
          id,
          raw_user_meta_data
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })

    // Filtros
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        query = query.is('assigned_agent_id', null)
      } else if (assignedTo === 'me') {
        // Precisaria do user_id do contexto
        query = query.eq('assigned_agent_id', assignedTo)
      } else {
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
      query = query.or(`phone_number.ilike.%${search}%,contact.name.ilike.%${search}%`)
    }

    // Paginação
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw error

    // Formatar resposta
    const conversations = data?.map(conv => ({
      ...conv,
      contact_name: conv.contact?.name || null,
      contact_email: conv.contact?.email || null,
      contact_avatar: conv.contact?.profile_picture_url || null,
      contact_tags: conv.contact?.tags || [],
      contact_total_orders: conv.contact?.total_orders || 0,
      contact_total_spent: conv.contact?.total_spent || 0,
      contact_is_blocked: conv.contact?.is_blocked || false,
      agent_name: conv.assigned_agent?.raw_user_meta_data?.name || null,
      tags: conv.tags?.map((t: any) => t.tag) || []
    }))

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
