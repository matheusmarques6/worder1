// Janela de atendimento de 24h da WhatsApp Cloud API (Meta).
// Fonte unica de verdade para backend (formatConversation do inbox, guard de
// envio) e frontend (ServiceWindowBar, composer do ChatPanel).

export type ServiceWindowStatus = 'active' | 'expiring' | 'expired' | 'no-window'

/** Janela e considerada "expirando" quando faltam menos de 2h. */
export const EXPIRING_THRESHOLD_MS = 2 * 3_600_000

export function getServiceWindowStatus(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): ServiceWindowStatus {
  if (!expiresAt) return 'no-window'
  const diff = new Date(expiresAt).getTime() - now
  if (Number.isNaN(diff) || diff <= 0) return 'expired'
  return diff < EXPIRING_THRESHOLD_MS ? 'expiring' : 'active'
}

export function isServiceWindowOpen(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const status = getServiceWindowStatus(expiresAt, now)
  return status === 'active' || status === 'expiring'
}

/**
 * Regra do backend: texto livre so quando o flag do BD esta ligado E o
 * timestamp de expiracao esta no futuro — mesma regra do guard em
 * /api/whatsapp/cloud/messages (WINDOW_EXPIRED).
 */
export function computeCanSendTemplateOnly(
  isWindowOpen: boolean | null | undefined,
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return !(isWindowOpen === true && isServiceWindowOpen(expiresAt, now))
}
