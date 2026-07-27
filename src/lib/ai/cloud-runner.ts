/**
 * Cloud runner — religa a IA ao webhook Cloud (Fase 2a / P1.5).
 *
 * maybeRunAgentForCloudConversation() é chamado por
 * webhook-processor.ts::processMessage (dentro de try/catch que nunca quebra
 * o webhook) e pelo simulador api/ai/test/cloud-webhook.
 *
 * Responsabilidades:
 *   - Guards (inbound text-only, anti-loop, ai_enabled).
 *   - Resolve agente via RPC get_active_agent_for_conversation (agnóstica).
 *   - Guards de comportamento (cooldown / max_messages / stop_on_human) como
 *     HELPERS TS contra whatsapp_cloud_messages (sent_by_bot=true p/ max,
 *     sender='human' p/ stop). NÃO importa whatsapp-integration.ts (legado).
 *   - BYO-key gracioso: sem api_keys do provider => desabilita a conversa
 *     (ai_disabled_reason='no_valid_api_key') + console.error, sem 500.
 *   - Monta histórico (~20 últimas), cria engine (createAgentEngine), roda
 *     processMessage passando toolContext (Fase 2b): se o agente tem tools
 *     ativas, o engine roda o tool-loop (RAG condicional sob demanda).
 *   - Grava 1 linha em agent_traces (incl. tool_calls quando houver).
 *   - Transferência => ai_enabled=false e NÃO envia.
 *   - Entrega ao sender (cloud-sender.ts), salvo skipSend.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createAgentEngine } from './engine';
import type { EngineMessage } from './types';
import type { ToolContext } from './tools/types';
import { sendHumanizedReply } from './cloud-sender';
import { AiBudgetExceededError } from './budget';
import { classifyAiFailure } from './failure-classifier';
import { sendAlert } from '@/lib/whatsapp/alerts';
import { wlog } from '@/lib/observability/whatsapp-logger';
import {
  routeInboundForAi,
  providerSupportsVision,
  resolveMediaFallback,
  shouldFetchImageBytes,
  appendCurrentTurn,
  type InboundMediaInput,
} from './media/router';
import { resolveSttConfig, transcribeAudio } from './media/transcription';
import { fetchInboundMedia } from './media/fetch-media';
import type { AIMessageImage } from '@/lib/whatsapp/ai-providers';
import { matchHandoffKeyword, isTransferCooldownActive } from './guards';

const COOLDOWN_MS = 5000;

/** Alerta + notificação quando a IA é DESLIGADA por falha permanent.
 *  Padrão campaign_worker_stalled (whatsapp-dead-alert/route.ts:67-90):
 *  sendAlert com dedupKey + insert best-effort em notifications. */
async function notifyAiDisabled(params: {
  organizationId: string;
  conversationId: string;
  reason: string;
  detail?: string;
}): Promise<void> {
  const { organizationId, conversationId, reason, detail } = params;
  await sendAlert({
    severity: 'critical',
    type: 'ai_response_failed',
    title: 'IA do WhatsApp desativada para uma conversa',
    message: `Conversa ${conversationId}: IA desativada (${reason}). ${detail || ''}`.trim(),
    organizationId,
    dedupKey: `ai_response_failed:disabled:${organizationId}:${conversationId}`,
    metadata: { conversation_id: conversationId, reason, detail },
  }).catch(() => {});

  const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
    organization_id: organizationId,
    type: 'whatsapp_ai_disabled',
    title: 'IA do WhatsApp desativada',
    message: `A IA foi desativada em uma conversa (${reason}). Verifique a chave de API / configuração do agente.`,
    metadata: { conversation_id: conversationId, reason, detail },
    action_url: '/whatsapp/inbox',
  });
  if (notifErr) wlog.warn('whatsapp.ai.notify_insert_failed', { error: notifErr.message });
}

interface HandoffKeywordParams {
  account: any;
  conversation: any;
  agent: any;
  agentId: string;
  organizationId: string;
  /** Texto a checar — cru para route='text', effectiveText (pós-transcrição) para audio/image. */
  text: string;
  keywords: readonly string[] | null | undefined;
  confirmationMessage: string | null | undefined;
  inboundMessageId?: string;
  skipSend: boolean;
  skipDelays: boolean;
}

