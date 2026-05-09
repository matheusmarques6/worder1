// =============================================
// Executors dos nodes do módulo IA. Reutilizam a infra de F2 (complete)
// pra rodar tarefas isoladas dentro de fluxos de automação.
//
// Convenção de retorno:
//   - status: 'success' | 'error'
//   - output: dado disponível em context (ex: extracted fields, summary)
//   - branch: '<key>'  → consumed by edges no flow builder (conditions)
// =============================================

import type { NodeExecutor } from './node-executors'
import { complete, isLLMConfigured } from '@/lib/ai/llm/client'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const DEFAULT_MODEL = process.env.AI_AUTOMATION_MODEL || 'anthropic/claude-haiku-4-5'

function safeJSON<T = unknown>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

function getLastUserMessage(context: Record<string, any>): string {
  return (
    context.lastMessage ||
    context.last_message ||
    context.message?.content ||
    context.contact?.last_message ||
    ''
  )
}

// =====================================================
// action_ai_classify — classifica intenção e separa fluxo
// =====================================================
const aiClassify: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return {
        status: 'success',
        output: { intent: 'compra' },
        branch: 'compra',
      }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const intents: string[] = Array.isArray(config.intents) ? config.intents : ['outro']
    const message = getLastUserMessage(context)
    if (!message.trim()) {
      return { status: 'success', output: { intent: 'outro' }, branch: 'outro' }
    }
    const result = await complete({
      model: config.model || DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: `Classifique a mensagem do cliente em uma das categorias: ${intents.join(
            ', ',
          )}. Responda APENAS o nome da categoria, em minúsculas.`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      maxTokens: 20,
    })
    const raw = result.content.trim().toLowerCase()
    const matched = intents.find((i) => raw.includes(i.toLowerCase())) || 'outro'
    return {
      status: 'success',
      output: { intent: matched, raw_response: result.content },
      branch: matched,
    }
  },
}

// =====================================================
// action_ai_extract — extrai campos estruturados e salva no contato
// =====================================================
const aiExtract: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return {
        status: 'success',
        output: { extracted: { email: 'teste@worder.com.br' } },
      }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const fields: string[] = Array.isArray(config.fields) ? config.fields : ['email', 'phone']
    const message = getLastUserMessage(context)
    if (!message.trim()) {
      return { status: 'success', output: { extracted: {} } }
    }

    const result = await complete({
      model: config.model || DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Extraia os campos solicitados da mensagem. Responda APENAS JSON puro no formato {"campo": "valor"}. Use null se o campo não estiver presente.',
        },
        {
          role: 'user',
          content: `Campos: ${fields.join(', ')}\n\nMensagem: ${message}`,
        },
      ],
      temperature: 0,
      maxTokens: 200,
    })

    const extracted = safeJSON<Record<string, string | null>>(result.content) ?? {}
    const filled = Object.fromEntries(
      Object.entries(extracted).filter(([, v]) => v && String(v).trim()),
    )

    if (config.saveToContact !== false && context.contact_id && Object.keys(filled).length > 0) {
      const supabase = getSupabaseAdmin()
      const directColumns = ['email', 'phone', 'whatsapp', 'first_name', 'last_name', 'full_name']
      const direct: Record<string, string> = {}
      const custom: Record<string, string> = {}
      for (const [k, v] of Object.entries(filled)) {
        if (directColumns.includes(k)) direct[k] = String(v)
        else custom[k] = String(v)
      }
      if (Object.keys(direct).length > 0) {
        await supabase.from('contacts').update(direct).eq('id', context.contact_id)
      }
      if (Object.keys(custom).length > 0) {
        const { data: cur } = await supabase
          .from('contacts')
          .select('custom_fields')
          .eq('id', context.contact_id)
          .maybeSingle()
        const merged = { ...((cur?.custom_fields as Record<string, unknown>) ?? {}), ...custom }
        await supabase
          .from('contacts')
          .update({ custom_fields: merged })
          .eq('id', context.contact_id)
      }
    }

    return { status: 'success', output: { extracted: filled } }
  },
}

// =====================================================
// action_ai_generate — gera mensagem livre com prompt + variáveis
// =====================================================
const aiGenerate: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return { status: 'success', output: { generated: 'Olá! Mensagem de teste gerada por IA.' } }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const prompt = String(config.prompt || '').trim()
    if (!prompt) {
      return { status: 'error', output: null, error: 'prompt vazio' }
    }
    const filled = prompt.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const value = key.split('.').reduce((acc: any, k: string) => acc?.[k], context)
      return value != null ? String(value) : ''
    })
    const result = await complete({
      model: config.model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: filled }],
      temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
      maxTokens: typeof config.maxTokens === 'number' ? config.maxTokens : 300,
    })
    return {
      status: 'success',
      output: { generated: result.content.trim(), tokens: result.tokensIn + result.tokensOut },
    }
  },
}

