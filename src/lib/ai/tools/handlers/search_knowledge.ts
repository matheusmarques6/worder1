// =====================================================
// TOOL: search_knowledge — RAG sob demanda (Fase 2b)
// =====================================================
// Versão SOB DEMANDA da base de conhecimento: a IA chama esta tool quando
// precisa consultar políticas/descrições/FAQ (conhecimento não-estruturado),
// em vez de pré-injetar o RAG em todo turno. Reusa rag.ts (embedding da query
// -> RPC search_agent_knowledge), retornando trechos com a fonte.

import type { Tool, ToolContext, ToolResultPayload } from '../types'
import { createRAGServiceForOrg } from '../../rag'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export const searchKnowledgeTool: Tool = {
  name: 'search_knowledge',
  description:
    'Busca na base de conhecimento do negócio (políticas, FAQ, descrições, ' +
    'documentos) por trechos relevantes para responder a pergunta do cliente. ' +
    'Use sempre que precisar de informação específica do negócio que você não ' +
    'tem certeza. Retorna trechos com a respectiva fonte.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'A pergunta ou termo a buscar na base de conhecimento, em linguagem natural.',
      },
    },
    required: ['query'],
  },
  async handler(ctx: ToolContext, args: { query?: string }): Promise<ToolResultPayload> {
    const query = (args?.query || '').trim()
    if (!query) {
      return { ok: false, error: 'query vazia' }
    }

    try {
      const rag = await createRAGServiceForOrg(
        supabaseAdmin as unknown as SupabaseClient,
        ctx.organizationId
      )
      if (!rag) {
        return {
          ok: false,
          error: 'knowledge base indisponivel (chave OpenAI nao cadastrada na org)',
        }
      }
      const results = await rag.search({
        agentId: ctx.agentId,
        query,
        topK: 5,
        threshold: 0.7,
      })

      if (!results || results.length === 0) {
        return {
          ok: true,
          data: {
            found: false,
            message: 'Nenhum trecho relevante encontrado na base de conhecimento.',
            chunks: [],
          },
        }
      }

      return {
        ok: true,
        data: {
          found: true,
          chunks: results.map((r) => ({
            source: r.source_name,
            content: r.content,
            similarity: Number(r.similarity?.toFixed?.(3) ?? r.similarity),
          })),
        },
      }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'erro na busca de conhecimento' }
    }
  },
}
