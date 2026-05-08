// =============================================
// Cliente LLM do módulo Worder AI. Default = OpenRouter (compatível com
// OpenAI SDK). Lança erro descritivo se OPENROUTER_API_KEY ausente.
//
// Pricing aproximado por 1M tokens (input/output em USD). Usado para
// estimar `cost_usd` em `ai_executions`. Atualizar conforme a tabela
// oficial do OpenRouter mudar.
// =============================================

import OpenAI from 'openai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionResult {
  content: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  model: string
}

export interface CompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

const PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  'anthropic/claude-sonnet-4.6': { in: 3, out: 15 },
  'anthropic/claude-haiku-4.5': { in: 0.8, out: 4 },
  'openai/gpt-4o-mini': { in: 0.15, out: 0.6 },
  'openai/gpt-4o': { in: 2.5, out: 10 },
}

let openrouterClient: OpenAI | null = null

function getOpenRouterClient(): OpenAI {
  if (openrouterClient) return openrouterClient
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY ausente. Configure no env para habilitar o pipeline de IA.',
    )
  }
  openrouterClient = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  })
  return openrouterClient
}

export function isLLMConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  const client = getOpenRouterClient()
  const start = Date.now()
  const response = await client.chat.completions.create({
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 1000,
  })
  const durationMs = Date.now() - start
  const tokensIn = response.usage?.prompt_tokens ?? 0
  const tokensOut = response.usage?.completion_tokens ?? 0
  const pricing = PRICING_USD_PER_1M[req.model]
  const costUsd = pricing
    ? (tokensIn * pricing.in + tokensOut * pricing.out) / 1_000_000
    : 0
  return {
    content: response.choices[0]?.message?.content ?? '',
    tokensIn,
    tokensOut,
    costUsd,
    durationMs,
    model: req.model,
  }
}
