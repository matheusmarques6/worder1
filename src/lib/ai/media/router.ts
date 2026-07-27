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

import type { AgentSettings, EngineMessage } from '../types'
import type { AIMessageImage } from '@/lib/whatsapp/ai-providers'

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

/**
 * Vision gate: só vale a pena baixar os bytes da imagem (download + base64
 * no payload do LLM) quando existe mídia utilizável E o provider do agente
 * aceita imagem inline. Pura — usada pelo cloud-runner ANTES de chamar
 * fetchInboundMedia (evita I/O desnecessário p/ Groq/DeepSeek) e serve como
 * o gate testável: nenhum provider sem visão recebe bytes de imagem.
 */
export function shouldFetchImageBytes(
  provider: string,
  media: InboundMediaInput | null | undefined,
): boolean {
  return Boolean(media) && providerSupportsVision(provider)
}

/**
 * Garante que a mensagem do turno atual esteja no fim do histórico como
 * 'user' — sem duplicar quando a MESMA linha do banco já virou um
 * placeholder de mídia sem texto (ex.: `[Cliente enviou uma imagem: ...]`).
 *
 * Isso importa sobretudo para imagem: diferente do áudio (que persiste o
 * transcript em text_body ANTES de montar o histórico, então a própria
 * query já traz o texto certo), a imagem nunca é persistida de volta —
 * então a última linha do histórico ainda aparece como placeholder mesmo
 * quando o runner degradou para caption/texto puro (sem visão ou sem
 * bytes). Sem este pop, o modelo veria o mesmo turno duas vezes: uma vez
 * como placeholder e outra como o texto/caption.
 *
 * Pura — usada pelo cloud-runner logo após montar `history` a partir das
 * linhas do banco (com placeholders já aplicados).
 */
export function appendCurrentTurn(
  history: EngineMessage[],
  params: { route: AiMediaRoute; effectiveText: string; images?: AIMessageImage[] },
): EngineMessage[] {
  const { route, effectiveText, images } = params
  const next = history.slice()

  const last = next[next.length - 1]
  if (
    route === 'image' &&
    last &&
    last.role === 'user' &&
    last.content.startsWith('[Cliente enviou uma imagem')
  ) {
    next.pop()
  }

  const tail = next[next.length - 1]
  if (!tail || tail.role !== 'user' || tail.content !== effectiveText || images) {
    next.push({ role: 'user', content: effectiveText, images })
  }

  return next
}
