/**
 * WhatsApp webhook worker — async processing endpoint.
 *
 * Triggered by QStash after the public ingestor at
 * /api/whatsapp/cloud/webhook persists a raw event.
 *
 * Flow:
 *   1. Verify QStash signature (mirrors /api/workers/webhook-delivery).
 *   2. Parse { eventId } from body.
 *   3. Call claim_whatsapp_webhook_event(eventId) RPC for atomic claim.
 *   4. Dispatch raw_payload through webhook-processor.
 *   5. Mark done | failed (failed = transient, cron retries within window).
 *
 * Idempotency:
 *   - Atomic claim prevents double-processing.
 *   - whatsapp_cloud_messages has UNIQUE(message_id) so duplicate inserts no-op.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processWebhookPayload } from '@/lib/whatsapp/webhook-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getQstashReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

async function markDone(eventId: string) {
  await supabaseAdmin
    .from('whatsapp_webhook_events')
    .update({
      status: 'done',
      processed_at: new Date().toISOString(),
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

async function markFailed(eventId: string, errorMessage: string, attempts: number, maxAttempts: number) {
  const finalStatus = attempts >= maxAttempts ? 'dead' : 'failed';
  await supabaseAdmin
    .from('whatsapp_webhook_events')
    .update({
      status: finalStatus,
      last_error: errorMessage.slice(0, 1000),
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const receiver = getQstashReceiver();

  if (process.env.NODE_ENV === 'production') {
    if (!signature || !receiver) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const valid = await receiver.verify({ signature, body: rawBody });
    if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  } else if (receiver && signature) {
    const valid = await receiver.verify({ signature, body: rawBody });
    if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  } else if (req.headers.get('x-internal-request') !== 'true') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let eventId: string | undefined;
  try {
    eventId = JSON.parse(rawBody).eventId;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 });
  }

  const { data: claimedRows, error: claimError } = await supabaseAdmin.rpc(
    'claim_whatsapp_webhook_event',
    { p_id: eventId }
  );

  if (claimError) {
    console.error('[whatsapp-webhook-worker] claim failed:', claimError);
    return NextResponse.json({ error: 'claim failed' }, { status: 500 });
  }

  const claimed = (claimedRows as any[])?.[0];
  if (!claimed) {
    return NextResponse.json({ skipped: true, reason: 'not_claimable' }, { status: 200 });
  }

  try {
    const result = await processWebhookPayload(claimed.raw_payload);
    await markDone(eventId);
    return NextResponse.json({ ok: true, eventId, result });
  } catch (err: any) {
    const message = err?.message ?? 'unknown error';
    await markFailed(eventId, message, claimed.attempts, claimed.max_attempts);
    console.error('[whatsapp-webhook-worker] processing failed:', err);
    // 200 prevents QStash from re-driving — our cron handles retry on failed rows.
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
