import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
          eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
        })),
      })),
    })),
  },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { isTemplateApproved, ensureCampaignTemplateApproved } from './template-approval'

describe('isTemplateApproved', () => {
  it('aceita APPROVED em qualquer case (banco mistura APPROVED e approved)', () => {
    expect(isTemplateApproved('APPROVED')).toBe(true)
    expect(isTemplateApproved('approved')).toBe(true)
    expect(isTemplateApproved('Approved')).toBe(true)
  })
  it('rejeita pending/rejected/paused/disabled/null', () => {
    for (const s of ['PENDING', 'pending', 'REJECTED', 'PAUSED', 'DISABLED', null, undefined, '']) {
      expect(isTemplateApproved(s as any)).toBe(false)
    }
  })
})

describe('ensureCampaignTemplateApproved', () => {
  beforeEach(() => mockMaybeSingle.mockReset())

  it('ok=true quando template_id aponta pra template APPROVED', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'APPROVED', name: 'promo' } })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-1', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(true)
  })

  it('ok=false com motivo claro quando status != approved', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'PENDING', name: 'promo' } })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-1', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/PENDING/)
  })

  it('ok=false quando template não existe', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-x', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(false)
  })
})
