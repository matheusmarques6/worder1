import { describe, it, expect } from 'vitest'
import {
  collectConsentBlocks,
  resolveConsentDecisions,
  stripConsentHtml,
  hashConsentText,
  consentInputName,
  countryFromHeaders,
  deviceClassFromUserAgent,
} from '../consent'

const block = (id: string, props: Record<string, unknown>) => ({ id, type: 'legal-consent', props })

describe('consentimento por canal', () => {
  it('um bloco sem channels cobre só e-mail', () => {
    const [b] = collectConsentBlocks([block('c1', { text: 'Aceito' })])
    expect(b.channels).toEqual(['email'])
    expect(b.required).toBe(true)
  })

  it('canais inválidos são ignorados; lista vazia volta para e-mail', () => {
    const [b] = collectConsentBlocks([block('c1', { text: 'x', channels: ['fax', 'WHATSAPP', 'sms', 'sms'] })])
    expect(b.channels).toEqual(['whatsapp', 'sms'])
    const [c] = collectConsentBlocks([block('c2', { text: 'x', channels: ['pombo'] })])
    expect(c.channels).toEqual(['email'])
  })

  it('cada bloco decide pelo seu input; o contrato antigo (consent) vale só para o primeiro', () => {
    const blocks = collectConsentBlocks([
      block('c1', { text: 'e-mail', channels: ['email'] }),
      block('c2', { text: 'zap', channels: ['whatsapp'] }),
    ])
    const d = resolveConsentDecisions(blocks, { consent: 'on' })
    expect(d.find((x) => x.channel === 'email')?.checked).toBe(true)
    expect(d.find((x) => x.channel === 'whatsapp')?.checked).toBe(false)

    const d2 = resolveConsentDecisions(blocks, { [consentInputName('c2')]: 'on' })
    expect(d2.find((x) => x.channel === 'email')?.checked).toBe(false)
    expect(d2.find((x) => x.channel === 'whatsapp')?.checked).toBe(true)
  })

  it('um canal citado em dois blocos só é concedido com os dois marcados', () => {
    const blocks = collectConsentBlocks([
      block('a', { text: '1', channels: ['email'] }),
      block('b', { text: '2', channels: ['email', 'sms'] }),
    ])
    const d = resolveConsentDecisions(blocks, { consent__a: 'on' })
    expect(d.find((x) => x.channel === 'email')?.checked).toBe(false)
    expect(d.find((x) => x.channel === 'sms')?.checked).toBe(false)
    const d2 = resolveConsentDecisions(blocks, { consent__a: 'on', consent__b: 'on' })
    expect(d2.every((x) => x.checked)).toBe(true)
  })

  it('"false", "0" e "off" não são consentimento', () => {
    const blocks = collectConsentBlocks([block('a', { text: '1' })])
    for (const v of ['false', '0', 'off', '', null, undefined]) {
      expect(resolveConsentDecisions(blocks, { consent__a: v })[0].checked).toBe(false)
    }
    expect(resolveConsentDecisions(blocks, { consent__a: 'on' })[0].checked).toBe(true)
  })

  it('o texto guardado é o que a pessoa leu, sem HTML, e o hash é estável', () => {
    const t = stripConsentHtml('Aceito receber <a href="/x">ofertas</a>&nbsp;da   loja.<br>Posso sair.')
    expect(t).toBe('Aceito receber ofertas da loja. Posso sair.')
    expect(hashConsentText(t)).toBe(hashConsentText(t))
    expect(hashConsentText(t)).toHaveLength(64)
  })

  it('nome do input é seguro para atributo HTML', () => {
    expect(consentInputName('ab c"<>')).toBe('consent__abc')
  })
})

describe('contexto da captura', () => {
  const h = (map: Record<string, string>) => ({ get: (k: string) => map[k.toLowerCase()] ?? null })

  it('país vem da borda, em duas letras, ou nada', () => {
    expect(countryFromHeaders(h({ 'x-vercel-ip-country': 'br' }))).toBe('BR')
    expect(countryFromHeaders(h({ 'cf-ipcountry': 'PT' }))).toBe('PT')
    expect(countryFromHeaders(h({ 'x-vercel-ip-country': 'XX' }))).toBeNull()
    expect(countryFromHeaders(h({ 'x-vercel-ip-country': 'Brasil' }))).toBeNull()
    expect(countryFromHeaders(h({}))).toBeNull()
  })

  it('classe do dispositivo pelo user-agent', () => {
    expect(deviceClassFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile')
    expect(deviceClassFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet')
    expect(deviceClassFromUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit')).toBe('tablet')
    expect(deviceClassFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('mobile')
    expect(deviceClassFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop')
    expect(deviceClassFromUserAgent(null)).toBeNull()
  })
})
