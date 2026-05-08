// =============================================
// Tipos do registro de ferramentas (F2.7).
//
// Uma "tool" é uma função que o LLM pode pedir pra executar durante uma
// conversa: transferir pra humano, gerar cupom, buscar produto, salvar
// dado do lead, etc. Cada ferramenta tem:
//   - definition: schema OpenAI/Anthropic compatível pra o LLM enxergar.
//   - handler: função TS que executa a chamada e retorna resultado.
//
// O AgentRunner roda um tool-loop: se a resposta do LLM contém tool_calls,
// executa cada uma, anexa os resultados como mensagens role=tool, e chama
// o LLM de novo. Limite de N iterações pra evitar loop infinito.
// =============================================

export interface ToolContext {
  organizationId: string
  conversationId: string
  agentId: string
  contactId?: string | null
  phoneNumber?: string | null
  config: Record<string, unknown>
}

export interface ToolHandlerResult {
  ok: boolean
  data?: unknown
  error?: string
  // Sinais para o runner:
  shouldStop?: boolean // true = não chame mais o LLM, encerre a turn
  outcome?: 'transferred' | 'converted' | 'escalated'
}

export interface ToolDefinition {
  /** identificador único do tipo de ferramenta (ai_agent_tools.tool_type) */
  type: string
  /** nome usado pelo LLM (function calling) — pode ser igual ao type */
  name: string
  description: string
  /** JSON Schema dos parâmetros da função (compatível com OpenAI tool calls) */
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  /** handler que executa a chamada com os args parseados */
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolHandlerResult>
}

export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolCallExecution {
  toolCallId: string
  toolType: string
  args: Record<string, unknown>
  result: ToolHandlerResult
  durationMs: number
}
