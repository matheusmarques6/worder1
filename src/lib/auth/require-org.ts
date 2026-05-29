import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface AuthContext {
  orgId: string
  userId: string
}

/**
 * Authenticates a request against the Supabase JWT in the Authorization header
 * and returns the caller's organization_id.
 *
 * Use at the top of every WhatsApp/CRM API route that uses supabaseAdmin
 * (service_role bypasses RLS), so the route can scope queries to the caller's
 * org instead of trusting an organizationId provided in the query string.
 *
 * Returns a NextResponse on failure — caller must check with `instanceof` and
 * return it short-circuit. Returns { orgId, userId } on success.
 */
export async function requireOrgFromAuth(
  request: NextRequest,
): Promise<AuthContext | NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  return { orgId: profile.organization_id, userId: user.id }
}
