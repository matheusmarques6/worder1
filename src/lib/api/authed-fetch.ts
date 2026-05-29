import { getSupabaseClient } from '@/lib/supabase-client'

/**
 * Wrapper around fetch that automatically attaches the Supabase JWT to the
 * Authorization header. Use for ALL calls to internal API routes that read
 * organization-scoped data (the API helper `requireOrgFromAuth` reads orgId
 * from this token instead of trusting an organizationId query param).
 *
 * Returns the raw Response — caller decides whether to .json(), .text(),
 * check status, etc.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  const token = session?.access_token

  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}
