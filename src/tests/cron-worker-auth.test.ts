/// <reference types="vite/client" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const effects = vi.hoisted(() => {
  const queryResult = { data: [], error: null, count: 0 }
  let chain: any
  chain = new Proxy({}, {
    get: (_target, property) => {
      if (property === 'then') {
        return (resolve: (value: typeof queryResult) => void) => resolve(queryResult)
      }
      return () => chain
    },
  })
  const from = vi.fn(() => chain)
  const rpc = vi.fn(async () => queryResult)

  return {
    chain,
    from,
    rpc,
    createClient: vi.fn(() => ({ from, rpc })),
    dispatchTrigger: vi.fn(async () => undefined),
    resolveSegment: vi.fn(async () => ({ contactIds: [] })),
    loadSegmentAsV2: vi.fn(async () => null),
    extractDependencies: vi.fn(() => ({ fields: [], events: [], lists: [], segments: [] })),
    detectSegmentChanges: vi.fn(async () => ({ processed: 0 })),
    processDueScheduledMessages: vi.fn(async () => ({
      claimed: 0,
      sent: 0,
      failed: 0,
      rescheduled: 0,
      expired: 0,
      recovered: 0,
    })),
    reclaimStaleRuns: vi.fn(async () => 0),
    recipientModeLeadTimeMs: vi.fn(() => 0),
    startCampaign: vi.fn(async () => undefined),
    processDueWhatsappCampaigns: vi.fn(async () => ({ claimed: 0, started: 0, failed: 0 })),
    reserve: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => ({ retrying: false, nextAttemptAt: null })),
    stats: vi.fn(async () => null),
    isQueueAvailable: vi.fn(() => false),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: effects.createClient,
}))
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: effects.from, rpc: effects.rpc },
  getSupabaseAdmin: () => ({ from: effects.from, rpc: effects.rpc }),
}))
vi.mock('@/lib/automation/trigger-dispatcher', () => ({
  dispatchTrigger: effects.dispatchTrigger,
}))
vi.mock('@/lib/segments', () => ({
  resolveSegment: effects.resolveSegment,
  loadSegmentAsV2: effects.loadSegmentAsV2,
}))
vi.mock('@/lib/segments/dsl', () => ({
  extractDependencies: effects.extractDependencies,
}))
vi.mock('@/lib/segments/change-detection', () => ({
  detectSegmentChanges: effects.detectSegmentChanges,
}))
vi.mock('@/lib/whatsapp/scheduled-message-sender', () => ({
  processDueScheduledMessages: effects.processDueScheduledMessages,
}))
vi.mock('@/lib/automation/run-lock', () => ({
  reclaimStaleRuns: effects.reclaimStaleRuns,
}))
vi.mock('@/lib/scheduling/campaign-plan', () => ({
  recipientModeLeadTimeMs: effects.recipientModeLeadTimeMs,
}))
vi.mock('@/lib/whatsapp/campaign-processor', () => ({
  campaignProcessor: { startCampaign: effects.startCampaign },
}))
vi.mock('@/lib/whatsapp/scheduled-campaigns', () => ({
  processDueWhatsappCampaigns: effects.processDueWhatsappCampaigns,
}))
vi.mock('@/lib/queue/durable-queue', () => ({
  reserve: effects.reserve,
  complete: effects.complete,
  fail: effects.fail,
  stats: effects.stats,
  isQueueAvailable: effects.isQueueAvailable,
}))

const routes = import.meta.glob('../app/api/cron/*/route.ts')
const sideEffects = Object.values(effects).filter(value => typeof value === 'function')
const unauthorizedHeaders: Record<string, string>[] = [{}, { 'x-vercel-cron': '1' }]

function request(method: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/cron/test', { method, headers })
}

function expectNoSideEffects() {
  for (const effect of sideEffects) {
    expect(effect).not.toHaveBeenCalled()
  }
}

function refusesWithoutSecret(batch: string, names: string[]) {
  describe(batch, () => {
    it.each(names)('%s denies anonymous and forged cron headers before I/O', async name => {
      const load = routes['../app/api/cron/' + name + '/route.ts']
      expect(load).toBeTypeOf('function')
      const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

      for (const method of ['GET', 'POST']) {
        if (!handlers[method]) continue
        for (const headers of unauthorizedHeaders) {
          vi.clearAllMocks()
          const response = await handlers[method](request(method, headers))
          expect(response.status).toBe(401)
          expectNoSideEffects()
        }
      }
    })
  })
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('CRON_SECRET', '')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

refusesWithoutSecret('cron-secret-fallback-1', [
  'check-back-in-stock',
  'check-inactivity',
  'detect-segment-changes',
  'email-queue-worker',
])

refusesWithoutSecret('cron-secret-fallback-2', [
  'lgpd-retention',
  'process-scheduled-messages',
  'reclaim-stale-runs',
  'recompute-segments',
])

refusesWithoutSecret('cron-secret-fallback-3', [
  'resolve-ab-winners',
  'send-scheduled-campaigns',
  'send-scheduled-whatsapp-campaigns',
  'update-send-times',
])

describe('configured Bearer reaches the existing business seam', () => {
  it('reaches Supabase for a database-backed handler', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/check-back-in-stock/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.from).toHaveBeenCalled()
  })

  it('reaches the queue adapter for a service-backed handler', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/email-queue-worker/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.isQueueAvailable).toHaveBeenCalled()
  })

  it('reaches the scheduled-message service with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/process-scheduled-messages/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.processDueScheduledMessages).toHaveBeenCalled()
  })

  it('reaches the Supabase client factory with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/recompute-segments/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.createClient).toHaveBeenCalled()
  })

  it('reaches campaign planning with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/send-scheduled-campaigns/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.recipientModeLeadTimeMs).toHaveBeenCalled()
  })

  it('reaches WhatsApp campaign processing with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/send-scheduled-whatsapp-campaigns/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.processDueWhatsappCampaigns).toHaveBeenCalled()
  })
})
