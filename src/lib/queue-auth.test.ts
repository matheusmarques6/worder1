import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const receiverVerify = vi.hoisted(() => vi.fn(async (_args: unknown) => false))

vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify(args: unknown) {
      return receiverVerify(args)
    }
  },
}))

import { verifyQStashSignature } from './queue'

describe('verifyQStashSignature', () => {
  beforeEach(() => {
    receiverVerify.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails closed without signing keys even with the legacy internal header', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')
    const request = new Request('https://app.example/api/workers/automation', {
      method: 'POST',
      headers: {
        'upstash-signature': 'forged',
        'x-internal-request': 'true',
      },
      body: '{}',
    })

    await expect(verifyQStashSignature(request)).resolves.toEqual({
      isValid: false,
      body: null,
    })
    expect(receiverVerify).not.toHaveBeenCalled()
  })

  it.each([false, true])('uses the official Receiver result (%s)', async isValid => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next')
    receiverVerify.mockResolvedValue(isValid)
    const body = JSON.stringify({ type: 'automation_run', data: { runId: 'run-1' } })
    const request = new Request('https://app.example/api/workers/automation', {
      method: 'POST',
      headers: { 'upstash-signature': 'signed' },
      body,
    })

    await expect(verifyQStashSignature(request)).resolves.toEqual({
      isValid,
      body: isValid ? JSON.parse(body) : null,
    })
    expect(receiverVerify).toHaveBeenCalledWith({ signature: 'signed', body })
  })
})
