/**
 * Guardas puras de segurança do agente de IA — caminho live Cloud.
 *
 * Extraídas como funções puras (zero I/O) para serem testáveis sem mocks de
 * banco. A fiação acontece em cloud-runner.ts (inbound: handoff keywords,
 * activate_on manual, cooldown pós-transferência) e cloud-sender.ts
 * (outbound: blocked_topics sobre a resposta do LLM).
 */

/** Normaliza para matching case/acento-insensitive (NFD remove diacríticos). */
export function normalizeForMatch(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Retorna a keyword de handoff (na forma ORIGINAL configurada) que casa com o
 * texto inbound, ou null. Matching por substring, case/acento-insensitive —
 * paridade com o comportamento do código legado (ai-chatbot-service.ts:62),
 * que só normalizava caixa; aqui normalizamos acentos também (pt-BR).
 */
export function matchHandoffKeyword(
  text: string,
  keywords: readonly string[] | null | undefined,
): string | null {
  if (!keywords || keywords.length === 0) return null;
  const haystack = normalizeForMatch(text);
  if (!haystack) return null;
  for (const kw of keywords) {
    const needle = normalizeForMatch(kw);
    if (needle && haystack.includes(needle)) return kw;
  }
  return null;
}

/**
 * Moderação mínima (YAGNI: sem API externa): retorna o tópico bloqueado
 * presente na RESPOSTA do LLM, ou null. Mesma semântica de matching do
 * handoff — reuso direto (DRY).
 */
export function findBlockedTopic(
  response: string,
  blockedTopics: readonly string[] | null | undefined,
): string | null {
  return matchHandoffKeyword(response, blockedTopics);
}

export interface TransferCooldownParams {
  /** whatsapp_cloud_conversations.ai_transferred_at (ISO) — null se nunca transferiu. */
  transferredAt: string | null | undefined;
  /** behavior.cooldown_after_transfer em SEGUNDOS (default 300; <=0 desliga). */
  cooldownSeconds: number | null | undefined;
  /** Date.now() injetável para teste. */
  now?: number;
}

/** True se ainda estamos dentro do cooldown pós-transferência. */
export function isTransferCooldownActive(params: TransferCooldownParams): boolean {
  const { transferredAt, now = Date.now() } = params;
  if (!transferredAt) return false;
  const seconds = Number(params.cooldownSeconds ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const transferredMs = new Date(transferredAt).getTime();
  if (!Number.isFinite(transferredMs)) return false;
  return now - transferredMs < seconds * 1000;
}
