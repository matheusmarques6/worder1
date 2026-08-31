/**
 * WhatsApp AI respond worker — RUN dedicado da auto-resposta (Fase 2d / P4).
 *
 * Disparado por QStash (enqueueWhatsAppAiRespond) com delay = DEBOUNCE_SECONDS.
 * Move o RUN do LLM para FORA do webhook, permitindo DEBOUNCE: várias mensagens
 * rápidas do cliente são agregadas em UMA resposta.
 *
 * Fluxo:
 *   1. Verifica assinatura QStash (IGUAL aos outros workers).
 *   2. Lê { conversationId, accountId, organizationId }.
 *   3. Lê a conversa. Se now < ai_debounce_until => ainda há janela aberta
 *      (chegou msg mais nova que reagendou) => retorna 200 sem rodar; um job
 *      posterior cobre.
 *   4. Se now >= ai_debounce_until => CLAIM ATÔMICO:
 *        update ... set ai_pending=false where id=? and ai_pending=true
 *      Se NÃO afetou linha (já consumido por outro job/retry) => 200 sem rodar.
 *      Isso protege contra DOUBLE-SEND sob retries do QStash e jobs concorrentes.
 *   5. Busca conta + contato + última mensagem inbound de texto e chama
 *      maybeRunAgentForCloudConversation (histórico das ~20 últimas agrega as
 *      mensagens rápidas naturalmente). Envio agora é HUMANIZADO.
 *   6. SEMPRE retorna 200 (mesmo em erro tratado) p/ evitar retempest de retries.
 *
 * maxDuration: 60s (teto Vercel). O sender limita os delays humanizados a um
 * orçamento seguro (ver cloud-sender.ts TIME BUDGET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { planAiRetry } from '@/lib/ai/failure-classifier';
import { wlog } from '@/lib/observability/whatsapp-logger';
import { sendAlert } from '@/lib/whatsapp/alerts';
import { buildRunnerMediaInput, type InboundMediaInput } from '@/lib/ai/media/router';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getQstashReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const receiver = getQstashReceiver();

  // --- Verificação de assinatura (mirror de whatsapp-webhook worker) ---
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

  let conversationId: string | undefined;
  let accountId: string | undefined;
  let organizationId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    conversationId = parsed.conversationId;
    accountId = parsed.accountId;
    organizationId = parsed.organizationId;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!conversationId || !accountId || !organizationId) {
    return NextResponse.json(
      { error: 'conversationId, accountId, organizationId required' },
      { status: 400 },
    );
  }

  // Rollout do runtime (Agentes por Evento, D3): org migrada não responde por
  // este caminho. Jobs QStash em voo no momento do cutover chegam aqui e são
  // reconhecidos e descartados — a resposta virá pelo coalescer do runtime.
  const { getRuntimeMode } = await import('@/lib/ai/runtime-rollout');
  if ((await getRuntimeMode(supabaseAdmin, organizationId)) === 'runtime') {
    return NextResponse.json({ ok: true, skipped: 'org_migrated_to_runtime' });
  }

  try {
    // ---------- 1. Ler a conversa ----------
    const { data: conversation } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json(
        { ok: true, skipped: 'conversation_not_found' },
        { status: 200 },
      );
    }

    if (conversation.ai_enabled === false) {
      return NextResponse.json({ ok: true, skipped: 'ai_disabled' }, { status: 200 });
    }

    // ---------- 2. Janela de debounce ainda aberta? ----------
    // Se chegou mensagem mais nova que empurrou ai_debounce_until p/ frente,
    // este job (mais velho) NÃO deve responder — um job posterior cobre.
    if (conversation.ai_debounce_until) {
      const debounceUntil = new Date(conversation.ai_debounce_until).getTime();
      if (Date.now() < debounceUntil) {
        return NextResponse.json(
          { ok: true, skipped: 'debounce_window_open' },
          { status: 200 },
        );
      }
    }

    // ---------- 3. CLAIM atômico (anti double-send) ----------
    // Só 1 job consegue zerar ai_pending=true->false. Os demais (retries/
    // concorrentes) não afetam linha e saem sem rodar. Guard compartilhado
    // com o fallback síncrono do webhook (item 14 da auditoria) — vive em
    // cloud-runner.ts para não divergir entre os dois lugares.
    const { claimAiPendingResponse } = await import('@/lib/ai/cloud-runner');
    const claimed = await claimAiPendingResponse(conversationId);

    if (!claimed) {
      return NextResponse.json({ ok: true, skipped: 'already_consumed' }, { status: 200 });
    }

    // ---------- 4. Carregar conta + contato ----------
    const { data: account } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ ok: true, skipped: 'account_not_found' }, { status: 200 });
    }

    let contact: any = null;
    if (conversation.contact_id) {
      const { data: c } = await supabaseAdmin
        .from('whatsapp_contacts')
        .select('*')
        .eq('id', conversation.contact_id)
        .maybeSingle();
      contact = c;
    }

    // ---------- 5. Última mensagem inbound elegível (texto/áudio/imagem) ----------
    const { data: lastInbound } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select(
        'message_id, text_body, message_type, caption, media_url, media_storage_path, media_mime_type',
      )
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const text = (lastInbound?.text_body || '').trim();
    const messageType = lastInbound?.message_type || 'text';
    const isMediaType = messageType === 'audio' || messageType === 'image';
    let inboundMedia: InboundMediaInput | null = lastInbound
      ? buildRunnerMediaInput(lastInbound)
      : null;
    // Fix (review Finding 1 — CRITICAL): áudio/imagem SEM ponteiros ainda
    // (media_url/media_storage_path nulos porque o download assíncrono ainda
    // não terminou, ou falhou permanentemente) não pode cair no guard abaixo
    // e virar silêncio terminal — o claim de ai_pending já foi consumido, e
    // NENHUM job posterior vai reprocessar esta mensagem. Monta um input de
    // mídia "vazio" (ponteiros null) a partir do tipo da linha; o runner
    // trata isso normalmente: fetchInboundMedia retorna null e
    // runMediaFallback dispara (ask_text/handoff) — nunca silêncio.
    if (!inboundMedia && isMediaType) {
      inboundMedia = {
        type: messageType as 'audio' | 'image',
        mediaUrl: null,
        storagePath: null,
        mimeType: lastInbound?.media_mime_type ?? null,
        caption: lastInbound?.caption ?? null,
      };
    }
    if (!text && !inboundMedia) {
      return NextResponse.json({ ok: true, skipped: 'no_inbound_text' }, { status: 200 });
    }

    // ---------- 6. Rodar runner (envio humanizado dentro do sender) ----------
    const { maybeRunAgentForCloudConversation } = await import('@/lib/ai/cloud-runner');
    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation,
      contact,
      text,
      inboundMessageId: lastInbound?.message_id,
      messageType,
      phoneNumber: conversation.contact_phone || conversation.wa_id,
      inboundMedia: inboundMedia || undefined,
    });

    // ---------- 7. Falha transient => retry com backoff (cap em ai_retry_count) ----------
    if (result.failure === 'transient') {
      const plan = planAiRetry(conversation.ai_retry_count ?? 0);

      if (plan.action === 'retry') {
        // Reabre o claim: repõe ai_pending e empurra a janela p/ o backoff.
        await supabaseAdmin
          .from('whatsapp_cloud_conversations')
          .update({
            ai_pending: true,
            ai_debounce_until: new Date(Date.now() + plan.delaySeconds * 1000).toISOString(),
            ai_retry_count: plan.attempt,
          })
          .eq('id', conversationId);

        const { enqueueWhatsAppAiRespond } = await import('@/lib/queue');
        const qId = await enqueueWhatsAppAiRespond(
          { conversationId, accountId, organizationId },
          plan.delaySeconds,
        );
        // qId null (QStash off) => o sweep do cron reprocess-whatsapp-pending cobre.
        wlog.warn('whatsapp.ai.retry_scheduled', {
          organization_id: organizationId,
          conversation_id: conversationId,
          attempt: plan.attempt,
          delay_seconds: plan.delaySeconds,
          enqueued: Boolean(qId),
          error: result.error,
        });
        return NextResponse.json(
          { ok: false, retry_scheduled: true, attempt: plan.attempt },
          { status: 200 },
        );
      }

      // ---------- 8. Esgotou tentativas => gave_up com visibilidade ----------
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({ ai_retry_count: 0 })
        .eq('id', conversationId);

      wlog.error('whatsapp.ai.gave_up', {
        organization_id: organizationId,
        conversation_id: conversationId,
        attempts: plan.attempts,
        error: result.error,
      });
      await sendAlert({
        severity: 'warning',
        type: 'ai_response_failed',
        title: 'IA não conseguiu responder cliente no WhatsApp',
        message: `Conversa ${conversationId}: ${plan.attempts} tentativas esgotadas sem resposta. Último erro: ${result.error || 'desconhecido'}`,
        organizationId,
        dedupKey: `ai_response_failed:gave_up:${organizationId}:${conversationId}`,
        metadata: { conversation_id: conversationId, attempts: plan.attempts, last_error: result.error },
      }).catch(() => {});
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        organization_id: organizationId,
        type: 'whatsapp_ai_gave_up',
        title: 'Cliente sem resposta da IA',
        message: 'A IA esgotou as tentativas de responder uma conversa do WhatsApp. Responda manualmente.',
        metadata: { conversation_id: conversationId, attempts: plan.attempts, last_error: result.error },
        action_url: '/whatsapp/inbox',
      });
      if (notifErr) console.error('[whatsapp-ai-respond] notification insert failed:', notifErr.message);

      return NextResponse.json({ ok: false, gave_up: true }, { status: 200 });
    }

    // ---------- 9. Sucesso/skip: zera contador de retry se necessário ----------
    if ((conversation.ai_retry_count ?? 0) > 0) {
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({ ai_retry_count: 0 })
        .eq('id', conversationId);
    }

    return NextResponse.json({ ok: true, conversationId, result }, { status: 200 });
  } catch (err: any) {
    // SEMPRE 200 em erro tratado: evita retempest de retries do QStash.
    console.error('[whatsapp-ai-respond] erro:', err?.message || err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'unknown error' },
      { status: 200 },
    );
  }
}
