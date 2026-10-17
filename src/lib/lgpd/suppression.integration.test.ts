import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const boundary = vi.hoisted(() => ({ admin: null as any, email: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: (table: string) => boundary.admin.from(table) } }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: async () => ({ user: { role: 'admin', organization_id: 'org-a' } }) }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: boundary.email }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({ wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

// Both consumers are real: a completed request must change the sender decision.
import { POST } from '@/app/api/lgpd/data-requests/[id]/process/route'
import { requireOptIn } from '@/lib/whatsapp/opt-out-guard'
import { erasePopupData } from '@/lib/popups/lgpd'

const PHONE = '5511987654321'
const OTHER_PHONE = '5511976543210'
type Row = Record<string, any>

function fixture() {
  const rows: Record<string, Row[]> = {
    contacts: [{ id: 'contact-a', organization_id: 'org-a', phone: '+55 (11) 98765-4321' }],
    lgpd_data_requests: [{ id: 'request-a', organization_id: 'org-a', contact_id: 'contact-a', request_type: 'restrict', status: 'pending', verified_at: '2026-10-01', requester_email: 'synthetic@example.test' }],
    whatsapp_opt_status: [
      { id: 'other-person', organization_id: 'org-a', contact_id: 'contact-b', phone: OTHER_PHONE, status: 'opted_in' },
      { id: 'other-tenant', organization_id: 'org-b', contact_id: 'contact-c', phone: PHONE, status: 'opted_in' },
    ],
  }
  let failWrites = false
  const admin = { from(table: string) {
    let action = 'select', patch: Row = {}, single = false, start = 0, end = Infinity
    const filters: [string, any][] = []
    const q: any = {
      select: () => q, order: () => q,
      eq: (key: string, value: any) => { filters.push([key, value]); return q },
      in: (key: string, value: any) => { filters.push([key, value]); return q },
      limit: (n: number) => { end = n - 1; return q },
      range: (a: number, b: number) => { start = a; end = b; return q },
      maybeSingle: () => { single = true; return q },
      update: (data: Row) => { action = 'update'; patch = data; return q },
      insert: (data: Row) => { action = 'insert'; patch = data; return q },
      then(resolve: any, reject: any) {
        if (failWrites && table === 'whatsapp_opt_status' && action !== 'select') return Promise.resolve({ data: null, error: { message: 'write denied' } }).then(resolve, reject)
        const tableRows = rows[table] ||= []
        let selected = tableRows.filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value))
        if (action === 'update') selected.forEach(row => Object.assign(row, structuredClone(patch)))
        if (action === 'insert') { const row = { id: `insert-${tableRows.length}`, ...structuredClone(patch) }; tableRows.push(row); selected = [row] }
        const data = structuredClone(selected.slice(start, end + 1))
        const error = single && data.length > 1 ? { code: 'PGRST116', message: 'multiple rows' } : null
        return Promise.resolve({ data: error ? null : single ? data[0] || null : data, count: selected.length, error }).then(resolve, reject)
      },
    }
    return q
  } }
  return { rows, admin, fail: () => { failWrites = true } }
}

let db: ReturnType<typeof fixture>
const processRequest = () => POST(new NextRequest('https://local.test/lgpd', { method: 'POST' }), { params: Promise.resolve({ id: 'request-a' }) })
const canMarket = (org = 'org-a', phone = PHONE) => requireOptIn(org, phone, 'MARKETING')

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret')
  db = fixture(); boundary.admin = db.admin; boundary.email.mockReset()
})

