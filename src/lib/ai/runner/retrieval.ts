// =============================================
// Retrieval helper para o AgentRunner.
//
// Estratégia simples: usa a última mensagem do usuário como query,
// chama `search_agent_chunks` (RPC com pgvector + HNSW), e devolve um
// bloco de contexto formatado pra injetar no prompt do system.
//
// Skip silencioso quando:
//   - Não há OPENAI_API_KEY (embeddings off)
//   - Agente não tem source com status='ready'
//   - Query vazia
//
// Limita topK=5 e threshold=0.7 por padrão. Layers podem ser passadas
// pra restringir busca (ex.: só `catalog` quando intent=produto).
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { RAGService } from '../rag'
import type { KnowledgeLayer, RAGResult } from '../types'

export interface RetrievalInput {
  agentId: string
  query: string
  topK?: number
  threshold?: number
  layers?: KnowledgeLayer[]
}

export interface RetrievalOutput {
  contextBlock: string
  results: RAGResult[]
  skipped?: 'no_key' | 'no_sources' | 'empty_query' | 'rag_error'
}

export async function retrieveRelevantChunks(
  input: RetrievalInput,
): Promise<RetrievalOutput> {
  const empty: RetrievalOutput = { contextBlock: '', results: [] }

  if (!input.query || !input.query.trim()) {
    return { ...empty, skipped: 'empty_query' }
  }

  if (!process.env.OPENAI_API_KEY) {
    return { ...empty, skipped: 'no_key' }
  }

  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('ai_agent_sources')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', input.agentId)
    .eq('status', 'ready')
  if (!count || count === 0) {
    return { ...empty, skipped: 'no_sources' }
  }

  try {
    const rag = new RAGService(process.env.OPENAI_API_KEY)
    const results = await rag.search({
      agentId: input.agentId,
      query: input.query,
      topK: input.topK ?? 5,
      threshold: input.threshold ?? 0.7,
      layers: input.layers,
    })

    if (results.length === 0) {
      return { contextBlock: '', results: [] }
    }

    const contextBlock = rag.buildContext(results)
    return { contextBlock, results }
  } catch (err) {
    console.warn('[Retrieval] RAG falhou, seguindo sem contexto:', err)
    return { ...empty, skipped: 'rag_error' }
  }
}
