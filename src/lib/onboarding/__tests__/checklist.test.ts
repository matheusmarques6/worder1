import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildChecklist, type OnboardingFacts } from '../checklist'

const zero: OnboardingFacts = {
  hasStore: false, embedActive: false, publishedPopups: 0,
  subscribers: 0, domainVerified: false, campaignsSent: 0, automationsActive: 0,
}
const facts = (p: Partial<OnboardingFacts> = {}): OnboardingFacts => ({ ...zero, ...p })
const byId = (c: ReturnType<typeof buildChecklist>, id: string) => c.steps.find((s) => s.id === id)!

describe('roteiro de primeiros passos', () => {
  it('quem acabou de chegar tem um único próximo passo: conectar a loja', () => {
    const c = buildChecklist(zero)
    expect(c.done).toBe(0)
    expect(c.complete).toBe(false)
    expect(c.next?.id).toBe('store')
  })

  it('cada passo é dado como feito por um fato, não por ter sido visto', () => {
    const c = buildChecklist(facts({ hasStore: true, publishedPopups: 2 }))
    expect(byId(c, 'store').done).toBe(true)
    expect(byId(c, 'popup').done).toBe(true)
    expect(byId(c, 'embed').done).toBe(false)
  })

  it('passo que depende de outro fica preso, com o nome do que falta', () => {
    const c = buildChecklist(zero)
    expect(byId(c, 'embed').blockedBy).toBe('Conecte sua loja')
    // Mandar criar popup sem loja é levar o lojista a uma tela vazia.
    expect(byId(c, 'popup').blockedBy).toBe('Ative a Worder na sua vitrine')
  })

  it('o passo se solta assim que a dependência é cumprida', () => {
    const c = buildChecklist(facts({ hasStore: true }))
    expect(byId(c, 'embed').blockedBy).toBeNull()
    expect(byId(c, 'domain').blockedBy).toBeNull()
    expect(c.next?.id).toBe('embed')
  })

  it('o próximo passo pula o que já está feito e ignora o que ainda está preso', () => {
    // Loja e domínio prontos, vitrine ainda não ativada: o próximo é a
    // vitrine, não a campanha (que depende do domínio, já pronto, mas
    // vem depois na ordem).
    const c = buildChecklist(facts({ hasStore: true, domainVerified: true }))
    expect(c.next?.id).toBe('embed')
  })

  it('com tudo feito, o roteiro se dá por encerrado', () => {
    const c = buildChecklist(facts({
      hasStore: true, embedActive: true, publishedPopups: 1,
      domainVerified: true, campaignsSent: 3, automationsActive: 1, subscribers: 40,
    }))
    expect(c.complete).toBe(true)
    expect(c.next).toBeNull()
    expect(c.progress).toBe(1)
  })

  it('todo passo tem para onde ir, e a tela existe', () => {
    for (const s of buildChecklist(zero).steps) {
      expect(s.cta.length).toBeGreaterThan(3)
      expect(s.detail.length).toBeGreaterThan(20)
      const page = join(process.cwd(), 'src', 'app', '(dashboard)', s.href, 'page.tsx')
      expect(existsSync(page), `o passo "${s.id}" aponta para ${s.href}, que não existe`).toBe(true)
    }
  })

  it('número negativo ou inválido não vira passo cumprido', () => {
    const c = buildChecklist(facts({ publishedPopups: -3, campaignsSent: Number.NaN as any }))
    expect(byId(c, 'popup').done).toBe(false)
    expect(byId(c, 'campaign').done).toBe(false)
  })
})
