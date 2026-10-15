import { describe, expect, it } from 'vitest'
import { computeReadiness } from '../agent-readiness'
import { AGENT_TEMPLATES, findAgentTemplate } from '../agent-templates'

const base = {
  hasProviderKey: true, provider: 'openai', missionsCount: 1,
  handoffKeywords: [] as string[], handoffToolEnabled: true, entriesCount: 1,
}

describe('computeReadiness', () => {
  it('fica verde com chave, missão e caminho para humano', () => {
    expect(computeReadiness(base).ready).toBe(true)
  })

  it.each([
    ['sem chave', { hasProviderKey: false }],
    ['sem missão', { missionsCount: 0 }],
    ['sem handoff', { handoffToolEnabled: false, handoffKeywords: [] }],
  ])('bloqueia %s', (_label, over) => {
    const readiness = computeReadiness({ ...base, ...over })
    expect(readiness.ready).toBe(false)
    expect(readiness.items.filter((i) => !i.ok && i.blocking)).toHaveLength(1)
  })

  it('palavras de handoff bastam no lugar da ferramenta', () => {
    const readiness = computeReadiness({
      ...base, handoffToolEnabled: false, handoffKeywords: ['atendente'],
    })
    expect(readiness.ready).toBe(true)
  })

  it('avaliação: nunca rodada é aviso, graves bloqueiam, nota boa fica verde', () => {
    const never = computeReadiness(base)
    expect(never.items.find((i) => i.id === 'eval')).toMatchObject({ ok: false, blocking: false })
    expect(never.ready).toBe(true)
    const grave = computeReadiness({ ...base, evalScore: 90, evalGrave: 1 })
    expect(grave.ready).toBe(false)
    expect(grave.items.find((i) => i.id === 'eval')?.blocking).toBe(true)
    const good = computeReadiness({ ...base, evalScore: 83, evalGrave: 0 })
    expect(good.items.find((i) => i.id === 'eval')).toMatchObject({ ok: true })
    const low = computeReadiness({ ...base, evalScore: 50, evalGrave: 0 })
    expect(low.ready).toBe(true)
    expect(low.items.find((i) => i.id === 'eval')?.detail).toMatch(/abaixo de 70/)
  })

  it('entrada ausente é aviso, não bloqueio', () => {
    const readiness = computeReadiness({ ...base, entriesCount: 0 })
    expect(readiness.ready).toBe(true)
    expect(readiness.items.find((i) => i.id === 'entry')).toMatchObject({ ok: false, blocking: false })
  })
})

describe('AGENT_TEMPLATES', () => {
  it('todo modelo tem handoff e ao menos uma família de missão', () => {
    for (const t of AGENT_TEMPLATES) {
      expect(t.tools).toContain('transfer_to_human')
      expect(t.mission_families.length).toBeGreaterThan(0)
      expect(t.system_prompt.length).toBeGreaterThan(20)
    }
  })

  it('findAgentTemplate aceita só ids conhecidos', () => {
    expect(findAgentTemplate('vendas-whatsapp')?.role).toBe('Vendas no WhatsApp')
    expect(findAgentTemplate('nope')).toBeNull()
    expect(findAgentTemplate(undefined)).toBeNull()
  })
})
