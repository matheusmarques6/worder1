import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeSupabase } from '@/tests/fake-supabase'

const mockAuth = vi.fn()
const mockSendEmail = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))
vi.mock('@/lib/email/resend', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const fake: any = createFakeSupabase()
  const generateLink = vi.fn()
  const inviteUserByEmail = vi.fn()
  fake.auth = { admin: { generateLink, inviteUserByEmail } }
  return {
    supabaseAdmin: fake,
    isSupabaseConfigured: () => true,
    __db: fake,
    __generateLink: generateLink,
    __inviteUserByEmail: inviteUserByEmail,
  }
})

import * as adminMod from '@/lib/supabase-admin'
import { POST } from './route'

const db = (adminMod as any).__db as FakeSupabase
const generateLink = (adminMod as any).__generateLink as ReturnType<typeof vi.fn>
const inviteUserByEmail = (adminMod as any).__inviteUserByEmail as ReturnType<typeof vi.fn>
const ORG = 'session-org'

function post(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/settings/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any)
}

beforeEach(() => {
  db.reset()
  mockAuth.mockReset()
  mockAuth.mockResolvedValue({
    supabase: db,
    user: { id: 'admin-user', email: 'admin@example.test', organization_id: ORG, role: 'admin' },
  })
  generateLink.mockReset()
  generateLink.mockResolvedValue({
    data: { properties: { action_link: 'http://localhost/reset-password?token=test' } },
    error: null,
  })
  inviteUserByEmail.mockReset()
  inviteUserByEmail.mockResolvedValue({ data: {}, error: null })
  mockSendEmail.mockReset()
  mockSendEmail.mockResolvedValue({ id: 'email-1' })
  db.seed('organizations', [{ id: ORG, name: 'Worder Test' }])
})

describe('POST /api/settings/users', () => {
  it('nega convite de member antes de inserir ou gerar link', async () => {
    mockAuth.mockResolvedValue({
      supabase: db,
      user: { id: 'member-user', email: 'member@example.test', organization_id: ORG, role: 'member' },
    })

    const response = await post({ email: 'invitee@example.test', role: 'member' })

    expect(response.status).toBe(403)
    expect(db.calls.some(([table, method]) => table === 'organization_members' && method === 'insert')).toBe(false)
    expect(generateLink).not.toHaveBeenCalled()
  })

  it('ignora organização e autor forjados e usa a sessão no convite', async () => {
    const response = await post({
      email: 'Invitee@Example.Test',
      role: 'member',
      name: 'Convidada Teste',
      organization_id: 'forged-org',
      invited_by: 'forged-user',
    })

    expect(response.status).toBe(200)
    expect(db.tables.organization_members).toContainEqual(expect.objectContaining({
      organization_id: ORG,
      invited_by: 'admin-user',
      email: 'invitee@example.test',
      role: 'member',
    }))
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: 'invite',
      email: 'invitee@example.test',
      options: expect.objectContaining({
        data: expect.objectContaining({
          invited_org_id: ORG,
          invited_role: 'member',
          full_name: 'Convidada Teste',
        }),
      }),
    }))
  })
})
