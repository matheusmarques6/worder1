// =============================================
// API: /api/whatsapp/ai
// Chatbot IA e sugestões de resposta
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { callAI, generateWhatsAppResponse, suggestResponse, AI_MODELS } from '@/lib/whatsapp/ai-providers';

// GET - Listar configurações de AI e modelos disponíveis
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id');
    const action = searchParams.get('action');

    // Retornar modelos disponíveis
    if (action === 'models') {
      return NextResponse.json({ models: AI_MODELS });
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    // Buscar configurações de AI da organização
    const { data: configs, error } = await supabase
      .from('whatsapp_ai_configs')
      .select('id, provider, model, system_prompt, temperature, max_tokens, is_active, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ configs });
  } catch (error: any) {
    console.error('AI GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar config, gerar resposta ou sugerir
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create_config':
        return handleCreateConfig(body);
      case 'generate':
        return handleGenerate(body);
      case 'suggest':
        return handleSuggest(body);
      case 'test':
        return handleTest(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('AI POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar configuração
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_ai_configs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ config: data });
  } catch (error: any) {
    console.error('AI PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remover configuração
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('whatsapp_ai_configs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('AI DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCreateConfig(body: any) {
  const { organization_id, provider, model, api_key, system_prompt, temperature, max_tokens } = body;

  if (!organization_id || !provider || !model || !api_key) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Criptografar API key (em produção, use uma solução mais robusta)
  const api_key_encrypted = Buffer.from(api_key).toString('base64');

  const { data, error } = await supabase
    .from('whatsapp_ai_configs')
    .insert({
      organization_id,
      provider,
      model,
      api_key_encrypted,
      system_prompt: system_prompt || null,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1000,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json({ config: data });
}

async function handleGenerate(body: any) {
  const { organization_id, conversation_id, user_message, contact_name } = body;

  if (!organization_id || !user_message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Buscar config de AI ativa
  const { data: config, error: configError } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: 'No active AI config found' }, { status: 404 });
  }

  // Descriptografar API key
  const apiKey = Buffer.from(config.api_key_encrypted, 'base64').toString('utf-8');

  // Buscar histórico de conversa
  let conversationHistory: any[] = [];
  if (conversation_id) {
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(20);

    conversationHistory = messages || [];
  }

  // Gerar resposta
  const response = await generateWhatsAppResponse({
    config: {
      provider: config.provider,
      apiKey,
      model: config.model,
      systemPrompt: config.system_prompt,
      temperature: config.temperature,
      maxTokens: config.max_tokens,
    },
    conversationHistory,
    userMessage: user_message,
    contactName: contact_name,
  });

  return NextResponse.json({ response });
}

async function handleSuggest(body: any) {
  const { organization_id, conversation_id, user_message } = body;

  if (!organization_id || !user_message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Buscar config de AI ativa
  const { data: config, error: configError } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: 'No active AI config found' }, { status: 404 });
  }

  // Descriptografar API key
  const apiKey = Buffer.from(config.api_key_encrypted, 'base64').toString('utf-8');

  // Buscar histórico de conversa
  let conversationHistory: any[] = [];
  if (conversation_id) {
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(10);

    conversationHistory = messages || [];
  }

  // Gerar sugestões
  const suggestions = await suggestResponse({
    config: {
      provider: config.provider,
      apiKey,
      model: config.model,
      temperature: 0.9,
      maxTokens: 500,
    },
    conversationHistory,
    userMessage: user_message,
  });

  return NextResponse.json({ suggestions });
}

async function handleTest(body: any) {
  const { provider, api_key, model, test_message } = body;

  if (!provider || !api_key || !model) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const response = await callAI(
      {
        provider,
        apiKey: api_key,
        model,
        temperature: 0.7,
        maxTokens: 100,
      },
      [
        { role: 'user', content: test_message || 'Olá, tudo bem?' },
      ]
    );

    return NextResponse.json({ 
      success: true, 
      response: response.content,
      usage: response.usage 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 400 });
  }
}
