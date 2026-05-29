// =============================================
// API: /api/whatsapp/meta/webhook (DEPRECATED)
// Onda 3 D.2 — forwards both GET and POST verbatim to
// /api/whatsapp/cloud/webhook, which is the canonical
// Meta Cloud webhook (async/QStash, fail-closed HMAC,
// persists into whatsapp_cloud_messages).
//
// Kept alive only so Meta Business Suite configs that
// still point here keep working until the user updates
// the Dashboard URL. Delete after telemetry confirms
// zero hits.
// =============================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function buildForwardUrl(request: NextRequest): URL {
  const target = new URL('/api/whatsapp/cloud/webhook', request.url)
  // Preserve query string verbatim (hub.mode, hub.verify_token, hub.challenge, …)
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value)
  })
  return target
}

// GET — Meta verification challenge. Forward query to /cloud/webhook
// and return its response verbatim so behaviour matches the canonical
// route exactly (per-account verify token lookup included).
export async function GET(request: NextRequest) {
  console.warn('[DEPRECATED] /meta/webhook hit', request.nextUrl.pathname + request.nextUrl.search)

  const target = buildForwardUrl(request)
  const upstream = await fetch(target, {
    method: 'GET',
    headers: request.headers,
  })

  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'text/plain' },
  })
}

// POST — Forward raw body + headers (signature header preserved).
// The cloud webhook re-verifies HMAC against the raw body bytes,
// so signature integrity is maintained as long as we don't mutate body.
export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] /meta/webhook hit (POST)', request.nextUrl.pathname)

  const rawBody = await request.text()
  const target = buildForwardUrl(request)

  const upstream = await fetch(target, {
    method: 'POST',
    headers: request.headers,
    body: rawBody,
  })

  const body = await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  })
}
