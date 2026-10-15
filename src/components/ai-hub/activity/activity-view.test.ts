import { describe, expect, it } from 'vitest'
import { ago, anf, apc, bucketLabel, criterionLabel, delta, handoffReasons, weekRows } from './activity-view'

describe('activity-view', () => {
  it('variação como no protótipo: %, p.p., inversa e "novo"', () => {
    expect(delta(110, 100)).toEqual({ text: '↑ 10,0%', tone: 'up' })
    expect(delta(15.3, 14.8, { pp: true, inv: true })).toEqual({ text: '↑ 0,5 p.p.', tone: 'dn' })
    expect(delta(5, 0)).toEqual({ text: 'novo', tone: 'ne' })
    expect(delta(5, null)).toBeNull()
  })

  it('motivos de transferência viram o texto do protótipo e se somam', () => {
    expect(handoffReasons([{ key: 'asked_human', count: 3 }, { key: 'keyword', count: 2 }, { key: 'complaint', count: 4 }, { key: 'xyz', count: 1 }]))
      .toEqual([
        { label: 'Pediu para falar com uma pessoa', count: 5 },
        { label: 'Reclamação ou problema no pedido', count: 4 },
        { label: 'Outro motivo', count: 1 },
      ])
  })

  it('critério conhecido, critério da loja e critério desconhecido', () => {
    expect(criterionLabel('sem-promessas-inventadas')).toBe('Prometeu condição que não existe')
    expect(criterionLabel('judge-1', 'Não fala de concorrentes')).toBe('Não fala de concorrentes')
    expect(criterionLabel('novo-criterio')).toBe('Novo criterio')
  })

  it('formatos e eixos', () => {
    expect(anf(21630)).toBe('21.630')
    expect(apc(75.2)).toBe('75,2%')
    expect(bucketLabel('2026-10-09', false)).toBe('09/10')
    expect(bucketLabel('07', true)).toBe('7h')
    expect(ago('2026-10-15T11:55:00Z', new Date('2026-10-15T12:00:00Z'))).toBe('há 5 min')
  })

  it('mapa de calor começa na segunda', () => {
    const grid = Array.from({ length: 7 }, (_, d) => Array(24).fill(d))
    const rows = weekRows(grid)
    expect(rows[0]).toMatchObject({ day: 'Seg', values: Array(24).fill(1) })
    expect(rows[6]).toMatchObject({ day: 'Dom', values: Array(24).fill(0) })
  })
})
