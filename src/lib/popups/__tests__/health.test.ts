import { describe, it, expect } from 'vitest'
import { buildHealthIssues, type HealthInput } from '../health'

const uniqueCoupon = {
  steps: [{ blocks: [{ id: 'k', type: 'coupon', props: { mode: 'unique', codePrefix: 'POPUP', discountType: 'percentage', discountValue: 10 } }] }],
}
const staticCoupon = {
  steps: [{ blocks: [{ id: 'k', type: 'coupon', props: { mode: 'static', code: 'FIXO10' } }] }],
}

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    forms: [],
    pools: [],
    experiments: [],
    storeCount: 1,
    staleWhatsappOptIns: 0,
    now: new Date('2026-09-09T12:00:00Z'),
    ...over,
  }
}

describe('saúde dos popups', () => {
  it('nada errado, nenhum aviso', () => {
    const out = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'Boas-vindas', store_id: 's1', design_json: uniqueCoupon }],
      pools: [{ id: 'p1', form_id: 'f1', status: 'active', min_stock: 50, usable: 120 }],
    }))
    expect(out).toEqual([])
  })

  it('pool sem estoque é erro; abaixo do mínimo é atenção', () => {
    const zero = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: 's1', design_json: uniqueCoupon }],
      pools: [{ id: 'p1', form_id: 'f1', status: 'active', min_stock: 50, usable: 0 }],
    }))
    expect(zero).toHaveLength(1)
    expect(zero[0]).toMatchObject({ level: 'error', kind: 'pool_low', form_name: 'A' })
    expect(zero[0].detail).toContain('código reserva')

    const low = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: 's1', design_json: uniqueCoupon }],
      pools: [{ id: 'p1', form_id: 'f1', status: 'active', min_stock: 50, usable: 12 }],
    }))
    expect(low[0]).toMatchObject({ level: 'warn', kind: 'pool_low' })
    expect(low[0].detail).toContain('12 de 50')
  })

  it('pool em erro mostra o motivo da Shopify e o estoque que sobrou', () => {
    const out = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: 's1', design_json: uniqueCoupon }],
      pools: [{ id: 'p1', form_id: 'f1', status: 'error', last_error: 'token revogado', min_stock: 50, usable: 3 }],
    }))
    expect(out[0]).toMatchObject({ level: 'error', kind: 'pool_error' })
    expect(out[0].detail).toContain('token revogado')
    expect(out[0].detail).toContain('3 códigos prontos')
  })

  it('pool pausado é de popup despublicado: não vira aviso', () => {
    expect(buildHealthIssues(input({
      pools: [{ id: 'p1', form_id: 'f1', status: 'paused', min_stock: 50, usable: 0 }],
    }))).toEqual([])
  })

  it('cupom único sem loja e sem pool são erros; cupom estático não exige nada', () => {
    const semLoja = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: null, design_json: uniqueCoupon }],
    }))
    expect(semLoja.map((i) => i.kind)).toContain('unique_without_store')

    const semPool = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: 's1', design_json: uniqueCoupon }],
    }))
    expect(semPool.map((i) => i.kind)).toEqual(['unique_without_pool'])

    const estatico = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: null, design_json: staticCoupon }],
    }))
    expect(estatico).toEqual([])
  })

  it('popup sem loja só é fan-out quando a org tem mais de uma loja', () => {
    const uma = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: null, design_json: staticCoupon }],
      storeCount: 1,
    }))
    expect(uma).toEqual([])

    const varias = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: null, design_json: staticCoupon }],
      storeCount: 3,
    }))
    expect(varias[0]).toMatchObject({ level: 'warn', kind: 'no_store_fanout' })
    expect(varias[0].detail).toContain('3 lojas')
  })

  it('teste A/B passado do prazo avisa; dentro do prazo e bandit não', () => {
    const base = { form_id: 'f1', max_days: 14, mode: 'split' }
    const forms = [{ id: 'f1', name: 'A', store_id: 's1', design_json: staticCoupon }]
    const vencido = buildHealthIssues(input({ forms, experiments: [{ ...base, started_at: '2026-08-01T00:00:00Z' }] }))
    expect(vencido[0]).toMatchObject({ kind: 'experiment_overdue', level: 'warn', form_name: 'A' })
    expect(vencido[0].detail).toContain('prazo de 14')

    const noPrazo = buildHealthIssues(input({ forms, experiments: [{ ...base, started_at: '2026-09-05T00:00:00Z' }] }))
    expect(noPrazo).toEqual([])

    const bandit = buildHealthIssues(input({ forms, experiments: [{ ...base, mode: 'bandit', started_at: '2026-01-01T00:00:00Z' }] }))
    expect(bandit).toEqual([])
  })

  it('confirmações de WhatsApp paradas viram um aviso só, com a contagem', () => {
    const out = buildHealthIssues(input({ staleWhatsappOptIns: 7 }))
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('7 confirmações de WhatsApp sem resposta')
    expect(buildHealthIssues(input({ staleWhatsappOptIns: 1 }))[0].title).toBe('1 confirmação de WhatsApp sem resposta')
  })

  it('erros vêm antes dos avisos', () => {
    const out = buildHealthIssues(input({
      forms: [{ id: 'f1', name: 'A', store_id: null, design_json: uniqueCoupon }],
      storeCount: 4,
      staleWhatsappOptIns: 2,
    }))
    expect(out.map((i) => i.level)).toEqual(['error', 'warn', 'warn'])
  })
})
