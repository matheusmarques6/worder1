// src/app/api/whatsapp/inbox/contacts/[id]/notes/route.ts
// CORRIGIDO: Com suporte a anexos (attachments)
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
export const dynamic = 'force-dynamic';

// GET - Buscar notas do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    // Buscar da tabela whatsapp_contact_notes
    const { data: notes, error } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .eq('organization_id', orgId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching notes:', error)
      throw error
    }

    return NextResponse.json({ notes: notes || [] })
  } catch (error: any) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: error.message, notes: [] }, { status: 500 })
  }
}

// POST - Adicionar nova nota
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId: organizationId, userId: authUserId } = auth

    const contactId = params.id
    const body = await request.json()
    const {
      content,
      conversation_id,
      note_type = 'note',
      attachments = [], // NOVO: suporte a anexos
      created_by_name = 'Usuário'
    } = body

    if (!content && attachments.length === 0) {
      return NextResponse.json({ error: 'content or attachments required' }, { status: 400 })
    }

    // Confirmar que o contato pertence à org
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('organization_id', organizationId)
      .single()

    if (!contact) {
      const { data: waContact } = await supabase
        .from('whatsapp_contacts')
        .select('id')
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .single()
      if (!waContact) {
        return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
      }
    }

    const created_by = authUserId

    // Criar nota
    const { data: note, error } = await supabase
      .from('whatsapp_contact_notes')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        content: (content || '').trim(),
        note_type: note_type,
        conversation_id: conversation_id || null,
        attachments: attachments, // NOVO
        created_by: created_by || null,
        created_by_name,
        is_pinned: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating note:', error)
      throw error
    }

    // Registrar atividade
    try {
      await supabase
        .from('contact_activities')
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          conversation_id: conversation_id || null,
          activity_type: 'note_added',
          title: attachments.length > 0 ? 'Nota com anexo adicionada' : 'Nota adicionada',
          description: content ? content.substring(0, 200) : `${attachments.length} anexo(s)`,
          created_by,
          created_by_name,
        })
    } catch (activityError) {
      console.warn('Não foi possível registrar atividade:', activityError)
    }

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error('Error adding note:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Excluir nota
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('note_id')

    if (!noteId) {
      return NextResponse.json({ error: 'note_id required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('whatsapp_contact_notes')
      .delete()
      .eq('id', noteId)
      .eq('contact_id', contactId)
      .eq('organization_id', orgId)

    if (error) {
      console.error('Error deleting note:', error)
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting note:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar nota (ex: fixar/desafixar)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const contactId = params.id
    const body = await request.json()
    const { note_id, is_pinned, content } = body

    if (!note_id) {
      return NextResponse.json({ error: 'note_id required' }, { status: 400 })
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (is_pinned !== undefined) {
      updates.is_pinned = is_pinned
    }

    if (content !== undefined) {
      updates.content = content.trim()
    }

    const { data: note, error } = await supabase
      .from('whatsapp_contact_notes')
      .update(updates)
      .eq('id', note_id)
      .eq('contact_id', contactId)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Error updating note:', error)
      throw error
    }

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error('Error updating note:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
