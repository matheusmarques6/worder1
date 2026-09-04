// =============================================
// Sending rules: Quiet Hours + Frequency Cap
// Reusable across action_email, action_sms, action_whatsapp.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { partsInTz, nextOccurrenceInTz } from '@/lib/scheduling/timezone';

export interface OrgSendingRules {
  quietHoursEnabled: boolean;
  quietHoursStart: number; // 0-23 (hour)
  quietHoursEnd: number;   // 0-23
  quietHoursTimezone: string; // IANA tz name e.g. "America/Sao_Paulo"
  // Per-channel caps. 0 = unlimited. maxSendsPerContactPerDay (legacy)
  // becomes the default when a channel-specific cap isn't set.
  maxSendsPerContactPerDay: number;
  maxEmailPerContactPerDay: number | null;
  maxSmsPerContactPerDay: number | null;
  maxWhatsappPerContactPerDay: number | null;
}

const DEFAULTS: OrgSendingRules = {
  quietHoursEnabled: false,
  quietHoursStart: 20,
  quietHoursEnd: 8,
  quietHoursTimezone: 'America/Sao_Paulo',
  maxSendsPerContactPerDay: 0,
  maxEmailPerContactPerDay: null,
  // Omnisend default for SMS: 3/day per recipient.
  maxSmsPerContactPerDay: 3,
  maxWhatsappPerContactPerDay: null,
};

const cache = new Map<string, { rules: OrgSendingRules; ts: number }>();
const CACHE_TTL_MS = 60_000;

export async function getOrgSendingRules(organizationId: string): Promise<OrgSendingRules> {
  const cached = cache.get(organizationId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.rules;

  const { data } = await supabaseAdmin
    .from('organizations')
    .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, max_sends_per_contact_per_day, max_email_per_contact_per_day, max_sms_per_contact_per_day, max_whatsapp_per_contact_per_day')
    .eq('id', organizationId)
    .maybeSingle();

  const rules: OrgSendingRules = {
    quietHoursEnabled: data?.quiet_hours_enabled ?? DEFAULTS.quietHoursEnabled,
    quietHoursStart: data?.quiet_hours_start ?? DEFAULTS.quietHoursStart,
    quietHoursEnd: data?.quiet_hours_end ?? DEFAULTS.quietHoursEnd,
    quietHoursTimezone: data?.quiet_hours_timezone ?? DEFAULTS.quietHoursTimezone,
    maxSendsPerContactPerDay: data?.max_sends_per_contact_per_day ?? DEFAULTS.maxSendsPerContactPerDay,
    maxEmailPerContactPerDay: data?.max_email_per_contact_per_day ?? DEFAULTS.maxEmailPerContactPerDay,
    maxSmsPerContactPerDay: data?.max_sms_per_contact_per_day ?? DEFAULTS.maxSmsPerContactPerDay,
    maxWhatsappPerContactPerDay: data?.max_whatsapp_per_contact_per_day ?? DEFAULTS.maxWhatsappPerContactPerDay,
  };

  cache.set(organizationId, { rules, ts: Date.now() });
  return rules;
}

/**
 * Returns the timestamp of the next moment when sending is allowed,
 * or null if no postpone is needed.
 *
 * Quiet hours wrap around midnight when start > end (e.g. 20→8).
 *
 * `timezoneOverride` permite avaliar o silêncio no fuso do
 * DESTINATÁRIO em vez do fuso único da organização — mesma ideia do
 * modo "fuso do contato" da campanha e do delay.
 *
 * A conta antiga montava a data como se o fuso fosse UTC e corrigia
 * por um delta de HORA inteira. Isso errava 30 minutos em fusos de
 * meia hora (Índia +5:30, Terra Nova -3:30) e caía na hora errada na
 * virada do horário de verão. Agora usa o núcleo de agendamento, que
 * calcula o deslocamento no instante certo.
 */
export function nextAllowedSendTime(
  rules: OrgSendingRules,
  now: Date = new Date(),
  timezoneOverride?: string | null
): Date | null {
  if (!rules.quietHoursEnabled) return null;
  const start = rules.quietHoursStart;
  const end = rules.quietHoursEnd;
  if (start === end) return null;

  const tz = timezoneOverride || rules.quietHoursTimezone;
  const hour = partsInTz(tz, now).hour;
  const inQuietWindow = start > end
    ? (hour >= start || hour < end)  // wraps midnight
    : (hour >= start && hour < end); // same-day window

  if (!inQuietWindow) return null;

  return nextOccurrenceInTz(tz, end, 0, now);
}

/**
 * Returns true if the contact has hit the per-day cap on a channel.
 * Channel-specific cap takes precedence; falls back to the org-wide
 * total cap (maxSendsPerContactPerDay).
 */
export async function isFrequencyCapped(
  organizationId: string,
  contactId: string | null | undefined,
  rules: OrgSendingRules,
  channel: 'email' | 'sms' | 'whatsapp' = 'email'
): Promise<boolean> {
  if (!contactId) return false;

  const channelCap = channel === 'email' ? rules.maxEmailPerContactPerDay
    : channel === 'sms' ? rules.maxSmsPerContactPerDay
    : rules.maxWhatsappPerContactPerDay;
  const totalCap = rules.maxSendsPerContactPerDay;

  if ((!channelCap || channelCap <= 0) && (!totalCap || totalCap <= 0)) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Channel-specific count + total count from email_sends (and other
  // tables when those land in the schema). For now email_sends is the
  // canonical send log and SMS/WhatsApp send through their own tables;
  // fall through gracefully when those tables aren't queried.
  if (channel === 'email') {
    const { count } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('contact_id', contactId)
      .gte('created_at', since)
      .not('status', 'in', '("failed","cancelled")');
    const sent = count || 0;
    if (channelCap && channelCap > 0 && sent >= channelCap) return true;
    if (totalCap && totalCap > 0 && sent >= totalCap) return true;
    return false;
  }

  // For SMS/WhatsApp the conservative behaviour is to still enforce the
  // total cap against email_sends until the dedicated send tables are
  // wired in.
  const { count } = await supabaseAdmin
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .gte('created_at', since);
  const sent = count || 0;
  if (channelCap && channelCap > 0 && sent >= channelCap) return true;
  if (totalCap && totalCap > 0 && sent >= totalCap) return true;
  return false;
}
