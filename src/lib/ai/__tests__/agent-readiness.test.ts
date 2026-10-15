import { describe, expect, it } from 'vitest'
import { computeReadiness } from '../agent-readiness'
import { AGENT_TEMPLATES, findAgentTemplate, suggestSources, templateAreas, templateJudges, templateToolLabels } from '../agent-templates'

const base = {
  hasProviderKey: true, provider: 'openai', missionsCount: 1,
  handoffKeywords: [] as string[], handoffToolEnabled: true, entriesCount: 1,
  evalScore: 90, evalGrave: 0,
}

describe('computeReadiness', () => {
  it('fica verde com chave, missão, caminho para humano e avaliação sem Grave', () => {
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

  it('avaliação (protótipo): obrigatória; nunca rodada e Grave bloqueiam, nota baixa é aviso', () => {
    const never = computeReadiness({ ...base, evalScore: null, evalGrave: null })
    expect(never.items.find((i) => i.id === 'eval')).toMatchObject({ ok: false, blocking: true })
    expect(never.ready).toBe(false)
    const grave = computeReadiness({ ...base, evalScore: 90, evalGrave: 1 })
    expect(grave.ready).toBe(false)
    expect(grave.items.find((i) => i.id === 'eval')?.blocking).toBe(true)
    const good = computeReadiness({ ...base, evalScore: 83, evalGrave: 0 })
    expect(good.items.find((i) => i.id === 'eval')).toMatchObject({ ok: true })
    const low = computeReadiness({ ...base, evalScore: 50, evalGrave: 0 })
    expect(low.ready).toBe(true)
    expect(low.items.find((i) => i.id === 'eval')?.detail).toMatch(/abaixo de 70/)
    expect(low.items.find((i) => i.id === 'eval')?.ok).toBe(true)
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
    expect(findAgentTemplate('vendas-whatsapp')?.title).toBe('Vendas no WhatsApp')
    expect(findAgentTemplate('vendas-whatsapp')?.role).toBe('Vendas')
    expect(findAgentTemplate('nope')).toBeNull()
    expect(findAgentTemplate(undefined)).toBeNull()
  })
})

describe('áreas e cartão "O que vem pronto"', () => {
  it('conta as áreas que o modelo preenche, sem conhecimento nem motor', () => {
    for (const t of AGENT_TEMPLATES) {
      const areas = templateAreas(t)
      expect(areas).not.toContain('knowledge')
      expect(areas).not.toContain('engine')
      expect(areas).toEqual(expect.arrayContaining(['identity', 'missions', 'handoff', 'review']))
    }
    expect(templateAreas(findAgentTemplate('pos-compra')!)).toHaveLength(7)
  })

  it('ferramentas no cartão ficam sem as que todo agente tem; juízes viram critérios ativos', () => {
    const rec = findAgentTemplate('recuperacao')!
    expect(templateToolLabels(rec)).toContain('Criar cupom (só com autorização)')
    expect(templateToolLabels(rec).some((l) => /humano/i.test(l))).toBe(false)
    expect(templateJudges(rec)).toEqual([{ id: 'judge-recuperacao-1', name: expect.any(String), criterion: rec.review[0], active: true }])
  })
})

describe('suggestSources', () => {
  const sources = [
    { id: '1', kind: 'note', name: 'Política de troca' },
    { id: '2', kind: 'note', name: 'Formas de pagamento' },
    { id: '3', kind: 'catalog', name: 'Catálogo Shopify' },
    { id: '4', kind: 'note', name: 'Sobre a marca' },
  ]
  it('marca por tipo e por nome, nunca tudo', () => {
    expect(suggestSources(findAgentTemplate('pos-compra')!, sources)).toEqual(['1'])
    expect(suggestSources(findAgentTemplate('vendas-whatsapp')!, sources)).toEqual(['2', '3'])
    expect(suggestSources(findAgentTemplate('recuperacao')!, sources)).toEqual(['2', '3'])
  })
})
