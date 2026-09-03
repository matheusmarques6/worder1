// src/lib/debug-guard.test.ts
//
// Trava do fail-closed do item 43 (fix round 1), no molde de
// `internal-auth.test.ts` (item 25). Estes testes existem para QUEBRAR se
// alguém reintroduzir o atalho `if (process.env.NODE_ENV !== 'production')
// return null` no guard: em dev, isso deixava as 12 rotas de
// debug/diagnóstico abertas — inclusive `/api/ai/test`, onde o
// `organizationId` do corpo da requisição decide o filtro de tenancy da RPC
// do RAG e o secret é a única fronteira que sobra.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { assertDebugAllowed } from './debug-guard'

const ORIGINAL_ENV = { ...process.env }

function req(url = 'http://localhost/api/debug/x', headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers })
}

describe('assertDebugAllowed', () => {
  beforeEach(() => {
    delete process.env.DEBUG_ENDPOINT_SECRET
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllEnvs()
  })

  it('nega sem segredo configurado, mesmo em desenvolvimento (fail-closed)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(assertDebugAllowed(req())?.status).toBe(404)
    // Nem uma chave "qualquer" abre: sem segredo no ambiente, não há o que comparar.
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key=qualquer'))?.status).toBe(404)
  })

  it('nega sem segredo configurado em produção', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(assertDebugAllowed(req())?.status).toBe(404)
  })

  it('nega chave errada quando o segredo está configurado', () => {
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key=errado'))?.status).toBe(404)
    expect(assertDebugAllowed(req(undefined, { 'x-debug-key': 'errado' }))?.status).toBe(404)
    expect(assertDebugAllowed(req())?.status).toBe(404)
  })

  it('libera por ?debug_key= com o segredo correto', () => {
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key=s3cret'))).toBeNull()
  })

  it('libera por header x-debug-key com o segredo correto', () => {
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req(undefined, { 'x-debug-key': 's3cret' }))).toBeNull()
  })

  it('libera por Authorization: Bearer com o segredo correto', () => {
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req(undefined, { authorization: 'Bearer s3cret' }))).toBeNull()
  })
})
