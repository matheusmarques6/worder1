// =====================================================
// SERVIÇO DE EMBEDDINGS COM CACHE REDIS
// text-embedding-3-small @ 1024 dim — alinhado com ai_agent_chunks.embedding
// (vector(1024)) e ~5x mais barato que ada-002 com melhor recall.
// =====================================================

import crypto from 'crypto'
import { getRedis, isRedisConfigured, CACHE_TTL, CACHE_PREFIX } from '@/lib/redis'

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENAI_EMBEDDING_DIMENSIONS = 1024
const MAX_TOKENS_PER_REQUEST = 8191
// bump de prefixo: invalida cache de vetores 1536-dim antigos
const EMBED_CACHE_PREFIX = `${CACHE_PREFIX.EMBEDDING}v2:`

// Estatísticas de cache (para monitoramento)
let cacheStats = {
  hits: 0,
  misses: 0,
  errors: 0,
}

/**
 * Gera hash SHA256 do texto para usar como chave de cache
 */
function hashText(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 32)
}

/**
 * Gera embedding para um texto usando OpenAI
 * Usa cache Redis para evitar chamadas repetidas (economia de ~90%)
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

  // Gerar hash para cache
  const hash = hashText(truncatedText)
  const cacheKey = `${EMBED_CACHE_PREFIX}${hash}`

  // ============================================
  // 1. TENTAR BUSCAR DO CACHE
  // ============================================
  if (isRedisConfigured()) {
    try {
      const redis = getRedis()
      const cached = await redis.get<number[]>(cacheKey)
      
      if (cached && Array.isArray(cached) && cached.length === OPENAI_EMBEDDING_DIMENSIONS) {
        cacheStats.hits++
        console.log(`[Embeddings] ✅ Cache HIT (${cacheStats.hits} hits, ${cacheStats.misses} misses)`)
        return cached
      }
    } catch (cacheError) {
      cacheStats.errors++
      console.warn('[Embeddings] ⚠️ Erro ao ler cache:', cacheError)
    }
  }

  // ============================================
  // 2. CACHE MISS - GERAR NOVO EMBEDDING
  // ============================================
  cacheStats.misses++
  console.log(`[Embeddings] 🔄 Cache MISS - Gerando embedding (${cacheStats.hits} hits, ${cacheStats.misses} misses)`)

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
        dimensions: OPENAI_EMBEDDING_DIMENSIONS,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const embedding = data.data[0].embedding as number[]

    // ============================================
    // 3. SALVAR NO CACHE (async, não bloqueia)
    // ============================================
    if (isRedisConfigured()) {
      try {
        const redis = getRedis()
        await redis.setex(cacheKey, CACHE_TTL.EMBEDDING, embedding)
        console.log(`[Embeddings] 💾 Salvo no cache: ${cacheKey.substring(0, 20)}...`)
      } catch (cacheError) {
        console.warn('[Embeddings] ⚠️ Erro ao salvar cache:', cacheError)
      }
    }

    return embedding

  } catch (error: any) {
    console.error('[Embeddings] ❌ Erro ao gerar embedding:', error)
    throw new Error(`Erro ao gerar embedding: ${error.message}`)
  }
}

/**
 * Gera embeddings para múltiplos textos em batch
 * Usa cache para textos já processados anteriormente
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

  const results: number[][] = new Array(texts.length)
  const toGenerate: { index: number; text: string; hash: string; cacheKey: string }[] = []

  // ============================================
  // 1. VERIFICAR CACHE PARA CADA TEXTO
  // ============================================
  const redisAvailable = isRedisConfigured()
  
  for (let i = 0; i < texts.length; i++) {
    const cleanText = texts[i].trim().replace(/\n+/g, ' ')
    const truncated = truncateToTokenLimit(cleanText, MAX_TOKENS_PER_REQUEST)
    const hash = hashText(truncated)
    const cacheKey = `${EMBED_CACHE_PREFIX}${hash}`

    if (redisAvailable) {
      try {
        const redis = getRedis()
        const cached = await redis.get<number[]>(cacheKey)
        
        if (cached && Array.isArray(cached) && cached.length === OPENAI_EMBEDDING_DIMENSIONS) {
          results[i] = cached
          cacheStats.hits++
          continue
        }
      } catch (e) {
        // Ignorar erro de cache
      }
    }

    toGenerate.push({ index: i, text: truncated, hash, cacheKey })
  }

  console.log(`[Embeddings Batch] ✅ Cache: ${texts.length - toGenerate.length}/${texts.length} | 🔄 Gerar: ${toGenerate.length}`)

  // ============================================
  // 2. GERAR EMBEDDINGS PARA TEXTOS NÃO CACHEADOS
  // ============================================
  if (toGenerate.length > 0) {
    const batchSize = 100 // OpenAI permite até 2048, mas 100 é mais seguro

    for (let i = 0; i < toGenerate.length; i += batchSize) {
      const batch = toGenerate.slice(i, i + batchSize)
      const batchTexts = batch.map(b => b.text)

      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: OPENAI_EMBEDDING_MODEL,
            input: batchTexts,
            dimensions: OPENAI_EMBEDDING_DIMENSIONS,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error?.message || `OpenAI API error: ${response.status}`)
        }

        const data = await response.json()
        const sortedData = data.data.sort((a: any, b: any) => a.index - b.index)

        // Processar resultados e salvar no cache
        for (let j = 0; j < batch.length; j++) {
          const embedding = sortedData[j].embedding
          const item = batch[j]
          
          results[item.index] = embedding
          cacheStats.misses++

          // Salvar no cache (async, não esperar)
          if (redisAvailable) {
            const redis = getRedis()
            redis.setex(item.cacheKey, CACHE_TTL.EMBEDDING, embedding).catch(() => {})
          }
        }

      } catch (error: any) {
        console.error('[Embeddings Batch] ❌ Erro:', error)
        throw new Error(`Erro ao gerar embeddings em batch: ${error.message}`)
      }

      // Rate limiting entre batches
      if (i + batchSize < toGenerate.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
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

/**
 * Retorna estatísticas do cache de embeddings
 */
