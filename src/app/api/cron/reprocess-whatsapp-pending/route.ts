/**
 * Cron — reprocess WhatsApp webhook events stuck in 'pending' or 'failed'.
 *
 * Scheduled every minute (vercel.json). Picks up events older than 60s that
 * were never enqueued (QStash hiccup) or where the worker errored transiently.
 *
 * Behavior:
 *   - Pulls up to 100 candidates via pending_whatsapp_webhook_events_for_reprocess.
 *   - Re-enqueues each via QStash (no claim here — worker does atomic claim).
 *   - Events that exhaust max_attempts move to 'dead' via the worker path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWhatsAppWebhook } from '@/lib/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  // Vercel Cron sends a bearer with CRON_SECRET when configured.
  // Locally, allow X-Internal-Request: true for manual smoke tests.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (req.headers.get('x-internal-request') === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: candidates, error } = await supabaseAdmin.rpc(
    'pending_whatsapp_webhook_events_for_reprocess',
    { p_older_than_seconds: 60, p_limit: 100 }
  );

  if (error) {
    console.error('[reprocess-whatsapp-pending] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const events = (candidates as any[]) || [];
  let enqueued = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await enqueueWhatsAppWebhook(event.id);
      enqueued++;
    } catch (err) {
      failed++;
      console.error('[reprocess-whatsapp-pending] enqueue failed for', event.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: events.length,
    enqueued,
    failed,
  });
}
