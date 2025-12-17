import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/whatsapp/inbox/conversations/[id]/read
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Marca todas mensagens inbound como lidas
    await supabase
      .from('whatsapp_messages')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('conversation_id', id)
      .eq('direction', 'inbound')
      .neq('status', 'read')

    // Zera contador de não lidas
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', id)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error marking as read:', error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
