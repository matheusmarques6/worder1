import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptSecret } from '@/lib/webhooks/secret-store';
import { buildSignatureHeader } from '@/lib/webhooks/signature';
import { safeFetch } from '@/lib/ai/ssrf-guard';
import { classifyResponse } from '@/lib/webhooks/response-classifier';
import { byteaToBuffer } from '@/lib/webhooks/bytea';

export const dynamic = 'force-dynamic';

const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 21600]; // 1m, 5m, 30m, 2h, 6h

function getQstashReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

function nextRetryDate(attemptCount: number): string {
  const idx = Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_SEC.length - 1);
  return new Date(Date.now() + RETRY_DELAYS_SEC[idx] * 1000).toISOString();
}

async function updateAfterAttempt(id: string, patch: Record<string, any>) {
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      ...patch,
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function markFailed(id: string, errorMessage: string) {
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      error_message: errorMessage,
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const receiver = getQstashReceiver();

  // Em produção: QStash signature obrigatória.
  // Em dev: se receiver configurado, também valida; senão aceita o header
  // interno X-Internal-Request: true pra smoke manual.
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

  let deliveryId: string | undefined;
  try {
    deliveryId = JSON.parse(rawBody).deliveryId;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!deliveryId) {
    return NextResponse.json({ error: 'deliveryId required' }, { status: 400 });
  }

  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .rpc('claim_webhook_delivery', { p_id: deliveryId });

  if (claimError) {
    console.error('[worker] claim failed:', claimError);
    return NextResponse.json({ error: 'claim failed' }, { status: 500 });
  }

  const claimed = (claimedRows as any[])?.[0];
  if (!claimed) {
    return NextResponse.json({ skipped: true, reason: 'not_claimable' }, { status: 200 });
  }

  const { data: sub } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('secret_encrypted, secret_previous_encrypted, secret_previous_expires_at')
    .eq('id', claimed.subscription_id)
    .single();

  if (!sub) {
    await markFailed(deliveryId, 'subscription not found');
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const primarySecret = decryptSecret(byteaToBuffer(sub.secret_encrypted));
  const previousSecret =
    sub.secret_previous_encrypted &&
    sub.secret_previous_expires_at &&
    new Date(sub.secret_previous_expires_at) > new Date()
      ? decryptSecret(byteaToBuffer(sub.secret_previous_encrypted))
      : null;

  const outboundBody = JSON.stringify(claimed.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sigHeader = buildSignatureHeader(primarySecret, previousSecret, timestamp, outboundBody);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Worder-Event': claimed.event_type,
    'X-Worder-Event-Id': claimed.event_id,
    'X-Worder-Signature': sigHeader,
    'X-Worder-Timestamp': timestamp,
    'X-Worder-Delivery-Id': claimed.id,
    'User-Agent': 'Worder-Webhooks/1.0',
  };

  // O guard aqui é o mesmo dos itens 18/19 do audit (ssrf-guard.ts): valida
  // esquema e IP/DNS do host, e revalida a cada salto de redirect — a URL do
  // hook é digitada pelo lojista, então tem a mesma classe de risco de SSRF
  // que fonte de conhecimento/mídia de WhatsApp. O safeFetch específico de
  // webhooks (safe-fetch.ts) tinha essa checagem só no `lookup` custom do
  // undici, que o Node nunca chama pra um IP literal — um lojista registrando
  // `https://10.0.0.5/x` batia direto na rede interna e a resposta virava
  // leitura exposta em webhook_deliveries.response_body.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // blockHttpsDowngrade=true (fix da re-review em cdeba429): sem isso, um
    // receptor https que responde 302 pra um http:// entrega a assinatura
    // HMAC (X-Worder-Signature) em texto claro nesse salto. Seguir redirect
    // continua correto — só não pode pisar em http no meio do caminho.
    const res = await safeFetch(claimed.url, {
      method: 'POST',
      headers,
      body: outboundBody,
      signal: controller.signal,
    }, 5, true);
    const text = await res.text();
    const result = { status: res.status, body: text.slice(0, 2048) };

    const outcome = classifyResponse(result.status, claimed.attempt_count, claimed.max_attempts);
    await updateAfterAttempt(deliveryId, {
      status: outcome,
      response_code: result.status,
      response_body: result.body,
      delivered_at: outcome === 'delivered' ? new Date().toISOString() : null,
      next_retry_at: outcome === 'retrying' ? nextRetryDate(claimed.attempt_count) : null,
    });

    return NextResponse.json({ ok: true, status: outcome, code: result.status });
  } catch (err: any) {
    const outcome = claimed.attempt_count < claimed.max_attempts ? 'retrying' : 'failed';
    await updateAfterAttempt(deliveryId, {
      status: outcome,
      error_message: err?.message?.slice(0, 500) ?? 'unknown error',
      next_retry_at: outcome === 'retrying' ? nextRetryDate(claimed.attempt_count) : null,
    });
    return NextResponse.json({ ok: false, error: err?.message }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
