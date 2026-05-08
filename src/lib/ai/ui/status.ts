// =============================================
// Helpers de UI compartilhados pelo módulo /ai.
// Pílula de status do agente alinhada à paleta Worder (orange + zinc).
// =============================================

import type { AgentStatus } from '@/lib/ai/types'

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  draft: 'Rascunho',
  simulating: 'Simulando',
  published: 'Publicado',
  paused: 'Pausado',
  archived: 'Arquivado',
}

// Paleta deliberadamente sóbria: orange só pra "publicado" (estado positivo
// principal). Demais estados em variações de zinc + pequena marca de cor.
export const AGENT_STATUS_PILL_CLASS: Record<AgentStatus, string> = {
  draft:
    'bg-zinc-100 text-zinc-600 border border-zinc-200',
  simulating:
    'bg-zinc-50 text-zinc-700 border border-zinc-200',
  published:
    'bg-orange-50 text-orange-700 border border-orange-200',
  paused:
    'bg-zinc-100 text-zinc-500 border border-zinc-200',
  archived:
    'bg-zinc-50 text-zinc-400 border border-zinc-200',
}

export function statusPillClass(status: AgentStatus): string {
  return AGENT_STATUS_PILL_CLASS[status] ?? AGENT_STATUS_PILL_CLASS.draft
}

export function statusLabel(status: AgentStatus): string {
  return AGENT_STATUS_LABEL[status] ?? status
}
