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
