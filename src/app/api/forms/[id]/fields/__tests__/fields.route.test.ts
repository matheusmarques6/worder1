// A rota de campos rodando de verdade. Ela recebe ids do cliente e os
// coloca dentro de um filtro do PostgREST — é o tipo de lugar onde uma
// string estranha deixa de ser dado e vira consulta.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

const FORM = '11111111-1111-4111-8111-111111111111'
const CAMPO = '22222222-2222-4222-8222-222222222222'

async function put(fields: any[]) {
  const { PUT } = await import('../route')
  const req = new NextRequest(`https://app.test/api/forms/${FORM}/fields`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  const res = await PUT(req, { params: { id: FORM } })
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { crm_forms: [{ id: FORM }], crm_form_fields: [] } })
})

describe('campos do formulário', () => {
  it('recusa o formulário de outra organização', async () => {
    db = fakeSupabase({ rows: { crm_forms: [] } })
    const { res } = await put([])
    expect(res.status).toBe(404)
    // Nada foi apagado antes de descobrir que o formulário não é nosso.
    expect(db.queries.some((q) => q.operation === 'delete')).toBe(false)
  })

  it('a busca do formulário é presa à organização da sessão', async () => {
    await put([])
    expect(hasFilter(db.on('crm_forms')[0], 'organization_id', 'org-1')).toBe(true)
  })

  it('recusa id que não é UUID em vez de costurá-lo no filtro', async () => {
    // `)` fecharia a lista do not.in e o resto viraria consulta.
    const { res, body } = await put([{ id: 'abc),(x', field_type: 'text', label: 'A' }])
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/identificador inválido/i)
    expect(db.queries.some((q) => q.operation === 'delete')).toBe(false)
  })

  it('campo novo entra e o que sumiu da lista é apagado dentro do formulário', async () => {
    await put([{ id: 'new-1', field_type: 'email', label: 'E-mail' }])
    const del = db.queries.find((q) => q.table === 'crm_form_fields' && q.operation === 'delete')!
    expect(hasFilter(del, 'form_id', FORM)).toBe(true)
    const ins = db.queries.find((q) => q.table === 'crm_form_fields' && q.operation === 'insert')!
    expect(ins.written).toMatchObject([{ form_id: FORM, field_type: 'email', position: 0 }])
    // Campo novo não leva id inventado pelo cliente.
    expect((ins.written as any)[0].id).toBeUndefined()
  })

  it('atualização de campo existente carrega o formulário no filtro, nunca só o id', async () => {
    await put([{ id: CAMPO, field_type: 'text', label: 'Nome' }])
    const upd = db.queries.find((q) => q.table === 'crm_form_fields' && q.operation === 'update')!
    expect(hasFilter(upd, 'id', CAMPO)).toBe(true)
    expect(hasFilter(upd, 'form_id', FORM)).toBe(true)
  })

  it('erro de escrita vira erro na resposta, não um "pronto" com a lista antiga', async () => {
    db = fakeSupabase({
      rows: { crm_forms: [{ id: FORM }] },
      errors: { crm_form_fields: { message: 'permission denied' } },
    })
    const { res, body } = await put([{ id: 'new-1', field_type: 'text', label: 'A' }])
    expect(res.status).toBe(500)
    expect(body.error).toBe('permission denied')
  })

  it('a posição vem da ordem enviada, não do que o cliente disser', async () => {
    await put([
      { id: 'new-1', field_type: 'text', label: 'Primeiro', position: 99 },
      { id: 'new-2', field_type: 'email', label: 'Segundo', position: 0 },
    ])
    const ins = db.queries.find((q) => q.table === 'crm_form_fields' && q.operation === 'insert')!
    expect((ins.written as any).map((f: any) => [f.label, f.position]))
      .toEqual([['Primeiro', 0], ['Segundo', 1]])
  })
})
