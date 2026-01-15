import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/debug/realtime-test - Lista organizações e conversas
// GET /api/debug/realtime-test?organizationId=xxx - Lista conversas da org
// GET /api/debug/realtime-test?organizationId=xxx&conversationId=xxx - Insere mensagem teste
// GET /api/debug/realtime-test?organizationId=xxx&create=true - Cria conversa de teste
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const organizationId = searchParams.get('organizationId')
  const conversationId = searchParams.get('conversationId')
  const createTest = searchParams.get('create') === 'true'

  // Sem organizationId - listar todas as orgs com conversas
  if (!organizationId) {
    const { data: orgs } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('organization_id')
      .limit(100)

    const uniqueOrgs = [...new Set(orgs?.map(o => o.organization_id) || [])]

    // Buscar também da tabela organizations
    const { data: allOrgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .limit(50)

    return NextResponse.json({
      message: 'Passe ?organizationId=xxx para ver conversas',
      organizations_with_conversations: uniqueOrgs,
      all_organizations: allOrgs,
      hint: 'Use o ID de uma organização acima'
    })
  }

  // Com organizationId - listar conversas
  const { data: conversations, error: convError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, phone_number, contact_name, last_message_at')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false })
    .limit(20)

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 })
  }

  // Se não tem conversas e pediu para criar
  if ((!conversations || conversations.length === 0) && createTest) {
    // Buscar ou criar um contato de teste
    const testPhone = '5511999999999'
    
    let { data: contact } = await supabaseAdmin
      .from('whatsapp_contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone_number', testPhone)
      .single()

    if (!contact) {
      const { data: newContact } = await supabaseAdmin
        .from('whatsapp_contacts')
        .insert({
          organization_id: organizationId,
          phone_number: testPhone,
          name: 'Contato Teste Debug',
          metadata: { test: true }
        })
        .select()
        .single()
      contact = newContact
    }

    if (contact) {
      // Criar conversa de teste
      const { data: newConv, error: newConvError } = await supabaseAdmin
        .from('whatsapp_conversations')
        .insert({
          organization_id: organizationId,
          contact_id: contact.id,
          phone_number: testPhone,
          contact_name: 'Contato Teste Debug',
          status: 'active',
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()

      if (newConvError) {
        return NextResponse.json({ error: 'Erro ao criar conversa: ' + newConvError.message }, { status: 500 })
      }

      return NextResponse.json({
        message: 'Conversa de teste criada!',
        conversation: newConv,
        next_step: `Agora acesse: /api/debug/realtime-test?organizationId=${organizationId}&conversationId=${newConv.id}`
      })
    }
  }

  // Se não tem conversas
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({
      error: 'No conversations found for this organization',
      organizationId,
      hint: 'Adicione ?create=true para criar uma conversa de teste',
      create_url: `/api/debug/realtime-test?organizationId=${organizationId}&create=true`
    }, { status: 404 })
  }

  // Se não passou conversationId, mostrar lista
  if (!conversationId) {
    return NextResponse.json({
      message: 'Escolha uma conversa para testar',
      organizationId,
      conversations: conversations.map(c => ({
        id: c.id,
        phone: c.phone_number,
        name: c.contact_name,
        test_url: `/api/debug/realtime-test?organizationId=${organizationId}&conversationId=${c.id}`
      }))
    })
  }

  // Se passou conversationId, buscar a conversa
  let targetConversationId = conversationId
  let targetContactId = null

  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, contact_id')
    .eq('id', conversationId)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found', conversationId }, { status: 404 })
  }
  
  targetConversationId = conv.id
  targetContactId = conv.contact_id

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
