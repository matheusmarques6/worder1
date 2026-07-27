import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateBusinessToken } from './token-validation';

const mockFetch = vi.fn();

function debugTokenResponse(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

const CREDS = { accessToken: 'tok_123', appId: 'app_1', appSecret: 'secret_1' };
const ALL_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];

describe('validateBusinessToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a non-expiring token with both required scopes', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result).toEqual({ valid: true });
  });

  it('calls debug_token with input_token and app credentials', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ALL_SCOPES })
    );
    await validateBusinessToken(CREDS);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/debug_token?input_token=tok_123');
    expect(url).toContain(`access_token=${encodeURIComponent('app_1|secret_1')}`);
  });

  it('rejects a token expiring in less than 168h with pt-BR message', async () => {
    const in24h = Math.floor(Date.now() / 1000) + 24 * 3600;
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: in24h, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token expira em');
    expect(result.error).toContain('System User Access Token');
  });

  it('accepts a token expiring beyond 168h', async () => {
    const in30d = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: in30d, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('rejects a token missing whatsapp_business_management', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ['whatsapp_business_messaging'] })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('whatsapp_business_management');
    expect(result.error).toContain('permissões obrigatórias');
  });

  it('does not reject when scopes array is empty (Meta omitted scopes)', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: [] })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('is best-effort: returns valid when debug_token request throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('is best-effort: returns valid when response has no data envelope', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });
});
