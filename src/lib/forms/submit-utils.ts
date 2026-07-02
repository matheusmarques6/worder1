// =============================================
// Pure helpers for the public form/popup endpoints
// src/lib/forms/submit-utils.ts
//
// Kept free of Next.js / Supabase imports so the logic is unit-testable
// (vitest, node environment). Everything here is deterministic string /
// object munging: e-mail + phone normalization, ilike escaping, domain
// sanitization for PostgREST filters, payload caps and the Meta CAPI
// SHA-256 hashing spec.
// =============================================

import crypto from 'crypto'

// ---------------------------------------------
// E-mail: single normalization point. The unique index
// contacts_org_email_unique (20260515) assumes lowercased e-mails, so
// every read/write on contacts.email must funnel through this.
// ---------------------------------------------
export function normalizeEmail(value: unknown): string | null {
  // Strings only: progressive profiling marks known fields with boolean
  // `true` — coercing that would produce the literal e-mail "true".
  if (typeof value !== 'string') return null
  const norm = value.trim().toLowerCase()
  return norm.length > 0 ? norm : null
}

// ---------------------------------------------
// Phone: the client contract (popup script) is to send the FULL value
// with the country code prepended (e.g. "+55 (11) 99999-9999"). The
// server never guesses a country — it only strips formatting:
// spaces / parentheses / dashes / dots removed, digits kept, a single
// leading "+" preserved when present.
// ---------------------------------------------
export function normalizePhone(value: unknown): string | null {
  // Strings and numbers only (JSON payloads sometimes send bare digits);
  // booleans are progressive-profiling markers, never phone values.
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const raw = String(value).trim()
  if (!raw) return null
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return null
  return (hasPlus ? '+' : '') + digits
}

// ---------------------------------------------
// ilike/like wildcard escaping — "%@gmail.com" must match a literal
// percent sign, not "any prefix". Escapes backslash first so the
// escape character itself can't be smuggled in.
// ---------------------------------------------
export function escapeIlikeWildcards(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// ---------------------------------------------
// Domain sanitizer for PostgREST .or()/.ilike() filters. Caller input
// like "x,id.not.is.null" would otherwise be interpreted as extra
// filter clauses (cross-org enumeration). Keep only [a-z0-9.-] after
// lowercasing and stripping scheme/path.
// ---------------------------------------------
export function sanitizeDomain(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '')
}

// ---------------------------------------------
// Payload caps (anti-abuse): answers <= 50 keys, each value <= 1000
// chars after string conversion (arrays joined), each UTM <= 500 chars.
// Returns null when OK, or a PT-BR error message when violated.
// ---------------------------------------------
export const MAX_ANSWER_KEYS = 50
export const MAX_ANSWER_VALUE_LENGTH = 1000
export const MAX_UTM_LENGTH = 500

export function answerValueToString(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(',')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function validateSubmitPayloadCaps(
  answers: Record<string, unknown>,
  utms: Record<string, unknown> = {}
): string | null {
  const keys = Object.keys(answers || {})
  if (keys.length > MAX_ANSWER_KEYS) {
    return `Payload inválido: máximo de ${MAX_ANSWER_KEYS} campos por envio.`
  }
  for (const key of keys) {
    if (answerValueToString(answers[key]).length > MAX_ANSWER_VALUE_LENGTH) {
      return `Payload inválido: valor do campo "${key}" excede ${MAX_ANSWER_VALUE_LENGTH} caracteres.`
    }
  }
  for (const [key, value] of Object.entries(utms || {})) {
    if (value !== undefined && value !== null && String(value).length > MAX_UTM_LENGTH) {
      return `Payload inválido: parâmetro "${key}" excede ${MAX_UTM_LENGTH} caracteres.`
    }
  }
  return null
}

// ---------------------------------------------
// Meta Conversions API user_data hashing (SHA-256, per Meta spec):
//   em — lowercased + trimmed e-mail
//   ph — digits only (no "+", no formatting)
//   fn/ln — lowercased + trimmed names
// Mirrors hashEmail/hashPhone in src/lib/identity/resolver.ts but kept
// here so the popup submit path has a single import for CAPI needs.
// ---------------------------------------------
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function capiHashEmail(email: unknown): string | null {
  const norm = normalizeEmail(email)
  return norm ? sha256Hex(norm) : null
}

export function capiHashPhone(phone: unknown): string | null {
  if (phone === undefined || phone === null) return null
  const digits = String(phone).replace(/[^0-9]/g, '')
  return digits ? sha256Hex(digits) : null
}

export function capiHashName(name: unknown): string | null {
  if (name === undefined || name === null) return null
  const norm = String(name).trim().toLowerCase()
  return norm ? sha256Hex(norm) : null
}

export function buildCapiUserData(
  contactData: { email?: unknown; phone?: unknown; first_name?: unknown; last_name?: unknown },
  request: { ip?: string | null; userAgent?: string | null }
): Record<string, any> {
  const em = capiHashEmail(contactData.email)
  const ph = capiHashPhone(contactData.phone)
  const fn = capiHashName(contactData.first_name)
  const ln = capiHashName(contactData.last_name)
  return {
    em: em ? [em] : undefined,
    ph: ph ? [ph] : undefined,
    fn: fn ? [fn] : undefined,
    ln: ln ? [ln] : undefined,
    client_ip_address: request.ip || '',
    client_user_agent: request.userAgent || '',
  }
}

// ---------------------------------------------
// Form types rendered by the visual popup builder (design_json.steps).
// These never use the legacy crm_form_fields table, so legacy
// required-field validation and default-field seeding must skip them.
// ---------------------------------------------
export const VISUAL_FORM_TYPES = ['popup', 'flyout', 'banner', 'fullpage', 'fullscreen', 'bar']

export function isVisualPopupForm(formType: unknown, designJson: any): boolean {
  if (formType && VISUAL_FORM_TYPES.includes(String(formType))) return true
  return Array.isArray(designJson?.steps) && designJson.steps.length > 0
}
