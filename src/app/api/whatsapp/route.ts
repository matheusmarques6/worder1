import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// Verify webhook (GET request from Meta)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Handle incoming messages and send messages
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Check if this is a webhook from Meta
  if (body.object === 'whatsapp_business_account') {
    return handleWebhook(body);
  }

  // Otherwise it's an API call to send a message
  const { action, ...data } = body;

  try {
    switch (action) {
      case 'send':
        return await sendMessage(data);
      case 'send-template':
        return await sendTemplateMessage(data);
      case 'mark-read':
        return await markAsRead(data);
      case 'get-templates':
        return await getTemplates(data);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('WhatsApp API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleWebhook(body: any) {
  const entries = body.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = value.messages || [];
      const statuses = value.statuses || [];
      const contacts = value.contacts || [];

      // Get organization from phone number ID
      const { data: config } = await supabase
        .from('whatsapp_configs')
        .select('organization_id')
        .eq('phone_number_id', phoneNumberId)
        .single();

      if (!config) continue;

      const organizationId = config.organization_id;

      // Handle incoming messages
      for (const message of messages) {
        const contact = contacts.find((c: any) => c.wa_id === message.from);
        
        await handleIncomingMessage(organizationId, {
          messageId: message.id,
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body,
          image: message.image,
          document: message.document,
          audio: message.audio,
          video: message.video,
          location: message.location,
          contacts: message.contacts,
          contactName: contact?.profile?.name,
        });
      }

      // Handle status updates
      for (const status of statuses) {
        await handleStatusUpdate(organizationId, {
          messageId: status.id,
          recipientId: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          errors: status.errors,
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}

async function handleIncomingMessage(organizationId: string, message: any) {
  // Find or create contact
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('phone', message.from)
    .single();

  let contactId = existingContact?.id;

  if (!contactId) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        phone: message.from,
        first_name: message.contactName?.split(' ')[0] || 'Unknown',
        last_name: message.contactName?.split(' ').slice(1).join(' ') || '',
        source: 'whatsapp',
      })
      .select('id')
      .single();

    contactId = newContact?.id;
  }

  // Find or create conversation
  const { data: existingConversation } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .single();

  let conversationId = existingConversation?.id;

  if (!conversationId) {
    const { data: newConversation } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        status: 'open',
      })
      .select('id')
      .single();

    conversationId = newConversation?.id;
  }

  // Save message
  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    external_id: message.messageId,
    direction: 'inbound',
    type: message.type,
    content: message.text || '',
    media_url: message.image?.url || message.document?.url || message.audio?.url || message.video?.url,
    media_type: message.type !== 'text' ? message.type : null,
    status: 'received',
    metadata: {
      location: message.location,
      contacts: message.contacts,
    },
  });

  // Update conversation
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message.text?.substring(0, 100) || `[${message.type}]`,
      unread_count: supabase.rpc('increment', { x: 1 }),
    })
    .eq('id', conversationId);

  // Trigger automations
  await supabase.from('automation_triggers').insert({
    organization_id: organizationId,
    trigger_type: 'whatsapp_received',
    metadata: {
      contact_id: contactId,
      conversation_id: conversationId,
      message_type: message.type,
      message_content: message.text,
    },
  });
}

async function handleStatusUpdate(organizationId: string, status: any) {
  await supabase
    .from('whatsapp_messages')
    .update({
      status: status.status,
      metadata: status.errors ? { errors: status.errors } : undefined,
    })
    .eq('external_id', status.messageId);
}

async function sendMessage({
  organizationId,
  conversationId,
  to,
  message,
  mediaUrl,
  mediaType,
}: {
  organizationId: string;
  conversationId: string;
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
}) {
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
  };

  if (mediaUrl && mediaType) {
    payload.type = mediaType;
    payload[mediaType] = { link: mediaUrl };
    if (message) {
      payload[mediaType].caption = message;
    }
  } else {
    payload.type = 'text';
    payload.text = { body: message };
  }

  const response = await fetch(
    `${WHATSAPP_API_URL}/${config.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to send message');
  }

  // Save message to database
  await supabase.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    external_id: result.messages[0].id,
    direction: 'outbound',
    type: mediaType || 'text',
    content: message,
    media_url: mediaUrl,
    media_type: mediaType,
    status: 'sent',
  });

  // Update conversation
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message?.substring(0, 100) || `[${mediaType}]`,
    })
    .eq('id', conversationId);

  return NextResponse.json({
    success: true,
    messageId: result.messages[0].id,
  });
}

async function sendTemplateMessage({
  organizationId,
  to,
  templateName,
  languageCode,
  components,
}: {
  organizationId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: any[];
}) {
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  const response = await fetch(
    `${WHATSAPP_API_URL}/${config.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Failed to send template');
  }

  return NextResponse.json({
    success: true,
    messageId: result.messages[0].id,
  });
}

async function markAsRead({
  organizationId,
  messageId,
}: {
  organizationId: string;
  messageId: string;
}) {
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('phone_number_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  await fetch(`${WHATSAPP_API_URL}/${config.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.access_token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });

  return NextResponse.json({ success: true });
}

async function getTemplates({ organizationId }: { organizationId: string }) {
  const { data: config } = await supabase
    .from('whatsapp_configs')
    .select('business_account_id, access_token')
    .eq('organization_id', organizationId)
    .single();

  if (!config) {
    throw new Error('WhatsApp not configured');
  }

  const response = await fetch(
    `${WHATSAPP_API_URL}/${config.business_account_id}/message_templates`,
    {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
    }
  );

  const result = await response.json();

  return NextResponse.json({ templates: result.data || [] });
}
