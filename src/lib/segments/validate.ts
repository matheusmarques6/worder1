// Input validation helpers shared by the segments + lists API layer.
//
// PostgREST's filter strings (.or(), .eq() etc.) are parsed by the
// server and unquoted values can break out of the expected filter if
// they contain commas, parens, or operators. We never accept these
// directly from query params or request bodies without first running
// them through these guards.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true if `value` looks like a canonical UUID v1-5.
 * Use before interpolating an ID into a Supabase filter string.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Returns the value if it's a UUID, null otherwise.
 * Convenience for the common pattern of accepting an optional UUID
 * from query params or request body.
 */
export function asUuid(value: unknown): string | null {
  return isUuid(value) ? value : null;
}
