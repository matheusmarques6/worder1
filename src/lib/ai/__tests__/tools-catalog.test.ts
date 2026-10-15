import { describe, it, expect } from 'vitest'
import { TOOL_CATALOG, RUNTIME_TOOL_NAMES } from '../tools/catalog'
import { ALL_TOOLS } from '../tools/registry'

describe('TOOL_CATALOG', () => {
  it('cobre exatamente as tools registradas em ALL_TOOLS (paridade de nomes)', () => {
    const catalogNames = TOOL_CATALOG.map((t) => t.name).sort()
    const registryNames = ALL_TOOLS.map((t) => t.name).sort()
    expect(catalogNames).toEqual(registryNames)
  })

  it('marca as tools store-gated com requiresStore', () => {
    const byName = new Map(TOOL_CATALOG.map((t) => [t.name, t]))
    expect(byName.get('product_lookup')?.requiresStore).toBe(true)
    expect(byName.get('order_status')?.requiresStore).toBe(true)
    expect(byName.get('transfer_to_human')?.requiresStore).toBe(false)
    expect(byName.get('search_knowledge')?.requiresStore).toBe(false)
  })

  it('toda entrada tem label e descricao nao-vazios (copy PT da UI)', () => {
    for (const entry of TOOL_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('o runtime executa o catálogo inteiro (M1 passo 9)', () => {
    expect([...RUNTIME_TOOL_NAMES].sort()).toEqual(
      ['transfer_to_human', 'search_knowledge', 'save_customer', 'save_interests', 'timeline', 'product_lookup', 'order_status'].sort(),
    )
  })
})
