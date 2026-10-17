import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const state = vi.hoisted(() => ({ token: '', factors: [] as any[], sessions: [{ id: 'session-a' }], passwordWrites: [] as any[], valid: true, currentPassword: 'Current123!', factorError: false }))
vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const db: any = createFakeSupabase()
  db.auth = {
    getUser: vi.fn(async () => ({ data: { user: state.valid ? { id: 'user-a', email: 'a@example.test', user_metadata: { role: 'owner', is_agent: false } } : null }, error: state.valid ? null : {} })),
    signInWithPassword: vi.fn(async ({ password }: any) => ({ data: { user: { id: 'user-a' }, session: { access_token: 'fresh' } }, error: password === state.currentPassword ? null : { message: 'bad password' } })),
    updateUser: vi.fn(async (data: any) => { state.passwordWrites.push({ id: 'user-a', ...data }); return { error: null } }),
    admin: {
      mfa: { deleteFactor: vi.fn(async () => ({ error: null })) },
      updateUserById: vi.fn(async (id: string, data: any) => { state.passwordWrites.push({ id, ...data }); return { error: null } }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
  return { supabaseAdmin: db, getSupabaseAdmin: () => db, isSupabaseConfigured: () => true, __db: db }
})
vi.mock('@supabase/supabase-js', async () => {
  const mod: any = await import('@/lib/supabase-admin')
  return { createClient: () => mod.__db }
})
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: state.token }) }) }))
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const mod: any = await import('@/lib/supabase-admin')
  return { createRouteHandlerClient: () => mod.__db }
})
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }), getClientIp: () => '127.0.0.1' }))
vi.mock('@/lib/settings/gotrue', async () => {
  const actual = await vi.importActual<typeof import('@/lib/settings/gotrue')>('@/lib/settings/gotrue')
  return { ...actual, gotrue: {
    enrollTotp: async () => ({ id: 'factor-a', totp: { qr_code: 'qr', secret: 'synthetic', uri: 'totp:test' } }),
    challenge: async () => ({ id: 'challenge-a' }),
    verify: async () => ({ access_token: 'verified-access', refresh_token: 'verified-refresh' }),
  } }
})

