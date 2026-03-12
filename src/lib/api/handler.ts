import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError, type AuthResult } from '../api-utils'
import { ApiError } from './errors'

type ApiHandlerFn = (
  req: NextRequest,
  auth: AuthResult,
  ctx?: { params: Record<string, string> }
) => Promise<NextResponse>

type PublicHandlerFn = (
  req: NextRequest,
  ctx?: { params: Record<string, string> }
) => Promise<NextResponse>

interface HandlerOptions {
  domain?: string
}

/**
 * Wraps an API route handler with auth check and error handling.
 * Eliminates repetitive getAuthClient() + try/catch in every route.
 *
 * Usage:
 *   export const GET = withApiHandler(async (req, auth) => {
 *     const { supabase, user } = auth
 *     // ... your logic
 *     return NextResponse.json({ data })
 *   }, { domain: 'Contacts' })
 */
export function withApiHandler(handler: ApiHandlerFn, options?: HandlerOptions) {
  return async (req: NextRequest, ctx?: { params: Record<string, string> }): Promise<NextResponse> => {
    const domain = options?.domain || 'API'

    try {
      const auth = await getAuthClient()
      if (!auth) return authError()

      return await handler(req, auth, ctx)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        )
      }

      console.error(`[${domain}] Unhandled error:`, error)
      const message = error instanceof Error ? error.message : 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

/**
 * Wraps a public API route handler (no auth) with error handling.
 * For webhooks, crons, public endpoints.
 */
export function withPublicHandler(handler: PublicHandlerFn, options?: HandlerOptions) {
  return async (req: NextRequest, ctx?: { params: Record<string, string> }): Promise<NextResponse> => {
    const domain = options?.domain || 'API'

    try {
      return await handler(req, ctx)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        )
      }

      console.error(`[${domain}] Unhandled error:`, error)
      const message = error instanceof Error ? error.message : 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
