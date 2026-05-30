import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/**
 * Wrapper around fetch that automatically attaches the Supabase JWT to the
 * Authorization header. Use for ALL calls to internal API routes that read
 * organization-scoped data (the API helper `requireOrgFromAuth` reads orgId
 * from this token instead of trusting an organizationId query param).
 *
 * IMPORTANT: usa `createClientComponentClient` da @supabase/auth-helpers-nextjs
 * porque é o mesmo cliente usado pelo login/AuthContext do app. O plano
 * `createClient` da supabase-js armazena sessão em localStorage; já o helper
 * usa cookies (`sb-<project>-auth-token`). Se misturar, getSession() retorna
 * null infinitamente e 401 garantido em produção.
 *
 * Resilient to hydration race: on page load, getSession() can return null
 * briefly while the auth helper reads the cookie. Retry up to 5x with backoff
 * (0ms, 50ms, 100ms, 200ms, 400ms — ~750ms total).
 *
 * Returns the raw Response — caller decides whether to .json(), .text(),
 * check status, etc.
 */
let cachedClient: ReturnType<typeof createClientComponentClient> | null = null
function getAuthClient() {
  if (!cachedClient) cachedClient = createClientComponentClient()
  return cachedClient
}

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const client = getAuthClient()
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
