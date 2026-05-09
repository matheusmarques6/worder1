// =============================================
// Multimodal handlers — transcrevem audio/imagem/documento pra texto
// antes do AgentRunner consumir. Cada handler é stateless: recebe URL +
// mime, devolve { content, metadata, kind }.
//
// Provedores:
//   - Audio: OpenAI Whisper (whisper-1) — formato robusto e barato.
//   - Image: Claude Vision via OpenRouter — modelo do agente já conhece.
//   - Document (PDF/DOCX): Gemini 1.5 Flash via OpenRouter quando
//     disponível; fallback pra OpenAI gpt-4o.
//
// Skip silencioso quando OPENROUTER_API_KEY ou OPENAI_API_KEY ausente —
// retorna placeholder textual pra não quebrar o fluxo.
// =============================================

import OpenAI from 'openai'

export interface MultimodalInput {
  mediaUrl: string
  mimeType: string | null
  filename?: string | null
}

export interface MultimodalOutput {
  content: string
  metadata: Record<string, unknown>
  kind: 'audio' | 'image' | 'document' | 'unsupported' | 'skipped'
}

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (openaiClient) return openaiClient
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openaiClient
}

let openrouterClient: OpenAI | null = null
function getOpenRouter(): OpenAI | null {
  if (!process.env.OPENROUTER_API_KEY) return null
  if (openrouterClient) return openrouterClient
  openrouterClient = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  })
  return openrouterClient
}

const VISION_MODEL = process.env.AI_VISION_MODEL || 'anthropic/claude-haiku-4-5'
const DOC_MODEL = process.env.AI_DOC_MODEL || 'google/gemini-2.0-flash-exp:free'

function detectKind(mime: string | null): 'audio' | 'image' | 'document' | 'unsupported' {
  if (!mime) return 'unsupported'
  const m = mime.toLowerCase()
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('image/')) return 'image'
  if (m === 'application/pdf' || m.includes('document') || m.includes('msword')) return 'document'
  return 'unsupported'
}

async function fetchAsBuffer(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  const ab = await res.arrayBuffer()
  return {
    buffer: Buffer.from(ab),
    mime: res.headers.get('content-type') || 'application/octet-stream',
  }
}

export async function transcribeAudio(input: MultimodalInput): Promise<MultimodalOutput> {
  const oai = getOpenAI()
  if (!oai) {
    return {
      content: '[áudio recebido — transcrição indisponível: OPENAI_API_KEY ausente]',
      metadata: { reason: 'no_key' },
      kind: 'skipped',
    }
  }
  try {
    const { buffer, mime } = await fetchAsBuffer(input.mediaUrl)
    const ext = mime.split('/')[1]?.split(';')[0] || 'ogg'
    const u8 = new Uint8Array(buffer)
    const file = new File([u8], input.filename || `audio.${ext}`, { type: mime })
    const transcription = await oai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    })
    return {
      content: transcription.text.trim(),
      metadata: {
        provider: 'openai',
        model: 'whisper-1',
        original_mime: input.mimeType,
      },
      kind: 'audio',
    }
  } catch (err) {
    return {
      content: `[áudio recebido — falha na transcrição: ${
        err instanceof Error ? err.message : 'erro'
      }]`,
      metadata: { error: err instanceof Error ? err.message : 'unknown' },
      kind: 'skipped',
    }
  }
}

export async function describeImage(input: MultimodalInput): Promise<MultimodalOutput> {
  const or = getOpenRouter()
  if (!or) {
    return {
      content: '[imagem recebida — descrição indisponível]',
      metadata: { reason: 'no_key' },
      kind: 'skipped',
    }
  }
  try {
    const completion = await or.chat.completions.create({
      model: VISION_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Descreva o conteúdo desta imagem em uma a três frases curtas em português. Foque em informações úteis pra um atendente: produto, problema, documento, captura de tela, etc.',
            },
            { type: 'image_url', image_url: { url: input.mediaUrl } },
          ] as any,
        },
      ],
    })
    return {
      content: completion.choices[0]?.message?.content?.trim() ?? '[imagem sem descrição]',
      metadata: { provider: 'openrouter', model: VISION_MODEL },
      kind: 'image',
    }
  } catch (err) {
    return {
      content: `[imagem recebida — falha na descrição: ${
        err instanceof Error ? err.message : 'erro'
      }]`,
      metadata: { error: err instanceof Error ? err.message : 'unknown' },
      kind: 'skipped',
    }
  }
}

export async function summarizeDocument(input: MultimodalInput): Promise<MultimodalOutput> {
  const or = getOpenRouter()
  if (!or) {
    return {
      content: `[documento recebido${input.filename ? `: ${input.filename}` : ''} — leitura indisponível]`,
      metadata: { reason: 'no_key' },
      kind: 'skipped',
    }
  }
  try {
    const completion = await or.chat.completions.create({
      model: DOC_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Leia o documento e resuma em até 5 bullets curtos em português. Inclua identificadores (nome do cliente, número de pedido, valor, data) se aparecerem. Filename: ${
                input.filename ?? 'desconhecido'
              }`,
            },
            { type: 'image_url', image_url: { url: input.mediaUrl } },
          ] as any,
        },
      ],
    })
    return {
      content: completion.choices[0]?.message?.content?.trim() ?? '[documento sem leitura]',
      metadata: { provider: 'openrouter', model: DOC_MODEL, filename: input.filename },
      kind: 'document',
    }
  } catch (err) {
    return {
      content: `[documento recebido — falha na leitura: ${
        err instanceof Error ? err.message : 'erro'
      }]`,
      metadata: { error: err instanceof Error ? err.message : 'unknown' },
      kind: 'skipped',
    }
  }
}

/** Roteador: dado mime + url, escolhe o handler certo. */
export async function processMedia(input: MultimodalInput): Promise<MultimodalOutput> {
  const kind = detectKind(input.mimeType)
  if (kind === 'audio') return transcribeAudio(input)
  if (kind === 'image') return describeImage(input)
  if (kind === 'document') return summarizeDocument(input)
  return {
    content: `[mídia recebida (${input.mimeType ?? 'tipo desconhecido'})]`,
    metadata: { mime: input.mimeType },
    kind: 'unsupported',
  }
}
