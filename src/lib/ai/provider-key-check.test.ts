import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasActiveProviderKey, providerKeyMissingResponse } from './provider-key-check'

const mockMaybeSingle = vi.fn()
const chain: any = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  maybeSingle: mockMaybeSingle,
}
const supabase: any = { from: vi.fn(() => chain) }

describe('hasActiveProviderKey (Onda 13 / P1-1)', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    chain.eq.mockClear()
  })

  it('true quando existe chave ativa do provider', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'k1' } })
    const ok = await hasActiveProviderKey(supabase, 'org-1', 'openrouter')
    expect(ok).toBe(true)
    expect(chain.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(chain.eq).toHaveBeenCalledWith('provider', 'openrouter')
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })

  it('false quando nao existe chave', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    const ok = await hasActiveProviderKey(supabase, 'org-1', 'anthropic')
    expect(ok).toBe(false)
  })

  it('payload do 400 tem code + provider + mensagem acionavel', () => {
    const body = providerKeyMissingResponse('openrouter')
    expect(body.error).toBe('provider_key_missing')
    expect(body.provider).toBe('openrouter')
    expect(body.message).toContain('API Keys')
  })
})
