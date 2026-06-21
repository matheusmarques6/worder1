// =============================================
// Phase 0 — Workstream 0D (shared recipient-idempotency helper)
//
// Target: a NEW shared helper (the plan calls it the "shared recipient-
// idempotency helper", used by every send path). The executor must add it;
// the most likely home is src/lib/whatsapp/recipient-claim.ts exporting:
//   - claimRecipient(supabase, id): pending|queued -> sending, returns the row
//     or null if already claimed (the optimistic `.update().in('status',
//     ['pending','queued']).select('id').maybeSingle()` pre-mark).
//   - reReadPendingRecipients(supabase, campaignId, ids): re-reads by id filtered
//     to status IN ('pending','queued') — never trusts a snapshot array.
//
// Because the helper does not exist on claude/debug-console-error-FWrLE, the
// suite probes for it and, if absent, fails with a descriptive message naming
// the contract (so it is RED until 0D lands rather than silently green).
//
// We model whatsapp_campaign_recipients as an in-memory table behind a chainable
// supabase mock that honours .update().in('status',[...]).select().maybeSingle()
// atomically (a single synchronous mutation — the DB row guard is the real
// idempotency boundary, so the test asserts the helper RELIES on it).
// =============================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = {
  id: string
  campaign_id: string
  phone_number: string
  status: string
  sending_at?: string | null
  sent_at?: string | null
  meta_message_id?: string | null
}

// In-memory table shared with the helper under test.
const table: Map<string, Row> = new Map()

function seed(rows: Row[]) {
  table.clear()
  for (const r of rows) table.set(r.id, { ...r })
}

// A minimal chainable supabase-admin mock for the recipients table.
// Supports the two query shapes the 0D helper needs:
//   update(patch).in('status', allowed) constrained by .eq('id', id) .select('id').maybeSingle()
//   select(cols).eq('campaign_id', cid).in('id', ids).in('status', allowed)
function makeBuilder(tbl: string) {
  let op: 'update' | 'select' | null = null
  let patch: Partial<Row> = {}
  const filters: { eqId?: string; eqCampaign?: string; inStatus?: string[]; inIds?: string[] } = {}

  const exec = () => {
    if (op === 'update') {
      // Atomic conditional update: only mutate if the row currently matches the
      // status filter. This mirrors a Postgres UPDATE ... WHERE status IN (...)
      // — the row-level guard is the idempotency boundary.
      const id = filters.eqId
      const row = id ? table.get(id) : undefined
      if (!row) return { data: null, error: null }
      const statusOk = !filters.inStatus || filters.inStatus.includes(row.status)
      if (!statusOk) return { data: null, error: null } // already claimed → no row
      Object.assign(row, patch)
      table.set(row.id, row)
      return { data: { id: row.id }, error: null }
    }
    // select
    let rows = [...table.values()]
    if (filters.eqCampaign) rows = rows.filter((r) => r.campaign_id === filters.eqCampaign)
    if (filters.inIds) rows = rows.filter((r) => filters.inIds!.includes(r.id))
    if (filters.inStatus) rows = rows.filter((r) => filters.inStatus!.includes(r.status))
    return { data: rows.map((r) => ({ ...r })), error: null }
  }

  const builder: any = {
    update(p: Partial<Row>) {
      op = 'update'
      patch = p
      return builder
    },
    select() {
      if (op !== 'update') op = 'select'
      return builder
    },
    eq(col: string, val: string) {
      if (col === 'id') filters.eqId = val
      if (col === 'campaign_id') filters.eqCampaign = val
      return builder
    },
    in(col: string, vals: string[]) {
      if (col === 'status') filters.inStatus = vals
      if (col === 'id') filters.inIds = vals
      return builder
    },
    maybeSingle() {
      const r = exec()
      return Promise.resolve({ data: (r.data as any) ?? null, error: r.error })
    },
    then(resolve: any) {
      // allow awaiting the select chain directly
      return Promise.resolve(exec()).then(resolve)
    },
  }
  return builder
}

const supabaseAdmin = {
  from: vi.fn((t: string) => makeBuilder(t)),
}

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Probe for the helper module. If it doesn't exist yet, the import throws and
// we surface a descriptive RED failure instead of a cryptic resolution error.
let helper: any = null
let helperLoadError: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  helper = await import('@/lib/whatsapp/recipient-claim')
} catch (e) {
  helperLoadError = e
}

beforeEach(() => {
  table.clear()
  supabaseAdmin.from.mockClear()
})

describe('0D: shared recipient-idempotency helper exists', () => {
  it('exports claimRecipientForSend + reReadClaimableRecipients', () => {
    expect(
      helperLoadError,
      'Phase 0D requires src/lib/whatsapp/recipient-claim.ts; module failed to import',
    ).toBeNull()
    expect(helper?.claimRecipientForSend, '0D: claimRecipientForSend(id) missing').toBeTypeOf('function')
    expect(
      helper?.reReadClaimableRecipients,
      '0D: reReadClaimableRecipients(ids) missing',
    ).toBeTypeOf('function')
  })
})

