/**
 * A ordem do DELETE em /api/ai/knowledge apagava chunks e documentos por
 * knowledge_base_id ANTES de qualquer checagem de organização — só o delete
 * final, na própria knowledge_bases, era escopado. Um UUID de outra loja
 * destruía o conteúdo dela (chunks + documentos) e a rota ainda respondia
 * `success: true`, porque o terceiro delete (que não apaga nada, já que o
 * `.eq('organization_id', orgId)` não casa) não retorna erro.
 *
 * A correção verifica posse com uma LEITURA escopada antes de qualquer
 * delete — as tabelas de conhecimento são legadas e não confiam em RLS
 * (item 24 desta auditoria). Base de outra loja é tratada como inexistente:
 * mesma resposta (404), sem distinguir "não existe" de "não é sua" — um
 * corpo ou status diferente seria oráculo de existência (precedente dos
 * itens 03 e 04 desta auditoria).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()

// Cada operação (select/delete) por tabela tem resultado configurável.
// A chave é `${tabela}:${operacao}` porque knowledge_bases é consultada
// duas vezes com propósitos diferentes: leitura de posse e delete final.
const results: Record<string, any> = {}
const deletesEmitted: string[] = []
let currentTable = ''
let currentOp = ''

function key() {
  return `${currentTable}:${currentOp}`
}

const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'select') {
        currentOp = 'select'
        return () => chain
      }
      if (prop === 'delete') {
        currentOp = 'delete'
        deletesEmitted.push(currentTable)
        return () => chain
      }
      if (prop === 'single') {
        return async () => results[key()] ?? { data: null, error: null }
      }
      if (prop === 'then') {
        const r = results[key()] ?? { data: null, error: null }
        return (resolve: any) => resolve(r)
      }
      return () => chain
    },
  },
)

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: (table: string) => {
      currentTable = table
      currentOp = ''
      return chain
    },
  }),
}))

vi.mock('next/headers', () => ({ cookies: () => ({}) }))

import { DELETE } from './route'

const ORG_ID = 'org-da-sessao'

function req(id: string): any {
  return { nextUrl: { searchParams: new URLSearchParams({ id }) } }
}

function arrange({ baseEhMinha }: { baseEhMinha: boolean }) {
  results['profiles:select'] = { data: { organization_id: ORG_ID }, error: null }
  results['knowledge_bases:select'] = baseEhMinha
    ? { data: { id: 'kb-1' }, error: null }
    : { data: null, error: null }
  results['knowledge_chunks:delete'] = { data: null, error: null }
  results['knowledge_documents:delete'] = { data: null, error: null }
  results['knowledge_bases:delete'] = { data: null, error: null }
}

describe('DELETE /api/ai/knowledge — posse verificada antes de apagar', () => {
  beforeEach(() => {
    for (const k of Object.keys(results)) delete results[k]
    deletesEmitted.length = 0
    mockGetUser.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('id de OUTRA org: nenhum delete é emitido, em nenhuma tabela', async () => {
    arrange({ baseEhMinha: false })

    const res: any = await DELETE(req('kb-de-outra-loja'))
    const body = await res.json()

    expect(deletesEmitted).toEqual([])
    expect(body.success).not.toBe(true)
  })

  it('id inexistente: mesma resposta do caso de outra org', async () => {
    // No banco real, tanto "não existe" quanto "não é sua" fazem a leitura
    // escopada (.eq(id).eq(organization_id)) voltar sem linha — o mock
    // reproduz isso com o mesmo resultado de arrange({baseEhMinha:false}).
    arrange({ baseEhMinha: false })

    const resOutraOrg: any = await DELETE(req('kb-de-outra-loja'))
    const bodyOutraOrg = await resOutraOrg.json()

    const resInexistente: any = await DELETE(req('kb-que-nao-existe'))
    const bodyInexistente = await resInexistente.json()

    expect(resInexistente.status).toBe(resOutraOrg.status)
    expect(bodyInexistente).toEqual(bodyOutraOrg)
    expect(deletesEmitted).toEqual([])
  })

  it('base própria: as três tabelas são limpas, na ordem que respeita a FK', async () => {
    arrange({ baseEhMinha: true })

    const res: any = await DELETE(req('kb-1'))
    const body = await res.json()

    expect(deletesEmitted).toEqual(['knowledge_chunks', 'knowledge_documents', 'knowledge_bases'])
    expect(body.success).toBe(true)
    expect(res.status).toBe(200)
  })
})
