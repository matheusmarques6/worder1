/**
 * Cloud sender — entrega HUMANIZADA (Fase 2d / P4).
 *
 * Evolução do envio simples (2a) mantendo compatibilidade com o simulador:
 *  - Checagem de janela de 24h (fechada => NÃO envia, loga e aborta).
 *  - Typing indicator (cloud-api.sendTyping) antes da 1ª bolha e entre bolhas.
 *      Limitação Meta: typing só dispara junto de "mark as read" sobre o
 *      ÚLTIMO inbound message_id; sem inboundMessageId o typing é pulado.
 *  - reply_delay configurável do agente (agent.persona.reply_delay, em segundos)
 *      ANTES da 1ª bolha, com CAP de tempo seguro (ver TIME BUDGET).
 *  - Split em bolhas: por \n\n e por tamanho (~600 chars), no máx 4 bolhas;
 *      envio sequencial com pequeno intervalo + typing entre elas.
 *  - Persiste CADA bolha em whatsapp_cloud_messages (sent_by_bot=true,
 *      sender='ai', ai_agent_id) e atualiza last_message_* só no FIM.
 *
 * ============================ TIME BUDGET (Riscos do plano) ============================
 * O worker /api/workers/whatsapp-ai-respond roda na Vercel com maxDuration=60s.
 * O tool-loop do engine já consome parte desse orçamento ANTES de chamar o sender.
 * Para nunca estourar o maxDuration, os delays AQUI são limitados (CAP) a um teto
 * agregado seguro (MAX_HUMANIZE_BUDGET_MS). Se a soma reply_delay + typings +
 * intervalos exceder o teto, os delays são reduzidos proporcionalmente.
 * Delays grandes (ex.: reply_delay de minutos configurado pelo cliente) NÃO devem
 * rodar como sleep aqui — recomendação no relatório: mover o run p/ Railway
 * (sem maxDuration) no futuro, e/ou reagendar delays grandes via QStash.
 * =====================================================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';

// ---- Caps de split ----
const MAX_BUBBLES = 4;
const MAX_BUBBLE_CHARS = 600;

// ---- Caps de tempo (orçamento p/ caber no maxDuration do worker) ----
// Teto agregado de TODOS os delays humanizados deste envio.
const MAX_HUMANIZE_BUDGET_MS = 8_000; // 8s — folga sob 60s, deixando ~52s p/ o tool-loop
const DEFAULT_REPLY_DELAY_MS = 1_500; // quando o agente não define reply_delay
const MAX_REPLY_DELAY_MS = 8_000; // cap do reply_delay configurável
const INTER_BUBBLE_MS = 1_200; // intervalo + typing entre bolhas

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export interface SendHumanizedReplyParams {
  account: any;
  conversation: any;
  text: string;
  agent: { id: string; [key: string]: any };
  inboundMessageId?: string;
  /** simulador/testes: pula os delays (typing/reply_delay/intervalo). */
  skipDelays?: boolean;
}

export interface SendHumanizedReplyResult {
  sent: boolean;
  messageId?: string; // id da 1ª bolha
  messageIds?: string[];
  bubbles?: number;
  reason?: string;
  error?: string;
}

/**
 * Divide o texto em bolhas: primeiro por parágrafos (\n\n), depois quebra
 * parágrafos longos por tamanho (preferindo limites de sentença/espaço).
 * Limita a MAX_BUBBLES (o excedente é concatenado na última bolha).
 */
export function splitIntoBubbles(text: string): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= MAX_BUBBLE_CHARS) {
      chunks.push(para);
      continue;
    }
    // Quebra parágrafo longo em pedaços <= MAX_BUBBLE_CHARS, em fronteira de
    // espaço quando possível.
    let rest = para;
    while (rest.length > MAX_BUBBLE_CHARS) {
      let cut = rest.lastIndexOf(' ', MAX_BUBBLE_CHARS);
      if (cut < MAX_BUBBLE_CHARS * 0.5) cut = MAX_BUBBLE_CHARS; // sem espaço útil
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  }

  if (chunks.length <= MAX_BUBBLES) return chunks;

  // Excedente: junta tudo a partir da 4ª na última bolha.
  const head = chunks.slice(0, MAX_BUBBLES - 1);
  const tail = chunks.slice(MAX_BUBBLES - 1).join('\n\n');
  return [...head, tail];
}

/** Resolve o reply_delay do agente (segundos) -> ms, com cap. */
function resolveReplyDelayMs(agent: any): number {
  const fromPersona = agent?.persona?.reply_delay;
  const fromBehavior = agent?.settings?.behavior?.reply_delay;
  const raw = fromPersona ?? fromBehavior;
  if (raw === undefined || raw === null) return DEFAULT_REPLY_DELAY_MS;
  const ms = Number(raw) * 1000;
  if (!Number.isFinite(ms) || ms < 0) return DEFAULT_REPLY_DELAY_MS;
  return Math.min(ms, MAX_REPLY_DELAY_MS);
}

