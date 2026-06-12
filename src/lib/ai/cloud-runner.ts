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
  if (!text || !text.trim()) {
    return { replied: false, transferred: false, skipped: 'empty_text' };
  }
  if (messageType && messageType !== 'text') {
    return { replied: false, transferred: false, skipped: 'non_text' };
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

  // ---------- BYO-key gracioso ----------
  // Checa organization_api_keys ANTES do createAgentEngine para evitar o fallback
  // silencioso para process.env.OPENAI_API_KEY quando o provider do agente não
  // é OpenAI. Tabela 'api_keys' (legacy) era pra API keys do Worder; chaves de
  // provider LLM moram em 'organization_api_keys' (gravada pela UI Configurações).
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

  // ---------- Histórico (~20 últimas) ----------
  const { data: historyRows } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('direction, text_body, timestamp')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .order('timestamp', { ascending: false })
    .limit(20);

  const ordered = (historyRows || []).slice().reverse();
  const conversationHistory: EngineMessage[] = ordered
    .filter((m) => (m.text_body || '').trim().length > 0)
    .map((m) => ({
      role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.text_body as string,
      timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
    }));

  // Garantir que a mensagem atual está no fim como 'user'.
  const last = conversationHistory[conversationHistory.length - 1];
  if (!last || last.role !== 'user' || last.content !== text) {
    conversationHistory.push({ role: 'user', content: text });
  }

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
      conversationHistory,
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
        input: text,
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
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: 'transferred_to_human',
      })
      .eq('id', conversation.id);

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
