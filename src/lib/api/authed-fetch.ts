import { getSupabaseClient } from '@/lib/supabase-client'

/**
 * Wrapper around fetch that automatically attaches the Supabase JWT to the
 * Authorization header. Use for ALL calls to internal API routes that read
 * organization-scoped data (the API helper `requireOrgFromAuth` reads orgId
 * from this token instead of trusting an organizationId query param).
 *
 * Resilient to hydration race: on page load, getSession() can return null
 * briefly while the Supabase client reads from localStorage. We retry up to
 * 5x with backoff (0ms, 50ms, 100ms, 200ms, 400ms — ~750ms total) so the
 * call never goes out without auth on a fresh page load.
 *
 * Returns the raw Response — caller decides whether to .json(), .text(),
 * check status, etc.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const client = getSupabaseClient()
  let token: string | undefined

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: { session } } = await client.auth.getSession()
    token = session?.access_token
    if (token) break
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 50 * (1 << attempt)))
    }
  }

  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}