/**
 * Handoff por keyword (settings.safety.handoff_keywords): match case/acento-
 * insensitive contra `text`. Sem match => null (segue o fluxo normal). Com
 * match => desativa a conversa (ai_disabled_reason='handoff_keyword'), marca
 * ai_transferred_at (cooldown), loga e (opcional) confirma via sender
 * humanizado — best-effort, falha no envio não desfaz a transferência.
 *
 * Chamada em DOIS pontos de maybeRunAgentForCloudConversation: (1) sobre o
 * texto CRU, route='text', ANTES do gate de chave BYO — para que um pedido de
 * handoff não dependa de a org ter LLM key válida; (2) sobre o effectiveText
 * pós-transcrição, DEPOIS do gate de chave, para audio/image (trade-off
 * aceito: se a chave estiver quebrada, um handoff falado desativa como
 * no_valid_api_key em vez de handoff_keyword).
 */
async function tryHandoffKeyword(params: HandoffKeywordParams): Promise<CloudRunnerResult | null> {
  const {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    text,
    keywords,
    confirmationMessage,
    inboundMessageId,
    skipSend,
    skipDelays,
  } = params;

  const matchedKeyword = matchHandoffKeyword(text, keywords);
  if (!matchedKeyword) return null;

  const nowIso = new Date().toISOString();
  const { error: disableErr } = await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .update({
      ai_enabled: false,
      ai_disabled_at: nowIso,
      ai_disabled_reason: 'handoff_keyword',
      ai_transferred_at: nowIso,
    })
    .eq('id', conversation.id);
  if (disableErr) {
    wlog.warn('whatsapp.ai.safety_disable_failed', {
      reason: 'handoff_keyword',
      conversationId: conversation.id,
      error: disableErr.message,
    });
  }

  wlog.info('whatsapp.ai.handoff_keyword', {
    organization_id: organizationId,
    conversation_id: conversation.id,
    agent_id: agentId,
    keyword: matchedKeyword,
  });

  const confirmation = String(confirmationMessage || '').trim();
  if (confirmation && !skipSend) {
    // Best-effort: falha no envio da confirmação não desfaz a transferência.
    await sendHumanizedReply({
      account,
      conversation,
      text: confirmation,
      agent: { id: agentId, ...agent },
      inboundMessageId,
      skipDelays,
    });
  }

  return { replied: false, transferred: true, agentId, skipped: 'handoff_keyword' };
}

interface MediaFallbackParams {
  account: any;
  conversation: any;
  agent: any;
  agentId: string;
  organizationId: string;
  reason: string;
  inboundMessageId?: string;
  skipSend: boolean;
  skipDelays: boolean;
}

/**
 * Fallback de segurança quando a mídia não pôde ser interpretada
 * (sem STT, provider sem visão, download/transcrição falhou, mídia grande).
 *   - ask_text (default): responde pedindo texto (via sender humanizado);
 *   - handoff: pausa a IA (ai_enabled=false, reason='media_handoff') e
 *     notifica a equipe — NUNCA silêncio.
 */
async function runMediaFallback(params: MediaFallbackParams): Promise<CloudRunnerResult> {
  const {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    reason,
    inboundMessageId,
    skipSend,
    skipDelays,
  } = params;

  const fallback = resolveMediaFallback(agent.settings);

  wlog.warn('whatsapp.ai.media_fallback', {
    organization_id: organizationId,
    conversation_id: conversation.id,
    agent_id: agentId,
    reason,
    mode: fallback.mode,
  });

  if (fallback.mode === 'handoff') {
    const handoffIso = new Date().toISOString();
    const { error: disableErr } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: handoffIso,
        ai_disabled_reason: 'media_handoff',
        ai_transferred_at: handoffIso,
      })
      .eq('id', conversation.id);
    if (disableErr) {
      wlog.warn('whatsapp.ai.safety_disable_failed', {
        reason: 'media_handoff',
        conversationId: conversation.id,
        error: disableErr.message,
      });
    }

    const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
      organization_id: organizationId,
      type: 'whatsapp_ai_media_handoff',
      title: 'Cliente enviou mídia que a IA não interpretou',
      message: `A IA foi pausada em uma conversa (${reason}). Responda manualmente.`,
      metadata: { conversation_id: conversation.id, reason },
      action_url: '/whatsapp/inbox',
    });
    if (notifErr) wlog.warn('whatsapp.ai.notify_insert_failed', { error: notifErr.message });

    return { replied: false, transferred: true, agentId, skipped: 'media_handoff' };
  }

  if (skipSend) {
    return {
      replied: true,
      transferred: false,
      response: fallback.message,
      agentId,
      skipped: `media_fallback:${reason}`,
    };
  }

  const sendResult = await sendHumanizedReply({
    account,
    conversation,
    text: fallback.message,
    agent: { id: agentId, ...agent },
    inboundMessageId,
    skipDelays,
  });

  // opted_out e skip terminal (mesmo tratamento do caminho principal,
  // linha ~726): retry nunca vai destravar um STOP do contato, entao nao
  // marca failure (worker nao agenda retry para reason terminal).
  if (!sendResult.sent && sendResult.reason === 'opted_out') {
    return {
      replied: false,
      transferred: false,
      response: fallback.message,
      agentId,
      skipped: 'opted_out',
    };
  }

  return {
    replied: sendResult.sent,
    transferred: false,
    response: fallback.message,
    agentId,
    skipped: `media_fallback:${reason}`,
    failure: sendResult.sent ? undefined : 'transient',
    error: sendResult.sent ? undefined : sendResult.reason || sendResult.error,
  };
}

