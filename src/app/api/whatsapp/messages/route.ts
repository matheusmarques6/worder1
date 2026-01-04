import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/supabase-route';


const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// Helper
async function getOrgId(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

// GET - Lista mensagens
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get('conversation_id');
    const limit = parseInt(searchParams.get('limit') || '100');
    const before = searchParams.get('before');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // Verificar acesso à conversa
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .single();

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('sent_at', before);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Marcar como lidas
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (error: any) {
    console.error('Messages GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Enviar mensagem
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const orgId = await getOrgId(supabase);
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { 
      conversation_id, 
      content, 
      type = 'text', 
      media_url, 
      template_name, 
      template_components 
    } = body;

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    // Buscar conversa e config WhatsApp
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .eq('organization_id', orgId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Buscar configuração WhatsApp
    const { data: waConfig } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (!waConfig) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    // Preparar payload
    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.phone_number,
    };

    if (template_name) {
      payload.type = 'template';
      payload.template = {
        name: template_name,
        language: { code: 'pt_BR' },
        components: template_components || [],
      };
    } else if (media_url) {
      payload.type = type;
      payload[type] = { link: media_url };
      if (content) payload[type].caption = content;
    } else {
      payload.type = 'text';
      payload.text = { body: content };
    }

    // Enviar para Meta API
    const response = await fetch(
      `${WHATSAPP_API_URL}/${waConfig.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${waConfig.access_token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', result);
      return NextResponse.json({ 
        error: result.error?.message || 'Failed to send message' 
      }, { status: 500 });
    }

    // Salvar mensagem
    const { data: message } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id,
        wa_message_id: result.messages?.[0]?.id,
        direction: 'outbound',
        type: template_name ? 'template' : (media_url ? type : 'text'),
        content: content || '',
        media_url,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${type}]`,
      })
      .eq('id', conversation_id);

    return NextResponse.json({
      success: true,
      message,
      meta_message_id: result.messages?.[0]?.id,
    });
  } catch (error: any) {
    console.error('Messages POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
