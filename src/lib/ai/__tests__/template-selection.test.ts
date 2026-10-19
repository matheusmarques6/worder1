import { expect, it } from 'vitest'
import { findAgentTemplate, suggestSources, templateAreas, templateJudges } from '../agent-templates'

const sources = [
  { id: 'catalog', kind: 'catalog', name: 'Itens da loja' },
  { id: 'faq', kind: 'faq', name: 'Dúvidas gerais' },
  { id: 'tracking', kind: 'note', name: 'Rastreamento' },
  { id: 'shipping', kind: 'note', name: 'Frete' },
  { id: 'pix', kind: 'note', name: 'PIX e boleto' },
  { id: 'unrelated', kind: 'note', name: 'Privacidade LGPD' },
]
it.each([
  ['vendas-whatsapp', ['catalog', 'faq', 'shipping']],
  ['pos-compra', ['faq', 'tracking']],
  ['recuperacao', ['catalog', 'shipping', 'pix']],
] as const)('IA-08 %s suggests by kind or subject and leaves unrelated notes unchecked', (id, expected) => {
  const template = findAgentTemplate(id)!
  expect(suggestSources(template, sources)).toEqual(expected)
  // A second invocation must not be affected by stateful pattern matching.
  expect(suggestSources(template, sources)).toEqual(expected)
  expect(suggestSources(template, [])).toEqual([])
})
it('IA-06 area preview removes controls absent from a draft template', () => {
  const template = findAgentTemplate('vendas-whatsapp')!
  expect(templateAreas(template)).toEqual(['identity', 'missions', 'adapt', 'tools', 'limits', 'handoff', 'review'])
  expect(templateAreas({ ...template, system_prompt: '', mission_families: [], client_adaptation: {},
    tools: ['search_knowledge'], blocked_topics: [], rules: [], handoff_keywords: [], review: [] })).toEqual([])
})
it('IA-06/09 template review criteria become active independent judges with stable IDs', () => {
  const template = findAgentTemplate('pos-compra')!
  const judges = templateJudges({ ...template, review: ['Confere prazo oficial', 'Respeita o cliente'] })
  expect(judges).toEqual([
    { id: 'judge-pos-compra-1', name: 'Confere prazo oficial', criterion: 'Confere prazo oficial', active: true },
    { id: 'judge-pos-compra-2', name: 'Respeita o cliente', criterion: 'Respeita o cliente', active: true },
  ])
})