export interface CloudRunnerParams {
  account: any;
  conversation: any;
  contact?: any;
  text: string;
  inboundMessageId?: string;
  messageType?: string;
  phoneNumber?: string;
  skipSend?: boolean;
  /**
   * Pula os delays humanizados (typing/reply_delay/intervalo entre bolhas).
   * Usado pelo simulador para E2E rápido e offline. O split em bolhas e a
   * persistência continuam acontecendo.
   */
  skipDelays?: boolean;
  /**
   * Mídia da última mensagem inbound (áudio/imagem), com ponteiros das colunas
   * media_* de whatsapp_cloud_messages (preenchidas pelo inbound-media-pipeline).
   * Ausente => mensagem de texto puro.
   */
  inboundMedia?: InboundMediaInput;
}

export interface CloudRunnerResult {
  replied: boolean;
  response?: string;
  transferred: boolean;
  traceId?: string;
  agentId?: string;
  skipped?: string;
  error?: string;
  /** Classificação da falha — o worker usa p/ decidir retry vs gave_up. */
  failure?: 'transient' | 'permanent';
}

export async function maybeRunAgentForCloudConversation(
  params: CloudRunnerParams,
): Promise<CloudRunnerResult> {
  const {
    account,
    conversation,
    contact,
    text,
    messageType,
    phoneNumber,
    skipSend = false,
    skipDelays = false,
  } = params;

  const organizationId = account.organization_id;
  const phone = phoneNumber || conversation.contact_phone || conversation.wa_id;

  // ---------- Guards básicos ----------
  // Roteamento por tipo: text/audio/image seguem; document/sticker/location/
  // video/etc continuam fora (skipped non_text, como antes).
  const route = routeInboundForAi(messageType, text);
  if (route === 'unsupported') {
    const isTextish = !messageType || messageType === 'text';
    return {
      replied: false,
      transferred: false,
      skipped: isTextish ? 'empty_text' : 'non_text',
    };
  }
  // Anti-loop: ignorar se o "remetente" é o próprio número da conta.
  if (phone && account.phone_number && phone === account.phone_number) {
    return { replied: false, transferred: false, skipped: 'self_message' };
  }
  if (conversation.ai_enabled === false) {
    return { replied: false, transferred: false, skipped: 'ai_disabled' };
  }

  // ---------- Resolver agente ativo ----------
  // RPC agnóstica: compara p_channel_id contra settings.channels.channel_ids;
  // agente com all_channels=true casa sempre. channel = account.id.
  const { data: agentRows, error: agentErr } = await supabaseAdmin.rpc(
    'get_active_agent_for_conversation',
    {
      p_organization_id: organizationId,
      p_channel_id: account.id,
      p_pipeline_stage_id: null,
    },
  );

  if (agentErr) {
    console.error('[cloud-runner] erro ao resolver agente:', agentErr.message);
    return { replied: false, transferred: false, error: agentErr.message };
  }
  if (!agentRows || agentRows.length === 0) {
    return { replied: false, transferred: false, skipped: 'no_active_agent' };
  }

  const agentId: string = agentRows[0].agent_id;

  // ---------- Buscar agente completo (provider/model/settings) ----------
  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!agent) {
    return { replied: false, transferred: false, skipped: 'agent_not_found' };
  }

  const behavior = agent.settings?.behavior || {};
  const safety = agent.settings?.safety || {};

  // ---------- activate_on: 'manual' NUNCA dispara automaticamente ----------
  // Mecanismo de ativação manual JÁ existe: POST /api/whatsapp/inbox/
  // conversations/[id]/bot com ai_agent_id grava conversation.ai_agent_id.
  // Agente manual só roda quando foi explicitamente atribuído a ESTA conversa.
  if (behavior.activate_on === 'manual' && conversation.ai_agent_id !== agentId) {
    return {
      replied: false,
      transferred: false,
      agentId,
      skipped: 'manual_activation_required',
    };
  }

  // ---------- Cooldown pós-transferência (behavior.cooldown_after_transfer) ----------
  // ai_transferred_at NÃO é limpo na reativação manual da IA — o cooldown
  // configurado (default 300s) vale mesmo se um humano religar a IA cedo.
  // Roda ANTES de qualquer trabalho caro (resolver histórico, transcrição,
  // engine) — silencia cedo, sem custo.
  if (
    isTransferCooldownActive({
      transferredAt: conversation.ai_transferred_at,
      cooldownSeconds: behavior.cooldown_after_transfer,
    })
  ) {
    return { replied: false, transferred: false, agentId, skipped: 'transfer_cooldown' };
  }

  // ---------- Guards de comportamento (helpers TS, tabelas Cloud) ----------
  // Cooldown: último outbound da IA (sent_by_bot=true) < COOLDOWN_MS.
  {
    const { data: lastBot } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select('timestamp')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversation.id)
      .eq('sent_by_bot', true)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastBot?.timestamp) {
      const elapsed = Date.now() - new Date(lastBot.timestamp).getTime();
      if (elapsed < COOLDOWN_MS) {
        return { replied: false, transferred: false, skipped: 'cooldown' };
      }
    }
  }

  // max_messages_per_conversation: nº de outbound da IA já enviados.
  const maxMessages = Number(behavior.max_messages_per_conversation || 0);
  if (maxMessages > 0) {
    const { count } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversation.id)
      .eq('sent_by_bot', true);

    if ((count || 0) >= maxMessages) {
      return { replied: false, transferred: false, skipped: 'max_messages' };
    }
  }

  // stop_on_human_reply: humano já respondeu manualmente nesta conversa.
  if (behavior.stop_on_human_reply !== false) {
    const { data: humanMsg } = await supabaseAdmin
      .from('whatsapp_cloud_messages')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversation.id)
      .eq('sender', 'human')
      .limit(1)
      .maybeSingle();

    if (humanMsg) {
      return { replied: false, transferred: false, skipped: 'stop_on_human' };
    }
  }

  const handoffCtx = {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    keywords: safety.handoff_keywords,
    confirmationMessage: safety.handoff_confirmation_message,
    inboundMessageId: params.inboundMessageId,
    skipSend,
    skipDelays,
  };

  // ---------- Handoff keywords sobre o texto CRU (route === 'text') ----------
  // Para texto puro não há pipeline de mídia: effectiveText === text sempre,
  // então checa aqui, ANTES do gate de chave BYO — um pedido de handoff do
  // cliente não deve depender de a org ter uma chave de LLM válida
  // configurada. Para audio/image o match roda mais abaixo, DEPOIS do gate
  // de chave (ver comentário lá).
  if (route === 'text') {
    const handoffResult = await tryHandoffKeyword({ ...handoffCtx, text });
    if (handoffResult) return handoffResult;
  }

  // ---------- BYO-key gracioso ----------
  // Checa organization_api_keys ANTES do createAgentEngine para evitar o fallback
  // silencioso para process.env.OPENAI_API_KEY quando o provider do agente não
  // é OpenAI. Tabela 'api_keys' (legacy) era pra API keys do Worder; chaves de
  // provider LLM moram em 'organization_api_keys' (gravada pela UI Configurações).
  // Roda ANTES do pipeline de mídia (transcrição/download) — sem isso, audio
  // e imagem gastariam STT/Storage à toa numa conversa que vai ser desabilitada
  // de qualquer forma por falta de chave.
  const { data: apiKeyRow } = await supabaseAdmin
    .from('organization_api_keys')
    .select('api_key, base_url, is_active')
    .eq('organization_id', organizationId)
    .eq('provider', agent.provider)
    .eq('is_active', true)
    .maybeSingle();

  if (!apiKeyRow?.api_key) {
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: 'no_valid_api_key',
      })
      .eq('id', conversation.id);

    console.error(
      `[cloud-runner] no_valid_api_key — provider="${agent.provider}" ` +
        `org=${organizationId} agent=${agentId} conversation=${conversation.id}. ` +
        `IA desabilitada para esta conversa até configurar a chave.`,
    );
    await notifyAiDisabled({
      organizationId,
      conversationId: conversation.id,
      reason: 'no_valid_api_key',
      detail: `provider=${agent.provider} agent=${agentId}`,
    });
    return {
      replied: false,
      transferred: false,
      agentId,
      failure: 'permanent',
      error: 'no_valid_api_key',
    };
  }

  // ---------- Mídia inbound (áudio/imagem) ----------
  // Áudio: transcreve via chave BYO (OpenAI whisper-1 / Groq whisper-large-v3)
  // e PERSISTE o transcript em text_body — assim entra no histórico e retries
  // re-roteiam como 'text' (idempotente). Imagem: baixa do Storage e injeta
  // base64 na mensagem atual (visão). Falhas => media_fallback configurável.
  let effectiveText = text;
  let currentImages: AIMessageImage[] | undefined;
  const media = params.inboundMedia;
  const fallbackCtx: Omit<MediaFallbackParams, 'reason'> = {
    account,
    conversation,
    agent,
    agentId,
    organizationId,
    inboundMessageId: params.inboundMessageId,
    skipSend,
    skipDelays,
  };

  if (route === 'audio') {
    const sttConfig = await resolveSttConfig(organizationId);
    if (!sttConfig) {
      return runMediaFallback({ ...fallbackCtx, reason: 'no_stt_provider' });
    }
    const fetched = media
      ? await fetchInboundMedia({
          storagePath: media.storagePath,
          mediaUrl: media.mediaUrl,
          mimeType: media.mimeType,
        })
      : null;
    if (!fetched) {
      return runMediaFallback({ ...fallbackCtx, reason: 'media_unavailable' });
    }

    let transcript = '';
    try {
      transcript = await transcribeAudio({
        config: sttConfig,
        audio: fetched.buffer,
        mimeType: fetched.mimeType,
      });
    } catch (sttErr: any) {
      wlog.warn('whatsapp.ai.transcription_failed', {
        organization_id: organizationId,
        conversation_id: conversation.id,
        error: sttErr?.message,
      });
    }
    if (!transcript) {
      return runMediaFallback({ ...fallbackCtx, reason: 'transcription_failed' });
    }

    effectiveText = transcript;
    if (params.inboundMessageId) {
      await supabaseAdmin
        .from('whatsapp_cloud_messages')
        .update({ text_body: transcript })
        .eq('organization_id', organizationId)
        .eq('message_id', params.inboundMessageId);
    }
  } else if (route === 'image') {
    const caption = (media?.caption || text || '').trim();
    const fetched = shouldFetchImageBytes(agent.provider, media)
      ? await fetchInboundMedia({
          storagePath: media!.storagePath,
          mediaUrl: media!.mediaUrl,
          mimeType: media!.mimeType,
        })
      : null;

    if (fetched) {
      currentImages = [{ mimeType: fetched.mimeType, base64: fetched.buffer.toString('base64') }];
      effectiveText = caption || 'O cliente enviou esta imagem.';
    } else if (caption) {
      // Sem visão/sem bytes mas com caption: degrada para texto (melhor que fallback).
      effectiveText = caption;
    } else {
      return runMediaFallback({
        ...fallbackCtx,
        reason: providerSupportsVision(agent.provider)
          ? 'media_unavailable'
          : 'provider_without_vision',
      });
    }
  }

  // ---------- Handoff keywords sobre o texto EFETIVO (audio/image) ----------
  // route='text' já foi checado acima (texto cru === effectiveText); aqui só
  // roda para audio/image, sobre o texto pós-transcrição/caption — DEPOIS do
  // gate de chave BYO (trade-off aceito: chave quebrada + handoff falado =>
  // desativa como no_valid_api_key, não handoff_keyword).
  if (route !== 'text') {
    const handoffResult = await tryHandoffKeyword({ ...handoffCtx, text: effectiveText });
    if (handoffResult) return handoffResult;
  }

  // ---------- Histórico (~20 últimas) ----------
  const { data: historyRows } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('direction, text_body, timestamp, message_type, caption')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(20);

  const ordered = (historyRows || []).slice().reverse();
  const conversationHistory: EngineMessage[] = [];
  for (const m of ordered) {
    const role = m.direction === 'inbound' ? ('user' as const) : ('assistant' as const);
    const body = (m.text_body || '').trim();
    if (body) {
      conversationHistory.push({
        role,
        content: body,
        timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      });
      continue;
    }
    // Mídia inbound sem texto: placeholder para o modelo saber o que houve
    // (a imagem REAL só é anexada na mensagem atual, nunca no histórico —
    // custo/latência).
    if (role === 'user' && m.message_type === 'image') {
      conversationHistory.push({
        role: 'user',
        content: m.caption
          ? `[Cliente enviou uma imagem: ${m.caption}]`
          : '[Cliente enviou uma imagem]',
      });
    } else if (role === 'user' && m.message_type === 'audio') {
      conversationHistory.push({ role: 'user', content: '[Cliente enviou um áudio sem transcrição]' });
    }
  }

  // Garantir que a mensagem atual está no fim como 'user' (com as imagens,
  // quando visão) sem duplicar o placeholder da PRÓPRIA imagem/áudio atual
  // (appendCurrentTurn — pura, testada em media/__tests__/router.test.ts).
  const finalHistory = appendCurrentTurn(conversationHistory, {
    route,
    effectiveText,
    images: currentImages,
  });

  const contactId: string | undefined = contact?.crm_contact_id || contact?.id;

  // ToolContext multi-tenant (Fase 2b) — repassado ao engine para o tool-loop.
  const toolContext: ToolContext = {
    organizationId,
    conversationId: conversation.id,
    contactId,
    phone,
    storeId: conversation.store_id || account.store_id || undefined,
    accountId: account.id,
    agentId,
  };

  // ---------- Criar engine + rodar ----------
  let result;
  try {
    const engine = await createAgentEngine(agentId, organizationId);
    result = await engine.processMessage({
      conversationId: conversation.id,
      conversationHistory: finalHistory,
      contactInfo: {
        id: contactId,
        name: contact?.name || contact?.contact_name,
        phone,
      },
      toolContext,
    });
  } catch (engineErr: any) {
    // Budget excedido: silenciar + marcar conversa para revisão humana.
    // NÃO é falha permanente — budget pode renovar no próximo mês.
    if (engineErr instanceof AiBudgetExceededError) {
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({
          ai_enabled: false,
          ai_disabled_at: new Date().toISOString(),
          ai_disabled_reason: 'budget_exceeded',
        })
        .eq('id', conversation.id);
      console.warn(
        `[cloud-runner] budget_exceeded — org=${organizationId} agent=${agentId} ` +
          `conversation=${conversation.id}. IA desabilitada até renovacao do orcamento.`,
      );
      return {
        replied: false,
        transferred: false,
        agentId,
        skipped: 'budget_exceeded',
      };
    }

    const failureClass = classifyAiFailure(engineErr);

    if (failureClass === 'skip') {
      // Gates intencionais (agente inativo / fora do horário) — não é falha.
      return { replied: false, transferred: false, agentId, skipped: 'agent_unavailable' };
    }

    if (failureClass === 'transient') {
      // NÃO desabilita. O worker agenda retry com backoff.
      wlog.warn('whatsapp.ai.transient_error', {
        organization_id: organizationId,
        conversation_id: conversation.id,
        agent_id: agentId,
        error: engineErr?.message,
      });
      return {
        replied: false,
        transferred: false,
        agentId,
        failure: 'transient',
        error: engineErr?.message || 'engine_error',
      };
    }

    // permanent: desabilita com motivo correto + visibilidade.
    const reason = /api[ _-]?key/i.test(engineErr?.message || '')
      ? 'no_valid_api_key'
      : 'ai_permanent_error';
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: reason,
      })
      .eq('id', conversation.id);
    await notifyAiDisabled({
      organizationId,
      conversationId: conversation.id,
      reason,
      detail: engineErr?.message,
    });
    return {
      replied: false,
      transferred: false,
      agentId,
      failure: 'permanent',
      error: engineErr?.message || 'engine_error',
    };
  }

  // ---------- Trace mínimo ----------
  let traceId: string | undefined;
  try {
    const { data: trace } = await supabaseAdmin
      .from('agent_traces')
      .insert({
        organization_id: organizationId,
        conversation_id: conversation.id,
        agent_id: agentId,
        provider: agent.provider,
        model: agent.model,
        input: effectiveText,
        output: result.response,
        tool_calls:
          result.tool_calls && result.tool_calls.length > 0
            ? { calls: result.tool_calls, stopped_by: result.stopped_by }
            : null,
        tokens: result.tokens_used,
        latency_ms: result.response_time_ms,
      })
      .select('id')
      .maybeSingle();
    traceId = trace?.id;
  } catch (traceErr: any) {
    console.error('[cloud-runner] falha ao gravar trace:', traceErr?.message);
  }

  // ---------- 429 no tool-loop ----------
  // rate_limited: loop.ts:139-146 aborta gracioso com stopped_by='rate_limited'
  // e texto vazio — hoje cairia no `if (!response)` silencioso.
  if (result.stopped_by === 'rate_limited' && !(result.response || '').trim()) {
    wlog.warn('whatsapp.ai.transient_error', {
      organization_id: organizationId,
      conversation_id: conversation.id,
      agent_id: agentId,
      error: 'rate_limited',
    });
    return {
      replied: false,
      transferred: false,
      traceId,
      agentId,
      failure: 'transient',
      error: 'rate_limited',
    };
  }

  // ---------- Transferência ----------
  if (result.was_transferred) {
    const transferIso = new Date().toISOString();
    const { error: disableErr } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: transferIso,
        ai_disabled_reason: 'transferred_to_human',
        ai_transferred_at: transferIso,
      })
      .eq('id', conversation.id);
    if (disableErr) {
      wlog.warn('whatsapp.ai.safety_disable_failed', {
        reason: 'transferred_to_human',
        conversationId: conversation.id,
        error: disableErr.message,
      });
    }

    console.log(
      `[cloud-runner] transferência para humano — conversation=${conversation.id}`,
    );
    return {
      replied: false,
      transferred: true,
      response: result.response,
      traceId,
      agentId,
    };
  }

  // ---------- Envio ----------
  const response = (result.response || '').trim();
  if (!response) {
    // Resposta vazia NUNCA é ok silencioso (Onda 13): modelos com reasoning
    // estouram max_tokens pensando e devolvem '' — antes isso virava bot mudo
    // sem retry nem alerta. transient => worker re-tenta com backoff e, se
    // persistir, dispara o alerta gave_up (visível no sino/Slack).
    wlog.warn('whatsapp.ai.empty_response', {
      organization_id: organizationId,
      conversation_id: conversation.id,
      agent_id: agentId,
      model: agent.model,
      stopped_by: result.stopped_by,
    });
    return {
      replied: false,
      transferred: false,
      traceId,
      agentId,
      failure: 'transient',
      error: 'empty_llm_response',
    };
  }

  if (skipSend) {
    return { replied: true, transferred: false, response, traceId, agentId };
  }

  const sendResult = await sendHumanizedReply({
    account,
    conversation,
    text: response,
    agent: { id: agentId, ...agent },
    inboundMessageId: params.inboundMessageId,
    skipDelays,
  });

  // opted_out e skip terminal (Onda 13 / B2): retry nunca vai destravar um
  // STOP do contato, entao nao marca failure (worker nao agenda retry).
  if (!sendResult.sent && sendResult.reason === 'opted_out') {
    return {
      replied: false,
      transferred: false,
      response,
      traceId,
      agentId,
      skipped: 'opted_out',
    };
  }

  // blocked_topic (moderação, Task 4): o sender já desabilitou a conversa e
  // marcou a transferência — retry nunca vai destravar, então é terminal
  // (sem failure) e reportamos transferred=true pro chamador/simulador.
  if (!sendResult.sent && sendResult.reason === 'blocked_topic') {
    return {
      replied: false,
      transferred: true,
      response,
      traceId,
      agentId,
      skipped: 'blocked_topic',
    };
  }

  return {
    replied: sendResult.sent,
    transferred: false,
    response,
    traceId,
    agentId,
    failure: sendResult.sent ? undefined : 'transient',
    error: sendResult.sent ? undefined : sendResult.reason || sendResult.error,
  };
}
