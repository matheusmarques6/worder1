// =====================================================
// SERVIÇO RAG - RETRIEVAL AUGMENTED GENERATION
// Busca semântica usando pgvector
// =====================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding } from './embeddings'
import { resolveEmbeddingKey } from './embedding-key'
import { RAGSearchParams, RAGResult } from './types'

// =====================================================
// RAG SERVICE CLASS
// =====================================================

export class RAGService {
  private supabase: SupabaseClient
  private openaiKey: string
  private organizationId: string

  constructor(openaiKey: string, organizationId: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Supabase não configurado')
    }

    if (!openaiKey) {
      throw new Error('OpenAI API key não configurada')
    }

    if (!organizationId) {
      throw new Error('organizationId não informado')
    }

    this.supabase = createClient(url, key)
    this.openaiKey = openaiKey
    this.organizationId = organizationId
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

    // Gerar embedding da query — erro aqui já subia antes e continua subindo.
    const queryEmbedding = await generateEmbedding(query, this.openaiKey, this.organizationId)

    // Única fonte de resultados: a RPC search_agent_knowledge (promovida ao
    // stream versionado no item 43, escopada por organização — ver
    // supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql).
    // Não há fallback de full scan: {error} da RPC vira exceção, no molde de
    // tools/knowledge.py (o gêmeo Python nunca teve fallback e sempre deixou
    // o erro propagar). Antes, um {error} aqui caía — sem log, sem throw —
    // num `searchDirect` que varria a tabela inteira sem LIMIT e truncava
    // em silêncio no default de 1000 linhas do PostgREST
    // (supabase/config.toml:17): resultado ERRADO, apresentado como certo.
    const { data, error } = await this.supabase.rpc('search_agent_knowledge', {
      p_agent_id: agentId,
      p_organization_id: this.organizationId,
      p_query_embedding: `[${queryEmbedding.join(',')}]`,
      p_match_threshold: threshold,
      p_match_count: topK,
    })

    if (error) {
      console.error('RAG search error (RPC search_agent_knowledge):', error)
      throw new Error(`Erro na busca RAG: ${error.message}`)
    }

    return this.formatResults(data ?? [], sourceIds)
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
}

// =====================================================
// FUNÇÕES HELPER
// =====================================================

/**
 * Cria instância do RAG Service pra uma org (BYO total, Onda 13.6).
 * Le chave OpenAI de `organization_api_keys`. Retorna null se a org nao
 * cadastrou chave — caller degrada graciosamente (sem knowledge base).
 */
export async function createRAGServiceForOrg(
  supabase: SupabaseClient,
  organizationId: string
): Promise<RAGService | null> {
  const openaiKey = await resolveEmbeddingKey(supabase, organizationId)
  if (!openaiKey) return null
  return new RAGService(openaiKey, organizationId)
}
