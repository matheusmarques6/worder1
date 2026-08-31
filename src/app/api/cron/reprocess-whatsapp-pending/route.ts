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
import { enqueueWhatsAppWebhook, enqueueWhatsAppAiRespond } from '@/lib/queue';
import { quarantineStuckSending } from '@/lib/whatsapp/recipient-claim';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
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

  // ---------- Fase 2: IA pendente órfã (job QStash perdido / QStash off / retry agendado) ----------
  // RPC criada em 20260619_whatsapp_ai_retry.sql. Janela 120s > debounce normal,
  // então só pega casos realmente órfãos. O worker faz o claim atômico de
  // ai_pending — re-enfileirar em duplicidade é no-op.
  let aiScanned = 0;
  let aiEnqueued = 0;
  let aiFailed = 0;
  const { data: aiPending, error: aiErr } = await supabaseAdmin.rpc(
    'pending_whatsapp_ai_responses_for_reprocess',
    { p_older_than_seconds: 120, p_limit: 50 }
  );
  if (aiErr) {
    // Migration ainda não aplicada => degrade gracioso, fase 1 já rodou.
    console.error('[reprocess-whatsapp-pending] ai sweep RPC error:', aiErr.message);
  } else {
    const rows = (aiPending as any[]) || [];
    aiScanned = rows.length;
    // Rollout do runtime (Agentes por Evento, D3): org em 'runtime' não tem
    // quem consuma este job no caminho TS — a resposta dela é agendada por
    // pending_response_at e coalescida pelo runtime Python. Reenfileirar no
    // QStash aqui seria um segundo mecanismo respondendo à mesma conversa,
    // do jeito que o item 09 corrigiu no coalescer para o sentido inverso.
    // Erro de leitura do rollout devolve o modo cacheado da org quando existe
    // (o cron reenfileira ou pula do jeito de sempre) e só cai para legacy —
    // reenfileirando — quando ainda não havia nada em cache; evita
    // reenfileirar em duplicidade uma org já confirmada em runtime só porque
    // o banco falhou uma vez. Linha pulada aqui NÃO tem ai_pending zerado: o
    // cron não é dono desse estado e a org pode voltar para legacy.
    const { getRuntimeMode } = await import('@/lib/ai/runtime-rollout');
    for (const row of rows) {
      if ((await getRuntimeMode(supabaseAdmin, row.organization_id)) === 'runtime') {
        continue;
      }
      try {
        await enqueueWhatsAppAiRespond(
          {
            conversationId: row.conversation_id,
            accountId: row.account_id,
            organizationId: row.organization_id,
          },
          0,
        );
        aiEnqueued++;
      } catch (err) {
        aiFailed++;
        console.error('[reprocess-whatsapp-pending] ai enqueue failed for', row.conversation_id, err);
      }
    }
  }

  // ---------- Phase 0 / 0D: quarentena de envios ambíguos ----------
  // Flipa recipients presos em 'sending' há >10min para 'failed'
  // (error_message='ambiguous_send_quarantine'). Viés anti-duplicata para
  // marketing: o pre-mark otimista deixa um raro crash mid-send como 'sending';
  // este sweep o sinaliza para revisão em vez de re-enviar.
  let quarantined = 0;
  try {
    quarantined = await quarantineStuckSending();
  } catch (err) {
    console.error('[reprocess-whatsapp-pending] quarantine sweep error:', err);
  }

  return NextResponse.json({
    ok: true,
    scanned: events.length,
    enqueued,
    failed,
    ai_scanned: aiScanned,
    ai_enqueued: aiEnqueued,
    ai_failed: aiFailed,
    quarantined,
  });
}
