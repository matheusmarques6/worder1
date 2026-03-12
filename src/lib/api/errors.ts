/**
 * Custom API error class for structured error handling.
 * Throw this in any handler wrapped with withApiHandler/withPublicHandler
 * to return a proper error response.
 *
 * Usage:
 *   throw new ApiError('Contact not found', 404)
 *   throw new ApiError('Rate limit exceeded', 429, 'RATE_LIMIT')
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static badRequest(message: string, code?: string) {
    return new ApiError(message, 400, code)
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new ApiError(message, 401, 'UNAUTHORIZED')
  }

  static forbidden(message: string = 'Forbidden') {
    return new ApiError(message, 403, 'FORBIDDEN')
  }

  static notFound(message: string = 'Not found') {
    return new ApiError(message, 404, 'NOT_FOUND')
  }
}
