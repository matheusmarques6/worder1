// =====================================================
// ANALISADOR DE SENTIMENTO
// Usa LLM para detectar o sentimento do usuário
// =====================================================

import { SentimentResult, Sentiment, SENTIMENTS } from './types'

/**
 * Analisa o sentimento de uma mensagem
 */
export async function analyzeSentiment(
  message: string,
  apiKey: string
): Promise<SentimentResult> {
  if (!message || !message.trim()) {
    return { sentiment: 'neutral', confidence: 0, score: 0 }
  }

  const prompt = `Analise o sentimento emocional da mensagem do cliente.

Sentimentos possíveis:
- frustrated: Cliente está frustrado ou irritado com algo
- confused: Cliente está confuso ou não entendeu
- happy: Cliente está satisfeito ou feliz
- neutral: Cliente está neutro, sem emoção aparente
- sad: Cliente está triste ou desapontado
- angry: Cliente está com raiva ou muito irritado

Mensagem do cliente: "${message}"

Responda APENAS com um JSON no formato:
{"sentiment": "nome_do_sentimento", "confidence": 0.95, "score": 0.5}

- confidence: número entre 0 e 1 indicando certeza da classificação
- score: número entre -1 (muito negativo) e 1 (muito positivo)`

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
          { role: 'system', content: 'Você é um analisador de sentimentos. Responda apenas com JSON válido.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    })

    if (!response.ok) {
      console.error('Sentiment analysis API error:', response.status)
      return { sentiment: 'neutral', confidence: 0, score: 0 }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''

    // Parse JSON da resposta
    const jsonMatch = content.match(/\{[^}]+\}/)
    if (!jsonMatch) {
      console.error('Could not parse sentiment JSON:', content)
      return { sentiment: 'neutral', confidence: 0, score: 0 }
    }

    const result = JSON.parse(jsonMatch[0])
    
    // Validar resultado
    const sentiment = result.sentiment?.toLowerCase() || 'neutral'
    const confidence = Math.min(1, Math.max(0, result.confidence || 0))
    const score = Math.min(1, Math.max(-1, result.score || 0))

    // Verificar se é um sentimento válido
    const validSentiment = SENTIMENTS.includes(sentiment as Sentiment) ? sentiment : 'neutral'

    return {
      sentiment: validSentiment as Sentiment,
      confidence,
      score,
    }

  } catch (error: any) {
    console.error('Sentiment analysis error:', error)
    return { sentiment: 'neutral', confidence: 0, score: 0 }
  }
}

/**
 * Versão simplificada usando regex e palavras-chave (fallback sem API)
 */
export function analyzeSentimentSimple(message: string): SentimentResult {
  const msg = message.toLowerCase()

  // Palavras-chave para cada sentimento
  const keywords: Record<Sentiment, { words: string[]; weight: number }> = {
    frustrated: {
      words: ['frustrado', 'frustrante', 'irritado', 'cansado', 'difícil', 'complicado', 'não funciona', 'problema'],
      weight: -0.6,
    },
    angry: {
      words: ['raiva', 'absurdo', 'ridículo', 'inaceitável', 'péssimo', 'horrível', 'porcaria', 'lixo', 'merda'],
      weight: -0.9,
    },
    confused: {
      words: ['confuso', 'não entendi', 'como assim', 'o que', 'não sei', 'perdido', 'qual', 'hein'],
      weight: -0.2,
    },
    sad: {
      words: ['triste', 'decepcionado', 'infeliz', 'chateado', 'desapontado', 'pena'],
      weight: -0.5,
    },
    happy: {
      words: ['feliz', 'satisfeito', 'ótimo', 'excelente', 'perfeito', 'maravilhoso', 'obrigado', 'agradeço', 'parabéns', 'amei'],
      weight: 0.8,
    },
    neutral: {
      words: ['ok', 'certo', 'entendi', 'tá', 'sim', 'não'],
      weight: 0,
    },
  }

  // Pontuação acumulada
  let totalScore = 0
  let matchCount = 0
  let dominantSentiment: Sentiment = 'neutral'
  let highestWeight = 0

  for (const [sentiment, { words, weight }] of Object.entries(keywords)) {
    for (const word of words) {
      if (msg.includes(word)) {
        totalScore += weight
        matchCount++
        
        if (Math.abs(weight) > Math.abs(highestWeight)) {
          highestWeight = weight
          dominantSentiment = sentiment as Sentiment
        }
      }
    }
  }

  // Verificar pontuação e emojis
  if (msg.includes('!')) totalScore += 0.1
  if (msg.includes('?')) totalScore -= 0.05
  if (msg.includes('...')) totalScore -= 0.1
  if (/[😊😄😃🙂👍❤️💕]/.test(msg)) totalScore += 0.3
  if (/[😠😡🤬😤👎]/.test(msg)) totalScore -= 0.3
  if (/[😢😭😞😔]/.test(msg)) totalScore -= 0.2
  if (/[🤔❓]/.test(msg)) dominantSentiment = 'confused'

  // Normalizar score
  const finalScore = Math.min(1, Math.max(-1, totalScore))
  const confidence = matchCount > 0 ? Math.min(0.8, 0.4 + matchCount * 0.1) : 0.3

  // Ajustar sentimento baseado no score final se necessário
  if (matchCount === 0) {
    if (finalScore > 0.3) dominantSentiment = 'happy'
    else if (finalScore < -0.3) dominantSentiment = 'frustrated'
    else dominantSentiment = 'neutral'
  }

  return {
    sentiment: dominantSentiment,
    confidence,
    score: finalScore,
  }
}

/**
 * Verifica se o sentimento corresponde a um requisito
 */
export function matchesSentiment(
  result: SentimentResult,
  requiredSentiment: Sentiment,
  minConfidence: number = 0.5
): boolean {
  if (result.confidence < minConfidence) {
    return false
  }

  return result.sentiment === requiredSentiment
}
