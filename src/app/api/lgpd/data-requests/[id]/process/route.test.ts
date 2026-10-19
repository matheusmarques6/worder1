import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const boundary = vi.hoisted(() => ({ admin: null as any, auth: vi.fn(), email: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (t: string) => boundary.admin.from(t) } }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: boundary.auth }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: boundary.email }))
import { POST } from './route'

type Row = Record<string, any>
type Call = { table: string; action: string; patch?: Row; filters: [string, any][] }
function database() {
  const rows: Record<string, Row[]> = {
    lgpd_data_requests: [{ id: 'request-a', organization_id: 'org-a', contact_id: 'contact-a', request_type: 'delete', status: 'pending', verified_at: '2026-10-01', requester_email: 'person@example.test', payload: {} }],
    contacts: [{ id: 'contact-a', organization_id: 'org-a', email: 'private-canary@example.test', first_name: 'Private canary' }, { id: 'contact-b', organization_id: 'org-b', email: 'other@example.test' }],
  }
  const calls: Call[] = []
  let fail: ((call: Call) => boolean) | undefined
  const admin = { from(table: string) {
    const call: Call = { table, action: 'select', filters: [] }
    let single = false, start = 0, end = Infinity
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: any) => { call.filters.push([k, v]); return q },
      in: (k: string, v: any[]) => { call.filters.push([k, v]); return q },
      neq: (k: string, v: any) => { call.filters.push([`!${k}`, v]); return q },
      limit: (n: number) => { end = n - 1; return q },
      range: (a: number, b: number) => { start = a; end = b; return q },
      maybeSingle: () => { single = true; return q },
      single: () => { single = true; return q },
      update: (patch: Row) => { call.action = 'update'; call.patch = patch; return q },
      delete: () => { call.action = 'delete'; return q },
      then(resolve: any, reject: any) {
        calls.push(call)
        if (fail?.(call)) return Promise.resolve({ data: null, error: { message: 'database private-canary failure', code: 'XX000' }, count: null }).then(resolve, reject)
        const matching = (rows[table] || []).filter(row => call.filters.every(([k, v]) => k.startsWith('!') ? row[k.slice(1)] !== v : Array.isArray(v) ? v.includes(row[k]) : row[k] === v))
        if (call.action === 'update') matching.forEach(row => Object.assign(row, structuredClone(call.patch)))
        if (call.action === 'delete') rows[table] = (rows[table] || []).filter(row => !matching.includes(row))
        const data = structuredClone(matching.slice(start, end + 1))
        return Promise.resolve({ data: single ? data[0] || null : data, error: null, count: matching.length }).then(resolve, reject)
      },
    }
    return q
  } }
  return { rows, calls, admin, setFail: (f: (call: Call) => boolean) => { fail = f } }
}

let db: ReturnType<typeof database>
const processRequest = () => POST(new NextRequest('https://local.test/api/lgpd/data-requests/request-a/process', { method: 'POST' }), { params: Promise.resolve({ id: 'request-a' }) })
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
  db = database(); boundary.admin = db.admin
  boundary.auth.mockReset().mockResolvedValue({ user: { role: 'admin', organization_id: 'org-a' } })
  boundary.email.mockReset().mockResolvedValue({})
})

