import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const producers = [
  './automation/event-processor.ts',
  './events.ts',
  '../app/api/cron/check-delayed-runs/route.ts',
  '../app/api/workers/automation-delay/route.ts',
]

describe('automation worker producer auth', () => {
  it.each(producers)('%s sends Bearer and never the legacy internal header', path => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source).not.toMatch(/X-Internal-Request/i)
    expect(source).toMatch(/Authorization[\s\S]*Bearer/)
  })
})
