import { describe, expect, it } from 'vitest'
import { USD_BRL_FALLBACK, brl, num, pct, usdToBrl, usdToBrlRate } from '../brl'

describe('brl (formato do protótipo)', () => {
  it('separa milhar e usa vírgula', () => {
    expect(brl(18420, 0)).toBe('R$ 18.420')
    expect(brl(0.04)).toBe('R$ 0,04')
    expect(brl(212.4)).toBe('R$ 212,40')
  })
  it('valor ausente vira zero', () => {
    expect(brl(null, 0)).toBe('R$ 0')
  })
  it('num e pct', () => {
    expect(num(1284)).toBe('1.284')
    expect(pct(0.978, 1)).toBe('97,8%')
    expect(pct(null)).toBe('—')
  })
})

describe('usdToBrlRate', () => {
  const client = (row: unknown, fail = false) => ({
    from: () => {
      const q: any = {}
      for (const k of ['select', 'eq', 'order', 'limit']) q[k] = () => q
      q.maybeSingle = async () => { if (fail) throw new Error('x'); return { data: row } }
      return q
    },
  }) as any
  it('usa a cotação mais recente', async () => {
    expect(await usdToBrlRate(client({ rate: '5.43' }))).toBeCloseTo(5.43)
  })
  it('cai na reserva sem linha ou com erro', async () => {
    expect(await usdToBrlRate(client(null))).toBe(USD_BRL_FALLBACK)
    expect(await usdToBrlRate(client(null, true))).toBe(USD_BRL_FALLBACK)
  })
  it('converte', () => {
    expect(usdToBrl(2, 5.5)).toBe(11)
    expect(usdToBrl(null, 5)).toBeNull()
  })
})
