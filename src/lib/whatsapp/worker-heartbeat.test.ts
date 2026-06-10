import { describe, it, expect } from 'vitest'
import { evaluateWorkerHealth } from './worker-heartbeat'

describe('evaluateWorkerHealth', () => {
  it('saudável: fila vazia, sem heartbeat (worker pode estar ocioso/desligado)', () => {
    expect(evaluateWorkerHealth({ pendingCount: 0, oldestPendingAgeMs: null, heartbeatAgeMs: null }).healthy).toBe(true)
  })
  it('saudável: jobs pendentes recentes + heartbeat recente', () => {
    expect(evaluateWorkerHealth({ pendingCount: 5, oldestPendingAgeMs: 30_000, heartbeatAgeMs: 20_000 }).healthy).toBe(true)
  })
  it('saudável: jobs antigos mas worker vivo (pode ser backlog legítimo)', () => {
    expect(evaluateWorkerHealth({ pendingCount: 100, oldestPendingAgeMs: 20 * 60_000, heartbeatAgeMs: 15_000 }).healthy).toBe(true)
  })
  it('NÃO saudável: jobs pendentes >10min e heartbeat ausente', () => {
    const r = evaluateWorkerHealth({ pendingCount: 3, oldestPendingAgeMs: 11 * 60_000, heartbeatAgeMs: null })
    expect(r.healthy).toBe(false)
    expect(r.reason).toMatch(/heartbeat/i)
  })
  it('NÃO saudável: jobs pendentes >10min e heartbeat velho (>2min)', () => {
    const r = evaluateWorkerHealth({ pendingCount: 3, oldestPendingAgeMs: 11 * 60_000, heartbeatAgeMs: 3 * 60_000 })
    expect(r.healthy).toBe(false)
  })
})
