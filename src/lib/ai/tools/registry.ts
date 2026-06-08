// =====================================================
// REGISTRY DE TOOLS (Fase 2b / P2)
// =====================================================
// ALL_TOOLS lista as tools disponíveis (só as 3 desta fase). getActiveTools lê
// ai_agents.settings.tools.enabled (array de nomes; default ausente = []) e
// devolve apenas as habilitadas. Ponto de extensão para gating por storeId já
// previsto (product/order entram na 2c).

import type { Tool, ToolContext } from './types'
import { searchKnowledgeTool } from './handlers/search_knowledge'
import { saveCustomerTool } from './handlers/save_customer'
import { transferToHumanTool } from './handlers/transfer_to_human'

/** Todas as tools registradas nesta fase. */
export const ALL_TOOLS: Tool[] = [
  searchKnowledgeTool,
  saveCustomerTool,
  transferToHumanTool,
]

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]))

/**
 * Tools que exigem loja conectada (storeId). Vazio nesta fase; product_lookup /
 * order_status entram aqui na 2c. Mantido como ponto de extensão.
 */
const STORE_GATED_TOOLS = new Set<string>([])

/**
 * Resolve as tools ativas para um agente dado o contexto da conversa.
 * - Lê settings.tools.enabled (array de nomes). Ausente => [].
 * - Filtra tools desconhecidas.
 * - Remove tools store-gated quando não há ctx.storeId (extensão p/ 2c).
 */
export function getActiveTools(
  agent: { settings?: { tools?: { enabled?: string[] } } } | null | undefined,
  ctx: Pick<ToolContext, 'storeId'>,
): Tool[] {
  const enabled = agent?.settings?.tools?.enabled
  if (!Array.isArray(enabled) || enabled.length === 0) {
    return []
  }

  const result: Tool[] = []
  for (const name of enabled) {
    const tool = TOOLS_BY_NAME.get(name)
    if (!tool) continue
    if (STORE_GATED_TOOLS.has(name) && !ctx.storeId) continue
    result.push(tool)
  }
  return result
}
