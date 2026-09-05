// =============================================
// Phase 0 — campaign-processor wiring for 0C (error-code pipeline) and 0D
// (re-read on replay). NEW file so it does not clobber campaign-processor.test.ts.
//
// Grounded call sites on claude/debug-console-error-FWrLE:
//   - send:            campaign-processor.ts:550 (whatsAppRetry -> sendTemplateMessage)
//   - sent commit:     :562-569 (status='sent')  — NOT atomic with the send
//   - catch -> ladder: :577-592  rateLimiter.recordError(error.code || 'UNKNOWN')
//                                  error_code: error.code?.toString() || 'UNKNOWN'
//   - re-read:         processBatch consumes data.recipients (the job SNAPSHOT),
//                      it does NOT re-read by id filtered to pending|queued.
//
// 0C: the error thrown by meta-api.ts:118 is a bare `new Error(message)` with NO
// `.code`. So recordError() and error_code both collapse to 'UNKNOWN'. After
// Phase 0, the error reaching :577 must carry a numeric `.code` (parsed from
// data.error.code in meta-api, or routed through WhatsAppCloudError). We assert
// the OBSERVABLE: recordError receives a numeric code and the recipient row's
// error_code is the numeric string, not 'UNKNOWN'.
// =============================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- capture stores -------------------------------------------------------
const recordedErrorCodes: Array<string | number> = []
const recipientUpdates: any[] = []
const rpcCalls: any[] = []

// ---- supabase mock: stateful enough to observe status writes + re-reads ----
const recipientTable = new Map<string, any>()

function recipientBuilder() {
  let op: 'update' | 'select' | null = null
  let patch: any = {}
  const f: any = {}
  const exec = () => {
    if (op === 'update') {
      const row = recipientTable.get(f.eqId)
      if (row) {
        const statusOk = !f.inStatus || f.inStatus.includes(row.status)
        if (statusOk) {
          Object.assign(row, patch)
          recipientUpdates.push({ id: f.eqId, ...patch })
          return { data: { id: f.eqId }, error: null }
        }
      }
      return { data: null, error: null }
    }
    let rows = [...recipientTable.values()]
    if (f.eqCampaign) rows = rows.filter((r) => r.campaign_id === f.eqCampaign)
    if (f.inIds) rows = rows.filter((r) => f.inIds.includes(r.id))
    if (f.inStatus) rows = rows.filter((r) => f.inStatus.includes(r.status))
    return { data: rows.map((r) => ({ ...r })), error: null }
  }
  const b: any = {
    update(p: any) { op = 'update'; patch = p; return b },
    select() { if (op !== 'update') op = 'select'; return b },
    eq(c: string, v: string) { if (c === 'id') f.eqId = v; if (c === 'campaign_id') f.eqCampaign = v; return b },
    in(c: string, v: string[]) { if (c === 'status') f.inStatus = v; if (c === 'id') f.inIds = v; return b },
    maybeSingle() { const r = exec(); return Promise.resolve({ data: r.data ?? null, error: r.error }) },
    then(res: any) { return Promise.resolve(exec()).then(res) },
  }
  return b
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((t: string) => recipientBuilder()),
    rpc: vi.fn((name: string, args: any) => { rpcCalls.push({ name, args }); return Promise.resolve({ data: null, error: null }) }),
  },
}))

// ---- rate limiter / circuit breaker: capture recordError + always-allow ----
const mockCanSend = vi.fn().mockResolvedValue({ allowed: true })
vi.mock('@/lib/whatsapp/rate-limiter', () => ({
  getRateLimiter: vi.fn(() => ({
    canSend: mockCanSend,
    recordError: vi.fn((code: any) => { recordedErrorCodes.push(code); return Promise.resolve() }),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    getRecommendedDelay: vi.fn(() => 0),
  })),
  WhatsAppRateLimiter: class {},
}))
vi.mock('@/lib/whatsapp/circuit-breaker', () => ({
  getCircuitBreaker: vi.fn(() => ({
    canExecute: vi.fn().mockResolvedValue(true),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  })),
  CircuitBreaker: class {},
}))

