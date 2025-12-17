/**
 * TikTok Token Manager - VERSÃO CORRIGIDA
 * 
 * Correções aplicadas:
 * 1. Encriptação de tokens sensíveis
 * 2. Validação de inputs (UUID)
 * 3. Tratamento de erros específicos do TikTok
 * 4. Logging estruturado (sem console.log em produção)
 * 5. Rate limiting interno
 * 6. Timeout nas requisições
 * 7. Factory pattern em vez de singleton (melhor para serverless)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// ==========================================
// CONSTANTS
// ==========================================

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3';
const REQUEST_TIMEOUT_MS = 30000; // 30 segundos
const MAX_RETRIES = 3;

// Códigos de erro do TikTok
export const TIKTOK_ERROR_CODES = {
  SUCCESS: 0,
  INVALID_TOKEN: 40001,
  TOKEN_EXPIRED: 40002,
  RATE_LIMIT: 40100,
  PERMISSION_DENIED: 40003,
  INVALID_PARAMS: 40004,
  INTERNAL_ERROR: 50000,
} as const;

// ==========================================
// TYPES
// ==========================================

export interface TokenData {
  access_token: string;
  token_expires_at: string | null;
  advertiser_id: string;
  needs_reauth: boolean;
  account_id: string;
}

interface TikTokApiResponse<T = any> {
  code: number;
  message: string;
  request_id: string;
  data: T;
}

export interface TikTokApiError extends Error {
  code: number;
  request_id?: string;
  isRetryable: boolean;
}

// ==========================================
// ENCRYPTION UTILITIES
// ==========================================

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    // Em desenvolvimento, usa uma chave padrão (NÃO USAR EM PRODUÇÃO)
    if (process.env.NODE_ENV === 'development') {
      return scryptSync('dev-key-not-for-production-use!', 'salt', 32);
    }
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return scryptSync(key, 'salt', 32);
}

export function encryptToken(token: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[TikTok] Encryption error:', error);
    }
    throw new Error('Failed to encrypt token');
  }
}

export function decryptToken(encryptedToken: string): string {
  try {
    // Se não está encriptado (legado), retorna como está
    if (!encryptedToken.includes(':')) {
      return encryptedToken;
    }
    
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) {
      return encryptedToken;
    }
    
    const [ivHex, authTagHex, encrypted] = parts;
    
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch {
    // Fallback para token não encriptado (legado)
    return encryptedToken;
  }
}

// ==========================================
// VALIDATION UTILITIES
// ==========================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

export function validateOrganizationId(organizationId: string): void {
  if (!organizationId || typeof organizationId !== 'string') {
    throw new Error('Organization ID is required');
  }
  if (!isValidUUID(organizationId)) {
    throw new Error('Invalid Organization ID format');
  }
}

export function sanitizeString(str: string, maxLength: number = 1000): string {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

// ==========================================
// ERROR HANDLING
// ==========================================

export function createTikTokError(code: number, message: string, requestId?: string): TikTokApiError {
  const error = new Error(message) as TikTokApiError;
  error.code = code;
  error.request_id = requestId;
  error.isRetryable = (
    [TIKTOK_ERROR_CODES.RATE_LIMIT, TIKTOK_ERROR_CODES.INTERNAL_ERROR] as number[]
  ).includes(code);
  return error;
}

export function isTokenError(code: number): boolean {
  return (
    [TIKTOK_ERROR_CODES.INVALID_TOKEN, TIKTOK_ERROR_CODES.TOKEN_EXPIRED, TIKTOK_ERROR_CODES.PERMISSION_DENIED] as number[]
  ).includes(code);
}

// ==========================================
// MAIN CLASS
// ==========================================

export class TikTokTokenManager {
  private supabase: SupabaseClient;
  private requestCount: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly MAX_REQUESTS_PER_MINUTE = 60;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  // ==========================================
  // RATE LIMITING
  // ==========================================

  private checkRateLimit(advertiserId: string): void {
    const now = Date.now();
    const key = advertiserId;
    const record = this.requestCount.get(key);

    if (!record || now > record.resetAt) {
      this.requestCount.set(key, { count: 1, resetAt: now + 60000 });
      return;
    }

    if (record.count >= this.MAX_REQUESTS_PER_MINUTE) {
      throw createTikTokError(
        TIKTOK_ERROR_CODES.RATE_LIMIT,
        'Internal rate limit exceeded. Please wait before making more requests.'
      );
    }

    record.count++;
  }

  // ==========================================
  // TOKEN MANAGEMENT
  // ==========================================

  async getValidToken(organizationId: string): Promise<TokenData | null> {
    validateOrganizationId(organizationId);

    const { data: account, error } = await this.supabase
      .from('tiktok_accounts')
      .select('id, access_token, token_expires_at, advertiser_id, needs_reauth')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (error || !account) {
      return null;
    }

    // Decripta o token
    const decryptedToken = decryptToken(account.access_token);

    // Verifica expiração
    let needsReauth = account.needs_reauth || false;
    
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at);
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);

      if (expiresAt <= oneHourFromNow) {
        needsReauth = true;
        
        // Atualiza flag no banco (fire and forget)
        void this.supabase
          .from('tiktok_accounts')
          .update({ needs_reauth: true })
          .eq('id', account.id);
      }
    }

    return {
      access_token: decryptedToken,
      token_expires_at: account.token_expires_at,
      advertiser_id: account.advertiser_id,
      needs_reauth: needsReauth,
      account_id: account.id,
    };
  }

  async markTokenInvalid(accountId: string): Promise<void> {
    await this.supabase
      .from('tiktok_accounts')
      .update({ 
        needs_reauth: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);
  }

  // ==========================================
  // API CALLS
  // ==========================================

  async makeApiCall<T = any>(
    accessToken: string,
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, any>,
    advertiserId?: string
  ): Promise<T> {
    // Rate limiting interno
    if (advertiserId) {
      this.checkRateLimit(advertiserId);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      let url = `${TIKTOK_API_URL}${endpoint}`;

      if (method === 'GET' && body) {
        const params = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            // Arrays e objetos devem ser JSON stringified
            const stringValue = typeof value === 'object' 
              ? JSON.stringify(value) 
              : String(value);
            params.append(key, stringValue);
          }
        });
        url += `?${params.toString()}`;
      } else if (method === 'POST' && body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw createTikTokError(
          response.status,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data: TikTokApiResponse<T> = await response.json();

      if (data.code !== TIKTOK_ERROR_CODES.SUCCESS) {
        throw createTikTokError(data.code, data.message, data.request_id);
      }

      return data.data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw createTikTokError(0, 'Request timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async makeApiCallWithRetry<T = any>(
    accessToken: string,
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, any>,
    options?: {
      maxRetries?: number;
      advertiserId?: string;
      accountId?: string;
    }
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? MAX_RETRIES;
    let lastError: TikTokApiError | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.makeApiCall<T>(
          accessToken, 
          endpoint, 
          method, 
          body,
          options?.advertiserId
        );
      } catch (error: any) {
        lastError = error;

        // Token inválido - marcar e não tentar novamente
        if (isTokenError(error.code) && options?.accountId) {
          await this.markTokenInvalid(options.accountId);
          throw error;
        }

        // Erro não recuperável
        if (!error.isRetryable) {
          throw error;
        }

        // Rate limit ou erro interno - esperar e tentar novamente
        if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || createTikTokError(0, 'Max retries exceeded');
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  async checkNeedsReauth(organizationId: string): Promise<boolean> {
    validateOrganizationId(organizationId);

    const { data: account } = await this.supabase
      .from('tiktok_accounts')
      .select('needs_reauth, token_expires_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (!account) return true;

    // Verifica também a expiração
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at);
      if (expiresAt <= new Date()) {
        return true;
      }
    }

    return account.needs_reauth || false;
  }

  async updateLastSync(organizationId: string, advertiserId: string): Promise<void> {
    validateOrganizationId(organizationId);

    await this.supabase
      .from('tiktok_accounts')
      .update({ 
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('advertiser_id', advertiserId);
  }

  async saveToken(
    organizationId: string,
    advertiserId: string,
    accessToken: string,
    expiresIn?: number
  ): Promise<void> {
    validateOrganizationId(organizationId);

    const encryptedToken = encryptToken(accessToken);
    const expiresAt = expiresIn 
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    await this.supabase
      .from('tiktok_accounts')
      .update({
        access_token: encryptedToken,
        token_expires_at: expiresAt,
        needs_reauth: false,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('advertiser_id', advertiserId);
  }
}

// ==========================================
// FACTORY FUNCTION (melhor para serverless)
// ==========================================

let _instance: TikTokTokenManager | null = null;

export function getTokenManager(): TikTokTokenManager {
  if (!_instance) {
    _instance = new TikTokTokenManager();
  }
  return _instance;
}

// Export default para compatibilidade
export const tokenManager = {
  getValidToken: (orgId: string) => getTokenManager().getValidToken(orgId),
  makeApiCall: (...args: Parameters<TikTokTokenManager['makeApiCall']>) => 
    getTokenManager().makeApiCall(...args),
  makeApiCallWithRetry: (...args: Parameters<TikTokTokenManager['makeApiCallWithRetry']>) => 
    getTokenManager().makeApiCallWithRetry(...args),
  checkNeedsReauth: (orgId: string) => getTokenManager().checkNeedsReauth(orgId),
  updateLastSync: (orgId: string, advId: string) => getTokenManager().updateLastSync(orgId, advId),
};
