import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/** Request-local user client for the app's httpOnly session cookies.
 * Keep the public key and caller JWT: these queries must remain subject to RLS.
 * Refresh stays in the existing middleware; getUser(accessToken) validates Auth.
 */
export async function createRequestRlsClient() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !publicKey) throw new Error('Supabase public configuration is missing')
  const supabase = createClient(url, publicKey, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return { supabase, accessToken }
}
