/**
 * WhatsApp webhook processor — pure, queue-driven.
 *
 * Extracted from src/app/api/whatsapp/cloud/webhook/route.ts (Sprint 1 / Fase 1).
 *
 * Responsibilities:
 *   - Resolve account by phone_number_id
 *   - Persist inbound messages (dedup by message_id)
 *   - Update conversation / contact / account counters
 *   - Update outbound message status from delivery receipts
 *   - Handle template status + category webhooks
 *   - Handle phone quality rating changes
 *   - Fire RuleEngine for conversation_started / message_received / contact_created
 *
 * Called from the QStash-triggered worker at /api/workers/whatsapp-webhook.
 * The webhook ingestor (route.ts) only validates HMAC, persists raw payload,
 * and publishes to QStash — no business logic runs in the public HTTP path.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  extractWebhookMessageText,
  getMessageType,
  normalizePhone,
  type WebhookMessage,
} from './cloud-api';
import { RuleEngine, type EventData } from '@/lib/services/automation/rule-engine';
import { wlog } from '@/lib/observability/whatsapp-logger';
import { applyCampaignRecipientWebhookStatus } from './campaign-recipient-status';
import { statusTimestampFields } from './status-timestamps';
import { resolveWebhookAccount } from './webhook-account-resolver';
import { routeInboundForAi } from '@/lib/ai/media/router';

// Ordem canonica de status WhatsApp. Webhooks chegam fora de ordem em raros
// casos (delivered antes de sent); sem o guard de ordinal a row sofre retrograde.
const STATUS_ORDINAL: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

// Janela de DEBOUNCE da auto-resposta da IA (Fase 2d). Mensagens do cliente
// que cheguem dentro dessa janela são agregadas em UMA resposta. Configurável
// via env; default 8s. Cada inbound EMPURRA a janela p/ frente (reschedule).
const AI_DEBOUNCE_SECONDS = Number(process.env.WHATSAPP_AI_DEBOUNCE_SECONDS) || 8;

// internal.correlate_outbox_status (20260812000004) só entende 'sent' e
// 'failed' — qualquer outro valor derruba a função com exceção. delivered/read
// da Meta são "chegou", que pro outbox já é 'sent' desde o primeiro status
// recebido (o outbox não distingue entrega de leitura). A tradução mora aqui,
// explícita, porque o vocabulário de quem chama nunca é o de quem responde.
const OUTBOX_STATUS_BY_META_STATUS: Record<string, 'sent' | 'failed'> = {
  sent: 'sent',
  delivered: 'sent',
  read: 'sent',
  failed: 'failed',
};

export interface ProcessResult {
  processed: number;
  skipped: number;
  errors: number;
  details: Array<{ type: string; status: string; reason?: string }>;
}

export async function processWebhookPayload(payload: any): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, errors: 0, details: [] };

  if (payload?.object !== 'whatsapp_business_account') {
    result.skipped++;
    result.details.push({ type: 'envelope', status: 'skipped', reason: 'not_whatsapp' });
    return result;
  }

  for (const entry of payload.entry || []) {
    // entry.id e o WABA ID (globalmente unico na Meta). Usado pra
    // desambiguar lookup quando duas orgs cadastram o mesmo phone_number_id
    // (cenario futuro de multi-tenant). Sem isso, webhook pode vazar pra
    // org errada.
    const entryWabaId: string | undefined = entry?.id;

    for (const change of entry.changes || []) {
      const field = change.field;
      const value = change.value;

      switch (field) {
        case 'messages': {
          const phoneNumberId = value?.metadata?.phone_number_id;
          if (!phoneNumberId) {
            result.skipped++;
            result.details.push({ type: 'change', status: 'skipped', reason: 'no_phone_number_id' });
            continue;
          }

          // Lookup: filtra por phone_number_id no banco e desempata por
          // waba_id em memoria (resolveWebhookAccount — pura, testada). O
          // limite de 10 e folga: as duas UNIQUE do banco tornam >2 linhas
          // impossivel na pratica, e o corte serve so de teto de leitura.
          const { data: matchingAccounts, error: lookupError } = await supabase
            .from('whatsapp_business_accounts')
            .select('*')
            .eq('phone_number_id', phoneNumberId)
            .limit(10);

          if (lookupError) {
            // Falha de infra != conta inexistente. Propaga pra o evento ser
            // reprocessado em vez de virar 'done' com a mensagem perdida.
            wlog.error('whatsapp.webhook.account_lookup_failed', {
              phone_number_id: phoneNumberId,
              waba_id: entryWabaId,
              error: lookupError.message,
            });
            throw lookupError;
          }

          const resolution = resolveWebhookAccount(matchingAccounts, entryWabaId);

          if (!resolution.ok) {
            // ANTES ESTE DESCARTE ERA MUDO: sem log, e o retorno de
            // processWebhookPayload e ignorado pelo caller sincrono. A Meta
            // recebia 200, nao fazia retry, e nada aparecia em log nenhum —
            // inbound morto e invisivel ao mesmo tempo. Agora grita.
            wlog.error('whatsapp.webhook.account_unresolved', {
              phone_number_id: phoneNumberId,
              waba_id_from_meta: entryWabaId,
              reason: resolution.reason,
              candidates: resolution.candidates,
              // Sem isto o operador nao sabe o que comparar: e o valor gravado
              // que diverge do entry.id da Meta.
              stored_waba_ids: (matchingAccounts || []).map((a: any) => a.waba_id ?? null),
              hint:
                resolution.reason === 'ambiguous'
                  ? 'Mais de uma conta candidata — o banco tem linha duplicada.'
                  : 'Nenhuma conta com este phone_number_id + waba_id. Confira waba_id gravado vs o WABA ID na Meta.',
            });
            result.skipped++;
            result.details.push({
              type: 'change',
              status: 'skipped',
              reason:
                resolution.reason === 'ambiguous'
                  ? `ambiguous_account:${phoneNumberId}`
                  : `unknown_phone_number_id:${phoneNumberId}`,
            });
            continue;
          }

          const account = resolution.account;

          if (resolution.matchedBy === 'legacy_null_waba') {
            // Casou por ser a unica linha legada com waba_id NULL. Funciona,
            // mas e um match por eliminacao: registrar torna auditavel e
            // aponta o backfill que encerra o caso.
            wlog.warn('whatsapp.webhook.account_matched_legacy', {
              account_id: account.id,
              phone_number_id: phoneNumberId,
              waba_id_from_meta: entryWabaId,
              hint: 'Linha com waba_id NULL. Faca backfill do waba_id nesta conta.',
            });
          }

          for (const message of value.messages || []) {
            try {
              await processMessage(account, message, value.contacts);
              result.processed++;
              result.details.push({ type: 'message', status: 'ok' });
            } catch (err: any) {
              result.errors++;
              result.details.push({ type: 'message', status: 'error', reason: err?.message });
              wlog.error('whatsapp.webhook.process_message_error', {
                error: err?.message,
                account_id: account.id,
                message_id: message?.id,
              });
            }
          }

          for (const status of value.statuses || []) {
            try {
              await processStatus(account, status);
              result.processed++;
              result.details.push({ type: 'status', status: 'ok' });
            } catch (err: any) {
              result.errors++;
              result.details.push({ type: 'status', status: 'error', reason: err?.message });
              wlog.error('whatsapp.webhook.process_status_error', {
                error: err?.message,
                account_id: account.id,
                message_id: status?.id,
              });
            }
          }

          for (const errorEntry of value.errors || []) {
            result.details.push({
              type: 'error',
              status: 'logged',
              reason: `code:${errorEntry?.code}`,
            });
            wlog.error('whatsapp.webhook.meta_error_entry', {
              code: errorEntry?.code,
              title: errorEntry?.title,
              account_id: account.id,
            });
          }
          break;
        }

        case 'message_template_status_update': {
          try {
            await processTemplateStatusUpdate(value);
            result.processed++;
            result.details.push({ type: 'template_status', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'template_status', status: 'error', reason: err?.message });
            wlog.error('whatsapp.webhook.template_status_error', {
              error: err?.message,
            });
          }
          break;
        }

        case 'template_category_update': {
          try {
            await processTemplateCategoryUpdate(value);
            result.processed++;
            result.details.push({ type: 'template_category', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'template_category', status: 'error', reason: err?.message });
            wlog.error('whatsapp.webhook.template_category_error', {
              error: err?.message,
            });
          }
          break;
        }

        case 'phone_number_quality_update': {
          try {
            await processPhoneQualityUpdate(value);
            result.processed++;
            result.details.push({ type: 'phone_quality', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'phone_quality', status: 'error', reason: err?.message });
            wlog.error('whatsapp.webhook.phone_quality_error', {
              error: err?.message,
            });
          }
          break;
        }

        default:
          result.skipped++;
          result.details.push({ type: field || 'unknown', status: 'skipped', reason: 'unhandled_field' });
          break;
      }
    }
  }

  return result;
}

// ============================================================
// PROCESS INBOUND MESSAGE
// ============================================================

async function processMessage(
  account: any,
  message: WebhookMessage,
  contacts: Array<{ wa_id: string; profile: { name: string } }> | undefined
) {
  const phoneNumber = normalizePhone(message.from);
  const contactInfo = contacts?.find((c) => c.wa_id === message.from);
  const contactName = contactInfo?.profile?.name || phoneNumber;

  const contact = await getOrCreateContact(account, phoneNumber, contactName);
  const isNewContact = contact?.isNew || false;

  const conversation = await getOrCreateConversation(account, contact, phoneNumber);
  const isNewConversation = conversation?.isNew || false;

  const { data: existingMsg } = await supabase
    .from('whatsapp_cloud_messages')
    .select('id')
    .eq('message_id', message.id)
    .maybeSingle();

  if (existingMsg) {
    return;
  }

  const messageType = getMessageType(message);
  const textBody = extractWebhookMessageText(message);
  const content = buildMessageContent(message);
  // Régua única de tipos suportados pela IA (document/sticker/location/video
  // ficam de fora) — calculada uma vez e usada tanto pelo ramo runtime
  // quanto pelo legado logo abaixo, para as duas bifurcações nunca divergirem.
  const aiRoute = routeInboundForAi(messageType, textBody);

  const mediaId =
    message.image?.id ||
    message.video?.id ||
    message.audio?.id ||
    message.document?.id ||
    message.sticker?.id;

  // Conhecidos no instante do ingest (webhook cru), ao contrário de
  // media_url/media_storage_path que só existem depois do download
  // assíncrono abaixo — usados no p_content do runtime (item 06).
  const mediaCaption =
    message.image?.caption || message.video?.caption || message.document?.caption;
  const mediaMimeType =
    message.image?.mime_type ||
    message.video?.mime_type ||
    message.audio?.mime_type ||
    message.document?.mime_type ||
    message.sticker?.mime_type ||
    null;

  const { data: insertedMsg, error: insertError } = await supabase
    .from('whatsapp_cloud_messages')
    .insert({
      organization_id: account.organization_id,
      store_id: account.store_id || conversation.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: message.id,
      direction: 'inbound',
      from_number: phoneNumber,
      to_number: account.phone_number,
      message_type: messageType,
      content,
      text_body: textBody,
      caption: mediaCaption,
      media_id: mediaId,
      media_download_status: mediaId ? 'pending' : null,
      status: 'received',
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    })
    .select('id')
    .maybeSingle();

  // Não engolir erro de insert: se o schema estiver atrasado (coluna nova
  // ainda não migrada) ou qualquer outra falha do PostgREST, propaga para o
  // caller (processMessage's caller conta em result.errors e o evento do
  // webhook é reprocessado pelo cron) em vez de marcar o evento como "done"
  // com a mensagem inbound silenciosamente perdida.
  if (insertError) {
    throw insertError;
  }

  // ============================================================
  // PIPELINE DE MÍDIA INBOUND — nunca quebra a persistência.
  // Preferência: QStash (async). Fallback: inline (ambientes sem fila).
  // Falha aqui deixa media_download_status='pending'/'failed' e a
  // mensagem segue visível no inbox (sem mídia).
  // ============================================================
  if (mediaId && insertedMsg?.id) {
    try {
      const mediaJob = {
        cloudMessageId: insertedMsg.id,
        accountId: account.id,
        organizationId: account.organization_id,
      };
      const { enqueueWhatsAppInboundMedia } = await import('@/lib/queue');
      const queued = await enqueueWhatsAppInboundMedia(mediaJob);
      if (!queued) {
        const { processInboundMedia } = await import('./inbound-media');
        await processInboundMedia(mediaJob);
      }
    } catch (err: any) {
      wlog.error('whatsapp.media.inbound_pipeline_error', {
        error: err?.message,
        message_id: message.id,
        conversation_id: conversation.id,
      });
    }
  }

  const nowIso = new Date().toISOString();
  // Counters via RPC: UPDATE atomico (COALESCE(col,0)+1). Sem isso, duas
  // webhooks concorrentes pro mesmo contato perdem incrementos.
  await supabase.rpc('increment_conversation_inbound', {
    p_conversation_id: conversation.id,
    p_preview: textBody.substring(0, 100),
    p_now: nowIso,
  });

  await supabase.rpc('increment_account_inbound', {
    p_account_id: account.id,
    p_now: nowIso,
  });

  let crmContactId: string | undefined = contact?.crm_contact_id;
  if (!crmContactId) {
    const { data: crmContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', account.organization_id)
      .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
      .limit(1)
      .maybeSingle();

    if (crmContact) {
      crmContactId = crmContact.id;
      await supabase
        .from('whatsapp_contacts')
        .update({ crm_contact_id: crmContact.id })
        .eq('id', contact.id);
    }
  }

  const eventData: EventData = {
    contact_id: crmContactId,
    contact_name: contactName,
    contact_phone: phoneNumber,
    conversation_id: conversation.id,
    message_text: textBody,
    message_timestamp: message.timestamp,
    source_id: `whatsapp_${conversation.id}`,
  };

  if (isNewConversation) {
    await RuleEngine.processCreationRules(
      account.organization_id,
      'whatsapp',
      'conversation_started',
      eventData
    );
  }

  await RuleEngine.processCreationRules(
    account.organization_id,
    'whatsapp',
    'message_received',
    eventData
  );

  if (isNewContact && crmContactId) {
    await RuleEngine.processCreationRules(
      account.organization_id,
      'whatsapp',
      'contact_created',
      eventData
    );
  }

  // ============================================================
  // ROLLOUT DO RUNTIME (Agentes por Evento, D3)
  // Org migrada usa o caminho canônico: ingest_inbound_message grava o seq
  // atômico + pending_response_at e NÃO enfileira — o coalescer do runtime
  // Python cria o job único da rajada. O bloco de debounce legado abaixo é
  // PULADO por inteiro (uma conversa nunca está nos dois mecanismos). Org sem
  // linha em ai_runtime_rollout = legacy; erro de leitura = legacy.
  // ============================================================
  const { getRuntimeMode } = await import('@/lib/ai/runtime-rollout');
  const runtimeMode = await getRuntimeMode(supabase, account.organization_id);

  if (runtimeMode === 'runtime') {
    // Try/catch que NUNCA quebra o webhook — mesmo contrato do bloco legado.
    try {
      const isSelf = phoneNumber && account.phone_number && phoneNumber === account.phone_number;
      // Mesma régua do legado (routeInboundForAi): document/sticker/location/
      // video não agendam IA em nenhum dos dois ramos. Aqui isso significa
      // nem chamar ingest_inbound_message — a mensagem já está no histórico
      // via whatsapp_cloud_messages acima, ingest é só o caminho da IA.
      if (!isSelf && aiRoute !== 'unsupported') {
        // Janela de agrupamento POR LOJA (órbita → Adaptação → Entrega),
        // com cache de 30s e fail-safe para o default — Pacote B 17/08.
        const { getDeliveryDebounceSeconds } = await import('@/lib/ai/delivery-settings');
        const debounceSeconds = await getDeliveryDebounceSeconds(
          supabase,
          account.organization_id,
        );
        // Mídia conhecida no instante do ingest (media_id/mime_type/caption
        // do webhook cru) — o download é assíncrono e pode não ter terminado
        // ainda, então não esperamos por media_url/storage_path aqui. O
        // consumidor resolve o resto por p_provider_message_id (item 06).
        // Texto continua saindo com a mesma forma de sempre.
        const ingestContent: Record<string, unknown> = { type: messageType, text: textBody ?? null };
        if (mediaId) {
          ingestContent.media_id = mediaId;
          ingestContent.mime_type = mediaMimeType;
          ingestContent.caption = mediaCaption ?? null;
        }
        const { error: ingestError } = await supabase.rpc('ingest_inbound_message', {
          p_organization_id: account.organization_id,
          p_channel: 'whatsapp',
          p_external_id: String(phoneNumber ?? ''),
          p_contact_name: contact?.profile_name || contact?.name || null,
          p_content: ingestContent,
          p_provider_message_id: message.id,
          p_debounce_seconds: debounceSeconds,
        });
        if (ingestError) throw new Error(ingestError.message);

        // O botão do inbox vale também no runtime: com o agente desligado o
        // ingest continua (histórico na canônica), mas a resposta agendada é
        // CANCELADA — o freio é a mesma RPC do toggle e do envio manual.
        const botOff = conversation?.ai_enabled === false;
        if (botOff) {
          await supabase.rpc('cancel_pending_ai_response', {
            p_organization_id: account.organization_id,
            p_phone: String(phoneNumber ?? ''),
          });
        }

        // Progresso ao vivo no chat, igual ao caminho legado: o debounce do
        // coalescer é justamente o trecho em que o inbox ficaria mudo. Os
        // passos seguintes (assumiu/gerando/verificando/enviada) vêm do
        // próprio runtime via internal.emit_ai_run_step.
        if (conversation?.id) {
          const { recordAiStep, AI_RUN_STEPS } = await import('@/lib/ai/run-steps');
          const { randomUUID } = await import('crypto');
          await recordAiStep({
            organizationId: account.organization_id,
            conversationId: conversation.id,
            runId: randomUUID(),
            step: botOff ? AI_RUN_STEPS.SKIPPED : AI_RUN_STEPS.QUEUED,
            detail: botOff
              ? 'Agente desativado nesta conversa — não vai responder'
              : 'Agente vai responder',
            metadata: { debounce_seconds: debounceSeconds, runtime: true },
          });
        }
      }
    } catch (err: any) {
      wlog.error('whatsapp.runtime.ingest_error', {
        error: err?.message,
        conversation_id: conversation?.id,
      });
    }
  }

  // ============================================================
  // DEBOUNCE DA IA (Fase 2d / P4) — auto-resposta humanizada agregada.
  // O webhook NÃO roda mais o LLM síncrono. Em vez disso:
  //   - marca ai_debounce_until = now + DEBOUNCE_SECONDS e ai_pending = true;
  //   - enfileira (QStash, delay = DEBOUNCE_SECONDS) o worker dedicado
  //     /api/workers/whatsapp-ai-respond.
  // Mensagens subsequentes EMPURRAM o ai_debounce_until p/ frente e enfileiram
  // outro job: o worker só responde quando now >= ai_debounce_until E consegue
  // o CLAIM atômico de ai_pending => 1 resposta agregada (sem double-send).
  // Try/catch que NUNCA quebra o webhook: erro da IA não bloqueia ingestão.
  // Guards finos (anti-loop, idempotência, text-only, ai_enabled) ficam
  // dentro do runner, executado no worker.
  // ============================================================
  try {
    // Agenda p/ inbound de texto, ÁUDIO e IMAGEM (document/sticker/location/
    // video seguem fora — rota 'unsupported'), fora de auto-conversa, com IA
    // habilitada. Mesma janela de debounce para todos os tipos.
    const isSelf = phoneNumber && account.phone_number && phoneNumber === account.phone_number;
    // runtimeMode === 'legacy': org migrada já foi atendida pelo bloco acima.
    if (runtimeMode === 'legacy' && aiRoute !== 'unsupported' && !isSelf && conversation?.ai_enabled !== false) {
      const debounceSeconds = AI_DEBOUNCE_SECONDS;
      const debounceUntil = new Date(Date.now() + debounceSeconds * 1000).toISOString();

      // Empurra a janela (reschedule) e marca pendente.
      await supabase
        .from('whatsapp_cloud_conversations')
        .update({ ai_debounce_until: debounceUntil, ai_pending: true })
        .eq('id', conversation.id);

      // Progresso ao vivo: a janela de debounce e justamente o trecho em que o
      // inbox ficava mudo sem explicacao. O runId aqui e proprio deste
      // agendamento e nao coincide com o do run — o painel agrupa por conversa
      // e encerra no passo terminal, nao por runId (ver run-steps.ts).
      const { recordAiStep, AI_RUN_STEPS } = await import('@/lib/ai/run-steps');
      const { randomUUID } = await import('crypto');
      await recordAiStep({
        organizationId: account.organization_id,
        conversationId: conversation.id,
        runId: randomUUID(),
        step: AI_RUN_STEPS.QUEUED,
        detail: 'Agente vai responder',
        metadata: { debounce_seconds: debounceSeconds },
      });

      const { enqueueWhatsAppAiRespond } = await import('@/lib/queue');
      const messageId = await enqueueWhatsAppAiRespond(
        {
          conversationId: conversation.id,
          accountId: account.id,
          organizationId: account.organization_id,
        },
        debounceSeconds,
      );

      // Fallback: QStash não configurado => roda síncrono (caminho legado 2a)
      // p/ não perder a resposta em ambientes sem fila. Relê a row p/ pegar
      // media_* (preenchidas pelo pipeline de mídia inbound).
      //
      // Item 14 da auditoria: este caminho chamava o runner direto, sem
      // passar pelo CLAIM atômico de ai_pending que o worker QStash usa —
      // duas entregas do mesmo webhook (Meta reentrega) viravam duas
      // respostas. Agora usa o MESMO guard (claimAiPendingResponse,
      // extraído de cloud-runner.ts): só quem consegue o claim roda o
      // runner. Se o runner falhar no meio do caminho, releaseAiPendingClaim
      // repõe ai_pending — senão a conversa fica muda pra sempre (QStash
      // fora do ar, ninguém mais reprocessa essa linha).
      if (!messageId) {
        const {
          maybeRunAgentForCloudConversation,
          claimAiPendingResponse,
          releaseAiPendingClaim,
        } = await import('@/lib/ai/cloud-runner');
        const claimed = await claimAiPendingResponse(conversation.id);
        if (claimed) {
          try {
            const { buildRunnerMediaInput } = await import('@/lib/ai/media/router');
            const { data: freshMsg } = await supabase
              .from('whatsapp_cloud_messages')
              .select('message_type, caption, media_url, media_storage_path, media_mime_type')
              .eq('message_id', message.id)
              .maybeSingle();
            const result = await maybeRunAgentForCloudConversation({
              account,
              conversation,
              contact,
              text: textBody,
              inboundMessageId: message.id,
              messageType,
              phoneNumber,
              inboundMedia: freshMsg ? buildRunnerMediaInput(freshMsg) || undefined : undefined,
            });
            // failure='transient' volta SEM lançar (mesmo sinal que o worker
            // QStash usa em route.ts pra decidir retry) — libera pro cliente
            // não ficar mudo. failure='permanent' (ou sucesso) NÃO libera:
            // vai falhar do mesmo jeito de novo, e reabrir o claim só convida
            // o mesmo trabalho fadado numa reentrega da Meta.
            if (result.failure === 'transient') {
              await releaseAiPendingClaim(conversation.id);
            }
          } catch (runErr) {
            await releaseAiPendingClaim(conversation.id);
            throw runErr;
          }
        }
      }
    }
  } catch (err: any) {
    wlog.error('whatsapp.ai.run_error', {
      error: err?.message,
      conversation_id: conversation?.id,
    });
  }
}

// ============================================================
// PROCESS STATUS UPDATE
// ============================================================

async function processStatus(account: any, status: any) {
  const {
    id: messageId,
    status: newStatus,
    timestamp,
    errors,
    conversation,
    pricing,
    biz_opaque_callback_data: idempotencyKey,
  } = status;

  // Motivo da falha, num valor só — last_error da outbox (fix round 1 do
  // item 10) é uma coluna de texto, sem code/message separados. Mesmo
  // formato "code - message" que este arquivo já usa do lado de fora
  // (message-service.ts) pra unir os dois.
  const errorCode = errors?.[0]?.code?.toString();
  const errorMessage = errors?.[0]?.message || errors?.[0]?.title;
  const errorText =
    errorCode && errorMessage ? `${errorCode} - ${errorMessage}` : errorCode || errorMessage || null;

  // B2: guard contra retrograde. Meta as vezes entrega o webhook de 'sent'
  // depois do 'delivered'; sem o guard a row volta pra 'sent'. failed sempre
  // se aplica porque carrega error_code que precisa ser persistido.
  const { data: currentRow } = await supabase
    .from('whatsapp_cloud_messages')
    .select('status, delivered_at, read_at')
    .eq('message_id', messageId)
    .maybeSingle();

  const currentOrdinal = STATUS_ORDINAL[currentRow?.status ?? ''] ?? 0;
  const newOrdinal = STATUS_ORDINAL[newStatus] ?? 0;

  if (newOrdinal < currentOrdinal && newStatus !== 'failed') {
    wlog.info('whatsapp.status.retrograde_skipped', {
      message_id: messageId,
      from: currentRow?.status,
      to: newStatus,
    });
    return;
  }

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    // statuses[].timestamp (epoch string da Meta) -> delivered_at/read_at.
    // Roda DEPOIS do guard monotonico acima; nunca sobrescreve valor ja gravado.
    ...statusTimestampFields(newStatus, timestamp, {
      currentDeliveredAt: currentRow?.delivered_at,
      currentReadAt: currentRow?.read_at,
    }),
  };

  if (errors && errors.length > 0) {
    updateData.error_code = errorCode;
    updateData.error_message = errorMessage;
  }

  if (conversation) {
    updateData.conversation_id_meta = conversation.id;
    updateData.conversation_category = conversation.origin?.type;
  }

  if (pricing) {
    updateData.pricing_billable = pricing.billable;
    updateData.pricing_category = pricing.category;
    updateData.pricing_model = pricing.pricing_model;
  }

  await supabase
    .from('whatsapp_cloud_messages')
    .update(updateData)
    .eq('message_id', messageId);

  // P0 — campanha: mensagens enviadas via meta-api não existem em
  // whatsapp_cloud_messages (currentRow null). Inbox: currentRow existe →
  // skip (lookup seria sempre miss, economiza 1 RPC por status de TODO o
  // tráfego de inbox). Se campanhas migrarem para o caminho cloud um dia,
  // revisar este gate.
  if (!currentRow) {
    await applyCampaignRecipientWebhookStatus(messageId, newStatus, {
      errorCode,
      errorMessage,
    });
  }

  // item 10 da auditoria: liga o webhook de status à outbox do runtime
  // Python. biz_opaque_callback_data só vem preenchido quando o envio saiu
  // pelo runtime (cloud_api.py grava a idempotency_key nele) — sem a chave
  // não existe linha de outbox pra correlacionar, e nada muda.
  if (idempotencyKey) {
    const outboxStatus = OUTBOX_STATUS_BY_META_STATUS[newStatus];
    if (outboxStatus) {
      const { data: correlated, error: correlateError } = await supabase.rpc('correlate_channel_status', {
        p_idempotency_key: idempotencyKey,
        p_status: outboxStatus,
        p_provider_message_id: messageId,
        // Só grava quando p_status = 'failed' (regra em SQL,
        // internal.correlate_outbox_status) — um sucesso nunca some com o
        // erro anterior. Passar sempre é seguro pelo mesmo motivo.
        p_error: errorText,
      });

      if (correlateError) {
        // Nunca derruba o webhook: a Meta reentrega o mesmo status pra
        // sempre se o processamento falhar.
        wlog.error('whatsapp.webhook.correlate_channel_status_error', {
          idempotency_key: idempotencyKey,
          status: newStatus,
          error: correlateError.message,
        });
      } else if (correlated === false) {
        // false não é erro: nenhuma linha de outbox 'sending'/'unknown' com
        // essa chave — mensagem que não saiu pelo runtime, ou status que já
        // chegou antes (delivered/read repetindo o 'sent' de uma row que já
        // saiu do estado correlacionável).
        wlog.info('whatsapp.webhook.correlate_channel_status_no_match', {
          idempotency_key: idempotencyKey,
          status: newStatus,
        });
      }
    }
  }
}

// ============================================================
// PROCESS TEMPLATE STATUS UPDATE
// ============================================================

async function processTemplateStatusUpdate(value: any) {
  const templateName = value?.message_template_name;
  const templateId = value?.message_template_id;
  const newStatus = value?.event?.toUpperCase();
  const rejectionReason = value?.reason || value?.rejection_reason;

  if (!templateName || !newStatus) {
    wlog.warn('whatsapp.webhook.template_status_missing_fields', {
      has_name: !!templateName,
      has_event: !!newStatus,
    });
    return;
  }

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (rejectionReason) {
    updateData.rejection_reason = rejectionReason;
  }

  if (templateId) {
    updateData.template_id = templateId.toString();
  }

  const { error } = await supabase
    .from('whatsapp_templates')
    .update(updateData)
    .eq('name', templateName);

  if (error) {
    wlog.error('whatsapp.webhook.template_status_update_failed', {
      template_name: templateName,
      error: error.message,
    });
  } else {
    wlog.info('whatsapp.template.status_updated', {
      name: templateName,
      status: newStatus,
    });
  }
}

// ============================================================
// PROCESS TEMPLATE CATEGORY UPDATE
// ============================================================

async function processTemplateCategoryUpdate(value: any) {
  const templateName = value?.message_template_name;
  const templateId = value?.message_template_id;
  const previousCategory = value?.previous_category;
  const newCategory = value?.new_category;

  if (!templateName || !newCategory) {
    wlog.warn('whatsapp.webhook.template_category_missing_fields', {
      has_name: !!templateName,
      has_new_category: !!newCategory,
    });
    return;
  }

  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('category_change_history')
    .eq('name', templateName)
    .maybeSingle();

  const history = Array.isArray(existing?.category_change_history)
    ? existing.category_change_history
    : [];

  history.push({
    from: previousCategory,
    to: newCategory,
    at: new Date().toISOString(),
  });

  const updateData: any = {
    category: newCategory,
    category_change_history: history,
    last_category_change_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (templateId) {
    updateData.template_id = templateId.toString();
  }

  const { error } = await supabase
    .from('whatsapp_templates')
    .update(updateData)
    .eq('name', templateName);

  if (error) {
    wlog.error('whatsapp.webhook.template_category_update_failed', {
      template_name: templateName,
      error: error.message,
    });
  } else {
    wlog.info('whatsapp.template.category_changed', {
      name: templateName,
      from: previousCategory,
      to: newCategory,
    });
  }
}

// ============================================================
// PROCESS PHONE QUALITY UPDATE
// ============================================================

async function processPhoneQualityUpdate(value: any) {
  const displayPhone = value?.display_phone_number;
  const currentLimit = value?.current_limit;
  const event = value?.event;

  if (!displayPhone) {
    wlog.warn('whatsapp.webhook.phone_quality_missing_fields', {});
    return;
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (currentLimit) {
    updateData.messaging_limit = currentLimit;
  }

  if (event) {
    const qualityMap: Record<string, string> = {
      FLAGGED: 'YELLOW',
      RESTRICTED: 'RED',
      UNFLAGGED: 'GREEN',
    };
    if (qualityMap[event]) {
      updateData.quality_rating = qualityMap[event];
    }
  }

  const cleaned = displayPhone.replace(/\D/g, '');
  const { error } = await supabase
    .from('whatsapp_business_accounts')
    .update(updateData)
    .eq('phone_number', cleaned);

  if (error) {
    wlog.error('whatsapp.webhook.phone_quality_update_failed', {
      display_phone: cleaned,
      error: error.message,
    });
  } else {
    wlog.info('whatsapp.phone_quality.updated', {
      event,
      current_limit: currentLimit,
      display_phone: cleaned,
    });
  }
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateContact(account: any, phoneNumber: string, name: string) {
  // Hot path: maioria das webhooks bate em contato existente.
  const { data: existing } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('phone_number', phoneNumber)
    .maybeSingle();

  if (existing) {
    if (name && name !== existing.name && name !== phoneNumber) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name, profile_name: name })
        .eq('id', existing.id);
    }
    return { ...existing, isNew: false };
  }

  // INSERT com fallback de race: se outro processo criou primeiro, o
  // UNIQUE (organization_id, phone_number) dispara 23505, reseleciona.
  const { data: newContact, error: insertErr } = await supabase
    .from('whatsapp_contacts')
    .insert({
      organization_id: account.organization_id,
      phone_number: phoneNumber,
      name,
      profile_name: name,
      source: 'whatsapp_cloud',
    })
    .select()
    .single();

  if (insertErr || !newContact) {
    const { data: refetch } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', account.organization_id)
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (refetch) return { ...refetch, isNew: false };
    throw insertErr ?? new Error('contact_insert_failed');
  }

  let crmContactId: string | undefined;
  const { data: existingCrmContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', account.organization_id)
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .limit(1)
    .maybeSingle();

  if (existingCrmContact) {
    crmContactId = existingCrmContact.id;
  } else {
    const displayName = name !== phoneNumber ? name : 'Contato WhatsApp';
    const { data: newCrmContact } = await supabase
      .from('contacts')
      .insert({
        organization_id: account.organization_id,
        first_name: displayName,
        whatsapp: phoneNumber,
        phone: phoneNumber,
        source: 'whatsapp',
        tags: ['whatsapp'],
      })
      .select('id')
      .single();
    crmContactId = newCrmContact?.id;
  }

  if (crmContactId && newContact) {
    await supabase
      .from('whatsapp_contacts')
      .update({ crm_contact_id: crmContactId })
      .eq('id', newContact.id);
  }

  return { ...newContact, isNew: true, crm_contact_id: crmContactId };
}

async function getOrCreateConversation(account: any, contact: any, phoneNumber: string) {
  const { data: existing } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('*')
    .eq('waba_id', account.id)
    .eq('wa_id', phoneNumber)
    .maybeSingle();

  if (existing) {
    if (contact && existing.contact_id !== contact.id) {
      await supabase
        .from('whatsapp_cloud_conversations')
        .update({ contact_id: contact.id })
        .eq('id', existing.id);
    }
    return { ...existing, isNew: false };
  }

  // INSERT com fallback de race: outro processo pode ter criado em paralelo.
  // UNIQUE idx_wcc_waba_waid impede duplicata — capturamos e reselecionamos.
  const { data: newConv, error: insertErr } = await supabase
    .from('whatsapp_cloud_conversations')
    .insert({
      organization_id: account.organization_id,
      store_id: account.store_id || null,
      waba_id: account.id,
      contact_id: contact?.id,
      wa_id: phoneNumber,
      chat_id: `${account.phone_number}-${phoneNumber}`,
      contact_name: contact?.name || phoneNumber,
      contact_phone: phoneNumber,
      status: 'open',
      ai_enabled: true,
      is_window_open: true,
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (insertErr || !newConv) {
    const { data: refetch } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*')
      .eq('waba_id', account.id)
      .eq('wa_id', phoneNumber)
      .maybeSingle();
    if (refetch) return { ...refetch, isNew: false };
    throw insertErr ?? new Error('conversation_insert_failed');
  }

  return { ...newConv, isNew: true };
}

function buildMessageContent(message: WebhookMessage): any {
  const type = getMessageType(message);
  switch (type) {
    case 'text':
      return { text: message.text };
    case 'image':
      return { image: message.image };
    case 'video':
      return { video: message.video };
    case 'audio':
      return { audio: message.audio };
    case 'document':
      return { document: message.document };
    case 'location':
      return { location: message.location };
    case 'contacts':
      return { contacts: message.contacts };
    case 'sticker':
      return { sticker: message.sticker };
    case 'interactive':
      return { interactive: message.interactive };
    case 'button':
      return { button: message.button };
    case 'reaction':
      return { reaction: message.reaction };
    default:
      return message;
  }
}
