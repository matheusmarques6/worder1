// =============================================
// WORDER: require-capability — server-side RBAC guard
// /src/lib/auth/require-capability.ts
//
// Use this in any /api/** handler that mutates state. Looks up the
// authed user's role in the target organization, checks the
// capability matrix, returns a 403 response when denied. The
// handler proceeds normally on allow.
//
// Usage:
//   const denied = await requireCapability(auth, 'campaigns:send')
//   if (denied) return denied
//
// Honor the same multi-org pattern other endpoints use: the
// effective role is the role of the user in auth.user.organization_id
// (their primary). For per-org overrides (rare, e.g. agent in OrgA
// + admin in OrgB), pass an explicit orgId.
// =============================================

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { Capability, Role } from './permissions'
import { canRoleAccess } from './permissions'

interface MinimalAuth {
  user: { id: string; organization_id: string }
}

/**
 * Returns a NextResponse (403) when the user lacks the capability,
 * or null when they have it. Designed to short-circuit handlers:
 *
 *   const denied = await requireCapability(auth, 'campaigns:send')
 *   if (denied) return denied
 *   // ...proceed
 */
export async function requireCapability(
  auth: MinimalAuth,
  capability: Capability,
  orgId?: string
): Promise<NextResponse | null> {
  const targetOrg = orgId || auth.user.organization_id
  const supabase = getSupabaseAdmin()

  // Owner shortcut on the profiles row (matches the schema default
  // — first user in an org is the owner). Saves a join for the
  // common case where a single-seat owner does most actions.
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', auth.user.id)
    .eq('organization_id', targetOrg)
    .maybeSingle()

  const role: Role | null = (member?.role as Role) || null

  if (!canRoleAccess(role, capability)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `Sua função (${role || 'sem permissão'}) não pode executar esta ação.`,
        capability,
      },
      { status: 403 }
    )
  }
  return null
}

/**
 * Loads the role and full capability set in one query. Use in
 * dashboard endpoints that return UI gating info ("can this user
 * see the Convidar button?").
 */
export async function loadUserRoleAndCapabilities(
  auth: MinimalAuth,
  orgId?: string
): Promise<{ role: Role | null; capabilities: string[] }> {
  const targetOrg = orgId || auth.user.organization_id
  const supabase = getSupabaseAdmin()

  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', auth.user.id)
    .eq('organization_id', targetOrg)
    .maybeSingle()
  const role = (member?.role as Role) || null

  const { capabilitiesForRole } = await import('./permissions')
  return {
    role,
    capabilities: Array.from(capabilitiesForRole(role)),
  }
}
