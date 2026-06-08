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
 *     processMessage (engine atual, RAG pré-injetado — NÃO mexido nesta fase).
 *   - Grava 1 linha em agent_traces.
 *   - Transferência => ai_enabled=false e NÃO envia.
 *   - Entrega ao sender (cloud-sender.ts), salvo skipSend.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createAgentEngine } from './engine';
import type { EngineMessage } from './types';
import { sendHumanizedReply } from './cloud-sender';

const COOLDOWN_MS = 5000;

export interface CloudRunnerParams {
  account: any;
  conversation: any;
  contact?: any;
  text: string;
  inboundMessageId?: string;
  messageType?: string;
  phoneNumber?: string;
  skipSend?: boolean;
}

export interface CloudRunnerResult {
  replied: boolean;
  response?: string;
  transferred: boolean;
  traceId?: string;
  agentId?: string;
  skipped?: string;
  error?: string;
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
  // Checa api_keys ANTES do createAgentEngine para evitar o fallback silencioso
  // para process.env.OPENAI_API_KEY quando o provider do agente não é OpenAI.
  const { data: apiKeyRow } = await supabaseAdmin
    .from('api_keys')
    .select('api_key')
    .eq('organization_id', organizationId)
    .eq('provider', agent.provider)
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
    return {
      replied: false,
      transferred: false,
      agentId,
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

  // ToolContext mínimo (objeto local — NÃO passado ao engine nesta fase;
  // guardado para a Fase 2b de tool-calling).
  const _toolContext = {
    organizationId,
    conversationId: conversation.id,
    contactId,
    phone,
    storeId: conversation.store_id || account.store_id || undefined,
    accountId: account.id,
    agentId,
  };
  void _toolContext;

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
    });
  } catch (engineErr: any) {
    // Defesa extra: createAgentEngine pode lançar se a chave sumir entre o
    // SELECT e a criação. Tratar como no_valid_api_key e desabilitar.
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: 'no_valid_api_key',
      })
      .eq('id', conversation.id);
    console.error(
      `[cloud-runner] engine error (tratado como no_valid_api_key): ${engineErr?.message}`,
    );
    return {
      replied: false,
      transferred: false,
      agentId,
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
        tool_calls: null,
        tokens: result.tokens_used,
        latency_ms: result.response_time_ms,
      })
      .select('id')
      .maybeSingle();
    traceId = trace?.id;
  } catch (traceErr: any) {
    console.error('[cloud-runner] falha ao gravar trace:', traceErr?.message);
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
    return { replied: false, transferred: false, traceId, agentId };
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
  });

  return {
    replied: sendResult.sent,
    transferred: false,
    response,
    traceId,
    agentId,
    error: sendResult.sent ? undefined : sendResult.reason || sendResult.error,
  };
}
