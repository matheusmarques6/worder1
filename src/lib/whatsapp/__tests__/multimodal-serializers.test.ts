import { describe, it, expect } from 'vitest'
import {
  toOpenAIChatMessage,
  toAnthropicChatMessage,
  toGeminiParts,
  type AIMessage,
} from '../ai-providers'

const img = { mimeType: 'image/jpeg', base64: 'QUJD' }

describe('toOpenAIChatMessage', () => {
  it('mensagem sem imagem permanece string simples', () => {
    expect(toOpenAIChatMessage({ role: 'user', content: 'oi' })).toEqual({
      role: 'user',
      content: 'oi',
    })
  })
  it('user com imagem vira array de parts com data URL', () => {
    const m: AIMessage = { role: 'user', content: 'o que é isso?', images: [img] }
    expect(toOpenAIChatMessage(m)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'o que é isso?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
      ],
    })
  })
  it('imagem sem texto omite o part de texto', () => {
    const out = toOpenAIChatMessage({ role: 'user', content: '', images: [img] })
    expect(out.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ])
  })
  it('assistant nunca carrega imagem', () => {
    expect(toOpenAIChatMessage({ role: 'assistant', content: 'ok', images: [img] })).toEqual({
      role: 'assistant',
      content: 'ok',
    })
  })
})

describe('toAnthropicChatMessage', () => {
  it('user com imagem vira blocos image (base64) + text', () => {
    const m: AIMessage = { role: 'user', content: 'analisa', images: [img] }
    expect(toAnthropicChatMessage(m)).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
        { type: 'text', text: 'analisa' },
      ],
    })
  })
  it('sem imagem permanece string', () => {
    expect(toAnthropicChatMessage({ role: 'user', content: 'oi' })).toEqual({
      role: 'user',
      content: 'oi',
    })
  })
})

describe('toGeminiParts', () => {
  it('texto + imagem viram parts text e inline_data', () => {
    expect(toGeminiParts({ role: 'user', content: 'veja', images: [img] })).toEqual([
      { text: 'veja' },
      { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } },
    ])
  })
  it('mensagem vazia produz part de texto vazio (Gemini exige >=1 part)', () => {
    expect(toGeminiParts({ role: 'user', content: '' })).toEqual([{ text: '' }])
  })
})
