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
import { saveInterestsTool } from './handlers/save_interests'
import { timelineTool } from './handlers/timeline'
import { productLookupTool } from './handlers/product_lookup'
import { orderStatusTool } from './handlers/order_status'

/** Todas as tools registradas (Fase 2b + 2c). */
export const ALL_TOOLS: Tool[] = [
  searchKnowledgeTool,
  saveCustomerTool,
  transferToHumanTool,
  // Fase 2c
  saveInterestsTool,
  timelineTool,
  productLookupTool,
  orderStatusTool,
]

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]))

/**
 * Tools que exigem loja conectada (storeId). product_lookup / order_status só
 * são expostas quando ctx.storeId está presente (Fase 2c). save_interests e
 * timeline NÃO são gated.
 */
const STORE_GATED_TOOLS = new Set<string>([
  productLookupTool.name,
  orderStatusTool.name,
])

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
