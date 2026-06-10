import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks antes do import — vitest hoist (padrão de opt-out-guard.test.ts)
const inserted: any[] = []
const mockSelect = vi.fn()

// Mock para template-approval — controlado por describe 'claim do cron (queued)'
const mockEnsureTemplateApproved = vi.fn()
vi.mock('./template-approval', () => ({
  ensureCampaignTemplateApproved: (...args: any[]) => mockEnsureTemplateApproved(...args),
  isTemplateApproved: (status: string) => (status || '').toUpperCase() === 'APPROVED',
}))

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
  campaignQueue: { add: vi.fn(), addBatch: vi.fn().mockResolvedValue([]), getStats: vi.fn(), complete: vi.fn(), fail: vi.fn(), recoverStuckJobs: vi.fn() },
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

import { supabaseAdmin } from '@/lib/supabase-admin'
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

// =============================================
// startCampaign — claim do cron (queued)
// Handoff da Task 3: campanha com status 'queued' + template PENDING deve
// reverter para 'scheduled' (NÃO 'failed') e retornar {success:false}.
// Testa o allowlist fix e o bloco soft-return/revert de startCampaign.
// =============================================
describe('startCampaign — claim do cron (queued)', () => {
  // Rastreamento de chamadas update().eq()
  const updateCalls: Array<{ data: any; id: string }> = []
  let mockEq: ReturnType<typeof vi.fn>
  let mockUpdate: ReturnType<typeof vi.fn>
  let mockSingle: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updateCalls.length = 0
    mockEnsureTemplateApproved.mockReset()
    mockSelect.mockReset()

    mockEq = vi.fn().mockResolvedValue({ error: null })
    mockUpdate = vi.fn((data: any) => {
      // captura chamadas update para assertar revert
      const eq = vi.fn((col: string, val: string) => {
        updateCalls.push({ data, id: val })
        return Promise.resolve({ error: null })
      })
      return { eq }
    }) as any

    mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'camp-1',
        status: 'queued',
        template_id: 'tpl-1',
        organization_id: 'org-1',
        template_name: 'promo',
        template_variables: {},
        audience_type: 'import',
        imported_contacts: [],
      },
      error: null,
    })

    // Override supabaseAdmin.from para este describe (usa import já resolvido no topo)
    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
          single: mockSingle,
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      update: mockUpdate,
      insert: vi.fn(() => ({ select: mockSelect })),
    })) as any)
  })

  it('queued + template PENDING → revert para scheduled, retorna {success:false}', async () => {
    // Template não aprovado (PENDING)
    mockEnsureTemplateApproved.mockResolvedValue({
      ok: false,
      reason: 'Template "promo" não está aprovado pela Meta (status: PENDING).',
    })

    const processor = new CampaignProcessor()
    const result = await processor.startCampaign('camp-1')

    // Deve retornar success:false (não lançar erro)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/PENDING|não está aprovado|Template/i)

    // Deve ter feito update com status:'scheduled' (revert), NÃO 'failed'
    const revertCall = updateCalls.find(c => c.data?.status === 'scheduled')
    expect(revertCall).toBeDefined()

    const failedCall = updateCalls.find(c => c.data?.status === 'failed')
    expect(failedCall).toBeUndefined()
  })
})

// =============================================
// startCampaign — queued sem instância conectada (soft-revert)
// =============================================
describe('startCampaign — queued sem instância conectada', () => {
  const updateCalls: Array<{ data: any; id: string }> = []
  let mockUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updateCalls.length = 0
    mockEnsureTemplateApproved.mockReset()
    mockSelect.mockReset()

    mockUpdate = vi.fn((data: any) => {
      const eq = vi.fn((col: string, val: string) => {
        updateCalls.push({ data, id: val })
        return Promise.resolve({ error: null })
      })
      return { eq }
    }) as any

    // Template APPROVED — passa o guard de template
    mockEnsureTemplateApproved.mockResolvedValue({ ok: true })

    // mockSingle responde em ordem:
    // 1ª chamada: query da campanha (status='queued')
    // 2ª chamada: query da instância (vazio — nenhuma instância conectada)
    let callCount = 0
    const mockSingle = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          data: {
            id: 'camp-2',
            status: 'queued',
            template_id: 'tpl-1',
            organization_id: 'org-1',
            template_name: 'promo',
            template_variables: {},
            audience_type: 'import',
            imported_contacts: [],
          },
          error: null,
        })
      }
      // 2ª chamada: instância — retorna erro (nenhuma encontrada)
      return Promise.resolve({ data: null, error: { message: 'No rows found' } })
    })

    // A instância é consultada com .select().eq(org).eq(status).single()
    // — dois níveis de .eq(). O mock precisa que o segundo .eq() também
    // retorne { single, maybeSingle, in }.
    const makeLeaf = () => ({
      single: mockSingle,
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const makeEqChain = () => ({
      eq: vi.fn(() => makeLeaf()),
      single: mockSingle,
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => ({
      select: vi.fn(() => ({ eq: vi.fn(() => makeEqChain()) })),
      update: mockUpdate,
      insert: vi.fn(() => ({ select: mockSelect })),
    })) as any)
  })

  it('queued sem instância conectada → revert para scheduled, NÃO failed', async () => {
    const processor = new CampaignProcessor()
    const result = await processor.startCampaign('camp-2')

    // Deve retornar success:false sem lançar erro
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No configured WhatsApp instance found/)

    // Deve ter feito update com status:'scheduled' (soft-revert)
    const revertCall = updateCalls.find(c => c.data?.status === 'scheduled')
    expect(revertCall).toBeDefined()

    // NÃO deve ter marcado 'failed'
    const failedCall = updateCalls.find(c => c.data?.status === 'failed')
    expect(failedCall).toBeUndefined()
  })
})
