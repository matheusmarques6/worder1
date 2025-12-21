// =====================================================
// SERVIÇO RAG - RETRIEVAL AUGMENTED GENERATION
// Busca semântica usando pgvector
// =====================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding } from './embeddings'
import { RAGSearchParams, RAGResult } from './types'

// =====================================================
// RAG SERVICE CLASS
// =====================================================

export class RAGService {
  private supabase: SupabaseClient
  private openaiKey: string

  constructor(openaiKey: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Supabase não configurado')
    }

    if (!openaiKey) {
      throw new Error('OpenAI API key não configurada')
    }

    this.supabase = createClient(url, key)
    this.openaiKey = openaiKey
  }

  /**
   * Busca chunks relevantes usando similaridade semântica
   */
  async search(params: RAGSearchParams): Promise<RAGResult[]> {
    const {
      agentId,
      query,
      topK = 5,
      threshold = 0.7,
      sourceIds,
    } = params

    if (!query || !query.trim()) {
      return []
    }

    try {
      // Gerar embedding da query
      const queryEmbedding = await generateEmbedding(query, this.openaiKey)

      // Buscar usando função RPC do Supabase (mais eficiente)
      // Se a função não existir, fazer query direta
      try {
        const { data, error } = await this.supabase.rpc('search_agent_knowledge', {
          p_agent_id: agentId,
          p_query_embedding: `[${queryEmbedding.join(',')}]`,
          p_match_threshold: threshold,
          p_match_count: topK,
        })

        if (!error && data) {
          return this.formatResults(data, sourceIds)
        }
      } catch (rpcError) {
        console.warn('RPC search not available, using direct query')
      }

      // Fallback: Query direta (menos eficiente mas funciona)
      return await this.searchDirect(agentId, queryEmbedding, topK, threshold, sourceIds)

    } catch (error: any) {
      console.error('RAG search error:', error)
      throw new Error(`Erro na busca RAG: ${error.message}`)
    }
  }

  /**
   * Busca direta no banco (fallback)
   */
  private async searchDirect(
    agentId: string,
    queryEmbedding: number[],
    topK: number,
    threshold: number,
    sourceIds?: string[]
  ): Promise<RAGResult[]> {
    // Buscar todos os chunks do agente
    let query = this.supabase
      .from('ai_agent_chunks')
      .select('id, source_id, content, metadata, embedding')
      .eq('agent_id', agentId)

    if (sourceIds && sourceIds.length > 0) {
      query = query.in('source_id', sourceIds)
    }

    const { data: chunks, error } = await query

    if (error) {
      console.error('Error fetching chunks:', error)
      throw error
    }

    if (!chunks || chunks.length === 0) {
      return []
    }

    // Calcular similaridade para cada chunk
    const results: Array<{
      chunk: any
      similarity: number
    }> = []

    for (const chunk of chunks) {
      if (!chunk.embedding) continue

      // Parse embedding (pode vir como string ou array)
      let embedding: number[]
      if (typeof chunk.embedding === 'string') {
        embedding = JSON.parse(chunk.embedding)
      } else {
        embedding = chunk.embedding
      }

      const similarity = this.cosineSimilarity(queryEmbedding, embedding)
      
      if (similarity >= threshold) {
        results.push({ chunk, similarity })
      }
    }

    // Ordenar por similaridade e pegar top K
    results.sort((a, b) => b.similarity - a.similarity)
    const topResults = results.slice(0, topK)

    // Buscar nomes das fontes
    const sourceIdsToFetch = [...new Set(topResults.map(r => r.chunk.source_id))]
    const { data: sources } = await this.supabase
      .from('ai_agent_sources')
      .select('id, name')
      .in('id', sourceIdsToFetch)

    const sourceMap = new Map(sources?.map(s => [s.id, s.name]) || [])

    return topResults.map(r => ({
      chunk_id: r.chunk.id,
      source_id: r.chunk.source_id,
      source_name: sourceMap.get(r.chunk.source_id) || 'Desconhecido',
      content: r.chunk.content,
      metadata: r.chunk.metadata || {},
      similarity: r.similarity,
    }))
  }

  /**
   * Formata resultados da busca RPC
   */
  private async formatResults(data: any[], sourceIds?: string[]): Promise<RAGResult[]> {
    if (!data || data.length === 0) return []

    // Filtrar por sourceIds se especificado
    let filtered = data
    if (sourceIds && sourceIds.length > 0) {
      filtered = data.filter(d => sourceIds.includes(d.source_id))
    }

    // Buscar nomes das fontes
    const sourceIdsToFetch = [...new Set(filtered.map(r => r.source_id))]
    const { data: sources } = await this.supabase
      .from('ai_agent_sources')
      .select('id, name')
      .in('id', sourceIdsToFetch)

    const sourceMap = new Map(sources?.map(s => [s.id, s.name]) || [])

    return filtered.map(r => ({
      chunk_id: r.chunk_id,
      source_id: r.source_id,
      source_name: sourceMap.get(r.source_id) || 'Desconhecido',
      content: r.content,
      metadata: r.metadata || {},
      similarity: r.similarity,
    }))
  }

  /**
   * Calcula similaridade de cosseno
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

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

    if (normA === 0 || normB === 0) return 0

    return dotProduct / (normA * normB)
  }

  /**
   * Monta contexto para o prompt a partir dos resultados RAG
   */
  buildContext(results: RAGResult[]): string {
    if (!results || results.length === 0) {
      return ''
    }

    const contextParts = results.map((r, i) => {
      return `[Fonte ${i + 1}: ${r.source_name}]\n${r.content}`
    })

    return `
Informações relevantes encontradas na base de conhecimento:

${contextParts.join('\n\n---\n\n')}

Use as informações acima para responder a pergunta do usuário. Se a informação não estiver disponível, informe educadamente.`
  }
}

// =====================================================
// FUNÇÕES HELPER
// =====================================================

/**
 * Cria instância do RAG Service
 */
export function createRAGService(): RAGService {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY não configurada')
  }
  return new RAGService(openaiKey)
}

/**
 * Busca rápida sem instanciar classe
 */
export async function ragSearch(params: RAGSearchParams): Promise<RAGResult[]> {
  const service = createRAGService()
  return service.search(params)
}
