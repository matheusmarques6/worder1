import { describe, it, expect } from 'vitest'
import { TOOL_CATALOG } from '../tools/catalog'
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
})
