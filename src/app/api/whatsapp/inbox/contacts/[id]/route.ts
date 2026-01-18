import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET - Buscar contato UNIFICADO (tabela contacts)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    // Buscar contato da tabela UNIFICADA (contacts)
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (error) {
      // Fallback: tentar buscar da whatsapp_contacts antiga (para compatibilidade)
      const { data: legacyContact, error: legacyError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', contactId)
        .single()
      
      if (legacyError) throw error // throw original error
      
      // Retornar formato compatível
      return NextResponse.json({ 
        contact: formatLegacyContact(legacyContact),
        notes: [],
        activities: [],
        deals: [],
        tasks: [],
        invoices: [],
        _legacy: true
      })
    }

    // Buscar comentários/notas do contato (tabela unificada)
    const { data: comments } = await supabase
      .from('contact_comments')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Fallback para whatsapp_contact_notes se não tiver comments
    let notes = comments || []
    if (notes.length === 0) {
      const { data: legacyNotes } = await supabase
        .from('whatsapp_contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50)
      notes = legacyNotes || []
    }

    // Buscar atividades do contato (timeline)
    const { data: activities } = await supabase
      .from('contact_activities')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Buscar deals do contato
    const { data: deals } = await supabase
      .from('deals')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        stage:pipeline_stages(id, name, color, is_won, is_lost)
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })

    // Buscar tarefas do contato
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .or(`contact_id.eq.${contactId},unified_contact_id.eq.${contactId}`)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true })
      .limit(10)

    // Buscar notas fiscais do contato
    const { data: invoices } = await supabase
      .from('contact_invoices')
      .select('*')
      .eq('contact_id', contactId)
      .order('issue_date', { ascending: false })
      .limit(20)

    // Buscar última conversa para link rápido
    const { data: lastConversation } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone_number, last_message_at')
      .or(`unified_contact_id.eq.${contactId},phone_number.eq.${contact.whatsapp},phone_number.eq.${contact.phone}`)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .single()

    // Formatar contato para resposta
    const formattedContact = {
      id: contact.id,
      organization_id: contact.organization_id,
      
      // Dados básicos
      phone_number: contact.whatsapp || contact.phone,
      phone: contact.phone,
      whatsapp: contact.whatsapp,
      email: contact.email,
      
      // Nome
      name: contact.full_name || contact.first_name || contact.profile_name || contact.whatsapp,
      first_name: contact.first_name,
      last_name: contact.last_name,
      full_name: contact.full_name,
      profile_name: contact.profile_name,
      
      // Empresa
      company: contact.company,
      position: contact.position,
      
      // Avatar
      profile_picture_url: contact.profile_picture_url || contact.avatar_url,
      avatar_url: contact.avatar_url || contact.profile_picture_url,
      
      // Endereço e campos customizados
      address: contact.address || {},
      custom_fields: contact.custom_fields || {},
      
      // Tags
      tags: contact.tags || [],
      
      // Métricas Shopify
      shopify_customer_id: contact.shopify_customer_id,
      total_orders: contact.total_orders || 0,
      total_spent: parseFloat(contact.total_spent) || 0,
      lifetime_value: parseFloat(contact.lifetime_value) || 0,
      last_order_at: contact.last_order_at,
      
      // Métricas WhatsApp
      first_message_at: contact.first_message_at,
      last_message_at: contact.last_message_at,
      total_conversations: contact.total_conversations || 0,
      total_messages_received: contact.total_messages_received || 0,
      total_messages_sent: contact.total_messages_sent || 0,
      
      // Status
      is_blocked: contact.is_blocked || false,
      blocked_reason: contact.blocked_reason,
      blocked_at: contact.blocked_at,
      
      // Subscriptions
      is_subscribed_email: contact.is_subscribed_email,
      is_subscribed_sms: contact.is_subscribed_sms,
      is_subscribed_whatsapp: contact.is_subscribed_whatsapp,
      
      // Origem
      source: contact.source,
      first_contact_channel: contact.first_contact_channel,
      
      // Datas
      created_at: contact.created_at,
      updated_at: contact.updated_at,
      
      // Contexto
      last_conversation_id: lastConversation?.id,
      
      // Contagens
      deals_count: deals?.length || 0,
      deals_won_count: deals?.filter((d: any) => d.status === 'won').length || 0,
      deals_open_count: deals?.filter((d: any) => d.status === 'open').length || 0,
      tasks_pending_count: tasks?.length || 0,
      invoices_count: invoices?.length || 0,
    }

    return NextResponse.json({ 
      contact: formattedContact,
      notes: notes || [],
      activities: activities || [],
      deals: deals || [],
      tasks: tasks || [],
      invoices: invoices || [],
    })
  } catch (error: any) {
    console.error('Error fetching contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para formatar contato legado
function formatLegacyContact(contact: any) {
  return {
    id: contact.id,
    organization_id: contact.organization_id,
    phone_number: contact.phone_number,
    phone: contact.phone_number,
    whatsapp: contact.phone_number,
    name: contact.name || contact.profile_name,
    first_name: contact.name?.split(' ')[0],
    last_name: contact.name?.split(' ').slice(1).join(' '),
    email: contact.email,
    profile_picture_url: contact.profile_picture_url,
    avatar_url: contact.profile_picture_url,
    address: contact.address || {},
    custom_fields: contact.custom_fields || {},
    tags: contact.tags || [],
    total_orders: contact.total_orders || 0,
    total_spent: parseFloat(contact.total_spent) || 0,
    is_blocked: contact.is_blocked || false,
    blocked_reason: contact.blocked_reason,
    total_messages_received: contact.total_messages_received || 0,
    total_messages_sent: contact.total_messages_sent || 0,
    first_message_at: contact.first_message_at,
    last_message_at: contact.last_message_at,
    created_at: contact.created_at,
  }
}

// PATCH - Atualizar contato UNIFICADO
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()

    // Campos permitidos para atualização
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'whatsapp',
      'company', 'position', 'avatar_url', 'profile_picture_url',
      'address', 'custom_fields', 'tags',
      'is_blocked', 'blocked_reason',
      'is_subscribed_email', 'is_subscribed_sms', 'is_subscribed_whatsapp'
    ]

    // Filtrar apenas campos permitidos
    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    // Atualizar na tabela contacts UNIFICADA
    const { data, error } = await supabase
      .from('contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      // Fallback: tentar atualizar na whatsapp_contacts antiga
      const legacyUpdates: Record<string, any> = {}
      if (updates.first_name || updates.last_name) {
        legacyUpdates.name = `${updates.first_name || ''} ${updates.last_name || ''}`.trim()
      }
      if (updates.whatsapp || updates.phone) {
        legacyUpdates.phone_number = updates.whatsapp || updates.phone
      }
      if (updates.email) legacyUpdates.email = updates.email
      if (updates.tags) legacyUpdates.tags = updates.tags
      if (updates.is_blocked !== undefined) legacyUpdates.is_blocked = updates.is_blocked
      if (updates.blocked_reason) legacyUpdates.blocked_reason = updates.blocked_reason
      if (updates.address) legacyUpdates.address = updates.address
      if (updates.custom_fields) legacyUpdates.custom_fields = updates.custom_fields
      if (updates.profile_picture_url) legacyUpdates.profile_picture_url = updates.profile_picture_url

      const { data: legacyData, error: legacyError } = await supabase
        .from('whatsapp_contacts')
        .update({
          ...legacyUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .select()
        .single()

      if (legacyError) throw error

      return NextResponse.json({ contact: formatLegacyContact(legacyData), _legacy: true })
    }

    return NextResponse.json({ contact: data })
  } catch (error: any) {
    console.error('Error updating contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
