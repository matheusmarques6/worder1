// =============================================
// DEPRECATED — Sem callers. Mantido vazio durante a F0 para preservar a
// estrutura de pastas em case de imports dinâmicos antigos. Remover na F1.
// Sucessor: src/lib/ai/runner (AgentRunner).
// =============================================

import type { ServiceResult } from './types'

export interface AIResponseParams {
  conversationId: string
  organizationId: string
  aiAgentId: string
  contactMessage: string
  contactName?: string
  messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export async function generateAIResponse(
  _params: AIResponseParams
): Promise<ServiceResult<{ response: string; shouldHandoff: boolean; handoffReason?: string }>> {
  return { error: 'legacy_ai_chat_service_disabled' }
}

export async function getCopilotSuggestion(
  _conversationId: string,
  _organizationId: string,
  _aiAgentId: string,
  _contactMessage: string,
  _contactName?: string
): Promise<ServiceResult<{ suggestion: string }>> {
  return { error: 'legacy_ai_chat_service_disabled' }
}

export async function processAIAutoResponse(): Promise<void> {
  // No-op
}
