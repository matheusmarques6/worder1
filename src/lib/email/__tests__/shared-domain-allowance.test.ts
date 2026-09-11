import { describe, it, expect } from 'vitest'
import { evaluateSharedAllowance } from '../shared-domain-allowance'

const SHARED = 'loja@worder.email'
const OWN = 'contato@sualoja.com.br'

describe('franquia do domínio compartilhado', () => {
  it('domínio próprio não tem franquia: a reputação passa a ser do lojista', () => {
    const v = evaluateSharedAllowance({ fromEmail: OWN, sentInWindow: 999999, aboutToSend: 50000 })
    expect(v).toMatchObject({ allowed: true, onSharedDomain: false })
    expect(v.remaining).toBe(Infinity)
  })

  it('dentro da franquia, envia', () => {
    const v = evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: 200, aboutToSend: 300, allowance: 1000 })
    expect(v).toMatchObject({ allowed: true, onSharedDomain: true, used: 200, remaining: 800 })
    expect(v.reason).toBeNull()
  })

  it('a campanha que ESTOURA a franquia é barrada antes de sair, não no meio', () => {
    const v = evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: 900, aboutToSend: 300, allowance: 1000 })
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('300')
    expect(v.reason).toContain('100')
    expect(v.reason).toContain('domínio da sua loja')
  })

  it('franquia esgotada: a mensagem diz o limite e a janela, não um número solto', () => {
    const v = evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: 1200, aboutToSend: 1, allowance: 1000 })
    expect(v.allowed).toBe(false)
    expect(v.remaining).toBe(0)
    expect(v.reason).toContain('1.000')
    expect(v.reason).toContain('30 dias')
  })

  it('exatamente no limite ainda passa', () => {
    expect(evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: 700, aboutToSend: 300, allowance: 1000 }).allowed).toBe(true)
    expect(evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: 700, aboutToSend: 301, allowance: 1000 }).allowed).toBe(false)
  })

  it('sem remetente resolvido, não bloqueia: quem decide isso é a verificação de domínio', () => {
    expect(evaluateSharedAllowance({ fromEmail: null, sentInWindow: 99999, aboutToSend: 10 }).allowed).toBe(true)
    expect(evaluateSharedAllowance({ fromEmail: '', sentInWindow: 99999, aboutToSend: 10 }).onSharedDomain).toBe(false)
  })

  it('números negativos ou inválidos não viram franquia infinita', () => {
    const v = evaluateSharedAllowance({ fromEmail: SHARED, sentInWindow: -5, aboutToSend: NaN, allowance: 10 })
    expect(v.used).toBe(0)
    expect(v.allowed).toBe(true)
  })
})
