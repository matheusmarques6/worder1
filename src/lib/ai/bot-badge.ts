// =============================================
// Fix round 1 do item 37 (auditoria 28/08), achado 1 — o badge "Bot
// Ativo/Off" do cabecalho do chat (ChatPanel.tsx).
//
// `aiStatus` (resolveConversationAiStatus, via /ai-status) e null em TRES
// casos: o fetch ainda nao voltou, o fetch falhou, ou a conversa nao tem
// espelho cloud pra calcular (Evolution). Nos tres, o componente nao SABE
// se o agente vai responder — e "nao sei" nao pode renderizar como "Ativo".
// Extraido pra fora do componente pra poder testar sem jsdom/RTL (nenhum
// dos dois esta no projeto), no mesmo desenho de disabled-reasons.ts.
// =============================================

export interface BotAiStatus {
  willRespond: boolean
  label: string
  detail?: string
}

export type BotBadgeVariant = 'off' | 'unknown' | 'blocked' | 'active'

/** off/unknown pintam neutro (nao afirmam atividade); blocked avisa; active confirma. */
export function botBadgeVariant(
  isBotActive: boolean,
  aiStatus: BotAiStatus | null,
): BotBadgeVariant {
  if (!isBotActive) return 'off'
  if (!aiStatus) return 'unknown'
  return aiStatus.willRespond ? 'active' : 'blocked'
}

export function botBadgeText(
  variant: BotBadgeVariant,
  aiStatus: BotAiStatus | null,
  agentName: string | null,
): string {
  switch (variant) {
    case 'off':
      return agentName ? `Agente ${agentName} Off` : 'Bot Off'
    case 'unknown':
      return agentName ? `Agente ${agentName}` : 'Bot'
    case 'blocked':
      return aiStatus?.label ?? 'Bot pausado'
    case 'active':
      return agentName ? `Agente ${agentName} Ativo` : 'Bot Ativo'
  }
}
