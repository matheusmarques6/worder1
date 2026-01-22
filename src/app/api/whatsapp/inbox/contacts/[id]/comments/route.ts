import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// GET - Buscar comentários/notas do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'note', 'call_log', 'meeting_note', etc
    const pinned_only = searchParams.get('pinned_only') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('contact_comments')
      .select(`
        *,
        created_by_user:profiles!contact_comments_created_by_fkey(id, first_name, last_name, avatar_url)
      `)
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('comment_type', type)
    }

    if (pinned_only) {
      query = query.eq('is_pinned', true)
    }

    const { data: comments, error } = await query

    if (error) {
      // Fallback para whatsapp_contact_notes
      const { data: legacyNotes, error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (legacyError) throw error

      return NextResponse.json({ 
        comments: (legacyNotes || []).map(note => ({
          ...note,
          comment_type: note.note_type || 'note',
        })),
        _legacy: true
      })
    }

    // Formatar resposta
    const formattedComments = (comments || []).map(comment => ({
      id: comment.id,
      content: comment.content,
      comment_type: comment.comment_type,
      is_pinned: comment.is_pinned,
      pinned_at: comment.pinned_at,
      mentions: comment.mentions || [],
      
      // Contexto
      contact_id: comment.contact_id,
      conversation_id: comment.conversation_id,
      deal_id: comment.deal_id,
      task_id: comment.task_id,
      
      // Criador
      created_by: comment.created_by,
      created_by_name: comment.created_by_name || 
        (comment.created_by_user ? `${comment.created_by_user.first_name} ${comment.created_by_user.last_name || ''}`.trim() : 'Usuário'),
      created_by_avatar: comment.created_by_user?.avatar_url,
      
      // Datas
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    }))

    return NextResponse.json({ 
      comments: formattedComments,
      pinned_count: formattedComments.filter(c => c.is_pinned).length,
      total: formattedComments.length,
    })
  } catch (error: any) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar novo comentário/nota
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()

    // =====================================================
    // CORREÇÃO: Buscar contato em AMBAS as tabelas
    // O contactId pode vir de 'contacts' OU 'whatsapp_contacts'
    // =====================================================
    
    let organizationId: string | null = null
    let finalContactId = contactId
    
    // 1. Tentar buscar da tabela unificada (contacts)
    const { data: unifiedContact } = await supabase
      .from('contacts')
      .select('id, organization_id')
      .eq('id', contactId)
      .single()

    if (unifiedContact) {
      organizationId = unifiedContact.organization_id
    } else {
      // 2. Tentar buscar da tabela legada (whatsapp_contacts)
      const { data: waContact } = await supabase
        .from('whatsapp_contacts')
        .select('id, organization_id')
        .eq('id', contactId)
        .single()
      
      if (waContact) {
        organizationId = waContact.organization_id
      }
    }
    
    // 3. Se não encontrou em nenhuma tabela
    if (!organizationId) {
      console.error(`[Comments] Contact not found in any table: ${contactId}`)
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }

    const {
      content,
      comment_type = 'note',
      conversation_id,
      deal_id,
      task_id,
      mentions = [],
      created_by,
      created_by_name,
    } = body

    // Validação
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 400 })
    }

    // Criar comentário
    const { data: comment, error } = await supabase
      .from('contact_comments')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        content: content.trim(),
        comment_type,
        conversation_id: conversation_id || null,
        deal_id: deal_id || null,
        task_id: task_id || null,
        mentions,
        created_by,
        created_by_name,
      })
      .select()
      .single()

    if (error) {
      console.error('[Comments] Error creating comment:', error)
      // Fallback: criar na tabela antiga
      return await createLegacyNote(contactId, body, organizationId)
    }

    // Registrar atividade
    try {
      await supabase
        .from('contact_activities')
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          conversation_id: conversation_id || null,
          deal_id: deal_id || null,
          task_id: task_id || null,
          activity_type: comment_type === 'note' ? 'note_added' : 'comment_added',
          title: `${getCommentTypeLabel(comment_type)} adicionado`,
          description: content.substring(0, 200),
          metadata: {
            comment_type,
            has_mentions: mentions.length > 0,
          },
          created_by,
          created_by_name,
        })
    } catch (activityError) {
      console.warn('Não foi possível registrar atividade:', activityError)
    }

    // Se tiver menções, criar notificações
    if (mentions.length > 0) {
      try {
        const notifications = mentions.map((userId: string) => ({
          organization_id: organizationId,
          user_id: userId,
          type: 'mention',
          title: `${created_by_name || 'Alguém'} mencionou você`,
          message: content.substring(0, 100),
          data: {
            contact_id: contactId,
            comment_id: comment.id,
            conversation_id,
          },
        }))

        await supabase
          .from('notifications')
          .insert(notifications)
      } catch (notifError) {
        console.warn('Não foi possível criar notificações:', notifError)
      }
    }

    return NextResponse.json({ 
      comment,
      message: 'Comentário adicionado com sucesso'
    })
  } catch (error: any) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar comentário (fixar, editar conteúdo)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const body = await request.json()
    const { comment_id, ...updates } = body

    if (!comment_id) {
      return NextResponse.json({ error: 'comment_id é obrigatório' }, { status: 400 })
    }

    // Campos permitidos para atualização
    const allowedFields = ['content', 'is_pinned', 'pinned_at', 'pinned_by', 'comment_type']
    const filteredUpdates: Record<string, any> = {}
    
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key]
      }
    }

    // Se estiver fixando, adicionar timestamp
    if (filteredUpdates.is_pinned === true && !filteredUpdates.pinned_at) {
      filteredUpdates.pinned_at = new Date().toISOString()
    }

    const { data: comment, error } = await supabase
      .from('contact_comments')
      .update({
        ...filteredUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comment_id)
      .eq('contact_id', contactId)
      .select()
      .single()

    if (error) {
      // Tentar atualizar na tabela antiga
      const legacyUpdates: Record<string, any> = {}
      if (filteredUpdates.content) legacyUpdates.content = filteredUpdates.content
      if (filteredUpdates.is_pinned !== undefined) legacyUpdates.is_pinned = filteredUpdates.is_pinned
      if (filteredUpdates.comment_type) legacyUpdates.note_type = filteredUpdates.comment_type

      const { data: legacyNote, error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .update({
          ...legacyUpdates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', comment_id)
        .eq('contact_id', contactId)
        .select()
        .single()

      if (legacyError) throw error

      return NextResponse.json({ comment: legacyNote, _legacy: true })
    }

    return NextResponse.json({ 
      comment,
      message: 'Comentário atualizado com sucesso'
    })
  } catch (error: any) {
    console.error('Error updating comment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover comentário
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('comment_id')

    if (!commentId) {
      return NextResponse.json({ error: 'comment_id é obrigatório' }, { status: 400 })
    }

    // Tentar deletar da nova tabela
    const { error } = await supabase
      .from('contact_comments')
      .delete()
      .eq('id', commentId)
      .eq('contact_id', contactId)

    if (error) {
      // Fallback: tentar deletar da tabela antiga
      const { error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .delete()
        .eq('id', commentId)
        .eq('contact_id', contactId)

      if (legacyError) throw error
    }

    return NextResponse.json({ 
      message: 'Comentário removido com sucesso'
    })
  } catch (error: any) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper para criar nota na tabela antiga (fallback)
async function createLegacyNote(contactId: string, body: any, organizationId?: string) {
  // Se já temos o organizationId, usar direto
  let orgId = organizationId
  
  if (!orgId) {
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('organization_id')
      .eq('id', contactId)
      .single()

    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    }
    orgId = contact.organization_id
  }

  const { data: note, error } = await supabase
    .from('whatsapp_contact_notes')
    .insert({
      organization_id: orgId,
      contact_id: contactId,
      content: body.content,
      note_type: body.comment_type || 'general',
      conversation_id: body.conversation_id || null,
      created_by: body.created_by,
      created_by_name: body.created_by_name,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ 
    comment: { ...note, comment_type: note.note_type },
    _legacy: true,
    message: 'Nota adicionada com sucesso'
  })
}

// Helper para label do tipo de comentário
function getCommentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    note: 'Nota',
    call_log: 'Registro de ligação',
    meeting_note: 'Nota de reunião',
    important: 'Nota importante',
    follow_up: 'Follow-up',
  }
  return labels[type] || 'Comentário'
}
