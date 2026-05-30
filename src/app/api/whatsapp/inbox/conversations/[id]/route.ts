import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// GET /api/whatsapp/inbox/conversations/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { id } = params

    // Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid conversation ID format' }, { status: 400 })
    }

    // Buscar conversa via view unificada (agrega Evolution + Cloud).
    // Sem isso, conversas Cloud (InnovaBay etc) retornam 404.
    const { data: conversation, error } = await supabase
      .from('whatsapp_inbox_conversations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single()

    if (error) {
      console.error('[Conversation GET] Error:', error)
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      throw error
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Buscar contato separadamente (mais seguro)
    let contact = null
    if (conversation.contact_id) {
      const { data: contactData } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', conversation.contact_id)
        .single()
      contact = contactData
    }

    // Buscar tags separadamente (não quebra se tabela não existir)
    let tags: any[] = []
    try {
      const { data: tagsData } = await supabase
        .from('whatsapp_conversation_tags')
        .select('tag:whatsapp_chat_tags(id, title, color)')
        .eq('conversation_id', id)
      tags = tagsData || []
    } catch (e) {
      // Tabela de tags pode não existir - ignorar
      console.log('[Conversation GET] Tags table not available')
    }

    return NextResponse.json({ 
      conversation: {
        ...conversation,
        contact,
        tags
      }
    })

  } catch (error: any) {
    console.error('[Conversation GET] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch conversation',
      details: error.message 
    }, { status: 500 })
  }
}

// PUT /api/whatsapp/inbox/conversations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { id } = params
    const body = await request.json()
    const { 
      status, 
      priority, 
      assignedAgentId, 
      isBotActive, 
      botDisabledReason,
      internalNote 
    } = body

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (status !== undefined) updates.status = status
    if (priority !== undefined) updates.priority = priority
    if (assignedAgentId !== undefined) {
      updates.assigned_agent_id = assignedAgentId
      updates.assigned_at = new Date().toISOString()
    }
    if (isBotActive !== undefined) {
      // CORREÇÃO: Atualizar AMBOS os campos para compatibilidade
      updates.is_bot_active = isBotActive
      updates.ai_enabled = isBotActive  // <- AI Process verifica este campo!
      if (!isBotActive) {
        updates.bot_disabled_reason = botDisabledReason || null
      } else {
        updates.bot_disabled_reason = null
        updates.bot_disabled_by = null
      }
    }
    if (internalNote !== undefined) updates.internal_note = internalNote

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

// DELETE /api/whatsapp/inbox/conversations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { id } = params

    const { error } = await supabase
      .from('whatsapp_conversations')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
