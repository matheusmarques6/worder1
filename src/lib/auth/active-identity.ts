import type { SupabaseClient } from '@supabase/supabase-js'

export interface ActiveIdentity {
  userId: string
  email: string
  orgId: string
  role: string
  agentId: string | null
  aal: 'aal1' | 'aal2'
  mfaRequired: boolean
  mfaSatisfied: boolean
}

/** Server authority shared by cookie APIs, Bearer APIs and middleware.
 * Claims are decoded ONLY after Auth has validated the complete token.
 * No profile/metadata fallback: legacy accounts are reconciled by migration.
 */
export async function resolveActiveIdentity(admin: SupabaseClient, token: string): Promise<ActiveIdentity | null> {
  try {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) return null
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (claims.sub !== user.id || !claims.session_id) return null
    const { data: sessions, error: sessionError } = await admin.rpc('list_auth_sessions', { p_user_id: user.id })
    if (sessionError || !Array.isArray(sessions) || !sessions.some(s => s.id === claims.session_id)) return null

    const { data: profile, error: profileError } = await admin.from('profiles').select('organization_id').eq('id', user.id).single()
    if (profileError || !profile?.organization_id) return null
    const { data: member, error: memberError } = await admin.from('organization_members')
      .select('role, status').eq('user_id', user.id).eq('organization_id', profile.organization_id).maybeSingle()
    if (memberError || member?.status !== 'active' || !['owner', 'admin', 'member', 'analyst', 'agent'].includes(member.role)) return null

    const [{ data: org, error: orgError }, { data: factors, error: factorError }] = await Promise.all([
      admin.from('organizations').select('settings').eq('id', profile.organization_id).single(),
      admin.rpc('list_mfa_factors', { p_user_id: user.id }),
    ])
    if (orgError || !org || factorError || !Array.isArray(factors)) return null
    const aal = claims.aal === 'aal2' ? 'aal2' : 'aal1'
    const mfaRequired = org.settings?.require_2fa === true || factors.some(f => f.status === 'verified')
    let agentId: string | null = null
    if (member.role === 'agent') {
      let agent = await admin.from('agents').select('id').eq('user_id', user.id)
        .eq('organization_id', profile.organization_id).eq('is_active', true).maybeSingle()
      if (['42P01', 'PGRST205'].includes(agent.error?.code || '') || (!agent.error && !agent.data)) {
        agent = await admin.from('whatsapp_agents').select('id').eq('user_id', user.id)
          .eq('organization_id', profile.organization_id).eq('is_active', true).maybeSingle()
      }
      if (agent.error) return null
      agentId = agent.data?.id || null
    }
    return { userId: user.id, email: user.email || '', orgId: profile.organization_id,
      role: member.role, agentId, aal, mfaRequired, mfaSatisfied: !mfaRequired || aal === 'aal2' }
  } catch {
    return null
  }
}
