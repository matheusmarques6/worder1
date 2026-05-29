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

// POST — Receive Events. HMAC obrigatório em produção; processing awaitado
// porque globalThis.waitUntil() não existe no runtime Node do Vercel —
// fire-and-forget seria silenciosamente abortado.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')

  // Fail closed em produção sem signature header
  if (process.env.NODE_ENV === 'production' && !signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  if (signature) {
    const valid = await verifySignature(rawBody, signature)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  try {
    const body = JSON.parse(rawBody)
    await processWebhookPayload(body)
  } catch (err) {
    console.error('[Meta Webhook] Processing error:', err)
    // Mesmo em erro, retorna 200 pra evitar retry da Meta que duplicaria
  }

  return NextResponse.json({ status: 'received' }, { status: 200 })
}