// ---- meta-api: throw an error that DOES carry numeric .code (the 0C target) --
// This simulates the POST-Phase-0 meta-api throw site. The test asserts the
// processor propagates that numeric code into recordError + error_code.
const sendTemplateMessage = vi.fn()
vi.mock('@/lib/whatsapp/meta-api', () => ({ sendTemplateMessage: (...a: any[]) => sendTemplateMessage(...a) }))
vi.mock('@/lib/whatsapp/opt-out-guard', () => ({ requireOptIn: vi.fn().mockResolvedValue({ allowed: true }) }))
vi.mock('@/lib/whatsapp/alerts', () => ({ sendAlert: vi.fn() }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({ wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/whatsapp/queue', () => ({
  campaignQueue: { add: vi.fn(), addBatch: vi.fn().mockResolvedValue([]), complete: vi.fn(), fail: vi.fn() },
  MessageQueue: class {},
}))

import CampaignProcessor from '@/lib/whatsapp/campaign-processor'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { campaignQueue } from '@/lib/whatsapp/queue'

function batchData(recipients: any[]) {
  return {
    campaignId: 'c1',
    organizationId: 'org-1',
    recipients,
    instance: { id: 'inst-1', tier: 1, phoneNumberId: 'pnid', accessToken: 'tok' },
    template: { name: 'promo', language: 'pt_BR', category: 'MARKETING', shape: { body_text: 'Hello!' } },
    mediaUrl: undefined,
    mediaType: undefined,
    batchIndex: 0,
  }
}

beforeEach(() => {
  recordedErrorCodes.length = 0
  recipientUpdates.length = 0
  rpcCalls.length = 0
  recipientTable.clear()
  mockCanSend.mockResolvedValue({ allowed: true })
  sendTemplateMessage.mockReset()
  vi.mocked(supabaseAdmin.from).mockImplementation((() => recipientBuilder()) as any)
  vi.mocked(campaignQueue.addBatch).mockClear()
})

describe('campaign template shape survives the serialized batch', () => {
  it.each([
    { label: 'JSONB dynamic URL fails before Meta', components: [{ type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://shop.example/{{1}}' }] }], buttons: null, fails: true, expected: [] },
    { label: 'flat dynamic URL fails before Meta', components: null, buttons: [{ type: 'URL', url: 'https://shop.example/{{1}}' }], fails: true, expected: [] },
    { label: 'static template sends unchanged', components: null, buttons: [{ type: 'URL', url: 'https://shop.example/' }], fails: false, expected: [] },
    { label: 'media header precedes numerically ordered body vars', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hello {{1}}, order {{2}}' }], buttons: null, fails: false, expected: [
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://shop.example/header.jpg' } }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '123' }] },
    ] },
  ])('$label', async ({ components, buttons, fails, expected }) => {
    const template = {
      name: 'approved_promo', status: 'APPROVED', language: 'en_US', category: 'MARKETING',
      components, buttons, header_type: null, body_text: 'Hello!',
    }
    const templateFilters: Array<[string, unknown]> = []
    recipientTable.set('r1', {
      id: 'r1', campaign_id: 'c1', phone_number: '5511999990001',
      contact_name: null, status: 'pending', resolved_variables: expected.length ? { '2': '123', '1': 'Ana' } : {}, retry_count: 0,
    })
    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
      if (table === 'whatsapp_campaign_recipients') return recipientBuilder()
      if (table === 'whatsapp_campaign_logs') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      let columns = ''
      const query: any = {
        select: (value: string) => { columns = value; return query },
        eq: (key: string, value: unknown) => {
          if (table === 'whatsapp_templates') templateFilters.push([key, value])
          return query
        },
        update: () => query,
        single: async () => ({ data: table === 'whatsapp_campaigns'
          ? { id: 'c1', organization_id: 'org-1', status: 'draft', template_id: 'tpl-1', template_name: 'stale_name', media_url: 'https://shop.example/header.jpg', media_type: 'image' }
          : { id: 'inst-1', phone_number_id: 'pnid', access_token: 'tok', messaging_limit_tier: 'TIER_250' }, error: null }),
        // Mirror PostgREST projection: returning unselected shape would hide a broken query.
        maybeSingle: async () => ({ data: Object.fromEntries(columns.split(',').map(key => {
          const field = key.trim() as keyof typeof template
          return [field, template[field]]
        })), error: null }),
      }
      return query
    }) as any)
    sendTemplateMessage.mockResolvedValue({ messages: [{ id: 'wamid.invalid' }] })

    const processor: any = new CampaignProcessor()
    expect((await processor.startCampaign('c1')).success).toBe(true)
    const batches = vi.mocked(campaignQueue.addBatch).mock.calls[0][1]
    const batch = JSON.parse(JSON.stringify(batches[0]))
    const result = await processor.processBatch(batch)

    if (fails) {
      expect(sendTemplateMessage).not.toHaveBeenCalled()
      expect(result).toMatchObject({ sent: 0, failed: 1 })
      expect(recipientTable.get('r1')).toMatchObject({ status: 'failed', error_code: 'button_vars_mismatch' })
    } else {
      expect(result).toMatchObject({ sent: 1, failed: 0 })
      expect(sendTemplateMessage).toHaveBeenCalledTimes(1)
      expect(sendTemplateMessage).toHaveBeenCalledWith({
        phoneNumberId: 'pnid', accessToken: 'tok', to: '5511999990001',
        templateName: 'approved_promo', languageCode: 'en_US', components: expected,
      })
    }
    expect(batch.template).toMatchObject({ name: 'approved_promo', language: 'en_US' })
    expect(templateFilters).toEqual([['id', 'tpl-1'], ['organization_id', 'org-1']])
  })

  it('old serialized batch without shape fails before Meta with an actionable error', async () => {
    const recipient = { id: 'old', phone_number: '1', resolved_variables: {}, retry_count: 0 }
    recipientTable.set('old', { ...recipient, campaign_id: 'c1', status: 'pending' })
    sendTemplateMessage.mockResolvedValue({ messages: [{ id: 'wamid.old' }] })
    const processor: any = new CampaignProcessor()
    const oldBatch: any = batchData([recipient])
    delete oldBatch.template.shape
    const result = await processor.processBatch(oldBatch)
    expect(sendTemplateMessage).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: 0, failed: 1 })
    expect(result.errors[0].error).toMatch(/template.*shape.*unsent recipients/i)
  })
})

