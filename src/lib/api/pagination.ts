/**
 * Parse pagination params from URL search params
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit: number = 50
): { page: number; limit: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get('limit') || String(defaultLimit))),
    1000
  )
  return { page, limit }
}

/**
 * Get Supabase range values from page/limit
 * Returns [from, to] for .range() call
 */
export function getPaginationRange(page: number, limit: number): [number, number] {
  return [(page - 1) * limit, page * limit - 1]
}
