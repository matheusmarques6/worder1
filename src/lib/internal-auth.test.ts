// src/lib/internal-auth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { isInternalAuthorized } from './internal-auth'

const ORIGINAL_ENV = { ...process.env }

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/internal', { headers })
}

describe('isInternalAuthorized', () => {
  beforeEach(() => {
    delete process.env.INTERNAL_API_SECRET
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllEnvs()
  })

  it('nega sem segredo configurado, mesmo em desenvolvimento (fail-closed)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isInternalAuthorized(req())).toBe(false)
    expect(isInternalAuthorized(req({ authorization: 'Bearer qualquer-coisa' }))).toBe(false)
  })

  it('nega sem segredo configurado em produção', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isInternalAuthorized(req())).toBe(false)
  })

  it('autoriza com INTERNAL_API_SECRET e header correto', () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    expect(isInternalAuthorized(req({ authorization: 'Bearer s3cret' }))).toBe(true)
  })

  it('autoriza com CRON_SECRET (fallback) e header correto', () => {
    process.env.CRON_SECRET = 'cron-s3cret'
    expect(isInternalAuthorized(req({ authorization: 'Bearer cron-s3cret' }))).toBe(true)
  })

  it('nega header ausente quando o segredo está configurado', () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    expect(isInternalAuthorized(req())).toBe(false)
  })

  it('nega header errado quando o segredo está configurado', () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    expect(isInternalAuthorized(req({ authorization: 'Bearer errado' }))).toBe(false)
  })
})
