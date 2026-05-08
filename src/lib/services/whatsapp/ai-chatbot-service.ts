// =============================================
// DEPRECATED — Sucessor: src/lib/ai/runner (AgentRunner) chamado pelo
// worker /api/workers/ai-respond. Será removido após F1.
// Mantido como stub para preservar imports dinâmicos existentes.
// =============================================

import type { Conversation, ServiceResult } from './types'

export async function processWithAI(
  _conversation: Conversation,
  _incomingMessage: string,
  _organizationId: string
): Promise<ServiceResult<{ response?: string; shouldHandoff: boolean; reason?: string }>> {
  return { data: { shouldHandoff: false, reason: 'legacy_chatbot_disabled' } }
}

export async function getCopilotSuggestion(
  _conversationId: string,
  _organizationId: string,
  _userMessage: string
): Promise<ServiceResult<{ suggestion: string }>> {
  return { error: 'legacy_copilot_disabled' }
}

export async function handleAIResponse(
  _conversationId: string,
  _organizationId: string,
  _instanceId: string,
  _contactPhone: string,
  _incomingMessage: string
): Promise<void> {
  // No-op. F1 substitui pelo pipeline buffer → AgentRunner → sender.
}
