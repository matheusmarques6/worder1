// =============================================
// API: /api/whatsapp/ai
// Chatbot IA e sugestoes de resposta
// =============================================
// P1.3: api_key_encrypted gravado em AES-256-GCM (secret-box).
//       Leitura dual: AES primeiro; fallback base64 legacy com
//       re-encrypt preguicoso (idempotente sob concorrencia).
// P1 v2: org SEMPRE derivada do token (requireOrgFromAuth);
//        organization_id de query/body e aceito e IGNORADO.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { callAI, generateWhatsAppResponse, suggestResponse, AI_MODELS } from '@/lib/whatsapp/ai-providers'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { encryptApiKey, decodeApiKey } from '@/lib/ai/api-key-codec'
export const dynamic = 'force-dynamic'

// GET - Listar configuracoes de AI e modelos disponiveis
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // Retornar modelos disponiveis (publico -- sem auth)
    if (action === 'models') {
      return NextResponse.json({ models: AI_MODELS })
    }

    // P1 v2: org do token; organization_id da query e IGNORADO
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const organizationId = auth.orgId

    // Buscar configuracoes de AI da organizacao
    const { data: configs, error } = await supabase
      .from('whatsapp_ai_configs')
      .select('id, provider, model, system_prompt, temperature, max_tokens, is_active, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ configs })
  } catch (error: any) {
    console.error('AI GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar config, gerar resposta ou sugerir
export async function POST(request: NextRequest) {
  try {
    // P1 v2: org do token para acoes que a requerem
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const organizationId = auth.orgId

    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'create_config':
        return handleCreateConfig(body, organizationId)
      case 'generate':
        return handleGenerate(body, organizationId)
      case 'suggest':
        return handleSuggest(body, organizationId)
      case 'test':
        return handleTest(body)
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('AI POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Colunas editáveis via PATCH (allowlist anti mass-assignment).
// organization_id / id / api_key_encrypted NUNCA aceitos diretamente.
const PATCH_ALLOWED: ReadonlySet<string> = new Set([
  'is_active',
  'provider',
  'model',
  'system_prompt',
  'temperature',
  'max_tokens',
])

// PATCH - Atualizar configuracao
export async function PATCH(request: NextRequest) {
  try {
    // P1 v2: org do token; validar que a config pertence a esta org
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const organizationId = auth.orgId

    const body = await request.json()
    const { id, api_key, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Validar que a config pertence a org do token (evita IDOR no PATCH)
    const { data: existing, error: fetchErr } = await supabase
      .from('whatsapp_ai_configs')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Config nao encontrada' }, { status: 404 })
    }

    // Allowlist: aceita apenas colunas seguras do body
    const safeUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rest)) {
      if (PATCH_ALLOWED.has(key)) {
        safeUpdates[key] = value
      }
    }

    // api_key em texto limpo → criptografar antes de persistir
    if (typeof api_key === 'string' && api_key.trim().length > 0) {
      safeUpdates['api_key_encrypted'] = encryptApiKey(api_key.trim())
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo editavel fornecido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('whatsapp_ai_configs')
      .update({
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ config: data })
  } catch (error: any) {
    console.error('AI PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover configuracao
export async function DELETE(request: NextRequest) {
  try {
    // P1 v2: org do token; validar que a config pertence a esta org
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const organizationId = auth.orgId

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Validar que a config pertence a org do token (evita IDOR no DELETE)
    const { error } = await supabase
      .from('whatsapp_ai_configs')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('AI DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// HANDLERS
// =============================================

async function handleCreateConfig(body: any, organizationId: string) {
  const { provider, model, api_key, system_prompt, temperature, max_tokens } = body

  if (!provider || !model || !api_key) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // P1.3: AES-256-GCM via secret-box (substitui base64)
  const api_key_encrypted = encryptApiKey(api_key)

  const { data, error } = await supabase
    .from('whatsapp_ai_configs')
    .insert({
      organization_id: organizationId,
      provider,
      model,
      api_key_encrypted,
      system_prompt: system_prompt || null,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 1000,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ config: data })
}

async function handleGenerate(body: any, organizationId: string) {
  const { conversation_id, user_message, contact_name } = body

  if (!user_message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Buscar config de AI ativa (escopada pela org do token)
  const { data: config, error: configError } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single()

  if (configError || !config) {
    return NextResponse.json({ error: 'No active AI config found' }, { status: 404 })
  }

  // P1.3: leitura dual + re-encrypt preguicoso
  const apiKey = await readConfigApiKey(config)

  const conversationHistory = await loadOwnHistory(conversation_id, organizationId, 20)

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
  })

  return NextResponse.json({ response })
}

async function handleSuggest(body: any, organizationId: string) {
  const { conversation_id, user_message } = body

  if (!user_message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Buscar config de AI ativa (escopada pela org do token)
  const { data: config, error: configError } = await supabase
    .from('whatsapp_ai_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single()

  if (configError || !config) {
    return NextResponse.json({ error: 'No active AI config found' }, { status: 404 })
  }

  // P1.3: leitura dual + re-encrypt preguicoso
  const apiKey = await readConfigApiKey(config)

  const conversationHistory = await loadOwnHistory(conversation_id, organizationId, 10)

  // Gerar sugestoes
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
  })

  return NextResponse.json({ suggestions })
}

async function handleTest(body: any) {
  const { provider, api_key, model, test_message } = body

  if (!provider || !api_key || !model) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
      [{ role: 'user', content: test_message || 'Ola, tudo bem?' }]
    )

    return NextResponse.json({
      success: true,
      response: response.content,
      usage: response.usage,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 400 }
    )
  }
}

// =============================================
// HELPER: Leitura dual + re-encrypt preguicoso (P1.3)
// Durante a transicao ha linhas base64 no banco; ao ler uma,
// re-gravamos ja encriptada. Guard .eq no valor antigo => idempotente.
// =============================================
/**
 * O histórico da conversa — e só se a conversa for desta org.
 *
 * `whatsapp_messages` NÃO tem `organization_id`: a tenancy mora no pai,
 * `whatsapp_conversations`. Por isso a posse é checada lá antes de qualquer
 * leitura de mensagem, em vez de um `.eq()` a mais numa coluna que não existe.
 *
 * Conversa de outra loja é tratada como conversa inexistente — vazio, sem 403.
 * Um erro distinto viraria oráculo de "esse UUID existe e não é seu". E o
 * `whatsapp_messages` sequer é consultado: o segredo alheio não é lido para
 * depois ser descartado.
 */
async function loadOwnHistory(
  conversationId: string | undefined,
  organizationId: string,
  limit: number,
): Promise<any[]> {
  if (!conversationId) return []

  const { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!conversation) return []

  const { data: messages } = await supabase
    .from('whatsapp_messages')
    .select('direction, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return messages || []
}

async function readConfigApiKey(config: { id: string; api_key_encrypted: string }): Promise<string> {
  const { apiKey, legacyBase64 } = decodeApiKey(config.api_key_encrypted)
  if (legacyBase64 && apiKey) {
    supabase
      .from('whatsapp_ai_configs')
      .update({ api_key_encrypted: encryptApiKey(apiKey), updated_at: new Date().toISOString() })
      .eq('id', config.id)
      .eq('api_key_encrypted', config.api_key_encrypted)
      .then(({ error }) => {
        if (error) console.warn('[whatsapp/ai] re-encrypt lazy falhou:', error.message)
      })
  }
  return apiKey
}
