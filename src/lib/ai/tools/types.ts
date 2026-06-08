// =====================================================
// TOOL-CALLING — TIPOS BASE (Fase 2b / P2)
// =====================================================
// Contratos provider-agnósticos para tool-calling. O loop (loop.ts) converte
// estes Tool[] para o formato de cada provedor (Anthropic / OpenAI-compat /
// Gemini) e executa os handlers passando o ToolContext.

/**
 * Definição declarativa de uma ferramenta que a IA pode invocar.
 * `inputSchema` é um JSON Schema (object) — convertido por loop.ts para o
 * formato de tool/function de cada provedor.
 */
export interface Tool {
  name: string
  description: string
  /** JSON Schema do tipo object (properties / required / ...). */
  inputSchema: Record<string, any>
  handler: (ctx: ToolContext, args: any) => Promise<ToolResultPayload>
}

/**
 * Contexto multi-tenant repassado a TODO handler. `organizationId` é
 * obrigatório e DEVE ser usado em toda query (ver tools/db.ts).
 */
export interface ToolContext {
  organizationId: string
  conversationId: string
  contactId?: string
  phone: string
  storeId?: string
  accountId: string
  agentId: string
}

/**
 * Resultado padronizado de um handler.
 * - `ok`: sucesso lógico do handler (não confundir com erro de transporte).
 * - `data`: payload serializável devolvido ao LLM como tool_result.
 * - `error`: mensagem curta quando `ok=false`.
 * - `control`: sinais de controle do loop (encerrar / transferir).
 */
export interface ToolResultPayload {
  ok: boolean
  data?: any
  error?: string
  control?: {
    transfer?: boolean
    stop?: boolean
  }
}
