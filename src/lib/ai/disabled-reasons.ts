// =============================================
// Onda 13 / P0-3 — vocabulario canonico de ai_disabled_reason.
//
// Quem SETA cada reason:
//   manual               -> botao Bot Ativo/Off do chat (escolha do atendente)
//   no_valid_api_key     -> cloud-runner (provider do agente sem chave ativa)
//   budget_exceeded      -> cloud-runner (orcamento mensal de IA estourado)
//   ai_permanent_error   -> cloud-runner (erro permanente do provider)
//   transferred_to_human -> tool de transferencia da IA
//
// Quem RELIGA:
//   manual / transferred_to_human -> SOMENTE o botao da propria conversa
//   demais (automaticas)          -> botao da conversa OU bulk reactivate-ai
// =============================================

export const MANUAL_DISABLED_REASON = 'manual'

/** Reasons automaticas — elegiveis pro religar em massa. */
export const AUTO_DISABLED_REASONS = [
  'no_valid_api_key',
  'budget_exceeded',
  'ai_permanent_error',
] as const

/** Valores legados gravados antes da normalizacao (leitura tolerante). */
const LEGACY_MANUAL_VALUES = ['Desativado manualmente', 'manual_pause']

export const AI_DISABLED_REASON_LABELS: Record<string, string> = {
  manual: 'Desativado manualmente',
  no_valid_api_key: 'Chave de IA ausente/inválida',
  budget_exceeded: 'Orçamento de IA excedido',
  ai_permanent_error: 'Erro do provedor de IA',
  transferred_to_human: 'Transferido para atendente',
}

/** Normaliza valores legados pro vocabulario canonico. */
export function normalizeDisabledReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  if (LEGACY_MANUAL_VALUES.includes(reason)) return MANUAL_DISABLED_REASON
  return reason
}

/** Label legivel pro user; fallback no proprio valor cru. */
export function getDisabledReasonLabel(reason: string | null | undefined): string {
  const normalized = normalizeDisabledReason(reason)
  if (!normalized) return 'Desativado'
  return AI_DISABLED_REASON_LABELS[normalized] || normalized
}

/** true quando a causa e automatica (problema a resolver, candidata ao bulk). */
export function isAutoDisabledReason(reason: string | null | undefined): boolean {
  const normalized = normalizeDisabledReason(reason)
  return (AUTO_DISABLED_REASONS as readonly string[]).includes(normalized || '')
}
