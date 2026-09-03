// src/lib/debug-guard.test.ts
//
// Trava do fail-closed do item 43 (fix round 1), no molde de
// `internal-auth.test.ts` (item 25). Estes testes existem para QUEBRAR se
// alguém reintroduzir o atalho `if (process.env.NODE_ENV !== 'production')
// return null` no guard: em dev, isso deixava as 12 rotas de
// debug/diagnóstico abertas — inclusive `/api/ai/test`, onde o
// `organizationId` do corpo da requisição decide o filtro de tenancy da RPC
// do RAG e o secret é a única fronteira que sobra.
//
// Fix round 2 acrescentou a trava do "as duas recusas são indistinguíveis"
// (decisão do item 25: o motivo fica no log, não na resposta) e os casos de
// borda que faltavam.
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
    // O guard loga o motivo da recusa no servidor — silenciado aqui para não
    // poluir a saída da suíte, e porque o que importa é a resposta.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
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

  it('nega com segredo configurado mas vazio (DEBUG_ENDPOINT_SECRET=)', () => {
    process.env.DEBUG_ENDPOINT_SECRET = ''
    expect(assertDebugAllowed(req())?.status).toBe(404)
    // String vazia na query não pode casar com segredo vazio: falsy nos dois lados.
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key='))?.status).toBe(404)
  })

  it('nega chave errada quando o segredo está configurado, pelos três canais', () => {
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key=errado'))?.status).toBe(404)
    expect(assertDebugAllowed(req(undefined, { 'x-debug-key': 'errado' }))?.status).toBe(404)
    expect(assertDebugAllowed(req(undefined, { authorization: 'Bearer errado' }))?.status).toBe(404)
    expect(assertDebugAllowed(req())?.status).toBe(404)
    // `?debug_key=` vazio cai para os headers; sem header, nega.
    expect(assertDebugAllowed(req('http://localhost/api/debug/x?debug_key='))?.status).toBe(404)
  })

  it('as duas recusas são indistinguíveis: mesmo status e mesmo corpo', async () => {
    // Item 25 (checklist :426-429): o motivo da recusa fica no log do
    // servidor, não na resposta. Se alguém puser de volta a dica de
    // configuração no corpo do 404, este teste quebra.
    const semSegredo = assertDebugAllowed(req())!
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    const chaveErrada = assertDebugAllowed(req('http://localhost/api/debug/x?debug_key=errado'))!

    expect(semSegredo.status).toBe(chaveErrada.status)
    const corpoSemSegredo = await semSegredo.json()
    expect(corpoSemSegredo).toEqual(await chaveErrada.json())
    expect(JSON.stringify(corpoSemSegredo)).not.toContain('DEBUG_ENDPOINT_SECRET')
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

  it('libera com o segredo correto também em produção (o guard não olha NODE_ENV)', () => {
    // A independência de ambiente precisa estar provada nos DOIS sentidos:
    // os casos acima provam "nega em dev", este prova "libera em produção".
    vi.stubEnv('NODE_ENV', 'production')
    process.env.DEBUG_ENDPOINT_SECRET = 's3cret'
    expect(assertDebugAllowed(req(undefined, { 'x-debug-key': 's3cret' }))).toBeNull()
  })
})
