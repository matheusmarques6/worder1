// =============================================
// Meta access token validation via debug_token.
// Shared by the manual connect route and the
// Embedded Signup route — validate BEFORE persisting.
// =============================================

import { META_BASE_URL } from './api-version';

export const REQUIRED_TOKEN_SCOPES = [
  'whatsapp_business_messaging',
  'whatsapp_business_management',
] as const;

export const MIN_TOKEN_LIFETIME_HOURS = 168;

export interface TokenValidationResult {
  valid: boolean;
  /** User-facing message in pt-BR when valid === false. */
  error?: string;
}

/**
 * Validates an access token against Meta's debug_token endpoint:
 * - rejects tokens expiring in < MIN_TOKEN_LIFETIME_HOURS
 * - rejects tokens missing any of REQUIRED_TOKEN_SCOPES
 *
 * Best-effort: failures of the debug_token call itself (network, Meta 5xx,
 * malformed response) do NOT block — returns { valid: true } with a warn,
 * matching the historical behavior of the manual connect route.
 */
export async function validateBusinessToken(params: {
  accessToken: string;
  appId: string;
  appSecret: string;
}): Promise<TokenValidationResult> {
  try {
    const res = await fetch(
      `${META_BASE_URL}/debug_token?input_token=${encodeURIComponent(params.accessToken)}` +
        `&access_token=${encodeURIComponent(`${params.appId}|${params.appSecret}`)}`
    );
    const dbg = await res.json();

    if (!dbg?.data) return { valid: true };

    if (typeof dbg.data.expires_at === 'number' && dbg.data.expires_at > 0) {
      const hoursLeft = (dbg.data.expires_at * 1000 - Date.now()) / 3600000;
      if (hoursLeft < MIN_TOKEN_LIFETIME_HOURS) {
        return {
          valid: false,
          error:
            `Token expira em ${Math.round(hoursLeft)}h. Use um System User Access Token (não expira) ` +
            `gerado em Business Manager → Usuários do Sistema → Gerar novo token.`,
        };
      }
    }

    const scopes: string[] = Array.isArray(dbg.data.scopes) ? dbg.data.scopes : [];
    const missing = REQUIRED_TOKEN_SCOPES.filter((s) => !scopes.includes(s));
    if (scopes.length > 0 && missing.length > 0) {
      return {
        valid: false,
        error:
          `Token sem permissões obrigatórias: ${missing.join(', ')}. ` +
          `Edite o System User no Business Manager e adicione esses escopos.`,
      };
    }

    return { valid: true };
  } catch (e) {
    // debug_token is best-effort — if Meta itself fails, proceed.
    console.warn('debug_token check falhou (seguindo):', (e as Error)?.message);
    return { valid: true };
  }
}