import * as admin from '@/lib/supabase-admin'
import { getAuthClient, validateStoreAccess } from '@/lib/api-utils'
import { requireOrgFromAuth } from './require-org'
import { POST as authPost, GET as authGet } from '@/app/api/auth/route'
import { DELETE as removeMember, POST as inviteMember } from '@/app/api/settings/users/route'
import { POST as securityPost } from '@/app/api/settings/security/route'
import { middleware } from '@/middleware'
import { POST as passwordPost } from '@/app/api/auth/change-password/route'
import { GET as agentMe } from '@/app/api/whatsapp/agents/me/route'
const db: any = (admin as any).__db
function token(aal = 'aal1') { return `header.${Buffer.from(JSON.stringify({ sub: 'user-a', aal, session_id: 'session-a' })).toString('base64url')}.signature` }
function request() { return new NextRequest('http://localhost/api/private', { headers: { authorization: `Bearer ${state.token}` } }) }
beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'
  db.reset(); state.valid = true; state.token = token(); state.factors = []; state.factorError = false; state.sessions = [{ id: 'session-a' }]; state.passwordWrites = []
  db.seed('profiles', [{ id: 'user-a', organization_id: 'org-a', role: 'member' }])
  db.seed('organization_members', [{ id: 'membership-a', user_id: 'user-a', organization_id: 'org-a', role: 'member', status: 'active' }])
  db.seed('organizations', [{ id: 'org-a', settings: {} }])
  db.defineRpc('list_mfa_factors', () => { if (state.factorError) throw new Error('factor lookup failed'); return state.factors })
  db.defineRpc('list_auth_sessions', () => state.sessions)
  db.defineRpc('revoke_other_auth_sessions', () => 1)
})
describe('server identity authority', () => {
  it('preserves ordinary active membership and ignores editable metadata roles', async () => {
    const auth = await getAuthClient()
    expect(auth?.user.role).toBe('member')
    expect(await requireOrgFromAuth(request())).toMatchObject({ orgId: 'org-a', userId: 'user-a' })
  })
  it('rejects profile-only former members in both auth entrypoints', async () => {
    db.seed('organization_members', [])
    expect(await getAuthClient()).toBeNull()
    expect(await requireOrgFromAuth(request())).toBeInstanceOf(NextResponse)
  })
  it('uses the active membership role instead of a stale profile owner role', async () => {
    db.tables.profiles[0].role = 'owner'
    expect((await getAuthClient())?.user.role).toBe('member')
  })
  it('rejects inactive membership even with an active legacy agent row', async () => {
    db.tables.organization_members[0].status = 'removed'
    db.seed('agents', [{ id: 'agent-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    expect(await getAuthClient()).toBeNull()
  })
  it.each(['factor', 'policy'])('requires aal2 from %s without trusting setup cookie', async (kind) => {
    if (kind === 'factor') state.factors = [{ status: 'verified' }]
    else db.tables.organizations[0].settings = { require_2fa: true }
    expect(await getAuthClient()).toBeNull()
    const denied = await requireOrgFromAuth(request())
    expect(denied).toBeInstanceOf(NextResponse)
    expect((denied as NextResponse).status).toBe(403)
    state.token = token('aal2')
    expect(await getAuthClient()).not.toBeNull()
  })
  it('fails closed when factor authority is unavailable', async () => {
    state.factorError = true
    expect(await getAuthClient()).toBeNull()
  })
  it('rejects a signed but revoked session', async () => {
    state.sessions = []
    expect(await getAuthClient()).toBeNull()
  })
  it('does not authorize primary store through a stale profile', async () => {
    db.seed('organization_members', [])
    db.seed('shopify_stores', [{ id: 'store-a', organization_id: 'org-a' }])
    expect((await validateStoreAccess(db, 'org-a', 'store-a', 'user-a')).valid).toBe(false)
  })
  it('keeps an active secondary organization store accessible', async () => {
    db.tables.organization_members.push({ user_id: 'user-a', organization_id: 'org-b', role: 'member', status: 'active' })
    db.seed('shopify_stores', [{ id: 'store-b', organization_id: 'org-b' }])
    expect((await validateStoreAccess(db, 'org-a', 'store-b', 'user-a')).valid).toBe(true)
  })
})
describe('legacy password action', () => {
  async function update(extra: Record<string, unknown> = {}) {
    return authPost(new NextRequest('http://localhost/api/auth', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `sb-access-token=${state.token}` }, body: JSON.stringify({ action: 'update-password', newPassword: 'NewStrong123!', ...extra }) }))
  }
  it('denies possession of a session alone without password writes', async () => {
    expect((await update()).status).toBe(403)
    expect(state.passwordWrites).toEqual([])
  })
  it('rejects an incorrect current password', async () => {
    expect((await update({ currentPassword: 'wrong' })).status).toBe(403)
    expect(state.passwordWrites).toEqual([])
  })
  it('allows independently verified current password only for caller identity', async () => {
    expect((await update({ currentPassword: state.currentPassword, userId: 'victim' })).status).toBe(200)
    expect(state.passwordWrites).toEqual([{ id: 'user-a', password: 'NewStrong123!' }])
  })
})
describe('offboarding', () => {
  it('an authorized owner can explicitly re-add a removed member with no primary org', async () => {
    db.tables.organization_members[0].role = 'owner'
    db.tables.profiles.push({ id: 'former', organization_id: null, email: 'former@example.test', role: 'agent' })
    db.tables.organization_members.push({ id: 'former-a', user_id: 'former', email: 'former@example.test', organization_id: 'org-a', role: 'agent', status: 'removed' })
    const response = await inviteMember(new NextRequest('http://localhost/api/settings/users', { method: 'POST', body: JSON.stringify({ email: 'former@example.test', role: 'member' }) }))
    expect(response.status).toBe(200)
    expect(db.tables.organization_members.find((m: any) => m.id === 'former-a')).toMatchObject({ status: 'active', role: 'member' })
    expect(db.tables.profiles.find((p: any) => p.id === 'former')).toMatchObject({ organization_id: 'org-a', role: 'member' })
  })
  it('retains a removed membership and switches only the removed primary organization', async () => {
    db.tables.organization_members[0].role = 'owner'
    db.tables.profiles[0].role = 'owner'
    db.tables.profiles.push({ id: 'former', organization_id: 'org-a', role: 'agent' })
    db.tables.organization_members.push(
      { id: 'former-a', user_id: 'former', organization_id: 'org-a', role: 'agent', status: 'active' },
      { id: 'former-b', user_id: 'former', organization_id: 'org-b', role: 'member', status: 'active' },
    )
    db.seed('agents', [{ id: 'legacy-agent', user_id: 'former', organization_id: 'org-a', is_active: true }])
    const response = await removeMember(new NextRequest('http://localhost/api/settings/users', { method: 'DELETE', body: JSON.stringify({ id: 'former-a' }) }))
    expect(response.status).toBe(200)
    expect(db.tables.organization_members.find((m: any) => m.id === 'former-a')?.status).toBe('removed')
    expect(db.tables.organization_members.find((m: any) => m.id === 'former-b')?.status).toBe('active')
    expect(db.tables.profiles.find((p: any) => p.id === 'former')?.organization_id).toBe('org-b')
    expect(db.tables.agents[0].is_active).toBe(false)
    // Fresh login after removal resolves the remaining membership, even though
    // the profile pointed at the removed primary organization before DELETE.
    db.tables.organizations.push({ id: 'org-b', settings: {} })
    state.token = `header.${Buffer.from(JSON.stringify({ sub: 'former', aal: 'aal1', session_id: 'session-a' })).toString('base64url')}.signature`
    vi.spyOn(db.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'former', email: 'former@example.test' } }, error: null })
    expect((await getAuthClient())?.user.organization_id).toBe('org-b')
  })
})
describe('MFA setup exceptions', () => {
  async function security(body: any) { return securityPost(new NextRequest('http://localhost/api/settings/security', { method: 'POST', body: JSON.stringify(body) })) }
  it('allows enrollment and challenge while org policy blocks business APIs', async () => {
    db.tables.organizations[0].settings = { require_2fa: true }
    expect((await security({ action: 'mfa-enroll' })).status).toBe(200)
    const verified = await security({ action: 'mfa-verify', factor_id: 'factor-a', code: '123456' })
    expect(verified.status).toBe(200)
    expect(verified.cookies.get('sb-access-token')?.value).toBe('verified-access')
  })
  it('does not allow an aal1 admin to disable organizational MFA', async () => {
    db.tables.profiles[0].role = 'owner'
    db.tables.organization_members[0].role = 'owner'
    db.tables.organizations[0].settings = { require_2fa: true }
    state.factors = [{ status: 'verified' }]
    expect((await security({ action: 'require-2fa', enabled: false })).status).toBe(403)
    expect(db.tables.organizations[0].settings.require_2fa).toBe(true)
  })
  it('owner cannot remove their factor while organizational MFA is required', async () => {
    state.token = token('aal2')
    db.tables.organization_members[0].role = 'owner'
    db.tables.organizations[0].settings = { require_2fa: true }
    expect((await security({ action: 'mfa-disable', factor_id: 'factor-a', password: state.currentPassword })).status).toBe(400)
  })
})
describe('middleware trusted authority', () => {
  it.each(['/settings/security', '/api/settings/security', '/api/whatsapp/agents/me'])('preserves agent access to %s', async (path) => {
    db.tables.organization_members[0].role = 'agent'
    db.seed('agents', [{ id: 'agent-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    const response = await middleware(new NextRequest('http://localhost' + path, { headers: { cookie: `sb-access-token=${state.token}` } }))
    expect(response.status).toBe(200)
  })
  it('never accepts the literal development token outside opted-in development', async () => {
    state.valid = false
    const response = await middleware(new NextRequest('http://localhost/api/contacts', { headers: { cookie: 'sb-access-token=dev-access-token' } }))
    expect(response.status).not.toBe(200)
  })
  it('blocks missing setup cookie using the organizational MFA policy', async () => {
    db.tables.organizations[0].settings = { require_2fa: true }
    const response = await middleware(new NextRequest('http://localhost/api/contacts', { headers: { cookie: `sb-access-token=${state.token}` } }))
    expect(response.status).toBe(403)
  })
  it('does not let editable is_agent=false open an admin route', async () => {
    db.tables.organization_members[0].role = 'agent'
    db.seed('agents', [{ id: 'agent-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    const response = await middleware(new NextRequest('http://localhost/settings/users', { headers: { cookie: `sb-access-token=${state.token}` } }))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/whatsapp')
  })
})

describe('legacy compatibility cannot bypass authority', () => {
  it('member inbox identity remains available without being labeled admin', async () => {
    const response = await agentMe(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ isAdmin: false, permissions: { accessLevel: 'member', canTransferConversations: true } })
  })
  it('bootstrap does not return organization data for a removed member', async () => {
    db.tables.organization_members[0].status = 'removed'
    const response = await authPost(new NextRequest('http://localhost/api/auth', { method: 'POST', headers: { cookie: `sb-access-token=${state.token}` }, body: JSON.stringify({ action: 'get-or-create-org' }) }))
    expect(response.status).toBe(401)
  })
  it('auth GET does not return a development owner outside opted-in development', async () => {
    state.valid = false
    expect((await authGet(new NextRequest('http://localhost/api/auth', { headers: { cookie: 'sb-access-token=dev-access-token' } }))).status).toBe(401)
  })
  it('login MFA completion refuses a revoked pending session', async () => {
    state.sessions = []
    state.factors = [{ id: 'factor-a', status: 'verified', factor_type: 'totp' }]
    const response = await authPost(new NextRequest('http://localhost/api/auth', { method: 'POST', headers: { cookie: `sb-mfa-pending=${encodeURIComponent(JSON.stringify({ a: state.token, r: 'refresh' }))}` }, body: JSON.stringify({ action: 'mfa-verify', code: '123456' }) }))
    expect(response.status).toBe(401)
    expect(response.cookies.get('sb-access-token')).toBeUndefined()
  })
  it.each(['42P01', 'PGRST205'])('resolves the legacy agent only for explicit absent-table error %s', async (code) => {
    db.tables.organization_members[0].role = 'agent'
    db.seed('whatsapp_agents', [{ id: 'old-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    const from = db.from.bind(db)
    vi.spyOn(db, 'from').mockImplementation((table: any) => {
      const query = from(table)
      if (table === 'agents') query.maybeSingle = async () => ({ data: null, error: { code } })
      return query
    })
    expect((await getAuthClient())?.user.agent_id).toBe('old-a')
  })
  it('does not fall back from a policy error to an old agent', async () => {
    db.tables.organization_members[0].role = 'agent'
    db.seed('whatsapp_agents', [{ id: 'old-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    const from = db.from.bind(db)
    vi.spyOn(db, 'from').mockImplementation((table: any) => {
      const query = from(table)
      if (table === 'agents') query.maybeSingle = async () => ({ data: null, error: { code: '42501' } })
      return query
    })
    expect(await getAuthClient()).toBeNull()
  })
  it('password alias rejects removed membership before any password write', async () => {
    db.tables.organization_members[0].status = 'removed'
    const response = await passwordPost(new NextRequest('http://localhost/api/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: state.currentPassword, new_password: 'NewStrong123!' }) }))
    expect(response.status).toBe(401)
    expect(state.passwordWrites).toEqual([])
  })
  it('password alias preserves the current-password contract for active callers', async () => {
    const response = await passwordPost(new NextRequest('http://localhost/api/auth/change-password', { method: 'POST', headers: { cookie: `sb-access-token=${state.token}` }, body: JSON.stringify({ current_password: state.currentPassword, new_password: 'NewStrong123!' }) }))
    expect(response.status).toBe(200)
    expect(state.passwordWrites).toEqual([{ id: 'user-a', password: 'NewStrong123!' }])
  })
  it('agent me derives role and agent from membership despite editable metadata', async () => {
    db.tables.organization_members[0].role = 'agent'
    db.seed('agents', [{ id: 'agent-a', user_id: 'user-a', organization_id: 'org-a', is_active: true }])
    const response = await agentMe(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ isAgent: true, isAdmin: false, permissions: { agentId: 'agent-a' } })
  })
})