describe('LGPD processing through the real handler', () => {
  it('never completes or leaks the database error when anonymization fails', async () => {
    db.setFail(c => c.table === 'contacts' && c.action === 'update')
    const res = await processRequest()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
    expect(JSON.stringify(await res.json())).not.toContain('private-canary')
    expect(boundary.email).not.toHaveBeenCalled()
  })
  it('never assigns the generated full_name column when erasing', async () => {
    await processRequest()
    const update = db.calls.find(c => c.table === 'contacts' && c.action === 'update')
    expect(update).toBeDefined()
    expect(update!.patch).not.toHaveProperty('full_name')
  })
  it('rejects a linked contact belonging to another organization before writes', async () => {
    db.rows.lgpd_data_requests[0].contact_id = 'contact-b'
    const res = await processRequest()
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(db.rows.contacts[1].email).toBe('other@example.test')
    expect(db.calls.filter(c => c.action !== 'select' && c.table !== 'lgpd_data_requests')).toEqual([])
  })
  it('fails closed when no cron secret and no authenticated administrator exist', async () => {
    vi.stubEnv('CRON_SECRET', '')
    boundary.auth.mockResolvedValue(null)
    expect((await processRequest()).status).toBe(401)
    expect(db.calls).toEqual([])
  })
  it('does not store or email the exported personal data', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'export'
    const res = await processRequest()
    expect(res.status).toBeLessThan(400)
    expect(JSON.stringify(db.rows.lgpd_data_requests[0].response)).not.toContain('private-canary')
    expect(JSON.stringify(boundary.email.mock.calls)).not.toContain('private-canary')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
  it.each(['delete', 'export'])('keeps %s under review until the whole data graph has been verified', async request_type => {
    db.rows.lgpd_data_requests[0].request_type = request_type
    const res = await processRequest()
    expect(res.status).toBe(202)
    expect(db.rows.lgpd_data_requests[0].status).toBe('processing')
    expect(db.rows.lgpd_data_requests[0].response.needs_review).toBe(true)
    expect(db.rows.lgpd_data_requests[0].processed_at).toBeNull()
    expect(boundary.email).not.toHaveBeenCalled()
  })
  it('exports paginated canonical messages only through the scoped contact conversation', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'export'
    db.rows.conversations = [{ id: 'conversation-a', organization_id: 'org-a', contact_id: 'contact-a' }, { id: 'conversation-b', organization_id: 'org-b', contact_id: 'contact-a' }]
    db.rows.messages = Array.from({ length: 1001 }, (_, i) => ({ id: `message-${i}`, organization_id: 'org-a', conversation_id: 'conversation-a', content: { text: `message ${i}` } }))
    db.rows.messages.push({ id: 'foreign', organization_id: 'org-b', conversation_id: 'conversation-a', content: { text: 'other-tenant-canary' } })
    const body = await (await processRequest()).json()
    expect(body.response.graph.messages).toHaveLength(1001)
    expect(JSON.stringify(body.response)).not.toContain('other-tenant-canary')
  })
  it('scrubs previous export copies for this contact without touching another subject', async () => {
    db.rows.lgpd_data_requests.push({ id: 'old-export', organization_id: 'org-a', contact_id: 'contact-a', request_type: 'export', status: 'completed', response: { data: 'old-private-canary' } })
    db.rows.lgpd_data_requests.push({ id: 'other-export', organization_id: 'org-a', contact_id: 'other-contact', response: { data: 'preserve-other-subject' } })
    await processRequest()
    expect(JSON.stringify(db.rows.lgpd_data_requests[1].response)).not.toContain('old-private-canary')
    expect(db.rows.lgpd_data_requests[2].response.data).toBe('preserve-other-subject')
  })
  it('leaves cancelled requests untouched', async () => {
    db.rows.lgpd_data_requests[0].status = 'cancelled'
    expect((await processRequest()).status).toBe(409)
    expect(db.calls.filter(c => c.action !== 'select')).toEqual([])
  })
  it.each(['contact_events', 'crm_form_submissions', 'shopify_orders'])('does not certify an export when mandatory %s lookup fails', async table => {
    db.rows.lgpd_data_requests[0].request_type = 'export'
    db.setFail(c => c.table === table)
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
  })
  it('does not certify erasure when a popup update fails', async () => {
    db.setFail(c => c.table === 'crm_form_submissions' && c.action === 'update')
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
  })
  it('rejects unsupported requests instead of recording completion', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'unknown'
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
  })
  it('rejects a full_name-only rectification rather than assigning a generated column', async () => {
    Object.assign(db.rows.lgpd_data_requests[0], { request_type: 'rectification', payload: { updates: { full_name: 'new name' } } })
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.calls.filter(c => c.table === 'contacts' && c.action === 'update')).toEqual([])
  })
  it('completes a valid rectification and retry has no duplicate mutation', async () => {
    Object.assign(db.rows.lgpd_data_requests[0], { request_type: 'rectification', payload: { updates: { first_name: 'Corrected' } } })
    expect((await processRequest()).status).toBe(200)
    expect(db.rows.contacts[0].first_name).toBe('Corrected')
    expect(db.rows.lgpd_data_requests[0].status).toBe('completed')
    await processRequest()
    expect(db.calls.filter(c => c.table === 'contacts' && c.action === 'update')).toHaveLength(1)
  })
  it('does not report success when persisting completion fails', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'restrict'
    db.setFail(c => c.table === 'lgpd_data_requests' && c.patch?.status === 'completed')
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(boundary.email).not.toHaveBeenCalled()
  })
  it('requires an affected contact row before certifying a restriction', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'restrict'
    db.setFail(c => { if (c.table === 'contacts' && c.action === 'update') db.rows.contacts = []; return false })
    expect((await processRequest()).status).toBe(500)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
  })
  it('uses the text consent schema and suppresses every marketing subscription', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'restrict'
    expect((await processRequest()).status).toBe(200)
    expect(db.rows.contacts[0]).toMatchObject({
      suppressed: true, email_consent: 'unsubscribed', sms_consent: false, whatsapp_consent: false,
      is_subscribed_email: false, is_subscribed_sms: false, is_subscribed_whatsapp: false,
    })
  })
  it.each([
    ['whatsapp_contacts', 'whatsapp_cloud_conversations', 'whatsapp_cloud_messages'],
    ['instagram_contacts', 'instagram_conversations', 'instagram_messages'],
  ])('follows %s channel contact ids without including another subject', async (contacts, conversations, messages) => {
    db.rows.lgpd_data_requests[0].request_type = 'export'
    db.rows[contacts] = [{ id: 'channel-contact-a', organization_id: 'org-a', crm_contact_id: 'contact-a' }, { id: 'channel-contact-b', organization_id: 'org-a', crm_contact_id: 'contact-b' }]
    db.rows[conversations] = [{ id: 'thread-a', organization_id: 'org-a', contact_id: 'channel-contact-a' }, { id: 'thread-b', organization_id: 'org-a', contact_id: 'channel-contact-b' }]
    db.rows[messages] = [{ id: 'own', organization_id: 'org-a', conversation_id: 'thread-a' }, { id: 'other', organization_id: 'org-a', conversation_id: 'thread-b' }]
    const body = await (await processRequest()).json()
    expect(body.response.graph[messages].map((row: Row) => row.id)).toEqual(['own'])
    expect(db.rows[messages]).toHaveLength(2)
  })
})
