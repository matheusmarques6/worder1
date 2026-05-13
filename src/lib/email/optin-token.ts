// =============================================
// WORDER: Double opt-in token (HMAC signed)
// /src/lib/email/optin-token.ts
//
// Generates and validates signed tokens for the confirmation link a
// merchant's subscriber clicks in their inbox. Mirrors the existing
// unsubscribe-token approach so we never need a `email_consent_token`
// column on contacts — everything verifies HMAC-only.
//
// Format: base64url(payload).base64url(hmac(payload))
// Payload: { c: contactId, o: orgId, f: formId, e: expiryMs }
// Default expiry: 14 days (long enough that a subscriber who reads
// their newsletter weekly still confirms in time).
// =============================================

import { createHmac, timingSafeEqual } from 'crypto'

const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

function getSecret(): string {
  // Reuses the same secret as unsubscribe tokens so deployments need
  // only one env var. ENCRYPTION_KEY is the canonical name.
  const s =
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  if (!s) {
    throw new Error(
      'UNSUBSCRIBE_SECRET (or ENCRYPTION_KEY / SUPABASE_SERVICE_ROLE_KEY) must be set to sign opt-in tokens'
    )
  }
  return s
}

function b64urlEncode(input: string | Buffer): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const norm = input.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(norm, 'base64').toString('utf8')
}

export interface OptInPayload {
  contactId: string
  orgId: string
  formId: string
  exp: number
}

export function signOptInToken(input: {
  contactId: string
  orgId: string
  formId: string
  ttlMs?: number
}): string {
  const secret = getSecret()
  const exp = Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS)
  const body = JSON.stringify({
    c: input.contactId,
    o: input.orgId,
    f: input.formId,
    e: exp,
  })
  const bodyEnc = b64urlEncode(body)
  const sigEnc = b64urlEncode(createHmac('sha256', secret).update(bodyEnc).digest())
  return `${bodyEnc}.${sigEnc}`
}

export function verifyOptInToken(token: string): OptInPayload | null {
  try {
    const secret = getSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [bodyEnc, sigEnc] = parts

    const expected = createHmac('sha256', secret).update(bodyEnc).digest()
    const actual = Buffer.from(
      sigEnc.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    )
    if (expected.length !== actual.length) return null
    if (!timingSafeEqual(expected, actual)) return null

    const body = JSON.parse(b64urlDecode(bodyEnc))
    if (!body.c || !body.o || !body.f || !body.e) return null
    if (Date.now() > Number(body.e)) return null

    return {
      contactId: String(body.c),
      orgId: String(body.o),
      formId: String(body.f),
      exp: Number(body.e),
    }
  } catch {
    return null
  }
}
