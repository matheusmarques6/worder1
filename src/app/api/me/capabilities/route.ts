// GET /api/me/capabilities
//
// Returns the authed user's role + capability list in their active
// org. Dashboard components fetch this once on mount and use it to
// hide/disable buttons the user can't actually click (e.g. agents
// shouldn't see "Send campaign" — they'd just hit a 403 and feel
// the app is broken). The same matrix runs server-side via
// requireCapability so the UI gate is cosmetic; security is enforced
// at the handler.
import { NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { loadUserRoleAndCapabilities } from '@/lib/auth/require-capability'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const { role, capabilities } = await loadUserRoleAndCapabilities(auth)
  return NextResponse.json({
    role,
    capabilities,
    organizationId: auth.user.organization_id,
  })
}
