import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}))

function post(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/email/campaigns/send-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      campaign_id: 'c1',
      contact_ids: ['ct1'],
      batch_number: 1,
      total_batches: 1,
      organizationId: 'org-a',
    }),
  })
}

describe('POST /api/email/campaigns/send-batch', () => {
  beforeEach(() => {
    delete process.env.INTERNAL_API_SECRET
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllEnvs()
  })

  it('nega quem só envia X-Internal: true', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ 'X-Internal': 'true' }))
    expect(res.status).toBe(401)
  })

  it('nega bearer errado', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer errado' }))
    expect(res.status).toBe(401)
  })

  it('nega sem segredo configurado, mesmo com bearer', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer qualquer' }))
    expect(res.status).toBe(401)
  })

  it('passa da autorização com bearer correto', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer s3cret' }))
    expect(res.status).not.toBe(401)
  })
})