// ---------------------------------------------------------------------------
// 0C — numeric error code flows into recordError + error_code
// ---------------------------------------------------------------------------
describe('0C: a Meta code:4 error records a NUMERIC code, not UNKNOWN', () => {
  it('recordError receives 4 and recipient.error_code is "4"', async () => {
    recipientTable.set('r1', { id: 'r1', campaign_id: 'c1', phone_number: '5511999990001', status: 'pending', retry_count: 0 })

    // POST-Phase-0 meta-api throw: error carries numeric .code.
    const err: any = new Error('(#4) Rate limit hit')
    err.code = 4
    sendTemplateMessage.mockRejectedValue(err)

    const processor: any = new CampaignProcessor()
    await processor.processBatch(batchData([
      { id: 'r1', phone_number: '5511999990001', resolved_variables: {}, retry_count: 0 },
    ]))

    // CONTRACT (0C): RED on current code because meta-api.ts:118 throws a bare
    // Error with no .code, so recordError gets 'UNKNOWN'. After Phase 0 it is 4.
    expect(recordedErrorCodes).toContain(4)
    expect(recordedErrorCodes).not.toContain('UNKNOWN')

    const failedWrite = recipientUpdates.find((u) => u.status === 'failed')
    expect(failedWrite).toBeTruthy()
    expect(failedWrite.error_code).toBe('4')
    expect(failedWrite.error_code).not.toBe('UNKNOWN')
  })

  it('a successful send records status=sent and never calls recordError', async () => {
    recipientTable.set('r2', { id: 'r2', campaign_id: 'c1', phone_number: '5511999990002', status: 'pending', retry_count: 0 })
    sendTemplateMessage.mockResolvedValue({ messages: [{ id: 'wamid.X' }] })

    const processor: any = new CampaignProcessor()
    const res = await processor.processBatch(batchData([
      { id: 'r2', phone_number: '5511999990002', resolved_variables: {}, retry_count: 0 },
    ]))

    expect(res.sent).toBe(1)
    expect(recordedErrorCodes).toHaveLength(0)
    const sentWrite = recipientUpdates.find((u) => u.status === 'sent')
    expect(sentWrite).toBeTruthy()
    expect(sentWrite.meta_message_id).toBe('wamid.X')
  })
})

// ---------------------------------------------------------------------------
// 0D — replaying a batch must not re-send already-sent recipients
//
// CURRENT BEHAVIOUR DEMONSTRATION + CONTRACT:
// processBatch consumes data.recipients (the snapshot). On replay with the same
// snapshot, the current code re-sends rows already 'sent' (no re-read, no claim).
// Phase 0D requires either a pre-send claim (pending|queued -> sending) or a
// re-read filtered to pending|queued. We assert the post-fix invariant: across
// two drives of the same snapshot, sendTemplateMessage fires at most once per id.
// ---------------------------------------------------------------------------
describe('0D: replaying the same batch sends each recipient at most once (RED until 0D lands)', () => {
  it('two drives of the same snapshot => one Meta send per recipient', async () => {
    recipientTable.set('d1', { id: 'd1', campaign_id: 'c1', phone_number: '1', status: 'pending', retry_count: 0 })
    sendTemplateMessage.mockResolvedValue({ messages: [{ id: 'wamid.d1' }] })

    const snapshot = [{ id: 'd1', phone_number: '1', resolved_variables: {}, retry_count: 0 }]
    const processor: any = new CampaignProcessor()

    await processor.processBatch(batchData(snapshot))
    // Row is now 'sent'. Replay the SAME snapshot (Phase-1 C3 / Phase-3 re-drive).
    await processor.processBatch(batchData(snapshot))

    const sendsForD1 = sendTemplateMessage.mock.calls.filter(
      (c) => c[0]?.to === '1',
    ).length

    // CONTRACT (0D): exactly one Meta send across both drives.
    // RED on current code: processBatch trusts data.recipients and does not
    // re-read by status nor claim, so the second drive sends again.
    expect(sendsForD1).toBe(1)
  })
})
