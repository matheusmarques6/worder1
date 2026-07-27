/**
 * Media router — decide o que a IA faz com cada inbound do WhatsApp.
 *
 * Fonte única de verdade para:
 *   - quais message_types disparam a IA (text/audio/image; resto = fallback);
 *   - quais providers têm visão (imagem na mensagem);
 *   - qual fallback usar quando a mídia não puder ser interpretada
 *     (agent.settings.media_fallback, default seguro ask_text).
 *
 * Funções PURAS (sem IO) — consumidas por webhook-processor, pelo worker
 * whatsapp-ai-respond e pelo cloud-runner.
 */

import type { AgentSettings } from '../types'

export type AiMediaRoute = 'text' | 'audio' | 'image' | 'unsupported'

/** Providers cujos modelos de chat aceitam imagem inline (base64). */
const VISION_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'google', 'openrouter'])

export const DEFAULT_MEDIA_FALLBACK_MESSAGE =
  'Desculpe, não consegui entender sua mensagem por aqui. Pode me escrever em texto, por favor?'

export interface InboundMediaInput {
  type: 'audio' | 'image'
  mediaUrl: string | null
  storagePath: string | null
  mimeType: string | null
  caption: string | null
}

export interface ResolvedMediaFallback {
  mode: 'ask_text' | 'handoff'
  message: string
}

export function routeInboundForAi(
  messageType: string | null | undefined,
  textBody?: string | null,
): AiMediaRoute {
  const body = (textBody || '').trim()
  const type = messageType || 'text'
  if (type === 'text') return body ? 'text' : 'unsupported'
  // Áudio já transcrito (text_body preenchido pelo runner em run anterior)
  // é tratado como texto — evita re-transcrever em retries.
  if (type === 'audio') return body ? 'text' : 'audio'
  if (type === 'image') return 'image'
  return 'unsupported'
}

export function providerSupportsVision(provider: string): boolean {
  return VISION_PROVIDERS.has(provider)
}

/**
 * Monta o input de mídia do runner a partir da row de whatsapp_cloud_messages
 * (colunas media_* preenchidas pelo plano inbound-media-pipeline).
 * Null quando não há mídia utilizável.
 */
export function buildRunnerMediaInput(row: {
  message_type?: string | null
  media_url?: string | null
  media_storage_path?: string | null
  media_mime_type?: string | null
  caption?: string | null
}): InboundMediaInput | null {
  const type = row.message_type
  if (type !== 'audio' && type !== 'image') return null
  if (!row.media_url && !row.media_storage_path) return null
  return {
    type,
    mediaUrl: row.media_url ?? null,
    storagePath: row.media_storage_path ?? null,
    mimeType: row.media_mime_type ?? null,
    caption: row.caption ?? null,
  }
}

export function resolveMediaFallback(
  settings: AgentSettings | null | undefined,
): ResolvedMediaFallback {
  const raw = settings?.media_fallback
  const mode = raw?.mode === 'handoff' ? 'handoff' : 'ask_text'
  const message = (raw?.message || '').trim() || DEFAULT_MEDIA_FALLBACK_MESSAGE
  return { mode, message }
}
