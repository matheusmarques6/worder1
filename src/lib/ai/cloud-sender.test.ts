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
