// =============================================================
// Campanha no fuso do destinatário
//
// O lojista escolhe "10/09 às 09:00". No modo 'fixed' isso é UM
// instante e todo mundo recebe junto — quem está em Sydney recebe às
// 22:00. No modo 'recipient' o que vale é o RELÓGIO DE PAREDE: cada
// contato recebe às 09:00 do fuso dele, e a campanha escorre pelo
// globo. É o "Send in recipient's time zone" da Omnisend.
//
// A data e a hora de parede saem do próprio scheduled_at lido no fuso
// de quem agendou (loja/organização) — ou seja, do que o lojista viu
// na tela quando escolheu.
//
// Quem já passou daquele horário local quando a campanha começa
// recebe imediatamente, em vez de esperar 24h. Isso mantém a promessa
// "no dia 10" para todo mundo, que é o comportamento da Omnisend.
// =============================================================

import { partsInTz, zonedTimeToUtc, resolveRecipientTimezone, DEFAULT_TZ } from './timezone';

export interface PlanContact {
  id: string;
  timezone?: string | null;
  country?: string | null;
  [k: string]: any;
}

export interface TimezoneBucket<T> {
  timezone: string;
  /** Instante em que este grupo deve sair. */
  sendAt: Date;
  /** ms a partir de `now` — 0 quando o horário local já passou. */
  delayMs: number;
  contacts: T[];
}

export interface RecipientPlanOptions {
  /** Quando o lojista marcou o envio. */
  scheduledAt: Date;
  /** Fuso de quem agendou — define QUAL horário de parede foi escolhido. */
  authorTimezone?: string | null;
  /** Fuso de quem não tem nenhum: normalmente o da loja. */
  fallbackTimezone?: string | null;
  now?: Date;
  /**
   * Teto de espera. A Terra tem 26 horas de fusos ponta a ponta; sem
   * teto uma campanha ficaria "enviando" por mais de um dia. O padrão
   * cobre o globo inteiro com folga de uma hora.
   */
  maxDelayMs?: number;
}

const HORAS_26 = 26 * 3600_000;

/**
 * Agrupa os contatos por fuso e calcula quando cada grupo sai.
 *
 * Agrupar importa: uma campanha de 20 mil contatos tem dezenas de
 * fusos, não 20 mil horários. Cada grupo vira um punhado de lotes na
 * fila, e não um job por pessoa.
 */
export function planRecipientTimezoneSend<T extends PlanContact>(
  contacts: T[],
  opts: RecipientPlanOptions
): TimezoneBucket<T>[] {
  const now = opts.now || new Date();
  const maxDelay = opts.maxDelayMs ?? HORAS_26;
  const autor = opts.authorTimezone || opts.fallbackTimezone || DEFAULT_TZ;

  // O horário de parede que o lojista escolheu, lido no fuso dele.
  const parede = partsInTz(autor, opts.scheduledAt);

  const porFuso = new Map<string, T[]>();
  for (const c of contacts) {
    const { timezone } = resolveRecipientTimezone({
      contactTimezone: c.timezone,
      contactCountry: c.country,
      storeTimezone: opts.fallbackTimezone,
      orgTimezone: opts.authorTimezone,
    });
    const lista = porFuso.get(timezone);
    if (lista) lista.push(c);
    else porFuso.set(timezone, [c]);
  }

  const buckets: TimezoneBucket<T>[] = [];
  for (const [timezone, lista] of porFuso) {
    const alvo = zonedTimeToUtc(timezone, {
      year: parede.year, month: parede.month, day: parede.day,
      hour: parede.hour, minute: parede.minute,
    });
    // Quem já passou do horário local sai agora — segurar até amanhã
    // quebraria a data que o lojista prometeu.
    const bruto = alvo.getTime() - now.getTime();
    const delayMs = Math.min(Math.max(bruto, 0), maxDelay);
    buckets.push({ timezone, sendAt: new Date(now.getTime() + delayMs), delayMs, contacts: lista });
  }

  // Mais cedo primeiro: se algo estourar no meio do caminho, quem
  // deveria receber antes já recebeu.
  buckets.sort((a, b) => a.delayMs - b.delayMs);
  return buckets;
}

/**
 * Quanto ANTES de scheduled_at o cron precisa acordar a campanha.
 *
 * O fuso mais a leste (UTC+14) chega às 09:00 locais 17 horas antes de
 * um lojista em São Paulo (UTC-3). Se o cron só olhasse
 * `scheduled_at <= now`, esses contatos já teriam perdido a hora e
 * receberiam todos de uma vez, atrasados.
 */
export function recipientModeLeadTimeMs(): number {
  return 18 * 3600_000;
}

/**
 * Resumo para a tela de agendamento: quantos fusos, quando sai o
 * primeiro e o último, e quantos contatos estão sem fuso conhecido
 * (esses caem no fuso da loja).
 */
export function summarizePlan<T extends PlanContact>(
  buckets: TimezoneBucket<T>[]
): { timezones: number; totalContacts: number; firstSendAt: Date | null; lastSendAt: Date | null } {
  if (buckets.length === 0) {
    return { timezones: 0, totalContacts: 0, firstSendAt: null, lastSendAt: null };
  }
  let total = 0;
  let primeiro = buckets[0].sendAt;
  let ultimo = buckets[0].sendAt;
  for (const b of buckets) {
    total += b.contacts.length;
    if (b.sendAt < primeiro) primeiro = b.sendAt;
    if (b.sendAt > ultimo) ultimo = b.sendAt;
  }
  return { timezones: buckets.length, totalContacts: total, firstSendAt: primeiro, lastSendAt: ultimo };
}
