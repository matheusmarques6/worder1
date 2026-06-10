import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks antes do import — vitest hoist (padrão de opt-out-guard.test.ts)
const inserted: any[] = []
const mockSelect = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      // createRecipients: insert(...).select(...)
      insert: vi.fn((rows: any[]) => {
        inserted.push(...rows)
        return {
          select: mockSelect,
        }
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

vi.mock('./queue', () => ({
  campaignQueue: { add: vi.fn(), getStats: vi.fn(), complete: vi.fn(), fail: vi.fn(), recoverStuckJobs: vi.fn() },
  MessageQueue: class {},
}))
vi.mock('./rate-limiter', () => ({ getRateLimiter: vi.fn(), WhatsAppRateLimiter: class {} }))
vi.mock('./circuit-breaker', () => ({ getCircuitBreaker: vi.fn(), CircuitBreaker: class {} }))
vi.mock('./meta-api', () => ({ sendTemplateMessage: vi.fn() }))
vi.mock('./opt-out-guard', () => ({ requireOptIn: vi.fn() }))
vi.mock('./alerts', () => ({ sendAlert: vi.fn() }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import CampaignProcessor from './campaign-processor'

describe('createRecipients', () => {
  beforeEach(() => {
    inserted.length = 0
    mockSelect.mockReset()
  })

  it('retorna IDs REAIS do banco (insert().select()), nunca new-N', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 'uuid-real-1', phone_number: '5511999990001', contact_name: 'A', resolved_variables: {}, retry_count: 0 },
        { id: 'uuid-real-2', phone_number: '5511999990002', contact_name: 'B', resolved_variables: {}, retry_count: 0 },
      ],
      error: null,
    })

    const processor = new CampaignProcessor()
    const campaign = {
      id: 'camp-1',
      organization_id: 'org-1',
      audience_type: 'import',
      imported_contacts: [
        { phone: '5511999990001', name: 'A' },
        { phone: '5511999990002', name: 'B' },
      ],
      template_variables: {},
    }

    const recipients = await (processor as any).createRecipients(campaign)

    expect(recipients).toHaveLength(2)
    expect(recipients.map((r: any) => r.id)).toEqual(['uuid-real-1', 'uuid-real-2'])
    expect(recipients.some((r: any) => String(r.id).startsWith('new-'))).toBe(false)
    // contact_id de import NÃO pode ser string não-UUID
    expect(inserted.every(r => r.contact_id === null || /^[0-9a-f-]{36}$/i.test(r.contact_id))).toBe(true)
  })

  it('propaga erro do insert em vez de ignorar', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'contact_id uuid inválido' } })
    const processor = new CampaignProcessor()
    const campaign = {
      id: 'camp-1', organization_id: 'org-1', audience_type: 'import',
      imported_contacts: [{ phone: '5511999990001', name: 'A' }], template_variables: {},
    }
    await expect((processor as any).createRecipients(campaign)).rejects.toThrow(/contact_id/)
  })
})
