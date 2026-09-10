// O domínio dos links atende pelo Worder?
//
// Vem de uma falha real: click.worder.email estava configurado no Resend
// como o subdomínio de click tracking DELE. Quem atendia ali era o
// Resend, que não conhece /api/t/c/… e respondia 400 — todo clique de
// todo e-mail caía numa página de erro, e nada do lado do envio acusava.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classificarHostDeLinks } from '../tracking-host-probe'
import {
  verificarHostDeLinks,
  hostDeLinksReprovado,
  __limparCacheDoHostDeLinks,
} from '../tracking-host-probe-run'

describe('classificação do host dos links', () => {
  it('a marca do Worder é o que vale, não o 200', () => {
    expect(classificarHostDeLinks('link.loja.com', { status: 200, ehWorder: true }).ok).toBe(true)
  })

  it('responde mas não é o Worder: link morto e o motivo mais provável', () => {
    const v = classificarHostDeLinks('click.worder.email', { status: 400, ehWorder: false })
    expect(v.ok).toBe(false)
    expect(v.diagnostico).toBe('outro_servidor')
    expect(v.detalhe).toContain('provedor de envio')
    expect(v.acao).toContain('CNAME')
  })

  it('não responde: também é link morto', () => {
    const v = classificarHostDeLinks('link.loja.com', { status: null, ehWorder: false, erro: 'tempo esgotado' })
    expect(v.diagnostico).toBe('sem_resposta')
    expect(v.ok).toBe(false)
  })

  it('sem sonda, não acusa nada', () => {
    expect(classificarHostDeLinks('x.com', null)).toMatchObject({ diagnostico: 'nao_verificado', ok: true })
  })
})

describe('a sonda de verdade', () => {
  beforeEach(() => { __limparCacheDoHostDeLinks() })

  it('pergunta em /api/t/ping e aceita só a resposta do Worder', async () => {
    const fake = vi.fn(async (_url: string) => new Response(JSON.stringify({ worder: true, service: 'tracking' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fake)
    const v = await verificarHostDeLinks('https://link.loja.com')
    expect(fake.mock.calls[0]?.[0]).toBe('https://link.loja.com/api/t/ping')
    expect(v.ok).toBe(true)
  })

  it('o 400 do provedor de envio vira reprovação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))
    const v = await verificarHostDeLinks('https://click.worder.email')
    expect(v.diagnostico).toBe('outro_servidor')
  })

  it('página que responde 200 sem a marca também reprova', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>parking</html>', { status: 200 })))
    const v = await verificarHostDeLinks('https://link.loja.com')
    expect(v.ok).toBe(false)
    expect(v.diagnostico).toBe('outro_servidor')
  })

  it('o envio nunca espera: sem veredito guardado, o host configurado vale', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))
    expect(hostDeLinksReprovado('https://click.worder.email')).toBe(false)
  })

  it('depois de reprovado, o envio para de usar o host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))
    await verificarHostDeLinks('https://click.worder.email')
    expect(hostDeLinksReprovado('https://click.worder.email')).toBe(true)
  })

  it('host bom continua valendo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ worder: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })))
    await verificarHostDeLinks('https://link.loja.com')
    expect(hostDeLinksReprovado('https://link.loja.com')).toBe(false)
  })
})