describe('0D: sending pre-mark claims a recipient at most once', () => {
  it('first claim transitions pending->sending and returns true; a second claim returns false', async () => {
    if (!helper?.claimRecipientForSend) return // gated by the existence test above
    seed([{ id: 'r1', campaign_id: 'c1', phone_number: '551199', status: 'pending' }])

    const first = await helper.claimRecipientForSend('r1')
    expect(first).toBe(true)
    expect(table.get('r1')!.status).toBe('sending')

    const second = await helper.claimRecipientForSend('r1')
    // Already 'sending' → not in ('pending','queued') → no row → false.
    expect(second).toBe(false)
  })

  it('queued recipients are also claimable (status IN pending|queued)', async () => {
    if (!helper?.claimRecipientForSend) return
    seed([{ id: 'rq', campaign_id: 'c1', phone_number: '551100', status: 'queued' }])
    const claimed = await helper.claimRecipientForSend('rq')
    expect(claimed).toBe(true)
    expect(table.get('rq')!.status).toBe('sending')
  })

  it('CONTRACT: replaying a batch sends each recipient at most once', async () => {
    if (!helper?.claimRecipientForSend) return
    seed([
      { id: 'a', campaign_id: 'c1', phone_number: '1', status: 'pending' },
      { id: 'b', campaign_id: 'c1', phone_number: '2', status: 'pending' },
    ])
    const ids = ['a', 'b']

    // Simulate two overlapping drives of the SAME batch (the Phase-1 C3 /
    // Phase-3 re-drive). Each drive claims-then-"sends" only rows it won.
    const sends: string[] = []
    const drive = async () => {
      for (const id of ids) {
        const claimed = await helper.claimRecipientForSend(id)
        if (claimed) {
          sends.push(id) // pretend Meta accepted
          table.get(id)!.status = 'sent'
          table.get(id)!.sent_at = new Date().toISOString()
        }
      }
    }
    await Promise.all([drive(), drive()])

    // Each recipient sent exactly once across both drives.
    expect(sends.sort()).toEqual(['a', 'b'])
    expect(sends.filter((x) => x === 'a').length).toBe(1)
    expect(sends.filter((x) => x === 'b').length).toBe(1)
  })
})

describe('0D: re-read filters to pending|queued, never trusts a snapshot array', () => {
  it('re-read excludes rows already sent/sending/failed', async () => {
    if (!helper?.reReadClaimableRecipients) return
    seed([
      { id: 'p1', campaign_id: 'c1', phone_number: '1', status: 'pending' },
      { id: 's1', campaign_id: 'c1', phone_number: '2', status: 'sent' },
      { id: 'g1', campaign_id: 'c1', phone_number: '3', status: 'queued' },
      { id: 'x1', campaign_id: 'c1', phone_number: '4', status: 'sending' },
      { id: 'f1', campaign_id: 'c1', phone_number: '5', status: 'failed' },
    ])
    const snapshot = ['p1', 's1', 'g1', 'x1', 'f1'] // original batch array
    const fresh = await helper.reReadClaimableRecipients(snapshot)
    const freshIds = fresh.map((r: any) => r.id).sort()
    expect(freshIds).toEqual(['g1', 'p1']) // only pending|queued survive
  })
})

describe('0D: crash between Meta-accept and sent-commit leaves recipient in sending', () => {
  it('injected crash after claim leaves status=sending (not pending, not re-sent)', async () => {
    if (!helper?.claimRecipientForSend) return
    seed([{ id: 'crash', campaign_id: 'c1', phone_number: '1', status: 'pending' }])

    // Drive that crashes AFTER claim + Meta-accept but BEFORE the sent commit.
    const driveThatCrashes = async () => {
      const claimed = await helper.claimRecipientForSend('crash')
      expect(claimed).toBe(true)
      // ... Meta accepted here ...
      throw new Error('worker crashed before sent-commit')
    }
    await expect(driveThatCrashes()).rejects.toThrow(/crashed/)

    // CONTRACT (0D): the row is left 'sending' — NOT reverted to pending — so a
    // re-drive will NOT re-send it (claim returns null), and the quarantine
    // sweep can flip it to failed later. Bias: rather leave unsent-and-flagged
    // than risk a duplicate (Meta has no send-idempotency key).
    expect(table.get('crash')!.status).toBe('sending')

    // A subsequent re-drive must not re-claim it.
    const reclaim = await helper.claimRecipientForSend('crash')
    expect(reclaim).toBe(false)
  })
})
