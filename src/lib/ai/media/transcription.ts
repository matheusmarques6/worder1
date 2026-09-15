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
import { AiBudgetUnavailableError, checkAiBudget } from '../budget'
import { trackAiUsage } from '../cost-tracker'
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

const STT_PRICING: Record<string, { usdPerSecond: number; minimumSeconds: number }> = {
  'openai/whisper-1': { usdPerSecond: 0.006 / 60, minimumSeconds: 0 },
  'groq/whisper-large-v3': { usdPerSecond: 0.111 / 3600, minimumSeconds: 10 },
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
  organizationId: string
  config: SttConfig
  audio: Buffer
  mimeType: string
}): Promise<string> {
  const { organizationId, config, audio, mimeType } = params

  if (!organizationId) {
    throw new Error('organizationId não informado')
  }

  const pricing = STT_PRICING[`${config.provider}/${config.model}`]
  if (!pricing) {
    throw new AiBudgetUnavailableError('unpriced_model')
  }

  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    `audio.${extensionForMime(mimeType)}`,
  )
  form.append('model', config.model)
  form.append('response_format', 'verbose_json')

  const billable = true
  await checkAiBudget(organizationId, { throwOnExceeded: true })
  let usageTracked = false

  try {
    const response = await fetch(STT_ENDPOINTS[config.provider], {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    })

    if (!response.ok) {
      // Corpo de erro nem sempre é JSON (ex.: gateway 502/504 devolvendo HTML) —
      // parseia defensivamente pra nunca deixar um SyntaxError opaco escapar no
      // lugar da mensagem de erro do provider.
      let detail = `status ${response.status}`
      try {
        const errData = await response.json()
        detail = errData?.error?.message || detail
      } catch {
        try {
          const text = await response.text()
          if (text) detail = text
        } catch {
          // mantém o detail de status
        }
      }
      throw new Error(`${config.provider} transcription error: ${detail}`)
    }

    const data = await response.json()
    let durationSeconds: number | null = null
    if (typeof data.duration === 'number' && Number.isFinite(data.duration) && data.duration > 0) {
      durationSeconds = data.duration
    } else if (Array.isArray(data.segments)) {
      const segmentEnds = data.segments
        .map((segment: any) => segment?.end)
        .filter((end: unknown): end is number =>
          typeof end === 'number' && Number.isFinite(end) && end > 0,
        )
      if (segmentEnds.length > 0) durationSeconds = Math.max(...segmentEnds)
    }

    await trackAiUsage({
      organizationId,
      provider: config.provider,
      model: config.model,
      feature: 'transcription',
      success: true,
      costUsdOverride: durationSeconds === null
        ? null
        : Math.max(durationSeconds, pricing.minimumSeconds) * pricing.usdPerSecond,
      metadata: { billable },
    })
    usageTracked = true

    return (data.text || '').trim()
  } catch (error) {
    if (!usageTracked) {
      await trackAiUsage({
        organizationId,
        provider: config.provider,
        model: config.model,
        feature: 'transcription',
        success: false,
        costUsdOverride: null,
        metadata: { billable },
      })
    }
    throw error
  }
}
