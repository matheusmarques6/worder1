import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/debug/realtime-test?organizationId=xxx&conversationId=xxx
// Insere uma mensagem fake para testar se o Realtime está funcionando
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get('organizationId')
  const conversationId = searchParams.get('conversationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  // Se não passou conversationId, buscar a primeira conversa da org
  let targetConversationId = conversationId
  let targetContactId = null

  if (!targetConversationId) {
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, contact_id')
      .eq('organization_id', organizationId)
      .limit(1)
      .single()

    if (!conv) {
      return NextResponse.json({ error: 'No conversation found' }, { status: 404 })
    }
    targetConversationId = conv.id
    targetContactId = conv.contact_id
  }

  // Se não temos contact_id, buscar da conversa
  if (!targetContactId) {
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('contact_id')
      .eq('id', targetConversationId)
      .single()
    
    targetContactId = conv?.contact_id
  }

  // Inserir mensagem de teste
  const testMessage = {
    organization_id: organizationId,
    conversation_id: targetConversationId,
    contact_id: targetContactId,
    direction: 'inbound',
    message_type: 'text',
    content: `🧪 Teste Realtime - ${new Date().toLocaleTimeString('pt-BR')}`,
    status: 'received',
    wamid: `test-${Date.now()}`,
    metadata: { test: true }
  }

  console.log('[Debug] Inserting test message:', testMessage)

  const { data: message, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .insert(testMessage)
    .select()
    .single()

  if (error) {
    console.error('[Debug] Error inserting message:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Também atualizar a conversa para disparar o evento de update
  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: testMessage.content,
      unread_count: 1
    })
    .eq('id', targetConversationId)

  return NextResponse.json({
    success: true,
    message: 'Test message inserted! Check if Realtime received it.',
    data: {
      messageId: message.id,
      conversationId: targetConversationId,
      content: testMessage.content
    }
  })
}

// POST - Mesmo comportamento
export async function POST(request: NextRequest) {
  return GET(request)
}
