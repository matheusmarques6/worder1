/**
 * CREDENTIAL ENCRYPTION SERVICE
 * AES-256-GCM encryption for secure credential storage
 */

import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secret-box';

// ============================================
// TYPES
// ============================================

export interface EncryptedData {
  iv: string;
  authTag: string;
  data: string;
}

// ============================================
// ENCRYPTION CLASS (Singleton)
// ============================================

class CredentialEncryption {
  private static instance: CredentialEncryption;

  private constructor() {
    // encrypt()/decrypt() delegam para o secret-box canonico (que valida
    // ENCRYPTION_KEY em produção e tem fallback de dev). Mantemos apenas a
    // validação em produção aqui por defesa; a derivação de chave saiu daqui.
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (process.env.NODE_ENV === 'production') {
      if (!encryptionKey) {
        throw new Error('ENCRYPTION_KEY environment variable is required');
      }
      if (encryptionKey.length < 32) {
        throw new Error('ENCRYPTION_KEY must be at least 32 characters');
      }
    }
  }

  public static getInstance(): CredentialEncryption {
    if (!CredentialEncryption.instance) {
      CredentialEncryption.instance = new CredentialEncryption();
    }
    return CredentialEncryption.instance;
  }

  /**
   * Encrypt plaintext data.
   * Delega para o secret-box canonico (AES-256-GCM, salt aleatorio por
   * segredo — formato v2). Valores legados `iv:tag:cipher` (salt estatico)
   * continuam legiveis em decrypt() porque a chave derivada e a mesma.
   */
  public encrypt(plaintext: string): string {
    return encryptSecret(plaintext);
  }

  /**
   * Decrypt encrypted data (aceita v2 e legado 3-partes).
   */
  public decrypt(ciphertext: string): string {
    return decryptSecret(ciphertext);
  }

  /**
   * Encrypt an object (JSON)
   */
  public encryptObject(obj: Record<string, any>): string {
    return this.encrypt(JSON.stringify(obj));
  }

  /**
   * Decrypt to an object (JSON)
   */
  public decryptObject<T = Record<string, any>>(ciphertext: string): T {
    const decrypted = this.decrypt(ciphertext);
    return JSON.parse(decrypted) as T;
  }

  /**
   * Generate a secure random token
   */
  public generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a webhook secret
   */
  public generateWebhookSecret(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash a value (for comparison without decryption)
   */
  public hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Verify HMAC signature (for webhooks)
   */
  public verifyHmac(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Create HMAC signature
   */
  public createHmac(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}

// ============================================
// EXPORTS
// ============================================

export const credentialEncryption = CredentialEncryption.getInstance;

// Helper functions for direct use
export function encryptCredential(data: Record<string, any>): string {
  return CredentialEncryption.getInstance().encryptObject(data);
}

export function decryptCredential<T = Record<string, any>>(ciphertext: string): T {
  return CredentialEncryption.getInstance().decryptObject<T>(ciphertext);
}

export function generateWebhookToken(): string {
  return CredentialEncryption.getInstance().generateToken(32);
}

export function generateWebhookSecret(): string {
  return CredentialEncryption.getInstance().generateWebhookSecret();
}

export function verifyWebhookSignature(
  payload: string, 
  signature: string, 
  secret: string
): boolean {
  return CredentialEncryption.getInstance().verifyHmac(payload, signature, secret);
}

export function createWebhookSignature(payload: string, secret: string): string {
  return CredentialEncryption.getInstance().createHmac(payload, secret);
}

// ============================================
// MASK SENSITIVE DATA (for logging)
// ============================================

export function maskSensitive(obj: Record<string, any>): Record<string, any> {
  const sensitiveKeys = [
    'password', 'secret', 'token', 'key', 'apiKey', 'api_key',
    'accessToken', 'access_token', 'refreshToken', 'refresh_token',
    'authorization', 'auth', 'credential', 'private'
  ];
  
  const mask = (value: any, key: string): any => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map((v, i) => mask(v, String(i)));
      }
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, mask(v, k)])
      );
    }
    
    const isSecret = sensitiveKeys.some(
      (sk) => key.toLowerCase().includes(sk.toLowerCase())
    );
    
    if (isSecret && typeof value === 'string') {
      if (value.length <= 8) return '****';
      return value.substring(0, 4) + '****' + value.substring(value.length - 4);
    }
    
    return value;
  };
  
  return mask(obj, '') as Record<string, any>;
}
