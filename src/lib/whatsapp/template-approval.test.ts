import { describe, it, expect, vi, beforeEach } from 'vitest'

// -------------------------------------------------------
// Mock refactored to record .eq() calls for org-scope test.
// eqCalls accumulates every [column, value] pair passed to
// .eq() across the entire chain so we can assert that the
// template_id lookup ALSO filters by organization_id.
// -------------------------------------------------------
const mockMaybeSingle = vi.fn()
let eqCalls: [string, unknown][] = []

function makeEqChain(): any {
  const chain: any = {
    maybeSingle: mockMaybeSingle,
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      return chain
    },
  }
  return chain
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => makeEqChain()),
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
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    eqCalls = []
  })

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

  // -------------------------------------------------------
  // NEW TEST (a): fallback por name+org quando template_id
  // não encontra nada — guard de regressão do path fallback.
  // O primeiro maybeSingle (lookup por id) retorna null;
  // o segundo (fallback por name+org) retorna APPROVED.
  // Deve resultar em ok=true.
  // -------------------------------------------------------
  it('fallback por name+org quando template_id não encontra', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null })                             // lookup por id → miss
      .mockResolvedValueOnce({ data: { status: 'APPROVED', name: 'promo' } }) // fallback → hit
    const r = await ensureCampaignTemplateApproved({
      template_id: 'tpl-missing',
      template_name: 'promo',
      organization_id: 'org-1',
    })
    expect(r.ok).toBe(true)
  })

  // -------------------------------------------------------
  // NEW TEST (b): lookup por template_id DEVE incluir filtro
  // de organization_id — impede que template APPROVED de outra
  // org passe no gate.
  // Antes do fix: eqCalls NÃO conterá ['organization_id','org-1']
  // no primeiro lookup → FALHA (RED).
  // Após o fix: conterá → PASSA (GREEN).
  // -------------------------------------------------------
  it('lookup por template_id inclui filtro de organization_id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'APPROVED', name: 'promo' } })
    await ensureCampaignTemplateApproved({
      template_id: 'tpl-1',
      template_name: null,
      organization_id: 'org-1',
    })
    // eqCalls acumula TODAS as chamadas .eq() feitas durante a query.
    // Deve haver pelo menos uma com coluna 'organization_id' e valor 'org-1'.
    expect(eqCalls).toContainEqual(['organization_id', 'org-1'])
  })
})
