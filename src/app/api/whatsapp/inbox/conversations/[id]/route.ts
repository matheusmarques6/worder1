import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// GET /api/whatsapp/inbox/conversations/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        tags:whatsapp_conversation_tags(
          tag:whatsapp_tags(id, name, color)
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({ conversation })

  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

// PUT /api/whatsapp/inbox/conversations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
      updates.is_bot_active = isBotActive
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
    const { id } = params

    const { error } = await supabase
      .from('whatsapp_conversations')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting conversation:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
