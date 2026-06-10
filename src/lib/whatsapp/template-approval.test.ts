import { describe, it, expect, vi, beforeEach } from 'vitest'

// -------------------------------------------------------
// Mock supports two query shapes:
//   - template_id lookup: chain ends with .maybeSingle()
//   - name fallback lookup: chain resolves as array (no maybeSingle)
//
// mockMaybeSingle   — controls the .maybeSingle() terminal
// mockArrayQuery    — controls the bare-array terminal (name fallback)
// eqCalls           — accumulates every .eq(col, val) call
// -------------------------------------------------------
const mockMaybeSingle = vi.fn()
const mockArrayQuery = vi.fn()
let eqCalls: [string, unknown][] = []

function makeEqChain(isArray = false): any {
  const chain: any = {
    maybeSingle: mockMaybeSingle,
    then(resolve: (v: any) => any, reject?: (e: any) => any) {
      // Makes the chain itself thenable (await chain == await chain.then(...))
      return mockArrayQuery().then(resolve, reject)
    },
    eq(col: string, val: unknown) {
      eqCalls.push([col, val])
      return chain
    },
  }
  return chain
}

// selectCalls tracks which columns were requested per query
let selectCalls: string[] = []

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        selectCalls.push(cols)
        return makeEqChain()
      }),
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
    mockArrayQuery.mockReset()
    eqCalls = []
    selectCalls = []
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
  // Fallback por name: busca array de linhas — se nome tem
  // múltiplos idiomas, maybeSingle() retornaria PGRST116.
  // O novo código faz query sem maybeSingle e escolhe a linha
  // APPROVED se houver.
  // -------------------------------------------------------
  it('fallback por name+org quando template_id não encontra', async () => {
    // id lookup via maybeSingle: miss
    mockMaybeSingle.mockResolvedValueOnce({ data: null })
    // name fallback via array: retorna uma linha APPROVED
    mockArrayQuery.mockResolvedValueOnce({ data: [{ status: 'APPROVED', name: 'promo' }], error: null })
    const r = await ensureCampaignTemplateApproved({
      template_id: 'tpl-missing',
      template_name: 'promo',
      organization_id: 'org-1',
    })
    expect(r.ok).toBe(true)
  })

  // -------------------------------------------------------
  // FIX 1 — nome com 2 linhas (2 idiomas): uma PENDING, uma
  // APPROVED. maybeSingle() retornaria PGRST116 + data null.
  // O novo código prefere a linha APPROVED → ok=true.
  // -------------------------------------------------------
  it('nome com 2 idiomas (PENDING + APPROVED): prefere linha APPROVED → ok=true', async () => {
    // template_id lookup: miss (nenhum id)
    // name fallback retorna duas linhas
    mockArrayQuery.mockResolvedValueOnce({
      data: [
        { status: 'PENDING', name: 'promo' },
        { status: 'APPROVED', name: 'promo' },
      ],
      error: null,
    })
    const r = await ensureCampaignTemplateApproved({
      template_id: null,
      template_name: 'promo',
      organization_id: 'org-1',
    })
    expect(r.ok).toBe(true)
  })

  // -------------------------------------------------------
  // nome com 2 linhas, nenhuma APPROVED: ok=false com status
  // real da primeira linha (não 'desconhecido').
  // -------------------------------------------------------
  it('nome com 2 idiomas (ambas PENDING): ok=false com status real', async () => {
    mockArrayQuery.mockResolvedValueOnce({
      data: [
        { status: 'PENDING', name: 'promo' },
        { status: 'PENDING', name: 'promo' },
      ],
      error: null,
    })
    const r = await ensureCampaignTemplateApproved({
      template_id: null,
      template_name: 'promo',
      organization_id: 'org-1',
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/PENDING/)
  })

  // -------------------------------------------------------
  // lookup por template_id DEVE incluir filtro de organization_id
  // -------------------------------------------------------
  it('lookup por template_id inclui filtro de organization_id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'APPROVED', name: 'promo' } })
    await ensureCampaignTemplateApproved({
      template_id: 'tpl-1',
      template_name: null,
      organization_id: 'org-1',
    })
    expect(eqCalls).toContainEqual(['organization_id', 'org-1'])
  })
})
