import { describe, it, expect } from 'vitest'
import { mergeNodeResults } from '../node-results'

const EMAIL1 = 'node-email-1'
const DELAY = 'node-delay'
const EMAIL2 = 'node-email-2'

describe('mergeNodeResults — snapshot da run acumula os segmentos', () => {
  it('mantém o Email 1 do primeiro segmento quando a retomada só executa o Email 2', () => {
    const seg1 = {
      [EMAIL1]: { status: 'success', output: { sent: true, emailSendId: 'send-1' } },
      [DELAY]: { status: 'waiting', output: { delay: '1 days' } },
    }
    const seg2 = {
      [EMAIL2]: { status: 'success', output: { sent: true, emailSendId: 'send-2' } },
      [DELAY + '-2']: { status: 'waiting', output: { delay: '1 days' } },
    }
    const merged = mergeNodeResults(seg1, seg2)
    expect(merged[EMAIL1]?.output?.emailSendId).toBe('send-1')
    expect(merged[EMAIL2]?.output?.emailSendId).toBe('send-2')
    expect(Object.keys(merged)).toHaveLength(4)
  })

  it('o segmento novo sobrescreve o resultado do mesmo nó (email adiado que finalmente enviou)', () => {
    const before = { [EMAIL1]: { status: 'waiting', output: { reason: 'quiet hours' } } }
    const now = { [EMAIL1]: { status: 'success', output: { sent: true, emailSendId: 'send-9' } } }
    expect(mergeNodeResults(before, now)[EMAIL1].status).toBe('success')
  })

  it('um "pulado" novo não apaga um envio real de segmento anterior', () => {
    const before = { [EMAIL1]: { status: 'success', output: { sent: true, emailSendId: 'send-1' } } }
    const now = { [EMAIL1]: { status: 'skipped', output: { reason: 'Condição não atendida' } } }
    expect(mergeNodeResults(before, now)[EMAIL1].status).toBe('success')
  })

  it('tolera snapshot anterior ausente ou malformado', () => {
    const now = { [EMAIL1]: { status: 'success', output: {} } }
    expect(mergeNodeResults(undefined, now)).toEqual(now)
    expect(mergeNodeResults(null, now)).toEqual(now)
    expect(mergeNodeResults([1, 2], now)).toEqual(now)
    expect(mergeNodeResults('x', now)).toEqual(now)
    expect(mergeNodeResults({ a: 1 }, undefined)).toEqual({ a: 1 })
  })

  it('não muta o snapshot anterior', () => {
    const before = { [EMAIL1]: { status: 'success' } }
    const frozen = JSON.stringify(before)
    mergeNodeResults(before, { [EMAIL2]: { status: 'success' } })
    expect(JSON.stringify(before)).toBe(frozen)
  })
})
