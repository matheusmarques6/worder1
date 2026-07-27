/**
 * Mapeia um status webhook da Meta (statuses[].status + statuses[].timestamp,
 * epoch em SEGUNDOS como string) para os campos delivered_at/read_at a mesclar
 * no UPDATE de whatsapp_cloud_messages.
 *
 * Regras:
 *   - 'delivered' → delivered_at (se ainda não persistido)
 *   - 'read'      → read_at (se ainda não persistido) + delivered_at (se
 *                   ausente — Meta às vezes pula o webhook de delivered)
 *   - 'sent'/'failed'/outros → {} (nenhum timestamp)
 *   - Nunca sobrescreve valor já persistido (primeiro webhook vence).
 *   - timestamp ausente/inválido → fallback now() (melhor aproximação).
 *
 * Função pura — o guard monotônico de status continua em processStatus.
 */

export interface StatusTimestampContext {
  currentDeliveredAt?: string | null;
  currentReadAt?: string | null;
}

export interface StatusTimestampFields {
  delivered_at?: string;
  read_at?: string;
}

export function epochToIso(epoch: string | number | undefined | null): string | null {
  if (epoch === undefined || epoch === null || epoch === '') return null;
  const seconds = Number(epoch);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function statusTimestampFields(
  newStatus: string,
  epochTimestamp: string | number | undefined | null,
  context: StatusTimestampContext = {},
): StatusTimestampFields {
  if (newStatus !== 'delivered' && newStatus !== 'read') return {};

  const iso = epochToIso(epochTimestamp) ?? new Date().toISOString();
  const fields: StatusTimestampFields = {};

  if (newStatus === 'delivered') {
    if (!context.currentDeliveredAt) fields.delivered_at = iso;
  } else {
    // read
    if (!context.currentReadAt) fields.read_at = iso;
    if (!context.currentDeliveredAt) fields.delivered_at = iso;
  }

  return fields;
}
