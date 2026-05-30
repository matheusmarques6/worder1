// =============================================
// WhatsApp account health checker.
//
// Probes Meta Graph API with the account's access_token to determine if
// it is still valid, when it expires, and which scopes are granted. Used
// by:
//   - GET /api/whatsapp/cloud/accounts/[id]/health  (manual diagnostics)
//   - PATCH /api/whatsapp/cloud/accounts/[id]       (validate before save)
//
// Two-call probe:
//   1. GET /me?access_token=X            -> identity + 401 if revoked
//   2. GET /debug_token?input_token=X    -> expiry + scopes (best-effort)
//
// Both calls use the user/app token itself as the bearer for debug_token,
// which works for long-lived user tokens and System User tokens (no
// separate app access token needed).
// =============================================

import { META_BASE_URL } from './api-version';
import { getAccessToken, type WhatsAppAccountRow } from './account-loader';

export interface AccountHealthResult {
  valid: boolean;
  metaUserId?: string;
  metaUserName?: string;
  /** ISO timestamp when the token expires; null = never (e.g. System User). */
  expiresAt?: string | null;
  scopes?: string[];
  errorCode?: number;
  errorSubcode?: number;
  errorMessage?: string;
  checkedAt: string;
}

/**
 * Maps a health result to a coarse status string persisted on the account row.
 */
export function deriveHealthStatus(result: AccountHealthResult): 'healthy' | 'expired' | 'invalid' | 'error' {
  if (result.valid) return 'healthy';
  // Meta auth errors: 190 = token issue (expired/revoked/invalid)
  if (result.errorCode === 190) {
    // subcode 463 = expired, 467 = invalid (password change, etc).
    if (result.errorSubcode === 463) return 'expired';
    return 'invalid';
  }
  return 'error';
}

export async function checkAccountHealth(
  account: WhatsAppAccountRow,
): Promise<AccountHealthResult> {
  const checkedAt = new Date().toISOString();

  let token: string;
  try {
    token = getAccessToken(account);
  } catch (e: any) {
    return {
      valid: false,
      errorMessage: e?.message || 'No access token configured',
      checkedAt,
    };
  }

  // 1. /me — minimum viability check
  let meResp: Response;
  try {
    meResp = await fetch(`${META_BASE_URL}/me?access_token=${encodeURIComponent(token)}`);
  } catch (e: any) {
    return {
      valid: false,
      errorMessage: `Network error: ${e?.message || 'unknown'}`,
      checkedAt,
    };
  }

  const meData = await meResp.json().catch(() => ({}));

  if (!meResp.ok || meData.error) {
    const err = meData.error || {};
    return {
      valid: false,
      errorCode: err.code,
      errorSubcode: err.error_subcode,
      errorMessage: err.message || `HTTP ${meResp.status}`,
      checkedAt,
    };
  }

  const metaUserId: string | undefined = meData.id;
  const metaUserName: string | undefined = meData.name;

  // 2. /debug_token — extended metadata (best-effort, never fails the check)
  let expiresAt: string | null | undefined;
  let scopes: string[] | undefined;
  try {
    const dbgResp = await fetch(
      `${META_BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    );
    if (dbgResp.ok) {
      const dbg = await dbgResp.json();
      const data = dbg?.data || {};
      // expires_at is a unix timestamp in seconds; 0 = never expires
      if (typeof data.expires_at === 'number') {
        expiresAt = data.expires_at > 0
          ? new Date(data.expires_at * 1000).toISOString()
          : null;
      } else if (typeof data.data_access_expires_at === 'number') {
        expiresAt = data.data_access_expires_at > 0
          ? new Date(data.data_access_expires_at * 1000).toISOString()
          : null;
      }
      if (Array.isArray(data.scopes)) scopes = data.scopes;
    }
  } catch {
    // ignore — debug_token is informational only
  }

  return {
    valid: true,
    metaUserId,
    metaUserName,
    expiresAt: expiresAt ?? undefined,
    scopes,
    checkedAt,
  };
}
