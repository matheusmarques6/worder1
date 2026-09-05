// Chamadas ao GoTrue (Supabase Auth) em nome do usuário — usadas pelo 2FA
// (TOTP) das Configurações. O supabase-js exige uma sessão persistida para
// `auth.mfa.*`; no servidor só temos o access token do cookie, então falamos
// direto com a API REST usando esse token.

const base = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '') + '/auth/v1'
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

async function call<T = any>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base() + path, {
    ...init,
    headers: {
      apikey: anon(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || `GoTrue ${res.status}`
    const err: any = new Error(String(msg))
    err.status = res.status
    err.code = data?.error_code || data?.code
    throw err
  }
  return data as T
}

export interface TotpEnroll {
  id: string
  type: 'totp'
  friendly_name?: string
  totp: { qr_code: string; secret: string; uri: string }
}

export const gotrue = {
  /** Inicia o cadastro de um app autenticador. Devolve QR (SVG data URI) e segredo. */
  enrollTotp: (token: string, friendlyName: string) =>
    call<TotpEnroll>('/factors', token, { method: 'POST', body: JSON.stringify({ factor_type: 'totp', friendly_name: friendlyName, issuer: 'Worder' }) }),
  challenge: (token: string, factorId: string) =>
    call<{ id: string; expires_at: number }>(`/factors/${factorId}/challenge`, token, { method: 'POST', body: '{}' }),
  verify: (token: string, factorId: string, challengeId: string, code: string) =>
    call<{ access_token: string; refresh_token: string; expires_in: number; user: any }>(`/factors/${factorId}/verify`, token, { method: 'POST', body: JSON.stringify({ challenge_id: challengeId, code }) }),
  unenroll: (token: string, factorId: string) =>
    call(`/factors/${factorId}`, token, { method: 'DELETE' }),
  /** Nível de garantia da sessão atual (aal1 / aal2). */
  user: (token: string) => call<any>('/user', token),
}

/** Fatores (do JWT) — sem chamada extra. */
export function jwtAal(token: string | null | undefined): 'aal1' | 'aal2' | null {
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const p = JSON.parse(Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8'))
    return p.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch { return null }
}
