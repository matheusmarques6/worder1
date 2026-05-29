/**
 * WhatsApp Cloud webhook — public ingestor.
 *
 * Two modes:
 *   - ENABLE_ASYNC_WEBHOOK=true  (target): HMAC verify → persist raw payload
 *     into whatsapp_webhook_events → enqueue via QStash → return 200 in <50ms.
 *   - ENABLE_ASYNC_WEBHOOK=false (legacy fallback during canary): runs the
 *     full processor inline. Used to revert without redeploy if a regression
 *     is detected.
 *
 * Plan ref: Sprint 1 / Fase 1 (ingest-fast / process-later).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyWebhookSignature } from '@/lib/whatsapp/cloud-api';
import { processWebhookPayload } from '@/lib/whatsapp/webhook-processor';
import { enqueueWhatsAppWebhook } from '@/lib/queue';
import { wlog } from '@/lib/observability/whatsapp-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

// ============================================
// GET — Meta verification challenge
// ============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode !== 'subscribe') {
    wlog.warn('whatsapp.webhook.verify_invalid_mode', { mode });
    return new Response('Invalid mode', { status: 403 });
  }

  const { data: account } = await supabase
    .from('whatsapp_business_accounts')
    .select('id, organization_id')
    .eq('webhook_verify_token', token)
    .single();

  if (!account) {
    const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (token !== globalToken) {
      wlog.warn('whatsapp.webhook.verify_token_mismatch', {});
      return new Response('Invalid verify token', { status: 403 });
    }
  } else {
    await supabase
      .from('whatsapp_business_accounts')
      .update({ webhook_configured: true })
      .eq('id', account.id);
    wlog.info('whatsapp.webhook.verified', {
      organization_id: account.organization_id,
      account_id: account.id,
    });
  }

  return new Response(challenge, { status: 200 });
}

// ============================================
// POST — Receive events (async ingest)
// ============================================
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const appSecret = process.env.META_APP_SECRET;

  // HMAC verify — timing-safe (cloud-api.ts:verifyWebhookSignature)
  if (signature && appSecret) {
    const valid = await verifyWebhookSignature(rawBody, signature, appSecret);
    if (!valid) {
      wlog.warn('whatsapp.webhook.invalid_signature', {});
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    wlog.error('whatsapp.webhook.missing_signature_or_secret', {});
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    wlog.warn('whatsapp.webhook.invalid_json', {});
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (payload?.object !== 'whatsapp_business_account') {
    wlog.info('whatsapp.webhook.ignored_non_whatsapp', { object: payload?.object });
    return NextResponse.json({ received: true, ignored: 'not_whatsapp' });
  }

  // Legacy synchronous path (disable when async is canary-validated).
  if (process.env.ENABLE_ASYNC_WEBHOOK !== 'true') {
    try {
      await processWebhookPayload(payload);
    } catch (err) {
      wlog.error('whatsapp.webhook.sync_processing_error', {
        error: (err as Error)?.message,
      });
    }
    return NextResponse.json({ received: true });
  }

  // Async path — persist raw + enqueue.
  const phoneNumberId =
    payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null;

  const { data: inserted, error: insertError } = await supabase
    .from('whatsapp_webhook_events')
    .insert({
      waba_phone_number_id: phoneNumberId,
      raw_payload: payload,
      signature: signature || null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    wlog.error('whatsapp.webhook.insert_failed', {
      phone_number_id: phoneNumberId,
      error: insertError?.message,
    });
    // Return 200 anyway — Meta retries for 7 days, but every 500 here counts
    // as a delivery error against our phone number quality. Better to swallow
    // and rely on Meta's retry than to look unstable.
    return NextResponse.json({ received: true, queued: false });
  }

  wlog.info('whatsapp.webhook.received', {
    event_id: inserted.id,
    phone_number_id: phoneNumberId,
  });

  // Fire-and-forget enqueue. If QStash fails, the cron at
  // /api/cron/reprocess-whatsapp-pending picks the event up within 60s.
  try {
    await enqueueWhatsAppWebhook(inserted.id);
  } catch (err) {
    wlog.error('whatsapp.webhook.enqueue_failed', {
      event_id: inserted.id,
      phone_number_id: phoneNumberId,
      error: (err as Error)?.message,
    });
  }

  return NextResponse.json({ received: true, eventId: inserted.id });
}
