// =====================================================
// DETECTOR DE INTENÇÃO
// Usa LLM para detectar a intenção do usuário
// =====================================================

import { DetectedIntent, PredefinedIntent, PREDEFINED_INTENTS } from './types'

/**
 * Detecta a intenção do usuário em uma mensagem
 */
export async function detectIntent(
  message: string,
  apiKey: string,
  customIntents?: string[]
): Promise<DetectedIntent> {
  if (!message || !message.trim()) {
    return { intent: 'other', confidence: 0 }
  }

  const allIntents = [...PREDEFINED_INTENTS, ...(customIntents || [])]

  const prompt = `Analise a mensagem do cliente e identifique a intenção principal.

Intenções disponíveis:
- buy: Cliente quer comprar algo
- support: Cliente precisa de suporte técnico ou ajuda
- refund: Cliente quer reembolso ou devolução
- human: Cliente quer falar com um humano/atendente
- price: Cliente pergunta sobre preço
- delivery: Cliente pergunta sobre entrega/frete
- availability: Cliente pergunta sobre disponibilidade/estoque
- complaint: Cliente está reclamando
- greeting: Cliente está cumprimentando
- farewell: Cliente está se despedindo
- other: Nenhuma das anteriores
${customIntents?.length ? `\nIntenções customizadas: ${customIntents.join(', ')}` : ''}

Mensagem do cliente: "${message}"

Responda APENAS com um JSON no formato:
{"intent": "nome_da_intencao", "confidence": 0.95}

A confiança deve ser um número entre 0 e 1.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um classificador de intenções. Responda apenas com JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    })

    if (!response.ok) {
      console.error('Intent detection API error:', response.status)
      return { intent: 'other', confidence: 0 }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // Parse JSON da resposta
    const jsonMatch = content.match(/\{[^}]+\}/)
    if (!jsonMatch) {
      console.error('Could not parse intent JSON:', content)
      return { intent: 'other', confidence: 0 }
    }

    const result = JSON.parse(jsonMatch[0])
    
    // Validar resultado
    const intent = result.intent?.toLowerCase() || 'other'
    const confidence = Math.min(1, Math.max(0, result.confidence || 0))

    // Verificar se é uma intenção conhecida
    const isCustom = customIntents?.includes(intent) && !PREDEFINED_INTENTS.includes(intent as PredefinedIntent)

    return {
      intent: intent as PredefinedIntent,
      confidence,
      custom_intent: isCustom ? intent : undefined,
    }

  } catch (error: any) {
    console.error('Intent detection error:', error)
    return { intent: 'other', confidence: 0 }
  }
}

/**
 * Versão simplificada usando regex (fallback sem API)
 */
export function detectIntentSimple(message: string): DetectedIntent {
  const msg = message.toLowerCase()

  // Padrões para cada intenção
  const patterns: Record<PredefinedIntent, RegExp[]> = {
    buy: [
      /quero\s+(comprar|adquirir)/i,
      /como\s+(compro|faço\s+para\s+comprar)/i,
      /tem\s+para\s+venda/i,
      /qual\s+o\s+valor/i,
      /quanto\s+custa/i,
      /aceita\s+(cartão|pix|boleto)/i,
    ],
    support: [
      /preciso\s+de\s+ajuda/i,
      /não\s+(funciona|consigo|está\s+funcionando)/i,
      /problema\s+(com|no|na)/i,
      /como\s+(faço|usar|configuro)/i,
      /dúvida/i,
    ],
    refund: [
      /reembolso/i,
      /devolução/i,
      /devolver/i,
      /quero\s+meu\s+dinheiro/i,
      /cancelar\s+(pedido|compra)/i,
      /estorno/i,
    ],
    human: [
      /falar\s+com\s+(um\s+)?(humano|atendente|pessoa|alguém)/i,
      /atendimento\s+humano/i,
      /quero\s+falar\s+com/i,
      /passa\s+para\s+alguém/i,
      /transfere/i,
    ],
    price: [
      /quanto\s+(custa|é|fica)/i,
      /qual\s+(é\s+)?o\s+(valor|preço)/i,
      /preço/i,
      /valor/i,
      /promoção/i,
      /desconto/i,
    ],
    delivery: [
      /entrega/i,
      /frete/i,
      /prazo/i,
      /envio/i,
      /quando\s+chega/i,
      /rastreamento/i,
      /rastrear/i,
      /código\s+de\s+rastreio/i,
    ],
    availability: [
      /tem\s+(em\s+)?estoque/i,
      /disponível/i,
      /disponibilidade/i,
      /tem\s+para\s+pronta\s+entrega/i,
      /quantos?\s+tem/i,
    ],
    complaint: [
      /reclamação/i,
      /insatisfeito/i,
      /péssimo/i,
      /horrível/i,
      /absurdo/i,
      /vocês\s+são/i,
      /muito\s+ruim/i,
      /decepcionado/i,
    ],
    greeting: [
      /^(oi|olá|ola|hey|ei|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+aí)/i,
      /tudo\s+(bem|bom|certo)/i,
    ],
    farewell: [
      /^(tchau|adeus|até\s+(mais|logo)|valeu|obrigado|obrigada|flw)/i,
      /foi\s+só\s+isso/i,
      /era\s+só\s+isso/i,
    ],
    other: [],
  }

  // Verificar cada padrão
  for (const [intent, regexList] of Object.entries(patterns)) {
    if (intent === 'other') continue
    
    for (const regex of regexList) {
      if (regex.test(msg)) {
        return {
          intent: intent as PredefinedIntent,
          confidence: 0.7, // Confiança média para regex
        }
      }
    }
  }

  return { intent: 'other', confidence: 0.5 }
}
