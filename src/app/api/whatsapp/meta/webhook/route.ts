// =============================================
// API: /api/whatsapp/meta/webhook
// Unified Meta Cloud API Webhook Handler
// Returns 200 immediately, processes in background
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import {
  verifySignature,
  verifyWebhookToken,
  processWebhookPayload,
} from '@/lib/services/whatsapp/webhook-processor'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET — Webhook Verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const result = await verifyWebhookToken(mode, token, challenge)

  if (result.valid) {
    return new Response(result.challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

// POST — Receive Events (return 200 immediately)
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Validate HMAC-SHA256 signature
  const signature = request.headers.get('x-hub-signature-256')
  if (signature && process.env.META_APP_SECRET) {
    const valid = await verifySignature(rawBody, signature)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // Parse and process in background
  try {
    const body = JSON.parse(rawBody)

    // Use waitUntil if available (Vercel Edge), otherwise process inline
    const processPromise = processWebhookPayload(body)

    if (typeof (globalThis as any).waitUntil === 'function') {
      ;(globalThis as any).waitUntil(processPromise)
    } else {
      // Fallback: don't await, let it process async
      processPromise.catch((err) => {
        console.error('[Meta Webhook] Background processing error:', err)
      })
    }
  } catch {
    // Parse error — still return 200 to prevent Meta retries
  }

  return NextResponse.json({ status: 'received' }, { status: 200 })
}
