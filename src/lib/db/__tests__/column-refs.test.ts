import { describe, it, expect } from 'vitest'
import { extractColumnRefs, chavesDeNivel1, colunasDoSelect } from '../column-refs'

const pares = (src: string) =>
  extractColumnRefs(src).map((r) => `${r.table}.${r.column}:${r.kind}`).sort()

describe('leitura das colunas que o código pede', () => {
  it('pega as chaves de um insert', () => {
    expect(pares(`
      await db.from('campanhas').insert({ nome: 'x', status: 'draft' })
    `)).toEqual(['campanhas.nome:insert', 'campanhas.status:insert'])
  })

  it('pega as colunas de um select, e ignora * e apelidos', () => {
    expect(pares(`db.from('t').select('id, nome, apelido:outra_coluna, *')`))
      .toEqual(['t.id:select', 't.nome:select'])
  })

  it('ignora as colunas de uma relação embutida — são de outra tabela', () => {
    expect(pares(`db.from('pedidos').select('id, contato:contacts(nome, email)')`))
      .toEqual(['pedidos.id:select'])
  })

  it('desiste do insert quando há spread: o conjunto é desconhecido', () => {
    expect(pares(`db.from('t').insert({ ...base, nome: 'x' })`)).toEqual([])
  })

  it('desiste quando a chave é computada', () => {
    expect(chavesDeNivel1(`[coluna]: 1, nome: 'x'`)).toBeNull()
  })

  it('aceita o atalho { nome } e objetos aninhados', () => {
    expect(chavesDeNivel1(`nome, config: { a: 1, b: [2, 3] }, ativo: true`))
      .toEqual(['nome', 'config', 'ativo'])
  })

  it('não confunde opção do PostgREST com coluna', () => {
    expect(pares(`db.from('t').upsert({ a: 1 }, { onConflict: 'a' })`)).toEqual(['t.a:upsert'])
  })

  it('separa encadeamentos de tabelas diferentes', () => {
    const src = `
      await db.from('a').select('x')
      await db.from('b').select('y')
    `
    expect(pares(src)).toEqual(['a.x:select', 'b.y:select'])
  })

  it('lê select em template literal de várias linhas', () => {
    expect(colunasDoSelect(`
      id,
      nome,
      analytics:outra(*)
    `)).toEqual(['id', 'nome'])
  })

  it('guarda a linha do from, para o relatório apontar o lugar', () => {
    const src = `linha1\nlinha2\nawait db.from('t').select('id')`
    expect(extractColumnRefs(src)[0].line).toBe(3)
  })
})

describe('colunas citadas nos filtros', () => {
  it('pega a coluna de um .eq no encadeamento', () => {
    expect(pares(`db.from('t').select('id').eq('store_id', x)`))
      .toEqual(['t.id:select', 't.store_id:filter'])
  })

  it('ignora caminho de json e coluna de relação embutida', () => {
    expect(pares(`db.from('t').select('id').eq('metadata->>store_id', x).eq('contacts.email', y)`))
      .toEqual(['t.id:select'])
  })

  it('não credita à tabela errada o filtro de uma consulta vizinha', () => {
    const src = `
      const count = (tabela) => db.from(tabela).select('id', { head: true })
      const [a, b] = await Promise.all([
        db.from('lojas').select('id').eq('organization_id', org),
        count('formularios').eq('status', 'publicado'),
      ])
    `
    expect(pares(src)).toEqual(['lojas.id:select', 'lojas.organization_id:filter'])
  })

  it('segue o filtro aplicado depois, quando a consulta mora numa variável', () => {
    const src = `
      let q = db.from('runs').select('id').eq('organization_id', org)
      if (loja) q = q.eq('store_id', loja)
    `
    expect(pares(src)).toEqual(
      ['runs.id:select', 'runs.organization_id:filter', 'runs.store_id:filter'],
    )
  })

  it('método que não é filtro não vira coluna', () => {
    expect(pares(`db.from('t').select('id').order('criado_em').limit(10)`))
      .toEqual(['t.id:select'])
  })
})
