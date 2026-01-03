import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// Rate limiting
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// Verify webhook token
async function verifyWebhookToken(request: NextRequest): Promise<{ valid: boolean; instanceName?: string }> {
  // Option 1: Bearer token in header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    // Lookup instance by webhook token
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('unique_id, organization_id')
      .eq('webhook_token', token)
      .single();
    
    if (instance) {
      return { valid: true, instanceName: instance.unique_id };
    }
  }
  
  // Option 2: Global webhook secret (for Evolution API)
  const globalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const providedSecret = request.headers.get('x-webhook-secret') || 
                         request.headers.get('apikey') ||
                         request.nextUrl.searchParams.get('token');
  
  if (globalSecret && providedSecret === globalSecret) {
    return { valid: true };
  }
  
  // Option 3: Webhook token in query string (legacy)
  const queryToken = request.nextUrl.searchParams.get('webhook_token');
  if (queryToken) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('unique_id')
      .eq('webhook_token', queryToken)
      .single();
    
    if (instance) {
      return { valid: true, instanceName: instance.unique_id };
    }
  }
  
  return { valid: false };
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';

  // Rate limiting
  if (!checkRateLimit(ip)) {
    console.warn('[Webhook] Rate limit exceeded:', ip);
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // VERIFICAÇÃO DE AUTENTICAÇÃO
    const { valid, instanceName: tokenInstance } = await verifyWebhookToken(request);
    
    // Se não tem token válido, verificar se é chamada do Evolution API local
    // Evolution API envia o instanceName no body, então podemos verificar depois
    const body = await request.json();
    
    // Log para auditoria
    console.log('[Webhook] Received:', {
      event: body.event,
      instance: body.instance,
      ip,
      hasValidToken: valid,
      timestamp: new Date().toISOString()
    });
    
    // Se tem token, usar instância do token; senão, pegar do body
    const instanceName = tokenInstance || body.instance;
    
    if (!instanceName) {
      console.warn('[Webhook] No instance identifier');
      return NextResponse.json({ error: 'Missing instance' }, { status: 400 });
    }

    // Verificar se a instância existe
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, organization_id, webhook_token')
      .eq('unique_id', instanceName)
      .single();
    
    if (!instance) {
      console.warn('[Webhook] Instance not found:', instanceName);
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    
    // Se a instância tem webhook_token configurado, exigir autenticação
    if (instance.webhook_token && !valid) {
      console.warn('[Webhook] Unauthorized - instance requires token:', instanceName);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Processar evento
    if (body.event === 'messages.upsert') {
      await processMessage(body, instance.organization_id);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

async function processMessage(body: any, orgId: string) {
  const instanceName = body.instance;
  const data = body.data;

  const key = data.key;
  const message = data.message;

  // Ignorar mensagens próprias
  if (key?.fromMe) return;

  const remoteJid = key?.remoteJid;
  if (!remoteJid || remoteJid.includes('@g.us')) return;

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
  const pushName = data.pushName || phoneNumber;

  // Extrair conteúdo
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                '[Mídia]';

  let messageType = 'text';
  if (message?.imageMessage) messageType = 'image';
  if (message?.audioMessage) messageType = 'audio';
  if (message?.videoMessage) messageType = 'video';
  if (message?.documentMessage) messageType = 'document';

  console.log('[Webhook] Mensagem de:', phoneNumber, '-', content.substring(0, 50));

  // 2. Buscar contato EXISTENTE por phone_number
  const { data: existingContacts } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .limit(1);

  let contact = existingContacts?.[0];

  if (!contact) {
    // Criar novo contato APENAS se não existe
    const { data: newContact } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,
        phone_number: phoneNumber,
        name: pushName,
        profile_name: pushName,
      })
      .select()
      .single();
    contact = newContact;
    console.log('[Webhook] Novo contato criado:', contact?.id);
  } else {
    console.log('[Webhook] Contato existente:', contact.id);
    // Atualizar nome se mudou
    if (pushName && pushName !== contact.name) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name: pushName, profile_name: pushName })
        .eq('id', contact.id);
    }
  }

  if (!contact) return;

  // 3. Buscar conversa EXISTENTE por phone_number
  const { data: existingConversations } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(1);

  let conversation = existingConversations?.[0];

  if (!conversation) {
    // Criar nova conversa APENAS se não existe
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        contact_id: contact.id,
        phone_number: phoneNumber,
        status: 'open',
        is_bot_active: false,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: 1,
      })
      .select()
      .single();
    conversation = newConv;
    console.log('[Webhook] Nova conversa criada:', conversation?.id);
  } else {
    console.log('[Webhook] Conversa existente:', conversation.id);
    // Atualizar conversa existente
    await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
        contact_id: contact.id,
      })
      .eq('id', conversation.id);
  }

  if (!conversation) return;

  // 4. Verificar se mensagem já existe (evitar duplicação)
  const messageId = key?.id;
  if (messageId) {
    const { data: existingMsg } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('wamid', messageId)
      .limit(1);

    if (existingMsg && existingMsg.length > 0) {
      console.log('[Webhook] Mensagem já existe, ignorando:', messageId);
      return;
    }
  }

  // 5. Salvar mensagem
  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      wamid: key?.id,
      wa_message_id: key?.id,
      direction: 'inbound',
      message_type: messageType,
      content: content,
      status: 'received',
      metadata: { pushName },
    });

  if (msgError) {
    console.error('[Webhook] Erro ao salvar mensagem:', msgError);
  } else {
    console.log('[Webhook] Mensagem salva com sucesso');
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Webhook WhatsApp ativo' });
}
