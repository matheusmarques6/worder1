import { describe, it, expect } from 'vitest';
import {
  generateRsaKeyPair,
  decryptFlowRequest,
  encryptFlowResponse,
} from './flows-encryption';
import {
  publicEncrypt,
  createCipheriv,
  randomBytes,
  constants,
  privateDecrypt,
  createDecipheriv,
} from 'crypto';

// =============================================
// Helpers — simulate what Meta does on their side
// =============================================

/** Encrypt a mock request the same way Meta would. */
function simulateMetaEncrypt(
  payload: Record<string, unknown>,
  publicKeyPem: string,
) {
  // Random AES-128 key (16 bytes)
  const aesKey = randomBytes(16);
  // Random 12-byte IV
  const iv = randomBytes(12);

  // RSA-OAEP encrypt the AES key with our public key
  const encryptedAesKey = publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey,
  );

  // AES-128-GCM encrypt the payload
  const cipher = createCipheriv('aes-128-gcm', aesKey, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return {
    encrypted_aes_key: encryptedAesKey.toString('base64'),
    encrypted_flow_data: encrypted.toString('base64'),
    initial_vector: iv.toString('base64'),
    _aesKey: aesKey,
    _iv: iv,
  };
}

/** Decrypt a response the same way Meta would (using the flipped IV). */
function simulateMetaDecryptResponse(
  base64Response: string,
  aesKey: Buffer,
  requestIv: Buffer,
) {
  const responseIv = Buffer.alloc(requestIv.length);
  for (let i = 0; i < requestIv.length; i++) {
    responseIv[i] = requestIv[i] ^ 0xff;
  }

  const data = Buffer.from(base64Response, 'base64');
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);

  const decipher = createDecipheriv('aes-128-gcm', aesKey, responseIv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

// =============================================
// Tests
// =============================================

describe('flows-encryption', () => {
  describe('generateRsaKeyPair', () => {
    it('generates valid PEM key pair', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();

      expect(publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(publicKeyPem).toContain('-----END PUBLIC KEY-----');
      expect(privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
      expect(privateKeyPem).toContain('-----END PRIVATE KEY-----');
    });

    it('generates unique key pairs', () => {
      const a = generateRsaKeyPair();
      const b = generateRsaKeyPair();
      expect(a.publicKeyPem).not.toBe(b.publicKeyPem);
    });
  });

  describe('decryptFlowRequest', () => {
    it('round-trips: encrypt as Meta → decrypt → original payload', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();

      const payload = {
        action: 'data_exchange',
        screen: 'CART_RECOVERY',
        data: { product_id: '123', quantity: 2 },
        flow_token: 'test_token_abc',
      };

      const encrypted = simulateMetaEncrypt(payload, publicKeyPem);
      const { decryptedBody, aesKeyBuffer, initialVectorBuffer } =
        decryptFlowRequest(
          {
            encrypted_aes_key: encrypted.encrypted_aes_key,
            encrypted_flow_data: encrypted.encrypted_flow_data,
            initial_vector: encrypted.initial_vector,
          },
          privateKeyPem,
        );

      expect(decryptedBody).toEqual(payload);
      expect(aesKeyBuffer).toBeInstanceOf(Buffer);
      expect(aesKeyBuffer.length).toBe(16);
      expect(initialVectorBuffer).toBeInstanceOf(Buffer);
      expect(initialVectorBuffer.length).toBe(12);
    });

    it('decrypts empty object payload', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();
      const encrypted = simulateMetaEncrypt({}, publicKeyPem);

      const { decryptedBody } = decryptFlowRequest(
        {
          encrypted_aes_key: encrypted.encrypted_aes_key,
          encrypted_flow_data: encrypted.encrypted_flow_data,
          initial_vector: encrypted.initial_vector,
        },
        privateKeyPem,
      );

      expect(decryptedBody).toEqual({});
    });

    it('decrypts large payload', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();

      const largePayload: Record<string, unknown> = {
        action: 'data_exchange',
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `item_${i}`,
          name: `Product ${i} with a long description to increase payload size`,
          price: Math.random() * 1000,
        })),
      };

      const encrypted = simulateMetaEncrypt(largePayload, publicKeyPem);
      const { decryptedBody } = decryptFlowRequest(
        {
          encrypted_aes_key: encrypted.encrypted_aes_key,
          encrypted_flow_data: encrypted.encrypted_flow_data,
          initial_vector: encrypted.initial_vector,
        },
        privateKeyPem,
      );

      expect(decryptedBody).toEqual(largePayload);
    });

    it('throws on wrong private key', () => {
      const keyPair1 = generateRsaKeyPair();
      const keyPair2 = generateRsaKeyPair();

      const encrypted = simulateMetaEncrypt({ x: 1 }, keyPair1.publicKeyPem);

      expect(() =>
        decryptFlowRequest(
          {
            encrypted_aes_key: encrypted.encrypted_aes_key,
            encrypted_flow_data: encrypted.encrypted_flow_data,
            initial_vector: encrypted.initial_vector,
          },
          keyPair2.privateKeyPem,
        ),
      ).toThrow();
    });
  });

  describe('encryptFlowResponse', () => {
    it('produces a response that Meta can decrypt', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();

      const requestPayload = { action: 'INIT', flow_token: 'tok' };
      const encrypted = simulateMetaEncrypt(requestPayload, publicKeyPem);

      const { aesKeyBuffer, initialVectorBuffer } = decryptFlowRequest(
        {
          encrypted_aes_key: encrypted.encrypted_aes_key,
          encrypted_flow_data: encrypted.encrypted_flow_data,
          initial_vector: encrypted.initial_vector,
        },
        privateKeyPem,
      );

      const responsePayload = {
        screen: 'SUCCESS',
        data: { message: 'Done!' },
      };

      const encryptedResponse = encryptFlowResponse(
        responsePayload,
        aesKeyBuffer,
        initialVectorBuffer,
      );

      // Verify Meta can decrypt it
      const decrypted = simulateMetaDecryptResponse(
        encryptedResponse,
        encrypted._aesKey,
        encrypted._iv,
      );

      expect(decrypted).toEqual(responsePayload);
    });

    it('encrypts empty response', () => {
      const { publicKeyPem, privateKeyPem } = generateRsaKeyPair();
      const encrypted = simulateMetaEncrypt({ action: 'ping' }, publicKeyPem);

      const { aesKeyBuffer, initialVectorBuffer } = decryptFlowRequest(
        {
          encrypted_aes_key: encrypted.encrypted_aes_key,
          encrypted_flow_data: encrypted.encrypted_flow_data,
          initial_vector: encrypted.initial_vector,
        },
        privateKeyPem,
      );

      const encryptedResponse = encryptFlowResponse(
        {},
        aesKeyBuffer,
        initialVectorBuffer,
      );

      const decrypted = simulateMetaDecryptResponse(
        encryptedResponse,
        encrypted._aesKey,
        encrypted._iv,
      );

      expect(decrypted).toEqual({});
    });

    it('response IV is request IV XOR 0xFF', () => {
      // Verify the IV flip logic directly
      const requestIv = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff, 0xab, 0x54, 0x00, 0xff, 0x12, 0x34]);
      const expectedResponseIv = Buffer.from([0xff, 0xfe, 0x80, 0x7f, 0x01, 0x00, 0x54, 0xab, 0xff, 0x00, 0xed, 0xcb]);

      // We test the IV flip by doing a full encrypt/decrypt cycle with known IVs
      const aesKey = randomBytes(16);
      const payload = { test: true };

      const result = encryptFlowResponse(payload, aesKey, requestIv);

      // Decrypt with expected flipped IV
      const data = Buffer.from(result, 'base64');
      const authTag = data.subarray(data.length - 16);
      const ciphertext = data.subarray(0, data.length - 16);

      const decipher = createDecipheriv('aes-128-gcm', aesKey, expectedResponseIv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      expect(JSON.parse(decrypted)).toEqual(payload);
    });
  });
});