// =====================================================
// action_ai_summarize — resume conversa e salva em ai_conversation_memory.summary
// =====================================================
const aiSummarize: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return { status: 'success', output: { summary: 'Resumo de teste.' } }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const conversationId = context.conversation_id || context.conversationId
    if (!conversationId) {
      return { status: 'error', output: null, error: 'conversation_id ausente' }
    }
    const supabase = getSupabaseAdmin()
    const windowSize = typeof config.windowSize === 'number' ? config.windowSize : 20
    const { data: msgs } = await supabase
      .from('whatsapp_messages')
      .select('direction, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(windowSize)
    const transcript = (msgs ?? [])
      .reverse()
      .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'IA'}: ${m.content}`)
      .join('\n')
    if (!transcript.trim()) {
      return { status: 'success', output: { summary: '' } }
    }
    const result = await complete({
      model: config.model || DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Resuma a conversa em até 200 palavras. Foque em fatos sobre o cliente, intenções, dores, produtos discutidos e estado da negociação. Português, frases curtas.',
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      maxTokens: 400,
    })
    const summary = result.content.trim().slice(0, 4000)

    if (config.saveToMemory !== false && context.ai_agent_id) {
      await supabase.from('ai_conversation_memory').upsert(
        {
          conversation_id: conversationId,
          agent_id: context.ai_agent_id,
          organization_id: context.organization_id,
          summary,
        },
        { onConflict: 'conversation_id,agent_id' },
      )
    }

    return { status: 'success', output: { summary } }
  },
}

// =====================================================
// action_ai_handoff — transfere conversa entre agentes IA
// =====================================================
const aiHandoff: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return { status: 'success', output: { handoff: true, target: config.targetAgentId } }
    }
    const conversationId = context.conversation_id || context.conversationId
    if (!conversationId || !config.targetAgentId) {
      return { status: 'error', output: null, error: 'conversation_id ou targetAgentId ausente' }
    }
    const supabase = getSupabaseAdmin()
    await supabase
      .from('whatsapp_conversations')
      .update({ ai_agent_id: config.targetAgentId, ai_paused: false })
      .eq('id', conversationId)
    return { status: 'success', output: { handoff: true, target: config.targetAgentId } }
  },
}

// =====================================================
// condition_ai_sentiment — branches: positive | neutral | negative
// =====================================================
const aiSentiment: NodeExecutor = {
  async execute({ config: _c, context, isTest }) {
    if (isTest) {
      return { status: 'success', output: { sentiment: 'neutral' }, branch: 'neutral' }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const message = getLastUserMessage(context)
    if (!message.trim()) {
      return { status: 'success', output: { sentiment: 'neutral' }, branch: 'neutral' }
    }
    const result = await complete({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Classifique o sentimento da mensagem em: positive, neutral, negative. Responda APENAS uma das três palavras em inglês minúsculo.',
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      maxTokens: 10,
    })
    const raw = result.content.trim().toLowerCase()
    const sentiment = raw.includes('positive')
      ? 'positive'
      : raw.includes('negative')
      ? 'negative'
      : 'neutral'
    return { status: 'success', output: { sentiment }, branch: sentiment }
  },
}

// =====================================================
// condition_ai_match — pergunta sim/não em linguagem natural
// =====================================================
const aiMatch: NodeExecutor = {
  async execute({ config, context, isTest }) {
    if (isTest) {
      return { status: 'success', output: { matched: true }, branch: 'true' }
    }
    if (!isLLMConfigured()) {
      return { status: 'error', output: null, error: 'OPENROUTER_API_KEY ausente' }
    }
    const question = String(config.question || '').trim()
    if (!question) {
      return { status: 'error', output: null, error: 'question vazia' }
    }
    const message = getLastUserMessage(context)
    const result = await complete({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Responda APENAS "sim" ou "não" para a pergunta sobre a mensagem do cliente. Sem pontuação, sem texto adicional.',
        },
        { role: 'user', content: `Mensagem: ${message}\n\nPergunta: ${question}` },
      ],
      temperature: 0,
      maxTokens: 5,
    })
    const raw = result.content.trim().toLowerCase()
    const matched = raw.startsWith('sim') || raw.startsWith('yes')
    return {
      status: 'success',
      output: { matched, raw_response: result.content },
      branch: matched ? 'true' : 'false',
    }
  },
}

export const aiNodeExecutors: Record<string, NodeExecutor> = {
  action_ai_classify: aiClassify,
  action_ai_extract: aiExtract,
  action_ai_generate: aiGenerate,
  action_ai_summarize: aiSummarize,
  action_ai_handoff: aiHandoff,
  condition_ai_sentiment: aiSentiment,
  condition_ai_match: aiMatch,
}
