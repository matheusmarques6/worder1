// =============================================
// CORS helpers for the PUBLIC form/popup endpoints
// src/lib/forms/public-cors.ts
//
// The popup script runs on the merchant's storefront (cross-origin).
// Every response — success AND error (400/429/500) — must carry
// Access-Control-Allow-Origin, otherwise the browser blocks the body
// and the script can't even read the error message. These endpoints
// never use cookies/credentials, so a wildcard origin is safe.
//
// Error body contract (client pack relies on this):
//   { success: false, error: string, code?: string }
// =============================================

import { NextResponse } from 'next/server'

export function publicCorsHeaders(origin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export function corsJson(
  body: any,
  status: number = 200,
  origin?: string | null
): NextResponse {
  return NextResponse.json(body, { status, headers: publicCorsHeaders(origin) })
}

export function corsError(
  error: string,
  status: number,
  code?: string,
  extra?: Record<string, any>
): NextResponse {
  return corsJson({ success: false, error, ...(code ? { code } : {}), ...(extra || {}) }, status)
}

export function corsPreflight(origin?: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: publicCorsHeaders(origin) })
}
