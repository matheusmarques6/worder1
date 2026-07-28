import { describe, it, expect } from 'vitest'
import { epochToIso, statusTimestampFields } from './status-timestamps'

describe('epochToIso', () => {
  it('converte epoch em segundos (string, formato da Meta) para ISO', () => {
    expect(epochToIso('1753600000')).toBe('2025-07-27T07:06:40.000Z')
  })

  it('aceita number', () => {
    expect(epochToIso(1753600000)).toBe('2025-07-27T07:06:40.000Z')
  })

  it('retorna null para entrada ausente ou inválida', () => {
    expect(epochToIso(undefined)).toBeNull()
    expect(epochToIso(null)).toBeNull()
    expect(epochToIso('')).toBeNull()
    expect(epochToIso('abc')).toBeNull()
    expect(epochToIso('-5')).toBeNull()
  })
})

describe('statusTimestampFields', () => {
  it("'delivered' preenche delivered_at a partir do timestamp do webhook", () => {
    expect(statusTimestampFields('delivered', '1753600000')).toEqual({
      delivered_at: '2025-07-27T07:06:40.000Z',
    })
  })

  it("'read' preenche read_at E delivered_at (read implica delivered)", () => {
    expect(statusTimestampFields('read', '1753600000')).toEqual({
      delivered_at: '2025-07-27T07:06:40.000Z',
      read_at: '2025-07-27T07:06:40.000Z',
    })
  })

  it("'read' não sobrescreve delivered_at já persistido", () => {
    expect(
      statusTimestampFields('read', '1753600000', {
        currentDeliveredAt: '2025-07-27T07:00:00.000Z',
      }),
    ).toEqual({ read_at: '2025-07-27T07:06:40.000Z' })
  })

  it("'delivered' repetido não sobrescreve delivered_at já persistido", () => {
    expect(
      statusTimestampFields('delivered', '1753601000', {
        currentDeliveredAt: '2025-07-27T07:06:40.000Z',
      }),
    ).toEqual({})
  })

  it("'read' repetido não sobrescreve read_at já persistido", () => {
    expect(
      statusTimestampFields('read', '1753602000', {
        currentDeliveredAt: '2025-07-27T07:06:40.000Z',
        currentReadAt: '2025-07-27T07:10:00.000Z',
      }),
    ).toEqual({})
  })

  it("'sent' e 'failed' não geram timestamps", () => {
    expect(statusTimestampFields('sent', '1753600000')).toEqual({})
    expect(statusTimestampFields('failed', '1753600000')).toEqual({})
  })

  it('timestamp ausente cai no fallback now() em ISO (delivered)', () => {
    const before = Date.now()
    const fields = statusTimestampFields('delivered', undefined)
    const after = Date.now()
    expect(fields.delivered_at).toBeDefined()
    const t = new Date(fields.delivered_at!).getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })
})
