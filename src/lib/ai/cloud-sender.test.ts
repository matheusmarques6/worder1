import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks antes do import — vitest hoist
const mockRequireOptIn = vi.fn()
const mockSendText = vi.fn()
const mockSendTyping = vi.fn()
const mockCreateClient = vi.fn(() => ({
  sendText: mockSendText,
  sendTyping: mockSendTyping,
}))
const mockUpsert = vi.fn(async () => ({}))
const mockUpdateEq = vi.fn(async () => ({}))
const mockUpdate = vi.fn((_payload: any) => ({ eq: mockUpdateEq }))

vi.mock('@/lib/whatsapp/opt-out-guard', () => ({
  requireOptIn: (...args: any[]) => mockRequireOptIn(...args),
}))

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  createWhatsAppCloudClient: (...args: any[]) => (mockCreateClient as any)(...args),
}))

vi.mock('@/lib/whatsapp/account-loader', () => ({
  getAccessToken: () => 'tok',
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: mockUpsert,
      update: mockUpdate,
    })),
  },
}))

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCheckBeforeSend = vi.fn(async () => ({ allowed: true }) as any)
const mockReportSendResult = vi.fn(async () => {})

vi.mock('@/lib/whatsapp/send-guard', () => ({
  checkBeforeSend: (...args: any[]) => (mockCheckBeforeSend as any)(...args),
  reportSendResult: (...args: any[]) => (mockReportSendResult as any)(...args),
}))

import { sendHumanizedReply } from './cloud-sender'

const account = {
  id: 'waba-1',
  phone_number_id: 'pnid-1',
  phone_number: '5538998258018',
}

const conversation = {
  id: 'conv-1',
  organization_id: 'org-1',
  contact_phone: '553898575602',
  wa_id: '553898575602',
  is_window_open: true,
  window_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

const agent = { id: 'agent-1' }

describe('sendHumanizedReply — opt-out guard (Onda 13 / B2)', () => {
  beforeEach(() => {
    mockRequireOptIn.mockReset()
    mockSendText.mockReset()
    mockCreateClient.mockClear()
    mockUpsert.mockClear()
    mockCheckBeforeSend.mockReset()
    mockCheckBeforeSend.mockResolvedValue({ allowed: true })
    mockReportSendResult.mockClear()
  })

  it('NAO envia quando contato esta opted_out (skip terminal)', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: false, reason: 'OPTED_OUT' })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('opted_out')
    // Nem chega a criar o client da Meta — zero risco de envio
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('passa org + phone + sender corretos pro requireOptIn', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: false, reason: 'OPTED_OUT' })

    await sendHumanizedReply({
      account,
      conversation,
      text: 'oi',
      agent,
      skipDelays: true,
    })

    expect(mockRequireOptIn).toHaveBeenCalledWith(
      'org-1',
      '553898575602',
      undefined,
      { sender: 'ai.auto-reply' },
    )
  })

  it('envia normalmente quando contato esta opted_in', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.123' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
    expect(r.messageId).toBe('wamid.123')
    expect(mockSendText).toHaveBeenCalledTimes(1)
  })

  it('janela fechada aborta ANTES do opt-check (window_closed)', async () => {
    const r = await sendHumanizedReply({
      account,
      conversation: { ...conversation, is_window_open: false },
      text: 'oi',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('window_closed')
    expect(mockRequireOptIn).not.toHaveBeenCalled()
  })
})

describe('sendHumanizedReply — moderacao blocked_topics', () => {
  beforeEach(() => {
    mockRequireOptIn.mockReset()
    mockSendText.mockReset()
    mockCreateClient.mockClear()
    mockUpsert.mockClear()
    mockUpdate.mockClear()
    mockUpdateEq.mockClear()
  })

  it('NAO envia quando a resposta contem topico bloqueado; desabilita e transfere', async () => {
    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'Sobre Política, eu acho que o candidato...',
      agent: { id: 'agent-1', settings: { safety: { blocked_topics: ['politica'] } } },
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('blocked_topic')
    // Nada foi pra Meta
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
    // Conversa desabilitada + transferida
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.ai_enabled).toBe(false)
    expect(payload.ai_disabled_reason).toBe('blocked_topic')
    expect(payload.ai_transferred_at).toBeDefined()
  })

  it('envia normalmente quando nenhum topico bloqueado aparece', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.9' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'Seu pedido saiu para entrega!',
      agent: { id: 'agent-1', settings: { safety: { blocked_topics: ['politica'] } } },
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
    expect(mockSendText).toHaveBeenCalledTimes(1)
  })

  it('agente sem settings.safety segue funcionando (retrocompatibilidade)', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.10' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent: { id: 'agent-1' },
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
  })
})

describe('sendHumanizedReply — send guard (rate limit por tier + circuit breaker)', () => {
  beforeEach(() => {
    mockRequireOptIn.mockReset()
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockReset()
    mockCreateClient.mockClear()
    mockCheckBeforeSend.mockReset()
    mockCheckBeforeSend.mockResolvedValue({ allowed: true })
    mockReportSendResult.mockClear()
  })

  it('NAO envia quando o guard bloqueia (skip silencioso com reason)', async () => {
    mockCheckBeforeSend.mockResolvedValue({
      allowed: false,
      reason: 'daily_quota',
      retryAfterMs: 3600000,
    })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('send_guard_daily_quota')
    expect(mockSendText).not.toHaveBeenCalled()
    expect(mockCheckBeforeSend).toHaveBeenCalledWith({
      accountId: 'waba-1',
      phoneNumberId: 'pnid-1',
      recipientPhone: '553898575602',
      messagingLimit: undefined,
    })
  })

  it('reporta sucesso 1x quando a resposta e enviada', async () => {
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.1' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'tudo certo!',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
    expect(mockReportSendResult).toHaveBeenCalledTimes(1)
    expect(mockReportSendResult).toHaveBeenCalledWith({
      accountId: 'waba-1',
      phoneNumberId: 'pnid-1',
      success: true,
    })
  })

  it('reporta falha quando a 1a bolha falha na Meta', async () => {
    const apiError = Object.assign(new Error('(#131056) pair rate'), { code: 131056 })
    mockSendText.mockRejectedValue(apiError)

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(mockReportSendResult).toHaveBeenCalledTimes(1)
    expect(mockReportSendResult).toHaveBeenCalledWith({
      accountId: 'waba-1',
      phoneNumberId: 'pnid-1',
      success: false,
      errorCode: 131056,
      error: apiError,
      messagingLimit: undefined,
    })
  })
})
