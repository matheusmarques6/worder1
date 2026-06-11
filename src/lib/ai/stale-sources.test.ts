import { describe, it, expect } from 'vitest'
import { findStaleSourceIds, STALE_SOURCE_THRESHOLD_MS, STALE_SOURCE_MESSAGE } from './stale-sources'

const NOW = new Date('2026-06-10T12:00:00Z').getTime()
const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString()
const tenMinAgo = new Date(NOW - 10 * 60 * 1000).toISOString()

describe('findStaleSourceIds', () => {
  it('marca pending com mais de 1h como órfã', () => {
    const sources = [{ id: 'a', status: 'pending', updated_at: twoHoursAgo, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['a'])
  })

  it('marca processing com mais de 1h como órfã (função morta no meio)', () => {
    const sources = [{ id: 'b', status: 'processing', updated_at: twoHoursAgo, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['b'])
  })

  it('NÃO marca pending recente (processamento em andamento)', () => {
    const sources = [{ id: 'c', status: 'pending', updated_at: tenMinAgo, created_at: tenMinAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual([])
  })

  it('NÃO marca ready nem error, mesmo antigas', () => {
    const sources = [
      { id: 'd', status: 'ready', updated_at: twoHoursAgo, created_at: twoHoursAgo },
      { id: 'e', status: 'error', updated_at: twoHoursAgo, created_at: twoHoursAgo },
    ]
    expect(findStaleSourceIds(sources, NOW)).toEqual([])
  })

  it('usa created_at quando updated_at está ausente', () => {
    const sources = [{ id: 'f', status: 'pending', updated_at: null, created_at: twoHoursAgo }]
    expect(findStaleSourceIds(sources, NOW)).toEqual(['f'])
  })

  it('threshold é 1 hora e a mensagem orienta o reprocess', () => {
    expect(STALE_SOURCE_THRESHOLD_MS).toBe(60 * 60 * 1000)
    expect(STALE_SOURCE_MESSAGE).toContain('Reprocessar')
  })
})
