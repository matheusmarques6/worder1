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
    if (typeof kw !== 'string') continue;
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
  cooldownSeconds: number | boolean | null | undefined;
  /** Date.now() injetável para teste. */
  now?: number;
}

/** True se ainda estamos dentro do cooldown pós-transferência. */
export function isTransferCooldownActive(params: TransferCooldownParams): boolean {
  const { transferredAt, now = Date.now() } = params;
  if (!transferredAt) return false;
  if (typeof params.cooldownSeconds === 'boolean') return false;
  const seconds = Number(params.cooldownSeconds ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const transferredMs = new Date(transferredAt).getTime();
  if (!Number.isFinite(transferredMs)) return false;
  return now - transferredMs < seconds * 1000;
}

/**
 * Estamos dentro do horário de atendimento configurado
 * (`ai_agents.settings.schedule`)?
 *
 * Porte 1:1 de `engine.ts:checkSchedule` — extraído para cá para ser
 * reusado pela cadeia de guards do badge (conversation-ai-status.ts) sem
 * duplicar a lógica (o mesmo motivo pelo qual `isTransferCooldownActive`
 * mora aqui). `engine.ts` chama esta função com o mesmo resultado de
 * sempre — zero mudança de comportamento no caminho live. Espelho de
 * `runtime/src/agents_runtime/agent_core/guards.py:is_within_schedule`
 * (auditoria item 30).
 */
export function isWithinSchedule(
  schedule:
    | { always_active?: boolean; timezone?: string; hours?: { start?: string; end?: string }; days?: string[] }
    | null
    | undefined,
  now: Date = new Date(),
): boolean {
  if (!schedule || schedule.always_active) {
    return true;
  }

  const tz = schedule.timezone || 'America/Sao_Paulo';

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const timeString = formatter.format(now);
  const [hours, minutes] = timeString.split(':').map(Number);
  const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  const hoursConfig = schedule.hours as unknown;
  const { start, end } = hoursConfig === undefined
    ? { start: '08:00', end: '18:00' }
    : hoursConfig && typeof hoursConfig === 'object' && !Array.isArray(hoursConfig)
      ? hoursConfig as { start?: unknown; end?: unknown }
      : { start: undefined, end: undefined };
  if (!isCanonicalTime(start) || !isCanonicalTime(end)) return false;
  const inTimeRange = currentTime >= start && currentTime <= end;

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now).toLowerCase();
  const dayMap: Record<string, string> = {
    sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat',
  };
  const today = dayMap[dayName];

  const days = schedule.days === undefined ? ['mon', 'tue', 'wed', 'thu', 'fri'] : schedule.days;
  if (!Array.isArray(days) || !days.every((day) => typeof day === 'string' && day in dayMap)) {
    return false;
  }
  const inDayRange = days.includes(today);

  return inTimeRange && inDayRange;
}

function isCanonicalTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Only the agent writers reject the legacy boolean; guards keep it harmless. */
export function hasBooleanTransferCooldown(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const behavior = (settings as { behavior?: unknown }).behavior;
  return !!behavior
    && typeof behavior === 'object'
    && typeof (behavior as { cooldown_after_transfer?: unknown }).cooldown_after_transfer === 'boolean';
}
