// =============================================================
// Resolver o fuso de um destinatário quando o dado não está todo na
// mão — o executor de delay tem o contato do contexto, mas o fuso da
// loja e o da organização moram no banco.
//
// As duas consultas de fallback são cacheadas por 5 minutos: loja e
// organização não mudam de fuso durante um drain de fila, e sem cache
// cada e-mail de uma campanha de 20 mil contatos abriria duas
// consultas só para descobrir a mesma coisa.
// =============================================================

import {
  resolveRecipientTimezone,
  type ResolvedTimezone,
  type TimezoneSources,
} from './timezone';

const CACHE_TTL_MS = 5 * 60_000;
const storeCache = new Map<string, { tz: string | null; ts: number }>();
const orgCache = new Map<string, { tz: string | null; ts: number }>();

/** Só para os testes: zera o cache entre casos. */
export function __clearTimezoneCache() {
  storeCache.clear();
  orgCache.clear();
}

async function storeTimezone(supabase: any, storeId: string | null | undefined): Promise<string | null> {
  if (!storeId || !supabase) return null;
  const hit = storeCache.get(storeId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.tz;
  try {
    const { data } = await supabase
      .from('shopify_stores')
      .select('timezone')
      .eq('id', storeId)
      .maybeSingle();
    const tz = (data as any)?.timezone || null;
    storeCache.set(storeId, { tz, ts: Date.now() });
    return tz;
  } catch {
    return null;
  }
}

async function orgTimezone(supabase: any, organizationId: string | null | undefined): Promise<string | null> {
  if (!organizationId || !supabase) return null;
  const hit = orgCache.get(organizationId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.tz;
  try {
    const { data } = await supabase
      .from('organizations')
      .select('quiet_hours_timezone')
      .eq('id', organizationId)
      .maybeSingle();
    const tz = (data as any)?.quiet_hours_timezone || null;
    orgCache.set(organizationId, { tz, ts: Date.now() });
    return tz;
  } catch {
    return null;
  }
}

/**
 * Lê o fuso do contato direto do objeto de contexto — que vem em
 * camelCase (o que os crons montam) ou snake_case (linha crua do
 * banco), a mesma dualidade que já apagava {{first_name}}.
 */
export function timezoneSourcesFromContact(contact: any): Pick<TimezoneSources, 'contactTimezone' | 'contactCountry'> {
  return {
    contactTimezone: contact?.timezone ?? contact?.timeZone ?? null,
    contactCountry: contact?.country ?? null,
  };
}

/**
 * Fuso do destinatário para um passo de automação. Consulta o banco só
 * quando o contato não basta.
 */
export async function resolveTimezoneForRun(
  supabase: any,
  args: { contact?: any; storeId?: string | null; organizationId?: string | null }
): Promise<ResolvedTimezone> {
  const doContato = timezoneSourcesFromContact(args.contact);

  // Curto-circuito: com o fuso ou o país do contato em mãos a cascata
  // já decide, e nenhuma consulta precisa acontecer.
  const semBanco = resolveRecipientTimezone(doContato);
  if (semBanco.source === 'contact' || semBanco.source === 'country') return semBanco;

  const [loja, org] = await Promise.all([
    storeTimezone(supabase, args.storeId),
    orgTimezone(supabase, args.organizationId),
  ]);

  return resolveRecipientTimezone({
    ...doContato,
    storeTimezone: loja,
    orgTimezone: org,
  });
}
