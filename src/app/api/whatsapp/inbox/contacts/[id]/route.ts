// src/app/api/whatsapp/inbox/contacts/[id]/route.ts
// CORRIGIDO: Prioriza tabela CONTACTS unificada
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ FASE 4: Garantir que não há cache
export const dynamic = 'force-dynamic'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// GET - Buscar contato UNIFICADO
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    // 1. Tentar buscar da tabela UNIFICADA (contacts) primeiro
    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()

    if (error) {
      // 2. Fallback: tentar buscar da whatsapp_contacts
      const { data: waContact, error: waError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', contactId)
        .single()
      
      if (waError) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }
      
      // Retornar formato compatível do whatsapp_contacts
      return NextResponse.json({ 
        contact: formatWhatsAppContact(waContact),
        notes: [],
        activities: [],
        deals: [],
        tasks: [],
        invoices: [],
        comments: [],
        _source: 'whatsapp_contacts'
      })
    }

    // 3. Buscar notas do contato
    const { data: notes } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    // 4. Buscar atividades do contato
    const { data: activities } = await supabase
      .from('contact_activities')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(50)

    // 5. Buscar deals do contato
    const { data: deals } = await supabase
      .from('deals')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        stage:pipeline_stages(id, name, color, is_won, is_lost)
      `)
      .or(`contact_id.eq.${contactId},contact_phone.eq.${contact.whatsapp},contact_phone.eq.${contact.phone}`)
      .order('created_at', { ascending: false })

    // 6. Buscar tarefas do contato
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .or(`contact_id.eq.${contactId},unified_contact_id.eq.${contactId}`)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true })
      .limit(10)

    // 7. Buscar notas fiscais do contato
    const { data: invoices } = await supabase
      .from('contact_invoices')
      .select('*')
      .eq('contact_id', contactId)
      .order('issue_date', { ascending: false })
      .limit(20)

    // 8. Buscar comentários do contato (para Timeline)
    const { data: comments } = await supabase
      .from('contact_comments')
      .select('*')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    // 9. Formatar contato para resposta
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
      comments: comments || [],
      _source: 'contacts'
    })
  } catch (error: any) {
    console.error('Error fetching contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para formatar contato do WhatsApp
function formatWhatsAppContact(contact: any) {
  return {
    id: contact.id,
    organization_id: contact.organization_id,
    phone_number: contact.phone_number,
    phone: contact.phone_number,
    whatsapp: contact.phone_number,
    name: contact.name || contact.profile_name || contact.push_name,
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

    // Gerar full_name se first/last_name foram atualizados
    if (updates.first_name || updates.last_name) {
      const firstName = updates.first_name || body.first_name || ''
      const lastName = updates.last_name || body.last_name || ''
      updates.full_name = `${firstName} ${lastName}`.trim()
    }

    updates.updated_at = new Date().toISOString()

    // Tentar atualizar na tabela contacts primeiro
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId)
      .select()
      .single()

    if (error) {
      // Fallback: tentar atualizar na whatsapp_contacts
      const waUpdates: Record<string, any> = {
        updated_at: new Date().toISOString()
      }
      
      if (updates.first_name || updates.last_name) {
        waUpdates.name = updates.full_name
      }
      if (updates.whatsapp || updates.phone) {
        waUpdates.phone_number = updates.whatsapp || updates.phone
      }
      if (updates.email) waUpdates.email = updates.email
      if (updates.tags) waUpdates.tags = updates.tags
      if (updates.is_blocked !== undefined) waUpdates.is_blocked = updates.is_blocked
      if (updates.blocked_reason) waUpdates.blocked_reason = updates.blocked_reason
      if (updates.address) waUpdates.address = updates.address
      if (updates.custom_fields) waUpdates.custom_fields = updates.custom_fields
      if (updates.profile_picture_url) waUpdates.profile_picture_url = updates.profile_picture_url

      const { data: waData, error: waError } = await supabase
        .from('whatsapp_contacts')
        .update(waUpdates)
        .eq('id', contactId)
        .select()
        .single()

      if (waError) throw error

      return NextResponse.json({ 
        contact: formatWhatsAppContact(waData), 
        _source: 'whatsapp_contacts' 
      })
    }

    return NextResponse.json({ contact: data, _source: 'contacts' })
  } catch (error: any) {
    console.error('Error updating contact:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
