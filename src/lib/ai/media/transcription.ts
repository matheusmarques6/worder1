/**
 * Transcrição de áudio (voice notes do WhatsApp) — BYO key.
 *
 * Ordem de resolução do provider de STT (independente do provider do AGENTE):
 *   1. Chave OpenAI ativa da org  => whisper-1 (api.openai.com)
 *   2. Chave Groq ativa da org    => whisper-large-v3 (api.groq.com, formato OpenAI)
 *   3. Nenhuma                    => null (caller cai no media_fallback)
 *
 * fetch cru multipart (padrão ai-providers.ts, sem SDK). WhatsApp entrega
 * voice notes como audio/ogg (opus) — ambos endpoints aceitam.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import { decodeProviderKey } from '../provider-key-codec'

export interface SttConfig {
  provider: 'openai' | 'groq'
  apiKey: string
  model: string
}

const STT_MODELS: Record<SttConfig['provider'], string> = {
  openai: 'whisper-1',
  groq: 'whisper-large-v3',
}

const STT_ENDPOINTS: Record<SttConfig['provider'], string> = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
}

const STT_PROVIDER_PRIORITY: SttConfig['provider'][] = ['openai', 'groq']

/** Pura: escolhe a chave STT a partir das rows de organization_api_keys. */
export function pickSttKey(
  rows: Array<{ provider: string; api_key: string }>,
): SttConfig | null {
  for (const provider of STT_PROVIDER_PRIORITY) {
    const row = rows.find((r) => r.provider === provider && r.api_key)
    if (row) {
      return { provider, apiKey: decodeProviderKey(row.api_key), model: STT_MODELS[provider] }
    }
  }
  return null
}

export async function resolveSttConfig(organizationId: string): Promise<SttConfig | null> {
  const { data } = await supabaseAdmin
    .from('organization_api_keys')
    .select('provider, api_key')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('provider', STT_PROVIDER_PRIORITY)
  return pickSttKey(data || [])
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  return 'ogg'
}

export async function transcribeAudio(params: {
  config: SttConfig
  audio: Buffer
  mimeType: string
}): Promise<string> {
  const { config, audio, mimeType } = params

  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    `audio.${extensionForMime(mimeType)}`,
  )
  form.append('model', config.model)

  const response = await fetch(STT_ENDPOINTS[config.provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `${config.provider} transcription error`)
  }

  return (data.text || '').trim()
}
