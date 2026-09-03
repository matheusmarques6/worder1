// =============================================
// Single source of truth for "may we email this contact?".
//
// email_consent is boolean on some schemas and TEXT on others (the popup
// double-opt-in path writes the string 'pending'). Every send path must
// apply the SAME rule, otherwise a contact blocked in automations still
// gets campaign blasts (or vice-versa). Both node-executors (automation
// email node) and send-batch (campaigns) call this.
// =============================================

const BLOCKED_STATUSES = new Set(['bounced', 'complained', 'unsubscribed', 'invalid']);
const BLOCKED_CONSENT_STRINGS = new Set(['pending', 'false', 'denied', 'unsubscribed', 'revoked']);

/**
 * Returns true when the contact must NOT be emailed.
 *
 * Blocks:
 *  - email_consent === false (boolean schema)
 *  - email_consent string in {pending, false, denied, unsubscribed, revoked}
 *    (TEXT schema — 'pending' is the double-opt-in "not confirmed yet" state)
 *  - status in {bounced, complained, unsubscribed, invalid}
 *
 * Allows (returns false): granted consent (true / 'subscribed' / 'granted')
 * and NULL/undefined consent (legacy contacts with no explicit signal), so
 * this never over-blocks existing sendable audiences.
 */
export function isEmailBlocked(emailConsent: unknown, status?: unknown): boolean {
  if (emailConsent === false) return true;
  const consentStr = String(emailConsent ?? '').toLowerCase();
  if (BLOCKED_CONSENT_STRINGS.has(consentStr)) return true;
  const statusStr = String(status ?? '').toLowerCase();
  if (BLOCKED_STATUSES.has(statusStr)) return true;
  return false;
}

// =============================================
// Sending thresholds (modelo da Omnisend)
//
// Cada automação escolhe, POR CANAL, quão longe o envio alcança:
//
//   'subscribed'    — só quem tem consentimento. É o padrão e equivale
//                     exatamente ao isEmailBlocked acima (nenhuma
//                     mudança de comportamento em fluxos já existentes).
//   'nonSubscribed' — inclui também quem NUNCA optou (consent false ou
//                     double-opt-in ainda pendente). Continua excluindo
//                     quem pediu descadastro. É o nível que a Omnisend
//                     usa nos fluxos de recuperação de carrinho.
//   'all'           — inclui também quem se descadastrou. Só para
//                     mensagens TRANSACIONais (confirmação de pedido,
//                     rastreio), como na Omnisend.
//
// PISO INEGOCIÁVEL: endereços com bounce definitivo, denúncia de spam ou
// inválidos NUNCA são liberados, em nenhum nível. Isso não é escolha de
// consentimento — é proteção da reputação do domínio de envio, e voltar
// a mandar para eles derruba a entregabilidade de toda a base.
// =============================================

export type SendingThreshold = 'subscribed' | 'nonSubscribed' | 'all';

/** Bloqueio técnico permanente: nenhum threshold libera. */
const HARD_BLOCKED_STATUSES = new Set(['bounced', 'complained', 'invalid']);
/** Descadastro explícito: só o nível 'all' (transacional) libera. */
const UNSUBSCRIBED_STATES = new Set(['unsubscribed', 'revoked', 'denied']);

export function normalizeThreshold(value: unknown): SendingThreshold {
  const v = String(value ?? '').trim();
  if (v === 'all') return 'all';
  if (v === 'nonSubscribed' || v === 'non_subscribed') return 'nonSubscribed';
  return 'subscribed';
}

/**
 * Decide se o e-mail deve ser bloqueado considerando o threshold da
 * automação. Sem threshold (ou 'subscribed') o resultado é idêntico ao
 * isEmailBlocked — nenhum fluxo existente muda.
 */
export function isEmailBlockedForThreshold(
  emailConsent: unknown,
  status: unknown,
  threshold: SendingThreshold = 'subscribed'
): boolean {
  const statusStr = String(status ?? '').toLowerCase();
  const consentStr = String(emailConsent ?? '').toLowerCase();

  // Piso técnico — vale para os três níveis.
  if (HARD_BLOCKED_STATUSES.has(statusStr)) return true;

  if (threshold === 'all') return false;

  const isUnsubscribed =
    UNSUBSCRIBED_STATES.has(statusStr) || UNSUBSCRIBED_STATES.has(consentStr);
  if (isUnsubscribed) return true;

  // 'nonSubscribed' alcança quem nunca optou (false / pendente).
  if (threshold === 'nonSubscribed') return false;

  return isEmailBlocked(emailConsent, status);
}

/**
 * Equivalente para SMS. O canal usa contacts.sms_consent (boolean).
 *
 * ATENÇÃO ao default: hoje o nó de SMS envia sem nenhuma checagem de
 * consentimento. Adotar 'subscribed' como padrão pararia, sem aviso,
 * fluxos de SMS que já rodam em produção — por isso o padrão aqui é
 * 'all' (comportamento atual) e o lojista escolhe explicitamente
 * apertar. A recomendação de usar 'subscribed' está na própria UI.
 */
export function isSmsBlockedForThreshold(
  smsConsent: unknown,
  status: unknown,
  threshold: SendingThreshold = 'all'
): boolean {
  const statusStr = String(status ?? '').toLowerCase();

  if (HARD_BLOCKED_STATUSES.has(statusStr)) return true;
  if (threshold === 'all') return false;

  const consentStr = String(smsConsent ?? '').toLowerCase();
  const isUnsubscribed =
    UNSUBSCRIBED_STATES.has(statusStr) || UNSUBSCRIBED_STATES.has(consentStr);
  if (isUnsubscribed) return true;

  if (threshold === 'nonSubscribed') return false;

  // 'subscribed': exige sinal positivo de consentimento.
  return !(smsConsent === true || consentStr === 'true' || consentStr === 'subscribed' || consentStr === 'granted');
}
