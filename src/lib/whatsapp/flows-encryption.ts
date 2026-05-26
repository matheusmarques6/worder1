/**
 * WhatsApp Flows Encryption / Decryption
 * src/lib/whatsapp/flows-encryption.ts
 *
 * Implements Meta's data-exchange encryption spec for WhatsApp Flows:
 *   - RSA-OAEP (SHA-256) to decrypt the per-request AES key
 *   - AES-128-GCM to decrypt the request body and encrypt the response
 *   - Response IV = request IV XOR 0xFF (per Meta spec)
 *
 * Reference:
 *   https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 */

import {
  generateKeyPairSync,
  privateDecrypt,
  createDecipheriv,
  createCipheriv,
  constants,
} from 'crypto';

// =============================================
// TYPES
// =============================================

export interface DecryptedFlowRequest {
  /** Decrypted JSON payload from Meta */
  decryptedBody: Record<string, unknown>;
  /** AES key to reuse when encrypting the response */
  aesKeyBuffer: Buffer;
  /** Original request IV to derive the response IV */
  initialVectorBuffer: Buffer;
}

export interface FlowKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

// =============================================
// KEY PAIR GENERATION
// =============================================

/**
 * Generate an RSA-2048 key pair for WhatsApp Flows.
 * The public key is uploaded to Meta; the private key is stored encrypted in DB.
 */
export function generateRsaKeyPair(): FlowKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

// =============================================
// DECRYPT REQUEST
// =============================================

/**
 * Decrypt an incoming Flows data-exchange request from Meta.
 *
 * The request body contains:
 *   - encrypted_aes_key: base64-encoded RSA-OAEP encrypted AES-128 key
 *   - encrypted_flow_data: base64-encoded AES-128-GCM ciphertext
 *   - initial_vector: base64-encoded 12-byte IV
 *
 * Steps (per Meta spec):
 *   1. RSA-OAEP decrypt the AES key using our private key
 *   2. AES-128-GCM decrypt the flow data (last 16 bytes = auth tag)
 *   3. Return parsed JSON + key material for response encryption
 */
export function decryptFlowRequest(
  body: { encrypted_aes_key: string; encrypted_flow_data: string; initial_vector: string },
  privateKeyPem: string,
): DecryptedFlowRequest {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  // 1. Decrypt the AES key with RSA-OAEP (SHA-256)
  const encryptedAesKey = Buffer.from(encrypted_aes_key, 'base64');
  const aesKeyBuffer = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedAesKey,
  );

  // 2. Decrypt the flow data with AES-128-GCM
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

  // Auth tag is the last 16 bytes of the ciphertext
  const AUTH_TAG_LENGTH = 16;
  const encryptedData = flowDataBuffer.subarray(0, flowDataBuffer.length - AUTH_TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(flowDataBuffer.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv('aes-128-gcm', aesKeyBuffer, initialVectorBuffer);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  const decryptedBody = JSON.parse(decrypted) as Record<string, unknown>;

  return { decryptedBody, aesKeyBuffer, initialVectorBuffer };
}

// =============================================
// ENCRYPT RESPONSE
// =============================================

/**
 * Encrypt the response payload to send back to Meta.
 *
 * Per Meta spec the response IV is the request IV with every byte XOR 0xFF (flipped).
 * Returns the base64-encoded ciphertext (data + auth tag concatenated).
 */
export function encryptFlowResponse(
  responsePayload: Record<string, unknown>,
  aesKeyBuffer: Buffer,
  initialVectorBuffer: Buffer,
): string {
  // Flip every byte of the IV to create the response IV
  const responseIv = Buffer.alloc(initialVectorBuffer.length);
  for (let i = 0; i < initialVectorBuffer.length; i++) {
    responseIv[i] = initialVectorBuffer[i] ^ 0xff;
  }

  const cipher = createCipheriv('aes-128-gcm', aesKeyBuffer, responseIv);

  const plaintext = JSON.stringify(responsePayload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(), // 16-byte auth tag appended after ciphertext
  ]);

  return encrypted.toString('base64');
}
