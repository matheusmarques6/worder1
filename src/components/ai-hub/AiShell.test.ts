import { describe, expect, it } from 'vitest'
import { resolveLegacyAiTab } from './AiShell'
import { whereItActs } from './AgentsList'

describe('resolveLegacyAiTab', () => {
  it.each([
    [null, '/ai/agentes'],
    ['agents', '/ai/agentes'],
    ['knowledge', '/ai/conhecimento'],
    ['activity', '/ai/atividade'],
    ['reports', '/ai/atividade'],
    ['eval', '/ai/atividade'],
    ['whatever', '/ai/agentes'],
  ])('%s → %s', (tab, href) => {
    expect(resolveLegacyAiTab(tab)).toBe(href)
  })
})

describe('whereItActs', () => {
  const entry = (kind: 'whatsapp_account' | 'flow_touch', label: string) =>
    ({ id: label, agent_id: 'a', kind, ref_id: label, active: true, label, created_at: '' }) as const
  it('resume número e fluxos como a lista do protótipo', () => {
    expect(whereItActs([])).toBe('Nenhuma entrada')
    expect(whereItActs([entry('whatsapp_account', 'Loja · +55 11')])).toBe('Loja · +55 11')
    expect(whereItActs([entry('whatsapp_account', 'a'), entry('whatsapp_account', 'b'), entry('flow_touch', 'f')]))
      .toBe('2 números · 1 fluxo')
  })
})
