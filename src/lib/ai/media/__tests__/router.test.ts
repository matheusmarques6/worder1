import { describe, it, expect } from 'vitest'
import {
  routeInboundForAi,
  providerSupportsVision,
  buildRunnerMediaInput,
  resolveMediaFallback,
  DEFAULT_MEDIA_FALLBACK_MESSAGE,
} from '../router'

describe('routeInboundForAi', () => {
  it('texto com body vira text', () => {
    expect(routeInboundForAi('text', 'oi')).toBe('text')
  })
  it('texto sem body vira unsupported', () => {
    expect(routeInboundForAi('text', '')).toBe('unsupported')
    expect(routeInboundForAi('text', '   ')).toBe('unsupported')
    expect(routeInboundForAi(null, undefined)).toBe('unsupported')
  })
  it('audio sem transcript vira audio', () => {
    expect(routeInboundForAi('audio', '')).toBe('audio')
  })
  it('audio JA transcrito (retry idempotente) vira text', () => {
    expect(routeInboundForAi('audio', 'quero fazer um pedido')).toBe('text')
  })
  it('image vira image mesmo com caption', () => {
    expect(routeInboundForAi('image', '')).toBe('image')
    expect(routeInboundForAi('image', 'olha isso')).toBe('image')
  })
  it('document/sticker/location/contacts/unknown viram unsupported', () => {
    for (const t of ['document', 'sticker', 'location', 'contacts', 'video', 'unknown']) {
      expect(routeInboundForAi(t, '')).toBe('unsupported')
    }
  })
})

describe('providerSupportsVision', () => {
  it('openai/anthropic/gemini/google/openrouter suportam', () => {
    for (const p of ['openai', 'anthropic', 'gemini', 'google', 'openrouter']) {
      expect(providerSupportsVision(p)).toBe(true)
    }
  })
  it('groq/deepseek/desconhecido nao suportam', () => {
    for (const p of ['groq', 'deepseek', 'whatever']) {
      expect(providerSupportsVision(p)).toBe(false)
    }
  })
})

describe('buildRunnerMediaInput', () => {
  it('monta input para audio com storage path', () => {
    expect(
      buildRunnerMediaInput({
        message_type: 'audio',
        media_url: null,
        media_storage_path: 'org1/conv1/msg1.ogg',
        media_mime_type: 'audio/ogg',
        caption: null,
      }),
    ).toEqual({
      type: 'audio',
      mediaUrl: null,
      storagePath: 'org1/conv1/msg1.ogg',
      mimeType: 'audio/ogg',
      caption: null,
    })
  })
  it('retorna null para texto e para midia sem ponteiros', () => {
    expect(buildRunnerMediaInput({ message_type: 'text' })).toBeNull()
    expect(buildRunnerMediaInput({ message_type: 'image' })).toBeNull()
  })
  it('image com media_url e caption', () => {
    const input = buildRunnerMediaInput({
      message_type: 'image',
      media_url: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/a.jpg',
      media_mime_type: 'image/jpeg',
      caption: 'meu comprovante',
    })
    expect(input?.type).toBe('image')
    expect(input?.caption).toBe('meu comprovante')
  })
})

describe('resolveMediaFallback', () => {
  it('default seguro: ask_text com mensagem padrao', () => {
    expect(resolveMediaFallback(undefined)).toEqual({
      mode: 'ask_text',
      message: DEFAULT_MEDIA_FALLBACK_MESSAGE,
    })
    expect(resolveMediaFallback({} as any)).toEqual({
      mode: 'ask_text',
      message: DEFAULT_MEDIA_FALLBACK_MESSAGE,
    })
  })
  it('respeita handoff configurado', () => {
    expect(resolveMediaFallback({ media_fallback: { mode: 'handoff' } } as any).mode).toBe('handoff')
  })
  it('usa mensagem customizada quando informada', () => {
    const r = resolveMediaFallback({
      media_fallback: { mode: 'ask_text', message: 'Me manda em texto?' },
    } as any)
    expect(r.message).toBe('Me manda em texto?')
  })
  it('mode invalido cai no default ask_text', () => {
    expect(resolveMediaFallback({ media_fallback: { mode: 'explode' } } as any).mode).toBe('ask_text')
  })
})
