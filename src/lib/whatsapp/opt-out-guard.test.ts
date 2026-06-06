import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock antes do import — vitest hoist
const mockMaybeSingle = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
      })),
    })),
  },
}))

vi.mock('@/lib/whatsapp/cloud-api', () => ({
  normalizePhone: (p: string) => p.replace(/\D/g, ''),
}))

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { requireOptIn } from './opt-out-guard'

const ORG = 'org-1'
const PHONE = '5538998258018'

describe('requireOptIn', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
  })

  it('allows when no row exists (legacy phonebook)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    const r = await requireOptIn(ORG, PHONE)
    expect(r.allowed).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it('allows when status is opted_in', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_in', opted_out_at: null, opt_out_reason: null, opt_in_source: 'organic' },
    })
    const r = await requireOptIn(ORG, PHONE)
    expect(r.allowed).toBe(true)
  })

  it('blocks free-text send when opted_out', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('OPTED_OUT')
  })

  it('blocks MARKETING template even when opted_out', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE, 'MARKETING')
    expect(r.allowed).toBe(false)
  })

  it('allows UTILITY template even when opted_out (transactional bypass)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE, 'UTILITY')
    expect(r.allowed).toBe(true)
  })

  it('allows AUTHENTICATION template even when opted_out', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE, 'AUTHENTICATION')
    expect(r.allowed).toBe(true)
  })

  it('allows override for free-text when opted_out', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE, undefined, {
      override: true,
      overrideReason: 'cliente voltou a comprar',
      agentUserId: 'user-1',
    })
    expect(r.allowed).toBe(true)
  })

  it('does NOT allow override for MARKETING template (product rule)', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'opted_out', opted_out_at: '2026-06-01', opt_out_reason: 'PARAR', opt_in_source: 'keyword' },
    })
    const r = await requireOptIn(ORG, PHONE, 'MARKETING', {
      override: true,
      overrideReason: 'forcar',
      agentUserId: 'user-1',
    })
    expect(r.allowed).toBe(false)
  })
})
