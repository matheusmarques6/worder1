// =============================================
// Detecção de fontes de conhecimento órfãs.
//
// Uma fonte fica presa em 'pending'/'processing' quando o trigger
// async falha sem marcar erro ou quando process/document morre no
// meio (maxDuration=60s na Vercel). Como nenhum processamento
// legítimo dura 1h, qualquer fonte nesses status há mais de 1h é
// órfã — convertida em 'error' pelo GET de sources, o que destrava
// o botão "Reprocessar" da UI.
// =============================================

export const STALE_SOURCE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hora

export const STALE_SOURCE_MESSAGE =
  'O processamento não foi concluído no tempo esperado. Clique em Reprocessar para tentar novamente.'

interface SourceLike {
  id: string
  status: string
  updated_at?: string | null
  created_at?: string | null
}

export function findStaleSourceIds(
  sources: SourceLike[],
  now: number = Date.now()
): string[] {
  return sources
    .filter((s) => {
      if (s.status !== 'pending' && s.status !== 'processing') return false
      const ref = s.updated_at || s.created_at
      if (!ref) return false
      return now - new Date(ref).getTime() > STALE_SOURCE_THRESHOLD_MS
    })
    .map((s) => s.id)
}
