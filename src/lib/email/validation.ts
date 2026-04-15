// =============================================
// WORDER: Email validation helpers
// /src/lib/email/validation.ts
// =============================================

// RFC 5322 simplified — good enough para UI + backend validation.
// Evita regex extravagantes para não criar ReDoS.
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false
  if (email.length === 0 || email.length > 254) return false
  return EMAIL_RE.test(email)
}

/**
 * Valida vários emails em lote. Retorna o primeiro inválido ou null.
 */
export function firstInvalidEmail(list: Array<string | undefined | null>): string | null {
  for (const e of list) {
    if (e == null || e === '') continue
    if (!isValidEmail(e)) return e
  }
  return null
}

/**
 * Normaliza um email para storage (trim + lowercase do local-part/domain).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
