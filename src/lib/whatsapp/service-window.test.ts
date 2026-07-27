import { describe, it, expect } from 'vitest'
import {
  getServiceWindowStatus,
  isServiceWindowOpen,
  computeCanSendTemplateOnly,
} from './service-window'

const NOW = new Date('2026-07-27T12:00:00Z').getTime()
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

describe('getServiceWindowStatus', () => {
  it('returns no-window when expiresAt is missing', () => {
    expect(getServiceWindowStatus(null, NOW)).toBe('no-window')
    expect(getServiceWindowStatus(undefined, NOW)).toBe('no-window')
    expect(getServiceWindowStatus('', NOW)).toBe('no-window')
  })

  it('returns expired when expiresAt is in the past or exactly now', () => {
    expect(getServiceWindowStatus(hoursFromNow(-1), NOW)).toBe('expired')
    expect(getServiceWindowStatus(hoursFromNow(0), NOW)).toBe('expired')
  })

  it('returns expired for invalid date strings', () => {
    expect(getServiceWindowStatus('not-a-date', NOW)).toBe('expired')
  })

  it('returns expiring when less than 2h remain', () => {
    expect(getServiceWindowStatus(hoursFromNow(1), NOW)).toBe('expiring')
  })

  it('returns active when 2h or more remain', () => {
    expect(getServiceWindowStatus(hoursFromNow(2), NOW)).toBe('active')
    expect(getServiceWindowStatus(hoursFromNow(23), NOW)).toBe('active')
  })
})

describe('isServiceWindowOpen', () => {
  it('is open for active and expiring windows', () => {
    expect(isServiceWindowOpen(hoursFromNow(23), NOW)).toBe(true)
    expect(isServiceWindowOpen(hoursFromNow(1), NOW)).toBe(true)
  })

  it('is closed for expired and missing windows', () => {
    expect(isServiceWindowOpen(hoursFromNow(-1), NOW)).toBe(false)
    expect(isServiceWindowOpen(null, NOW)).toBe(false)
  })
})

describe('computeCanSendTemplateOnly', () => {
  it('allows free text when the DB flag is true and expiry is in the future', () => {
    expect(computeCanSendTemplateOnly(true, hoursFromNow(5), NOW)).toBe(false)
  })

  it('forces template when the DB flag is false even with future expiry', () => {
    expect(computeCanSendTemplateOnly(false, hoursFromNow(5), NOW)).toBe(true)
  })

  it('forces template when the window already expired', () => {
    expect(computeCanSendTemplateOnly(true, hoursFromNow(-1), NOW)).toBe(true)
  })

  it('forces template when there is no window at all (legacy or never messaged)', () => {
    expect(computeCanSendTemplateOnly(null, null, NOW)).toBe(true)
    expect(computeCanSendTemplateOnly(undefined, undefined, NOW)).toBe(true)
  })
})
