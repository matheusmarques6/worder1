import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: (...args: any[]) => mockRpc(...args) },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { applyCampaignRecipientWebhookStatus } from './campaign-recipient-status'

describe('applyCampaignRecipientWebhookStatus', () => {
  beforeEach(() => mockRpc.mockReset())

  it('chama o RPC com meta_message_id, status e erros', async () => {
    mockRpc.mockResolvedValue({ data: [{ recipient_id: 'r1', out_campaign_id: 'c1', applied: true }], error: null })
    const applied = await applyCampaignRecipientWebhookStatus('wamid.X', 'delivered', {
      errorCode: undefined, errorMessage: undefined,
    })
    expect(mockRpc).toHaveBeenCalledWith('apply_campaign_recipient_webhook', expect.objectContaining({
      p_meta_message_id: 'wamid.X',
      p_new_status: 'delivered',
    }))
    expect(applied).toBe(true)
  })

  it('retorna false quando mensagem não é de campanha (RPC sem linhas)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const applied = await applyCampaignRecipientWebhookStatus('wamid.inbox', 'read')
    expect(applied).toBe(false)
  })

  it('não lança quando o RPC falha (best-effort; cloud_messages já foi atualizado)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(applyCampaignRecipientWebhookStatus('wamid.X', 'read')).resolves.toBe(false)
  })

  it('ignora status fora do ciclo (ex.: warning)', async () => {
    const applied = await applyCampaignRecipientWebhookStatus('wamid.X', 'warning' as any)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(applied).toBe(false)
  })
})
