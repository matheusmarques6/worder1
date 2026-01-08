/**
 * CREDENTIAL ENCRYPTION SERVICE
 * AES-256-GCM encryption for secure credential storage
 */

import crypto from 'crypto';

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
  private key: Buffer;
  private algorithm = 'aes-256-gcm';

  private constructor() {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    if (encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }
    
    // Create a 32-byte key from the environment variable
    this.key = crypto.scryptSync(encryptionKey, 'salt', 32);
  }

  public static getInstance(): CredentialEncryption {
    if (!CredentialEncryption.instance) {
      CredentialEncryption.instance = new CredentialEncryption();
    }
    return CredentialEncryption.instance;
  }

  /**
   * Encrypt plaintext data
   */
  public encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedData (all hex encoded)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt encrypted data
   */
  public decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, authTagHex, encryptedData] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
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