export async function sendHumanizedReply(
  params: SendHumanizedReplyParams,
): Promise<SendHumanizedReplyResult> {
  const { account, conversation, text, agent, inboundMessageId, skipDelays } = params;

  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { sent: false, reason: 'empty_text' };
  }

  // --- Janela de 24h (checagem proativa) ---
  const windowExpired =
    conversation.is_window_open === false ||
    (conversation.window_expires_at &&
      new Date(conversation.window_expires_at).getTime() < Date.now());

  if (windowExpired) {
    console.warn(
      `[cloud-sender] janela 24h fechada — resposta NÃO enviada. conversation_id=${conversation.id}`,
    );
    return { sent: false, reason: 'window_closed' };
  }

  const phone = conversation.contact_phone || conversation.wa_id;
  if (!phone) {
    console.error(
      `[cloud-sender] sem telefone na conversa. conversation_id=${conversation.id}`,
    );
    return { sent: false, reason: 'no_phone' };
  }

  const bubbles = splitIntoBubbles(trimmed);
  if (bubbles.length === 0) {
    return { sent: false, reason: 'empty_text' };
  }

  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account),
  });

  // ---------- Orçamento de tempo (CAP) ----------
  // Soma teórica: reply_delay + (bolhas-1) * intervalo. Se exceder o teto,
  // escala todos proporcionalmente.
  let replyDelayMs = skipDelays ? 0 : resolveReplyDelayMs(agent);
  let interBubbleMs = skipDelays ? 0 : INTER_BUBBLE_MS;

  if (!skipDelays) {
    const totalWanted = replyDelayMs + Math.max(0, bubbles.length - 1) * interBubbleMs;
    if (totalWanted > MAX_HUMANIZE_BUDGET_MS && totalWanted > 0) {
      const scale = MAX_HUMANIZE_BUDGET_MS / totalWanted;
      replyDelayMs = Math.floor(replyDelayMs * scale);
      interBubbleMs = Math.floor(interBubbleMs * scale);
      console.warn(
        `[cloud-sender] delays humanizados excederam o teto (${totalWanted}ms > ${MAX_HUMANIZE_BUDGET_MS}ms) — escalados por ${scale.toFixed(2)}. conversation_id=${conversation.id}`,
      );
    }
  }

  // ---------- Typing + reply_delay antes da 1ª bolha ----------
  if (!skipDelays && inboundMessageId) {
    try {
      await client.sendTyping(inboundMessageId);
    } catch (e: any) {
      // typing é best-effort; nunca bloqueia o envio.
      console.warn('[cloud-sender] sendTyping falhou (ignorado):', e?.message || e);
    }
  }
  if (replyDelayMs > 0) await sleep(replyDelayMs);

  const nowBase = Date.now();
  const messageIds: string[] = [];

  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i];

    // typing + intervalo entre bolhas (não antes da 1ª — já feito acima).
    if (i > 0 && !skipDelays) {
      if (inboundMessageId) {
        try {
          await client.sendTyping(inboundMessageId);
        } catch {
          /* best-effort */
        }
      }
      if (interBubbleMs > 0) await sleep(interBubbleMs);
    }

    let result;
    try {
      result = await client.sendText(phone, bubble);
    } catch (apiError: any) {
      console.error(
        `[cloud-sender] Cloud API error na bolha ${i + 1}/${bubbles.length}:`,
        apiError?.message || apiError,
      );
      // Se a 1ª bolha falhou, nada foi enviado.
      if (i === 0) {
        return { sent: false, error: apiError?.message || 'send_failed' };
      }
      // Bolhas seguintes: aborta o resto mas o que já foi enviado vale.
      break;
    }

    const messageId = result.messages?.[0]?.id;
    if (messageId) messageIds.push(messageId);

    // Persistência da bolha (espelha messages/route.ts:139-155).
    // timestamp incremental p/ preservar a ordem das bolhas.
    const bubbleIso = new Date(nowBase + i).toISOString();
    await supabaseAdmin.from('whatsapp_cloud_messages').upsert(
      {
        organization_id: conversation.organization_id,
        store_id: conversation.store_id || account.store_id || null,
        waba_id: account.id,
        conversation_id: conversation.id,
        message_id: messageId,
        direction: 'outbound',
        from_number: account.phone_number,
        to_number: phone,
        message_type: 'text',
        content: { text: { body: bubble } },
        text_body: bubble,
        status: 'sent',
        sent_by_bot: true,
        sender: 'ai',
        ai_agent_id: agent.id,
        timestamp: bubbleIso,
      },
      { onConflict: 'message_id' },
    );
  }

  if (messageIds.length === 0) {
    return { sent: false, error: 'send_failed' };
  }

  // ---------- Atualiza last_message_* só no FIM ----------
  const lastBubble = bubbles[Math.min(messageIds.length, bubbles.length) - 1] || trimmed;
  await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: lastBubble.substring(0, 100),
      last_message_direction: 'outbound',
    })
    .eq('id', conversation.id);

  return {
    sent: true,
    messageId: messageIds[0],
    messageIds,
    bubbles: messageIds.length,
  };
}
