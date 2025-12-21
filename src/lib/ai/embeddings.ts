// =====================================================
// SERVIÇO DE EMBEDDINGS
// Gera embeddings usando OpenAI text-embedding-ada-002
// =====================================================

const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002'
const OPENAI_EMBEDDING_DIMENSIONS = 1536
const MAX_TOKENS_PER_REQUEST = 8191

/**
 * Gera embedding para um texto usando OpenAI
 */
export async function generateEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new Error('Texto não pode estar vazio')
  }

  if (!apiKey) {
    throw new Error('API key da OpenAI não configurada')
  }

  // Limpar e truncar texto se necessário
  const cleanText = text.trim().replace(/\n+/g, ' ')
  const truncatedText = truncateToTokenLimit(cleanText, MAX_TOKENS_PER_REQUEST)

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: truncatedText,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.data[0].embedding
  } catch (error: any) {
    console.error('Error generating embedding:', error)
    throw new Error(`Erro ao gerar embedding: ${error.message}`)
  }
}

/**
 * Gera embeddings para múltiplos textos em batch
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return []
  }

  if (!apiKey) {
    throw new Error('API key da OpenAI não configurada')
  }

  // Limpar e truncar textos
  const cleanTexts = texts.map(t => {
    const clean = t.trim().replace(/\n+/g, ' ')
    return truncateToTokenLimit(clean, MAX_TOKENS_PER_REQUEST)
  })

  // OpenAI permite até 2048 textos por requisição
  const batchSize = 100
  const results: number[][] = []

  for (let i = 0; i < cleanTexts.length; i += batchSize) {
    const batch = cleanTexts.slice(i, i + batchSize)

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_EMBEDDING_MODEL,
          input: batch,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      
      // Ordenar por índice (OpenAI retorna na mesma ordem, mas por segurança)
      const sortedData = data.data.sort((a: any, b: any) => a.index - b.index)
      results.push(...sortedData.map((d: any) => d.embedding))
    } catch (error: any) {
      console.error('Error generating batch embeddings:', error)
      throw new Error(`Erro ao gerar embeddings em batch: ${error.message}`)
    }

    // Rate limiting: pequena pausa entre batches
    if (i + batchSize < cleanTexts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return results
}

/**
 * Trunca texto para caber no limite de tokens
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  // Aproximação: 4 caracteres por token
  const maxChars = maxTokens * 4
  
  if (text.length <= maxChars) {
    return text
  }

  // Tentar truncar em uma palavra
  const truncated = text.slice(0, maxChars)
  const lastSpace = truncated.lastIndexOf(' ')
  
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace)
  }

  return truncated
}

/**
 * Calcula similaridade de cosseno entre dois embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings devem ter o mesmo tamanho')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}

/**
 * Constantes exportadas
 */
export const EMBEDDING_MODEL = OPENAI_EMBEDDING_MODEL
export const EMBEDDING_DIMENSIONS = OPENAI_EMBEDDING_DIMENSIONS
