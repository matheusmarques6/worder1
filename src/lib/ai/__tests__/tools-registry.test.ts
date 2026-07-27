import { describe, it, expect } from 'vitest'
import { ALL_TOOLS, getActiveTools } from '../tools/registry'
import { DEFAULT_SETTINGS } from '../types'

describe('getActiveTools', () => {
  it('retorna [] quando settings.tools esta ausente (agentes existentes nao mudam)', () => {
    expect(getActiveTools({ settings: {} }, {})).toEqual([])
    expect(getActiveTools(null, {})).toEqual([])
    expect(getActiveTools(undefined, {})).toEqual([])
  })

  it('retorna [] para enabled vazio', () => {
    expect(getActiveTools({ settings: { tools: { enabled: [] } } }, {})).toEqual([])
  })

  it('retorna so as tools habilitadas, ignorando nomes desconhecidos', () => {
    const tools = getActiveTools(
      { settings: { tools: { enabled: ['transfer_to_human', 'not_a_tool'] } } },
      {},
    )
    expect(tools.map((t) => t.name)).toEqual(['transfer_to_human'])
  })

  it('omite product_lookup/order_status sem storeId (store-gated)', () => {
    const agent = {
      settings: { tools: { enabled: ['product_lookup', 'order_status', 'save_customer'] } },
    }
    expect(getActiveTools(agent, {}).map((t) => t.name)).toEqual(['save_customer'])
    expect(getActiveTools(agent, { storeId: 'store-1' }).map((t) => t.name)).toEqual([
      'product_lookup',
      'order_status',
      'save_customer',
    ])
  })
})

describe('DEFAULT_SETTINGS.tools', () => {
  it('habilita transfer_to_human por padrao para agentes novos', () => {
    expect(DEFAULT_SETTINGS.tools?.enabled).toEqual(['transfer_to_human'])
  })

  it('todo nome no default existe no registry', () => {
    const known = new Set(ALL_TOOLS.map((t) => t.name))
    for (const name of DEFAULT_SETTINGS.tools?.enabled ?? []) {
      expect(known.has(name)).toBe(true)
    }
  })
})
