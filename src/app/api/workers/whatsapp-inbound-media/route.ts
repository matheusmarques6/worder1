/**
 * Inbound media worker — baixa mídia de mensagem inbound já persistida.
 *
 * Disparado pelo QStash via enqueueWhatsAppInboundMedia (webhook-processor).
 * Auth: mesma verificação de assinatura de /api/workers/whatsapp-webhook.
 *
 * Códigos de resposta:
 *   200 — done (ou no-op idempotente / job inválido não-retryável)
 *   500 — falha transiente (download/upload) => QStash re-tenta (retries: 2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import {
  processInboundMedia,
  type InboundMediaJob,
} from '@/lib/whatsapp/inbound-media';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getQstashReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

// Falhas definitivas: re-tentar não muda o resultado, responder 200.
const NON_RETRYABLE = new Set(['message_not_found', 'no_media_id', 'account_not_found']);

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

  let job: InboundMediaJob;
  try {
    job = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!job?.cloudMessageId || !job?.accountId || !job?.organizationId) {
    return NextResponse.json({ error: 'cloudMessageId, accountId, organizationId required' }, { status: 400 });
  }

  const result = await processInboundMedia(job);

  if (!result.ok && !NON_RETRYABLE.has(result.reason || '')) {
    // Transiente (ex.: Meta 5xx, persist_failed) — 500 faz o QStash re-driver.
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
