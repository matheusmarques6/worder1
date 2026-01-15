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

  // Verificar se tem instância WhatsApp
  const { data: instance } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, instance_name, status')
    .eq('organization_id', organizationId)
    .limit(1)
    .single()

  // Com organizationId - listar conversas
  const { data: conversations, error: convError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, remote_jid, push_name, chat_id, last_message_at, instance_id')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(20)

  if (convError) {
    return NextResponse.json({ 
      error: convError.message,
      hint: 'Erro ao buscar conversas',
      instance: instance
    }, { status: 500 })
  }

  // Se não tem conversas e pediu para criar
  if ((!conversations || conversations.length === 0) && createTest) {
    if (!instance) {
      return NextResponse.json({
        error: 'Nenhuma instância WhatsApp encontrada para esta organização',
        hint: 'Primeiro conecte uma instância WhatsApp',
        organizationId
      }, { status: 400 })
    }

    const testPhone = '5511999999999'
    const testJid = `${testPhone}@s.whatsapp.net`
    
    // Criar conversa de teste
    const { data: newConv, error: newConvError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        organization_id: organizationId,
        instance_id: instance.id,
        chat_id: testJid,
        remote_jid: testJid,
        push_name: 'Contato Teste Debug',
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: 'Conversa de teste criada'
      })
      .select()
      .single()

    if (newConvError) {
      return NextResponse.json({ 
        error: 'Erro ao criar conversa: ' + newConvError.message,
        details: newConvError
      }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Conversa de teste criada!',
      conversation: newConv,
      next_step: `Agora acesse: /api/debug/realtime-test?organizationId=${organizationId}&conversationId=${newConv.id}`
    })
  }

  // Se não tem conversas
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({
      error: 'No conversations found for this organization',
      organizationId,
      instance: instance,
      hint: instance 
        ? 'Adicione ?create=true para criar uma conversa de teste'
        : 'Primeiro conecte uma instância WhatsApp',
      create_url: instance ? `/api/debug/realtime-test?organizationId=${organizationId}&create=true` : null
    }, { status: 404 })
  }

  // Se não passou conversationId, mostrar lista
  if (!conversationId) {
    return NextResponse.json({
      message: 'Escolha uma conversa para testar',
      organizationId,
      instance: instance,
      conversations: conversations.map(c => ({
        id: c.id,
        remote_jid: c.remote_jid,
        name: c.push_name,
        last_message_at: c.last_message_at,
        test_url: `/api/debug/realtime-test?organizationId=${organizationId}&conversationId=${c.id}`
      }))
    })
  }

  // Se passou conversationId, buscar a conversa
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, instance_id, contact_id, remote_jid')
    .eq('id', conversationId)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found', conversationId }, { status: 404 })
  }

  // Inserir mensagem de teste
  const testMessage = {
    organization_id: organizationId,
    conversation_id: conv.id,
    instance_id: conv.instance_id,
    contact_id: conv.contact_id,
    remote_jid: conv.remote_jid,
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
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }

  // Também atualizar a conversa para disparar o evento de update
  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: testMessage.content,
      unread_count: 1
    })
    .eq('id', conv.id)

  return NextResponse.json({
    success: true,
    message: 'Test message inserted! Check if Realtime received it.',
    data: {
      messageId: message.id,
      conversationId: conv.id,
      content: testMessage.content
    }
  })
}

// POST - Mesmo comportamento
export async function POST(request: NextRequest) {
  return GET(request)
}
