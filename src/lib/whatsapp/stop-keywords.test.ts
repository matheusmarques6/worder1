import { describe, it, expect } from 'vitest'
import { isStopKeyword } from './opt-out-guard'

describe('isStopKeyword', () => {
  it('matches exact keywords case-insensitive', () => {
    expect(isStopKeyword('PARAR')).toBe(true)
    expect(isStopKeyword('parar')).toBe(true)
    expect(isStopKeyword('Stop')).toBe(true)
    expect(isStopKeyword('SAIR')).toBe(true)
    expect(isStopKeyword('CANCELAR')).toBe(true)
    expect(isStopKeyword('unsubscribe')).toBe(true)
    expect(isStopKeyword('Sair Da Lista')).toBe(true)
  })

  it('matches keywords with trailing punctuation', () => {
    expect(isStopKeyword('PARAR.')).toBe(true)
    expect(isStopKeyword('Stop!')).toBe(true)
    expect(isStopKeyword('cancelar?')).toBe(true)
    expect(isStopKeyword('SAIR;')).toBe(true)
  })

  it('matches keywords with surrounding whitespace', () => {
    expect(isStopKeyword('  parar  ')).toBe(true)
    expect(isStopKeyword('\tSTOP\n')).toBe(true)
  })

  it('does NOT match keywords inside a longer phrase (false positive guard)', () => {
    expect(isStopKeyword('cancelar pedido')).toBe(false)
    expect(isStopKeyword('quero parar de receber')).toBe(false)
    expect(isStopKeyword('vou sair daqui')).toBe(false)
    expect(isStopKeyword('stop the bus')).toBe(false)
    expect(isStopKeyword('me cancelar nao')).toBe(false)
  })

  it('returns false for empty / null / undefined', () => {
    expect(isStopKeyword(null)).toBe(false)
    expect(isStopKeyword(undefined)).toBe(false)
    expect(isStopKeyword('')).toBe(false)
    expect(isStopKeyword('   ')).toBe(false)
  })

  it('does not match unrelated text', () => {
    expect(isStopKeyword('oi')).toBe(false)
    expect(isStopKeyword('quero comprar mais')).toBe(false)
    expect(isStopKeyword('123456')).toBe(false)
  })
})
