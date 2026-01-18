import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET - Buscar notas do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    // Tentar buscar da nova tabela contact_comments
    const { data: comments, error: commentsError } = await supabase
      .from('contact_comments')
      .select('*')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!commentsError && comments && comments.length > 0) {
      // Formatar como notes para manter compatibilidade
      const notes = comments.map(c => ({
        id: c.id,
        contact_id: c.contact_id,
        conversation_id: c.conversation_id,
        content: c.content,
        note_type: c.comment_type,
        is_pinned: c.is_pinned,
        created_by: c.created_by,
        created_by_name: c.created_by_name,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }))
      return NextResponse.json({ notes })
    }

    // Fallback para tabela antiga
    const { data: legacyNotes, error } = await supabase
      .from('whatsapp_contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json({ notes: legacyNotes || [] })
  } catch (error: any) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Adicionar nova nota
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { 
      content, 
      conversation_id, 
      note_type = 'note',
      created_by,
      created_by_name = 'Usuário' 
    } = body

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    // Buscar organization_id do contato (tentar nova tabela primeiro)
    let organizationId: string | null = null

    const { data: contact } = await supabase
      .from('contacts')
      .select('organization_id')
      .eq('id', contactId)
      .single()

    if (contact) {
      organizationId = contact.organization_id
    } else {
      // Fallback para tabela antiga
      const { data: legacyContact } = await supabase
        .from('whatsapp_contacts')
        .select('organization_id')
        .eq('id', contactId)
        .single()
      
      organizationId = legacyContact?.organization_id
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }

    // Tentar criar na nova tabela contact_comments
    const { data: comment, error: commentError } = await supabase
      .from('contact_comments')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        content: content.trim(),
        comment_type: note_type,
        conversation_id: conversation_id || null,
        created_by: created_by || null,
        created_by_name,
      })
      .select()
      .single()

    if (!commentError && comment) {
      // Registrar atividade
      try {
        await supabase
          .from('contact_activities')
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            conversation_id: conversation_id || null,
            activity_type: 'note_added',
            title: 'Nota adicionada',
            description: content.substring(0, 200),
            created_by,
            created_by_name,
          })
      } catch (activityError) {
        console.warn('Não foi possível registrar atividade:', activityError)
      }

      // Retornar como note para manter compatibilidade
      return NextResponse.json({ 
        note: {
          id: comment.id,
          contact_id: comment.contact_id,
          conversation_id: comment.conversation_id,
          content: comment.content,
          note_type: comment.comment_type,
          is_pinned: comment.is_pinned,
          created_by: comment.created_by,
          created_by_name: comment.created_by_name,
          created_at: comment.created_at,
          updated_at: comment.updated_at,
        }
      })
    }

    // Fallback para tabela antiga
    const { data: note, error } = await supabase
      .from('whatsapp_contact_notes')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        content: content.trim(),
        note_type: note_type,
        conversation_id: conversation_id || null,
        created_by: created_by || null,
        created_by_name,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error('Error adding note:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
