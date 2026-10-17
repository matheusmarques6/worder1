import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerSourceProcessing } from '../process-trigger'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('candidate source processing origin', () => {
  it('a Vercel preview processes sources on its own revision instead of an older shared alias', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', 'worder-qa-candidate.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://older-staging.example.test')
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    await triggerSourceProcessing('source-qa', 'org-qa')
    expect(fetch).toHaveBeenCalledWith('https://worder-qa-candidate.vercel.app/api/ai/process/document', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ source_id: 'source-qa', organization_id: 'org-qa' }),
    }))
  })

  it('production and local callers retain the configured app origin', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_URL', 'an-immutable-deployment.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://configured.example.test')
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    await triggerSourceProcessing('source-qa', 'org-qa')
    expect(fetch.mock.calls[0][0]).toBe('https://configured.example.test/api/ai/process/document')
  })
})
