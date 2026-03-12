// API Layer - Barrel Export
export { withApiHandler, withPublicHandler } from './handler'
export { apiSuccess, apiError, apiPaginated } from './response'
export { parsePagination, getPaginationRange } from './pagination'
export { ApiError } from './errors'

// Re-export existing utilities for backward compat
export {
  getAuthClient,
  authError,
  getSupabaseClient,
  withSupabase,
  errorResponse,
  successResponse,
  validateParams,
  parseDateRange,
  isSupabaseConfigured,
  validateStoreAccess,
  requireStoreAccess,
} from '../api-utils'
export type { AuthResult } from '../api-utils'
