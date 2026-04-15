// =============================================
// WORDER: Unsubscribe token (HMAC signed)
// /src/lib/email/unsubscribe-token.ts
//
// Gera e valida tokens assinados para links de unsubscribe.
// Formato: base64url(payload).hmac(payload)
// Payload: { c: contactId, o: orgId, e: exp? }
// =============================================

import { createHmac, timingSafeEqual } from 'crypto'

function getSecret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.ENCRYPTION_KEY || ''
  if (!s) {
    throw new Error(
      'UNSUBSCRIBE_SECRET (or ENCRYPTION_KEY) environment variable is not set'
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

export interface UnsubscribePayload {
  contactId: string
  orgId: string
  /** campaignId opcional para tracking */
  campaignId?: string
  /** timestamp expiração (ms). Default: nunca expira (unsub é perene) */
  exp?: number
}

export function signUnsubscribeToken(payload: UnsubscribePayload): string {
  const secret = getSecret()
  const body = JSON.stringify({
    c: payload.contactId,
    o: payload.orgId,
    cm: payload.campaignId,
    e: payload.exp,
  })
  const bodyEnc = b64urlEncode(body)
  const sig = createHmac('sha256', secret).update(bodyEnc).digest()
  const sigEnc = b64urlEncode(sig)
  return `${bodyEnc}.${sigEnc}`
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const secret = getSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [bodyEnc, sigEnc] = parts

    const expected = createHmac('sha256', secret).update(bodyEnc).digest()
    const actual = Buffer.from(
      b64urlDecode(sigEnc).length
        ? Buffer.from(sigEnc.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
        : Buffer.alloc(0)
    )
    // simpler: re-encode expected in same form and compare as Buffer
    const expectedB = expected
    const actualB = Buffer.from(sigEnc.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

    if (expectedB.length !== actualB.length) return null
    if (!timingSafeEqual(expectedB, actualB)) return null

    const body = JSON.parse(b64urlDecode(bodyEnc))
    if (body.e && Date.now() > Number(body.e)) return null

    if (!body.c || !body.o) return null
    return {
      contactId: String(body.c),
      orgId: String(body.o),
      campaignId: body.cm ? String(body.cm) : undefined,
      exp: body.e ? Number(body.e) : undefined,
    }
  } catch {
    return null
  }
}
