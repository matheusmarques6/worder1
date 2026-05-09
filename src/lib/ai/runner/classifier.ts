// =============================================
// F6 — Classifier (multi_agent pipeline mode)
//
// Quando agent.llm_config.pipeline_mode === 'multi_agent', o runner roda
// um classificador rápido (Haiku) em paralelo com o RAG. O resultado
// (intent + sentiment + urgency) é injetado no prompt do writer pra ele
// já saber em que cenário está respondendo.
//
// Skip silencioso quando OPENROUTER_API_KEY ausente — runner segue como
// monolítico nesse caso.
// =============================================

import { complete, isLLMConfigured } from '../llm/client'

const CLASSIFIER_MODEL =
  process.env.AI_CLASSIFIER_MODEL || 'anthropic/claude-haiku-4-5'

const DEFAULT_INTENTS = [
  'compra',
  'duvida_produto',
  'duvida_pedido',
  'reclamacao',
  'cancelamento',
  'saudacao',
  'fora_de_escopo',
] as const

const DEFAULT_URGENCIES = ['baixa', 'media', 'alta'] as const
const DEFAULT_SENTIMENTS = ['positive', 'neutral', 'negative'] as const

export interface ClassifierResult {
  intent: string
  sentiment: 'positive' | 'neutral' | 'negative'
  urgency: 'baixa' | 'media' | 'alta'
  raw_response: string
  durationMs: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  model: string
}

export interface ClassifierInput {
  query: string
  intents?: readonly string[]
}

export const EMPTY_CLASSIFIER_RESULT: ClassifierResult = {
  intent: 'fora_de_escopo',
  sentiment: 'neutral',
  urgency: 'baixa',
  raw_response: '',
  durationMs: 0,
  tokensIn: 0,
  tokensOut: 0,
  costUsd: 0,
  model: '',
}

export async function classifyIntent(input: ClassifierInput): Promise<ClassifierResult | null> {
  if (!input.query || !input.query.trim()) return null
  if (!isLLMConfigured()) return null

  const intents = input.intents ?? DEFAULT_INTENTS
  try {
    const result = await complete({
      model: CLASSIFIER_MODEL,
      messages: [
        {
          role: 'system',
          content: `Você é um classificador de mensagens de WhatsApp de e-commerce. Responda APENAS JSON puro:
{"intent":"<uma de: ${intents.join(', ')}>","sentiment":"<positive|neutral|negative>","urgency":"<baixa|media|alta>"}`,
        },
        { role: 'user', content: input.query.slice(0, 1000) },
      ],
      temperature: 0,
      maxTokens: 80,
    })

    const cleaned = result.content.replace(/```json|```/g, '').trim()
    let parsed: { intent?: string; sentiment?: string; urgency?: string } = {}
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return {
        ...EMPTY_CLASSIFIER_RESULT,
        raw_response: result.content,
        durationMs: result.durationMs,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        model: result.model,
      }
    }

    const intent = intents.includes(parsed.intent ?? '')
      ? (parsed.intent as string)
      : 'fora_de_escopo'
    const sentiment = (DEFAULT_SENTIMENTS as readonly string[]).includes(parsed.sentiment ?? '')
      ? (parsed.sentiment as ClassifierResult['sentiment'])
      : 'neutral'
    const urgency = (DEFAULT_URGENCIES as readonly string[]).includes(parsed.urgency ?? '')
      ? (parsed.urgency as ClassifierResult['urgency'])
      : 'baixa'

    return {
      intent,
      sentiment,
      urgency,
      raw_response: result.content,
      durationMs: result.durationMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      model: result.model,
    }
  } catch (err) {
    console.warn('[classifier] falhou:', err)
    return null
  }
}

export function classifierToSystemBlock(c: ClassifierResult): string {
  const intent = c.intent.replace(/_/g, ' ')
  const sentiment =
    c.sentiment === 'negative'
      ? 'negativo'
      : c.sentiment === 'positive'
      ? 'positivo'
      : 'neutro'
  return `# Análise da última mensagem
- Intenção: ${intent}
- Sentimento: ${sentiment}
- Urgência: ${c.urgency}

Use essa análise pra ajustar tom e foco da resposta. Se urgência for alta, vá direto ao ponto. Se sentimento for negativo, valide o cliente antes de propor solução.`
}
