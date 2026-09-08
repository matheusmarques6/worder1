// ═══════════════════════════════════════════════════════════════════
// A cerca de loja: sessão obrigatória, e a loja tem de ser de quem pede.
//
// Antes destas cercas, onze rotas de análise da Shopify aceitavam
// `?storeId=` de qualquer um. Elas carregam o `access_token` da loja e
// chamam a API da Shopify com ele — um id alheio operava a loja alheia.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const GROOT = 'd5dfd5dd-1d77-425e-a099-850338078999'
const ALHEIA = 'aaaaaaaa-1111-4111-8111-111111111111'
const USUARIO = '02b4112b-646a-419e-9766-c15a2bedcdb3'

// Sessão corrente do teste; null = ninguém logado.
let sessao: { id: string; organization_id: string } | null = null

const lojas: Record<string, { id: string; organization_id: string }> = {
  [GROOT]: { id: GROOT, organization_id: ORG },
  [ALHEIA]: { id: ALHEIA, organization_id: OUTRA_ORG },
}

vi.mock('@/lib/api-utils', async () => {
  const { NextResponse } = await import('next/server')
  return {
    getAuthClient: async () =>
      sessao ? { supabase: {}, user: { id: sessao.id, email: 'x@y.z', organization_id: sessao.organization_id } } : null,
    getSupabaseClient: () => ({
      from: (t: string) => ({
        select: () => ({
          eq: (_c: string, v: string) => ({
            eq: () => ({ /* organization_id encadeado */ }),
            single: async () => ({ data: lojas[v] || null, error: lojas[v] ? null : { message: 'no rows' } }),
          }),
        }),
      }),
    }),
    authError: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    validateStoreAccess: async (_s: any, orgDoUsuario: string, storeId: string) => {
      const loja = lojas[storeId]
      if (!loja) return { valid: false, error: 'Loja não encontrada', status: 404 }
      if (loja.organization_id !== orgDoUsuario) {
        return { valid: false, error: 'Sem permissão de acesso a esta loja', status: 403 }
      }
      return { valid: true, storeOrganizationId: loja.organization_id }
    },
  }
})

const { requireStore, orgStoreIds } = await import('../guards')

function pedido(qs: string) {
  return new NextRequest(`https://app.worder.com.br/api/analytics/shopify${qs}`)
}

beforeEach(() => {
  sessao = { id: USUARIO, organization_id: ORG }
})

describe('requireStore', () => {
  it('sem sessão, não passa — nem com um id de loja válido', async () => {
    sessao = null
    const r = await requireStore(pedido(`?storeId=${GROOT}`))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(401)
  })

  it('a loja de outra organização é recusada, não vira filtro', async () => {
    const r = await requireStore(pedido(`?storeId=${ALHEIA}`))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(403)
  })

  it('loja que não existe: 404, sem revelar mais que isso', async () => {
    const r = await requireStore(pedido('?storeId=00000000-0000-4000-8000-000000000000'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(404)
  })

  it('sem loja nenhuma, 400 — nunca "sem filtro"', async () => {
    const r = await requireStore(pedido(''))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.response.status).toBe(400)
  })

  it('a loja da própria organização passa, com a organização dela', async () => {
    const r = await requireStore(pedido(`?storeId=${GROOT}`))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.storeId).toBe(GROOT)
      expect(r.organizationId).toBe(ORG)
    }
  })

  it('aceita a grafia store_id além de storeId', async () => {
    const r = await requireStore(pedido(`?store_id=${GROOT}`))
    expect(r.ok).toBe(true)
  })

  it('o id explícito tem precedência sobre a URL', async () => {
    const r = await requireStore(pedido(`?storeId=${ALHEIA}`), GROOT)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.storeId).toBe(GROOT)
  })
})

describe('orgStoreIds', () => {
  // O CRM — deals, pipelines, events — não tem coluna de organização: a
  // cerca é a loja. Uma organização sem loja tem de devolver lista
  // vazia, e quem chama trata isso como "nada", nunca como "tudo".
  const fake = (linhas: any[]) => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: linhas, error: null }) }) }),
  })

  it('devolve as lojas da organização', async () => {
    const ids = await orgStoreIds(fake([{ id: GROOT }, { id: 'outra' }]) as any, ORG)
    expect(ids).toEqual([GROOT, 'outra'])
  })

  it('organização sem loja devolve lista vazia, não undefined', async () => {
    const ids = await orgStoreIds(fake([]) as any, ORG)
    expect(ids).toEqual([])
  })

  it('descarta linha sem id em vez de propagar um buraco', async () => {
    const ids = await orgStoreIds(fake([{ id: GROOT }, { id: null }]) as any, ORG)
    expect(ids).toEqual([GROOT])
  })
})
