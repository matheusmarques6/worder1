import { describe, it, expect } from 'vitest'
import {
  routeInboundForAi,
  providerSupportsVision,
  buildRunnerMediaInput,
  resolveMediaFallback,
  shouldFetchImageBytes,
  appendCurrentTurn,
  DEFAULT_MEDIA_FALLBACK_MESSAGE,
  type InboundMediaInput,
} from '../router'
import type { EngineMessage } from '../../types'

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

describe('shouldFetchImageBytes (vision gate)', () => {
  const media: InboundMediaInput = {
    type: 'image',
    mediaUrl: 'https://x.supabase.co/storage/v1/object/public/whatsapp-media/a.jpg',
    storagePath: null,
    mimeType: 'image/jpeg',
    caption: null,
  }

  it('providers com visao (openai/anthropic/gemini/google/openrouter) baixam bytes quando ha midia', () => {
    for (const p of ['openai', 'anthropic', 'gemini', 'google', 'openrouter']) {
      expect(shouldFetchImageBytes(p, media)).toBe(true)
    }
  })

  it('groq/deepseek (sem visao) NUNCA baixam bytes, mesmo com midia disponivel', () => {
    for (const p of ['groq', 'deepseek']) {
      expect(shouldFetchImageBytes(p, media)).toBe(false)
    }
  })

  it('sem midia (null/undefined), nao baixa bytes mesmo com provider de visao', () => {
    expect(shouldFetchImageBytes('openai', null)).toBe(false)
    expect(shouldFetchImageBytes('openai', undefined)).toBe(false)
  })
})

describe('appendCurrentTurn', () => {
  it('conversa so-texto: comportamento identico ao antigo (sem placeholder, sem duplicar)', () => {
    const history: EngineMessage[] = [{ role: 'assistant', content: 'oi, tudo bem?' }]
    const result = appendCurrentTurn(history, { route: 'text', effectiveText: 'quero comprar' })
    expect(result).toEqual([
      { role: 'assistant', content: 'oi, tudo bem?' },
      { role: 'user', content: 'quero comprar', images: undefined },
    ])
  })

  it('nao duplica quando a ultima linha ja e exatamente a mensagem atual', () => {
    const history: EngineMessage[] = [{ role: 'user', content: 'quero comprar' }]
    const result = appendCurrentTurn(history, { route: 'text', effectiveText: 'quero comprar' })
    expect(result).toHaveLength(1)
  })

  it('imagem com visao: substitui o placeholder por UM turno com as imagens (nao duplica)', () => {
    const history: EngineMessage[] = [
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: '[Cliente enviou uma imagem: olha isso]' },
    ]
    const images = [{ mimeType: 'image/jpeg', base64: 'AAA' }]
    const result = appendCurrentTurn(history, {
      route: 'image',
      effectiveText: 'olha isso',
      images,
    })
    expect(result).toEqual([
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: 'olha isso', images },
    ])
  })

  // Fix (review Task 6, Important #3): imagem+caption SEM visao (ou sem bytes)
  // degrada para texto puro — antes disso, o placeholder ficava e o caption
  // era empilhado por cima, criando DOIS turnos de user pro mesmo inbound.
  it('imagem+caption sem visao/sem bytes: exatamente UM turno de user com o caption (sem duplicar o placeholder)', () => {
    const history: EngineMessage[] = [
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: '[Cliente enviou uma imagem: minha duvida]' },
    ]
    const result = appendCurrentTurn(history, {
      route: 'image',
      effectiveText: 'minha duvida',
      images: undefined,
    })
    expect(result).toEqual([
      { role: 'assistant', content: 'oi!' },
      { role: 'user', content: 'minha duvida', images: undefined },
    ])
  })

  it('imagem sem caption (placeholder generico) sem visao: substitui pelo texto padrao, UM turno so', () => {
    const history: EngineMessage[] = [{ role: 'user', content: '[Cliente enviou uma imagem]' }]
    const result = appendCurrentTurn(history, {
      route: 'image',
      effectiveText: 'O cliente enviou esta imagem.',
      images: undefined,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      role: 'user',
      content: 'O cliente enviou esta imagem.',
      images: undefined,
    })
  })

  // Fix (review Task 6/7, Finding 2 IMPORTANT): dado real de producao — o
  // webhook-processor grava a caption tambem em text_body, entao a query de
  // historico (cloud-runner) NUNCA monta o placeholder `[Cliente enviou uma
  // imagem...]` pra ESTA linha (body ja vem preenchido) — o tail do historico
  // e a propria caption como texto puro. Sem o fix, appendCurrentTurn
  // empilhava um SEGUNDO turno 'user' (o mesmo texto, agora com imagens),
  // duplicando o turno pro LLM. Cobre exatamente essa forma de historico.
  it('happy path de producao (imagem+caption, SEM placeholder pq webhook grava caption em text_body): substitui o tail em vez de duplicar', () => {
    const history: EngineMessage[] = [
      { role: 'assistant', content: 'oi! como posso ajudar?' },
      { role: 'user', content: 'meu comprovante' }, // linha da PROPRIA imagem atual, ja como texto puro
    ]
    const images = [{ mimeType: 'image/jpeg', base64: 'BBB' }]
    const result = appendCurrentTurn(history, {
      route: 'image',
      effectiveText: 'meu comprovante',
      images,
    })
    expect(result).toEqual([
      { role: 'assistant', content: 'oi! como posso ajudar?' },
      { role: 'user', content: 'meu comprovante', images },
    ])
    expect(result).toHaveLength(2)
    expect(result.filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('placeholder de audio nao e afetado pela logica de imagem (route text/audio ja transcrito nao mexe no placeholder)', () => {
    const history: EngineMessage[] = [
      { role: 'user', content: '[Cliente enviou um áudio sem transcrição]' },
    ]
    // Simula um audio NOVO (route='audio' so ocorre antes da transcricao ter
    // sucesso; apos sucesso o runner ja roteia como 'text' pq persistiu no
    // banco). Aqui validamos que appendCurrentTurn so faz pop de placeholder
    // de IMAGEM — o de audio permanece no historico (empilha um novo turno).
    const result = appendCurrentTurn(history, { route: 'text', effectiveText: 'quero um produto' })
    expect(result).toEqual([
      { role: 'user', content: '[Cliente enviou um áudio sem transcrição]' },
      { role: 'user', content: 'quero um produto', images: undefined },
    ])
  })
})