describe('LGPD operational phone suppression', () => {
  it.each(['restrict', 'object'])('%s blocks a sender with an existing opted-in row', async requestType => {
    db.rows.lgpd_data_requests[0].request_type = requestType
    db.rows.whatsapp_opt_status.push({ id: 'own', organization_id: 'org-a', contact_id: 'contact-a', phone: PHONE, status: 'opted_in' })
    expect((await canMarket()).allowed).toBe(true)
    expect((await processRequest()).status).toBe(200)
    expect((await canMarket()).allowed).toBe(false)
    expect((await canMarket('org-b')).allowed).toBe(true)
    expect((await canMarket('org-a', OTHER_PHONE)).allowed).toBe(true)
  })
  it('creates a phone-keyed suppression when the legacy phonebook has no opt row', async () => {
    expect((await canMarket()).allowed).toBe(true)
    expect((await processRequest()).status).toBe(200)
    expect((await canMarket()).allowed).toBe(false)
    await processRequest()
    expect(db.rows.whatsapp_opt_status.filter(row => row.organization_id === 'org-a' && row.phone === PHONE)).toHaveLength(1)
  })
  it('preserves the sender lookup before, after and on retry of popup erasure', async () => {
    db.rows.whatsapp_opt_status.push({ id: 'own', organization_id: 'org-a', contact_id: 'contact-a', phone: PHONE, status: 'opted_out' })
    expect((await canMarket()).allowed).toBe(false)
    await erasePopupData(db.admin as any, 'org-a', 'contact-a')
    expect((await canMarket()).allowed).toBe(false)
    await erasePopupData(db.admin as any, 'org-a', 'contact-a')
    expect((await canMarket()).allowed).toBe(false)
    expect(db.rows.whatsapp_opt_status.find(row => row.id === 'own')?.phone).toBe(PHONE)
    expect((await canMarket('org-b')).allowed).toBe(true)
    expect((await canMarket('org-a', OTHER_PHONE)).allowed).toBe(true)
  })
  it('does not certify restriction or notify completion when suppression cannot be saved', async () => {
    db.fail()
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
    expect(boundary.email).not.toHaveBeenCalled()
  })
  it('suppresses the phone before partial deletion removes it from the contact', async () => {
    db.rows.lgpd_data_requests[0].request_type = 'delete'
    expect((await processRequest()).status).toBe(202)
    expect(db.rows.contacts[0].phone).toBeNull()
    expect((await canMarket()).allowed).toBe(false)
    expect(db.rows.lgpd_data_requests[0].status).toBe('processing')
    await processRequest()
    expect((await canMarket()).allowed).toBe(false)
  })
  it('suppresses explicitly linked channel identities even when the CRM phone is absent', async () => {
    db.rows.contacts[0].phone = null
    db.rows.channel_identities = [{ id: 'identity-a', organization_id: 'org-a', contact_id: 'contact-a', channel: 'whatsapp', external_id: PHONE }]
    db.rows.whatsapp_contacts = [{ id: 'wa-a', organization_id: 'org-a', crm_contact_id: 'contact-a', phone_number: OTHER_PHONE }]
    db.rows.whatsapp_opt_status = []
    expect((await processRequest()).status).toBe(200)
    expect((await canMarket()).allowed).toBe(false)
    expect((await canMarket('org-a', OTHER_PHONE)).allowed).toBe(false)
  })
  it('does not overwrite a phone suppression row assigned to another subject', async () => {
    db.rows.whatsapp_opt_status.push({ id: 'ambiguous', organization_id: 'org-a', contact_id: 'another-subject', phone: PHONE, status: 'opted_in' })
    expect((await processRequest()).status).toBeGreaterThanOrEqual(400)
    expect(db.rows.whatsapp_opt_status.find(row => row.id === 'ambiguous')?.status).toBe('opted_in')
    expect(db.rows.lgpd_data_requests[0].status).not.toBe('completed')
  })
  it('honors the direct CRM WhatsApp contact link when the reverse link is absent', async () => {
    Object.assign(db.rows.contacts[0], { phone: null, whatsapp_contact_id: 'legacy-wa-a' })
    db.rows.whatsapp_contacts = [{ id: 'legacy-wa-a', organization_id: 'org-a', crm_contact_id: null, phone_number: PHONE }]
    expect((await processRequest()).status).toBe(200)
    expect((await canMarket()).allowed).toBe(false)
  })
})
