/**
 * Account loader — single point to read WABA access tokens.
 *
 * Reads access_token_encrypted first (preferred), falls back to legacy
 * access_token column during transition. After 20260523 drop migration
 * runs, this falls back path becomes dead code and can be removed.
 */

import { decryptToken } from './token-encryption';

export interface WhatsAppAccountRow {
  id: string;
  organization_id: string;
  phone_number_id: string;
  waba_id?: string | null;
  access_token?: string | null;
  access_token_encrypted?: string | null;
  [key: string]: any;
}

/**
 * Returns plaintext access_token for use against Meta Graph API.
 * Throws if neither column has a value.
 */
export function getAccessToken(account: WhatsAppAccountRow): string {
  if (account.access_token_encrypted) {
    return decryptToken(account.access_token_encrypted);
  }
  if (account.access_token) {
    return account.access_token;
  }
  throw new Error(`No access token for account ${account.id}`);
}

/**
 * Returns whether the account is already migrated to encrypted storage.
 * Useful for backfill scripts and admin dashboards.
 */
export function isAccountEncrypted(account: WhatsAppAccountRow): boolean {
  return !!account.access_token_encrypted;
}
