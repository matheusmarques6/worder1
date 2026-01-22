import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

// =====================================================
// COMMENTS API - COM RLS
// =====================================================
// Esta rota usa cliente autenticado para respeitar RLS.
// O supabaseAdmin só é usado como fallback para webhooks.
// =====================================================

// GET - Buscar comentários/notas do contato
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id

    // Tentar autenticação primeiro
    const auth = await getAuthClient()
    const supabase = auth?.supabase || supabaseAdmin

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const pinned_only = searchParams.get('pinned_only') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('contact_comments')
      .select('*')
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
      // Fallback para whatsapp_contact_notes (tabela legada)
      const { data: legacyNotes, error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (legacyError) {
        console.error('[Comments] Error fetching:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

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
      contact_id: comment.contact_id,
      conversation_id: comment.conversation_id,
      deal_id: comment.deal_id,
      task_id: comment.task_id,
      created_by: comment.created_by,
      created_by_name: comment.created_by_name,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    }))

    return NextResponse.json({ 
      comments: formattedComments,
      pinned_count: formattedComments.filter(c => c.is_pinned).length,
      total: formattedComments.length,
    })
  } catch (error: any) {
    console.error('[Comments] Error:', error)
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
    // AUTENTICAÇÃO OBRIGATÓRIA PARA POST
    // =====================================================
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Authentication required', 401)
    }

    const { supabase, user } = auth

    // Extrair dados do body
    const {
      content,
      comment_type = 'note',
      conversation_id,
      deal_id,
      task_id,
      mentions = [],
    } = body

    // Validação
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 400 })
    }

    // =====================================================
    // CRIAR COMENTÁRIO (RLS valida automaticamente)
    // =====================================================
    const { data: comment, error } = await supabase
      .from('contact_comments')
      .insert({
        organization_id: user.organization_id,
        contact_id: contactId,
        content: content.trim(),
        comment_type,
        conversation_id: conversation_id || null,
        deal_id: deal_id || null,
        task_id: task_id || null,
        mentions,
        created_by: user.id,
        created_by_name: body.created_by_name || user.email?.split('@')[0],
      })
      .select()
      .single()

    if (error) {
      console.error('[Comments] Error creating:', error)
      
      // Tentar fallback na tabela legada
      const { data: note, error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .insert({
          organization_id: user.organization_id,
          contact_id: contactId,
          content: content.trim(),
          note_type: comment_type || 'general',
          conversation_id: conversation_id || null,
          created_by: user.id,
          created_by_name: body.created_by_name || user.email?.split('@')[0],
        })
        .select()
        .single()

      if (legacyError) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ 
        comment: { ...note, comment_type: note.note_type },
        _legacy: true,
        message: 'Nota adicionada com sucesso'
      })
    }

    // Registrar atividade (opcional, não bloqueia se falhar)
    try {
      await supabase
        .from('contact_activities')
        .insert({
          organization_id: user.organization_id,
          contact_id: contactId,
          conversation_id: conversation_id || null,
          deal_id: deal_id || null,
          task_id: task_id || null,
          activity_type: comment_type === 'note' ? 'note_added' : 'comment_added',
          title: `${getCommentTypeLabel(comment_type)} adicionado`,
          description: content.substring(0, 200),
          metadata: { comment_type, has_mentions: mentions.length > 0 },
          created_by: user.id,
          created_by_name: body.created_by_name || user.email?.split('@')[0],
        })
    } catch (activityError) {
      console.warn('[Comments] Could not log activity:', activityError)
    }

    // Criar notificações para menções (opcional)
    if (mentions.length > 0) {
      try {
        const notifications = mentions.map((userId: string) => ({
          organization_id: user.organization_id,
          user_id: userId,
          type: 'mention',
          title: `${body.created_by_name || 'Alguém'} mencionou você`,
          message: content.substring(0, 100),
          data: { contact_id: contactId, comment_id: comment.id, conversation_id },
        }))

        await supabase.from('notifications').insert(notifications)
      } catch (notifError) {
        console.warn('[Comments] Could not create notifications:', notifError)
      }
    }

    return NextResponse.json({ 
      comment,
      message: 'Comentário adicionado com sucesso'
    })
  } catch (error: any) {
    console.error('[Comments] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar comentário
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contactId = params.id
    
    // Autenticação obrigatória
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Authentication required', 401)
    }

    const { supabase } = auth
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

    // RLS garante que só pode atualizar da própria organização
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
      // Tentar tabela legada
      const legacyUpdates: Record<string, any> = {}
      if (filteredUpdates.content) legacyUpdates.content = filteredUpdates.content
      if (filteredUpdates.is_pinned !== undefined) legacyUpdates.is_pinned = filteredUpdates.is_pinned
      if (filteredUpdates.comment_type) legacyUpdates.note_type = filteredUpdates.comment_type

      const { data: legacyNote, error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .update({ ...legacyUpdates, updated_at: new Date().toISOString() })
        .eq('id', comment_id)
        .eq('contact_id', contactId)
        .select()
        .single()

      if (legacyError) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ comment: legacyNote, _legacy: true })
    }

    return NextResponse.json({ 
      comment,
      message: 'Comentário atualizado com sucesso'
    })
  } catch (error: any) {
    console.error('[Comments] PATCH error:', error)
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
    
    // Autenticação obrigatória
    const auth = await getAuthClient()
    if (!auth) {
      return authError('Authentication required', 401)
    }

    const { supabase } = auth
    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('comment_id')

    if (!commentId) {
      return NextResponse.json({ error: 'comment_id é obrigatório' }, { status: 400 })
    }

    // RLS garante que só pode deletar da própria organização
    const { error } = await supabase
      .from('contact_comments')
      .delete()
      .eq('id', commentId)
      .eq('contact_id', contactId)

    if (error) {
      // Tentar tabela legada
      const { error: legacyError } = await supabase
        .from('whatsapp_contact_notes')
        .delete()
        .eq('id', commentId)
        .eq('contact_id', contactId)

      if (legacyError) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ message: 'Comentário removido com sucesso' })
  } catch (error: any) {
    console.error('[Comments] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper
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
