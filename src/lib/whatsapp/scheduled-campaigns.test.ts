import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.fn()
const mockUpdateEq = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: mockUpdateEq })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { processDueWhatsappCampaigns, STALE_CAMPAIGN_MS } from './scheduled-campaigns'

describe('processDueWhatsappCampaigns', () => {
  const startCampaign = vi.fn()

  beforeEach(() => {
    mockRpc.mockReset()
    mockUpdateEq.mockReset().mockResolvedValue({ error: null })
    startCampaign.mockReset().mockResolvedValue({ success: true, totalRecipients: 10, totalBatches: 1 })
  })

  it('dispara startCampaign para cada campanha claimada pelo RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'c1', organization_id: 'o1', scheduled_at: new Date(Date.now() - 60_000).toISOString() },
        { id: 'c2', organization_id: 'o1', scheduled_at: new Date(Date.now() - 120_000).toISOString() },
      ],
      error: null,
    })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(mockRpc).toHaveBeenCalledWith('claim_due_whatsapp_campaigns', { p_limit: 3 })
    expect(startCampaign).toHaveBeenCalledTimes(2)
    expect(result.dispatched).toBe(2)
  })

  it('cancela (não envia) campanha stale agendada há mais de 48h', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'old', organization_id: 'o1', scheduled_at: new Date(Date.now() - STALE_CAMPAIGN_MS - 1000).toISOString() }],
      error: null,
    })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(startCampaign).not.toHaveBeenCalled()
    expect(result.expired).toBe(1)
  })

  it('retorna dispatched=0 quando não há campanhas due', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(result.dispatched).toBe(0)
  })

  it('propaga falha do RPC como erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    await expect(processDueWhatsappCampaigns({ startCampaign })).rejects.toThrow(/function does not exist/)
  })
})
