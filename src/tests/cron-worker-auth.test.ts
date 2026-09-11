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
  const checkAllIntegrations = vi.fn(async () => ({
    total: 0,
    healthy: 0,
    unhealthy: 0,
    results: [],
  }))
  const checkIntegration = vi.fn(async () => ({
    success: true,
    status: 'healthy',
    statusCode: 200,
    message: 'ok',
    responseTimeMs: 0,
    shouldNotify: false,
  }))

  return {
    chain,
    from,
    rpc,
    createClient: vi.fn(() => ({ from, rpc })),
    getSupabaseAdmin: vi.fn(() => ({ from, rpc })),
    dispatchTrigger: vi.fn(async () => undefined),
    resolveSegment: vi.fn(async () => ({ contactIds: [] })),
    loadSegmentAsV2: vi.fn(async () => null),
    drainSegmentReevalQueue: vi.fn(async () => ({ processed: 0 })),
    qstashVerify: vi.fn(async (_args: unknown) => false),
    processWebhookPayload: vi.fn(async () => ({ ok: true })),
    processInboundMedia: vi.fn(async () => ({ ok: true })),
    verifyQStashSignature: vi.fn(async () => ({ isValid: false, body: null })),
    processPendingEvents: vi.fn(async () => ({ processed: 0, errors: 0, results: [] })),
    processEvent: vi.fn(async () => ({
      success: true,
      automationsTriggered: 0,
      runIds: [],
    })),
    resumeExecution: vi.fn(async () => ({ status: 'success' })),
    runFullSyncGraphQL: vi.fn(async () => ({
      ordersCount: 0,
      customersCount: 0,
      productsCount: 0,
    })),
    enqueueShopifySync: vi.fn(async () => null),
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
    verifyEmailDomain: vi.fn(async () => ({ status: 'pending' })),
    refreshStoreToken: vi.fn(async () => 'token'),
    refreshPrimaryDomain: vi.fn(async () => null),
    claimRun: vi.fn(async () => null),
    releaseRun: vi.fn(async () => undefined),
    withHeartbeat: vi.fn(async (_id: string, _token: string, fn: () => Promise<unknown>) => fn()),
    executeWorkflow: vi.fn(async () => ({ status: 'success', nodeResults: [] })),
    mergeNodeResults: vi.fn((_old: unknown, current: unknown) => current),
    enqueueWhatsAppWebhook: vi.fn(async () => undefined),
    enqueueWhatsAppAiRespond: vi.fn(async () => undefined),
    quarantineStuckSending: vi.fn(async () => 0),
    enqueueWebhookDelivery: vi.fn(async () => undefined),
    sendAlert: vi.fn(async () => undefined),
    checkAndAlertMessagingLimits: vi.fn(async () => ({ checked: 0, alerted: 0 })),
    checkAndAlertQualityRating: vi.fn(async () => ({ checked: 0, alerted: 0 })),
    campaignQueueGetStats: vi.fn(async () => ({ pending: 0 })),
    campaignQueueGetOldestPendingAgeMs: vi.fn(async () => null),
    getWorkerHeartbeatAgeMs: vi.fn(async () => null),
    evaluateWorkerHealth: vi.fn(() => ({ healthy: true })),
    wlogError: vi.fn(),
    wlogWarn: vi.fn(),
    runBrowseAbandonedDetection: vi.fn(async () => ({ processed: 0 })),
    enqueueAutomationRun: vi.fn(async () => null),
    getAuthClient: vi.fn(async () => null),
    checkAllIntegrations,
    checkIntegration,
    integrationHealthService: vi.fn(() => ({ checkAllIntegrations, checkIntegration })),
    listPoolsNeedingStock: vi.fn(async () => []),
    replenishPool: vi.fn(async () => ({ created: 0, usable: 0 })),
    resolveRunningExperiments: vi.fn(async () => []),
    reserve: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => ({ retrying: false, nextAttemptAt: null })),
    stats: vi.fn(async () => null),
    isQueueAvailable: vi.fn(() => false),
  }
})