export function getEmbeddingCacheStats() {
  return {
    ...cacheStats,
    hitRate: cacheStats.hits + cacheStats.misses > 0 
      ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) 
      : 0,
  }
}

/**
 * Reseta estatísticas (para testes)
 */
export function resetCacheStats() {
  cacheStats = { hits: 0, misses: 0, errors: 0 }
}

/**
 * Limpa todo o cache de embeddings
 */
export async function clearEmbeddingsCache(): Promise<number> {
  if (!isRedisConfigured()) {
    return 0
  }

  try {
    const redis = getRedis()
    const keys = await redis.keys(`${CACHE_PREFIX.EMBEDDING}*`)
    
    if (keys.length === 0) {
      return 0
    }

    await redis.del(...keys)
    console.log(`[Embeddings] 🗑️ Cache limpo: ${keys.length} chaves removidas`)
    return keys.length
  } catch (error) {
    console.error('[Embeddings] Erro ao limpar cache:', error)
    return 0
  }
}

/**
 * Busca embedding do cache (sem gerar se não existir)
 */
export async function getEmbeddingFromCache(text: string): Promise<number[] | null> {
  if (!isRedisConfigured()) {
    return null
  }

  const cleanText = text.trim().replace(/\n+/g, ' ')
  const truncated = truncateToTokenLimit(cleanText, MAX_TOKENS_PER_REQUEST)
  const hash = hashText(truncated)
  const cacheKey = `${EMBED_CACHE_PREFIX}${hash}`

  try {
    const redis = getRedis()
    const cached = await redis.get<number[]>(cacheKey)
    
    if (cached && Array.isArray(cached) && cached.length === OPENAI_EMBEDDING_DIMENSIONS) {
      return cached
    }
  } catch (error) {
    // Ignorar
  }

  return null
}