vi.mock('@upstash/qstash', () => ({
  Receiver: class {
    verify(args: unknown) {
      return effects.qstashVerify(args)
    }
  },
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: effects.createClient,
}))
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: effects.from, rpc: effects.rpc },
  getSupabaseAdmin: effects.getSupabaseAdmin,
}))
vi.mock('@/lib/automation/trigger-dispatcher', () => ({
  dispatchTrigger: effects.dispatchTrigger,
}))
vi.mock('@/lib/segments', () => ({
  resolveSegment: effects.resolveSegment,
  loadSegmentAsV2: effects.loadSegmentAsV2,
}))
vi.mock('@/lib/segments/realtime', () => ({
  drainSegmentReevalQueue: effects.drainSegmentReevalQueue,
}))
vi.mock('@/lib/whatsapp/webhook-processor', () => ({
  processWebhookPayload: effects.processWebhookPayload,
}))
vi.mock('@/lib/whatsapp/inbound-media', () => ({
  processInboundMedia: effects.processInboundMedia,
}))
vi.mock('@/lib/automation/event-processor', () => ({
  EventProcessor: {
    processPendingEvents: effects.processPendingEvents,
    processEvent: effects.processEvent,
  },
}))
vi.mock('@/lib/services/shopify/full-sync-graphql', () => ({
  runFullSyncGraphQL: effects.runFullSyncGraphQL,
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
  claimRun: effects.claimRun,
  releaseRun: effects.releaseRun,
  withHeartbeat: effects.withHeartbeat,
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
vi.mock('@/lib/email/domain-dns-check', () => ({
  verifyEmailDomain: effects.verifyEmailDomain,
}))
vi.mock('@/lib/shopify/client-credentials', () => ({
  refreshStoreToken: effects.refreshStoreToken,
}))
vi.mock('@/lib/shopify/store-url', () => ({
  refreshPrimaryDomain: effects.refreshPrimaryDomain,
}))
vi.mock('@/lib/automation/execution-engine', () => ({
  executeWorkflow: effects.executeWorkflow,
  resumeExecution: effects.resumeExecution,
}))
vi.mock('@/lib/automation/node-results', () => ({
  mergeNodeResults: effects.mergeNodeResults,
}))
vi.mock('@/lib/queue', () => ({
  verifyQStashSignature: effects.verifyQStashSignature,
  enqueueWhatsAppWebhook: effects.enqueueWhatsAppWebhook,
  enqueueWhatsAppAiRespond: effects.enqueueWhatsAppAiRespond,
  enqueueAutomationRun: effects.enqueueAutomationRun,
  enqueueWebhookDelivery: effects.enqueueWebhookDelivery,
  enqueueShopifySync: effects.enqueueShopifySync,
}))
vi.mock('@/lib/whatsapp/recipient-claim', () => ({
  quarantineStuckSending: effects.quarantineStuckSending,
}))
vi.mock('@/lib/whatsapp/alerts', () => ({
  sendAlert: effects.sendAlert,
  checkAndAlertMessagingLimits: effects.checkAndAlertMessagingLimits,
  checkAndAlertQualityRating: effects.checkAndAlertQualityRating,
}))
vi.mock('@/lib/whatsapp/queue', () => ({
  campaignQueue: {
    getStats: effects.campaignQueueGetStats,
    getOldestPendingAgeMs: effects.campaignQueueGetOldestPendingAgeMs,
  },
}))
vi.mock('@/lib/whatsapp/worker-heartbeat', () => ({
  getWorkerHeartbeatAgeMs: effects.getWorkerHeartbeatAgeMs,
  evaluateWorkerHealth: effects.evaluateWorkerHealth,
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { error: effects.wlogError, warn: effects.wlogWarn },
}))
vi.mock('@/lib/services/browse-abandoned/detector', () => ({
  runBrowseAbandonedDetection: effects.runBrowseAbandonedDetection,
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: effects.getAuthClient,
}))
vi.mock('@/lib/services/integration-health', () => ({
  IntegrationHealthService: effects.integrationHealthService,
}))
vi.mock('@/lib/coupons/pool-service', () => ({
  listPoolsNeedingStock: effects.listPoolsNeedingStock,
  replenishPool: effects.replenishPool,
}))
vi.mock('@/lib/popups/experiment-service', () => ({
  resolveRunningExperiments: effects.resolveRunningExperiments,
}))
vi.mock('@/lib/queue/durable-queue', () => ({
  reserve: effects.reserve,
  complete: effects.complete,
  fail: effects.fail,
  stats: effects.stats,
  isQueueAvailable: effects.isQueueAvailable,
}))

const routes = import.meta.glob('../app/api/cron/*/route.ts')
const workerRoutes = import.meta.glob('../app/api/workers/*/route.ts')
const sideEffects = Object.values(effects).filter(value => typeof value === 'function')
const unauthorizedHeaders: Record<string, string>[] = [{}, { 'x-vercel-cron': '1' }]

function request(method: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/cron/test', { method, headers })
}

function expectNoSideEffects() {
  for (const effect of sideEffects) {
    expect(effect).not.toHaveBeenCalled()
  }
  expect(fetch).not.toHaveBeenCalled()
}

function expectNoBusinessSideEffects() {
  for (const effect of sideEffects) {
    if (effect !== effects.qstashVerify && effect !== effects.verifyQStashSignature) {
      expect(effect).not.toHaveBeenCalled()
    }
  }
  expect(fetch).not.toHaveBeenCalled()
}

function refusesWithoutSecret(
  batch: string,
  names: string[],
  requestHeaders = unauthorizedHeaders,
  cronSecret: string | null = '',
) {
  describe(batch, () => {
    it.each(names)('%s denies anonymous and forged cron headers before I/O', async name => {
      if (cronSecret === null) delete process.env.CRON_SECRET
      else vi.stubEnv('CRON_SECRET', cronSecret)
      const load = routes['../app/api/cron/' + name + '/route.ts']
      expect(load).toBeTypeOf('function')
      vi.clearAllMocks()
      const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
      expectNoSideEffects()

      for (const method of ['GET', 'POST']) {
        if (!handlers[method]) continue
        for (const headers of requestHeaders) {
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

refusesWithoutSecret('cron-secret-fallback-4', [
  'verify-email-domains',
  'shopify-import-worker',
  'shopify-token-refresh',
  'auto-process',
])

refusesWithoutSecret('cron-header-fallback-1', [
  'close-expired-whatsapp-windows',
  'prune-whatsapp-webhook-events',
  'reset-daily-whatsapp-counters',
  'reprocess-whatsapp-pending',
])

refusesWithoutSecret('cron-header-fallback-2', [
  'whatsapp-dead-alert',
  'whatsapp-messaging-limit-check',
  'whatsapp-quality-check',
  'whatsapp-webhook-heartbeat',
])

refusesWithoutSecret('cron-inline-development', [
  'browse-abandoned',
  'check-dates',
  'check-delayed-runs',
  'compute-recommendations',
])

refusesWithoutSecret('cron-inline-final', [
  'check-abandoned-carts',
  'check-integrations',
  'process-runs',
])

refusesWithoutSecret(
  'cron-bearer-undefined',
  ['webhook-deliveries-sweeper', 'webhook-deliveries-prune'],
  [...unauthorizedHeaders, { authorization: 'Bearer undefined' }],
  null,
)

refusesWithoutSecret('cron-remote-new-routes', [
  'replenish-coupon-pools',
  'resolve-popup-experiments',
])

describe('worker-cron-auth', () => {
  it.each(['GET', 'POST'])('segment-reeval %s denies missing and forged auth before I/O', async method => {
    vi.stubEnv('CRON_SECRET', '')
    const load = workerRoutes['../app/api/workers/segment-reeval/route.ts']
    expect(load).toBeTypeOf('function')
    vi.clearAllMocks()
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    expectNoSideEffects()

    for (const headers of [
      {},
      { 'x-vercel-cron-signature': 'forged' },
    ] as Record<string, string>[]) {
      vi.clearAllMocks()
      const response = await handlers[method](request(method, headers))
      expect(response.status).toBe(401)
      expectNoSideEffects()
    }
  })

  it('segment-reeval reaches the drain only with the configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = workerRoutes['../app/api/workers/segment-reeval/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    vi.clearAllMocks()

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).toBe(200)
    expect(effects.drainSegmentReevalQueue).toHaveBeenCalledTimes(1)
  })

  it.each(['GET', 'POST'])('retired campaign %s stays 410 without I/O', async method => {
    const load = workerRoutes['../app/api/workers/campaign/route.ts']
    expect(load).toBeTypeOf('function')
    vi.clearAllMocks()
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    expectNoSideEffects()

    const response = await handlers[method](request(method, {}))
    const body = await response.json()

    expect(response.status).toBe(410)
    expect(body).toMatchObject({ error: 'Endpoint aposentado' })
    expectNoSideEffects()
  })
})

describe('qstash-worker-auth', () => {
  const names = [
    'whatsapp-ai-respond',
    'whatsapp-webhook',
    'whatsapp-inbound-media',
    'webhook-delivery',
  ]

  it.each(names)('%s rejects the internal header without signing keys', async name => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')
    const load = workerRoutes[`../app/api/workers/${name}/route.ts`]
    expect(load).toBeTypeOf('function')
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    vi.clearAllMocks()

    const response = await handlers.POST(request('POST', {
      'content-type': 'application/json',
      'x-internal-request': 'true',
    }))

    expect(response.status).toBe(401)
    expect(effects.qstashVerify).not.toHaveBeenCalled()
    expectNoBusinessSideEffects()
  })

  it.each(names)('%s rejects a forged QStash signature before business I/O', async name => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next')
    effects.qstashVerify.mockResolvedValue(false)
    const load = workerRoutes[`../app/api/workers/${name}/route.ts`]
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    vi.clearAllMocks()

    const response = await handlers.POST(request('POST', {
      'content-type': 'application/json',
      'upstash-signature': 'forged',
    }))

    expect(response.status).toBe(401)
    expect(effects.qstashVerify).toHaveBeenCalledTimes(1)
    expectNoBusinessSideEffects()
  })

  it('verified inbound-media reaches its existing business seam', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next')
    effects.qstashVerify.mockResolvedValue(true)
    effects.processInboundMedia.mockResolvedValue({ ok: true })
    const load = workerRoutes['../app/api/workers/whatsapp-inbound-media/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    vi.clearAllMocks()
    effects.qstashVerify.mockResolvedValue(true)

    const body = JSON.stringify({
      cloudMessageId: 'message-1',
      accountId: 'account-1',
      organizationId: 'org-1',
    })
    const response = await handlers.POST(new NextRequest(
      'http://localhost/api/workers/whatsapp-inbound-media',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': 'valid',
        },
        body,
      },
    ))

    expect(response.status).toBe(200)
    expect(effects.qstashVerify).toHaveBeenCalledWith({ signature: 'valid', body })
    expect(effects.processInboundMedia).toHaveBeenCalledTimes(1)
  })

  it.each([
    [1, false],
    [2, true],
  ])('whatsapp-webhook attempt %i sets resumeExistingMessages=%s', async (attempts, resumeExistingMessages) => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next')
    const load = workerRoutes['../app/api/workers/whatsapp-webhook/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    vi.clearAllMocks()
    effects.qstashVerify.mockResolvedValue(true)
    effects.rpc.mockResolvedValueOnce({
      data: [{ raw_payload: { object: 'whatsapp_business_account' }, attempts, max_attempts: 5 }],
      error: null,
    } as any)

    const body = JSON.stringify({ eventId: 'event-1' })
    const response = await handlers.POST(new NextRequest(
      'http://localhost/api/workers/whatsapp-webhook',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'upstash-signature': 'valid',
        },
        body,
      },
    ))

    expect(response.status).toBe(200)
    expect(effects.processWebhookPayload).toHaveBeenCalledWith(
      { object: 'whatsapp_business_account' },
      { resumeExistingMessages },
    )
  })
})

describe('remaining-worker-auth', () => {
  it.each([
    ['process-events', 'GET'],
    ['process-events', 'POST'],
    ['abandoned-cart', 'GET'],
    ['automation-delay', 'GET'],
  ])('%s %s rejects presence-only cron and internal headers', async (name, method) => {
    vi.stubEnv('CRON_SECRET', '')
    const load = workerRoutes[`../app/api/workers/${name}/route.ts`]
    expect(load).toBeTypeOf('function')
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    for (const headers of [
      { 'x-vercel-cron': '1' },
      { 'x-internal-request': 'true' },
    ] as Record<string, string>[]) {
      vi.clearAllMocks()
      const response = await handlers[method](request(method, headers))
      expect(response.status).toBe(401)
      expectNoSideEffects()
    }
  })

  it.each(['automation', 'shopify-sync'])(
    '%s rejects the internal header and forged QStash signatures',
    async name => {
      vi.stubEnv('CRON_SECRET', '')
      const load = workerRoutes[`../app/api/workers/${name}/route.ts`]
      expect(load).toBeTypeOf('function')
      const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

      vi.clearAllMocks()
      let response = await handlers.POST(request('POST', { 'x-internal-request': 'true' }))
      expect(response.status).toBe(401)
      expectNoSideEffects()

      vi.clearAllMocks()
      effects.verifyQStashSignature.mockResolvedValue({ isValid: false, body: null })
      response = await handlers.POST(request('POST', { 'upstash-signature': 'forged' }))
      expect(response.status).toBe(401)
      expect(effects.verifyQStashSignature).toHaveBeenCalledTimes(1)
      expectNoBusinessSideEffects()
    },
  )
})

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

  it('reaches email-domain storage with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/verify-email-domains/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.from).toHaveBeenCalled()
  })

  it('reaches the automation client with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/auto-process/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.createClient).toHaveBeenCalled()
  })

  it('reaches WhatsApp pending recovery with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/reprocess-whatsapp-pending/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.quarantineStuckSending).toHaveBeenCalled()
  })

  it('reaches WhatsApp quality checks with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/whatsapp-quality-check/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.checkAndAlertQualityRating).toHaveBeenCalled()
  })

  it('reaches browse-abandoned detection with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/browse-abandoned/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.runBrowseAbandonedDetection).toHaveBeenCalled()
  })

  it('creates the delayed-run client only with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/check-delayed-runs/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.createClient).toHaveBeenCalled()
  })

  it('creates the recommendation admin client only with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/compute-recommendations/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.POST(request('POST', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.getSupabaseAdmin).toHaveBeenCalled()
  })

  it('checks all integrations only with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/check-integrations/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.checkAllIntegrations).toHaveBeenCalled()
  })

  it('checks one integration only with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/check-integrations/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>
    const integrationRequest = new NextRequest('http://localhost/api/cron/check-integrations', {
      method: 'POST',
      headers: {
        authorization: 'Bearer s3cret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'shopify', integrationId: 'store-1' }),
    })

    const response = await handlers.POST(integrationRequest)

    expect(response.status).not.toBe(401)
    expect(effects.checkIntegration).toHaveBeenCalled()
  })

  it('reaches webhook delivery sweeping with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/webhook-deliveries-sweeper/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.from).toHaveBeenCalled()
  })

  it('reaches coupon pool scanning with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/replenish-coupon-pools/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.listPoolsNeedingStock).toHaveBeenCalled()
  })

  it('reaches popup experiment resolution with a configured Bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const load = routes['../app/api/cron/resolve-popup-experiments/route.ts']
    const handlers = await load() as Record<string, (req: NextRequest) => Promise<Response>>

    const response = await handlers.GET(request('GET', { authorization: 'Bearer s3cret' }))

    expect(response.status).not.toBe(401)
    expect(effects.resolveRunningExperiments).toHaveBeenCalled()
  })
})
