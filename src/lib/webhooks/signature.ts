import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function signPayload(secret: string, timestamp: string, body: string): string {
  const message = `${timestamp}.${body}`;
  const mac = hmac(sha256, new TextEncoder().encode(secret), new TextEncoder().encode(message));
  return bytesToHex(mac);
}

export function buildSignatureHeader(
  primarySecret: string,
  previousSecret: string | null,
  timestamp: string,
  body: string
): string {
  const sigs = [`sha256=${signPayload(primarySecret, timestamp, body)}`];
  if (previousSecret) {
    sigs.push(`sha256=${signPayload(previousSecret, timestamp, body)}`);
  }
  return sigs.join(', ');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function verifySignatureHeader(
  header: string,
  secret: string,
  timestamp: string,
  body: string
): boolean {
  const expected = signPayload(secret, timestamp, body);
  const candidates = header.split(',').map((s) => s.trim());
  for (const cand of candidates) {
    const value = cand.startsWith('sha256=') ? cand.slice(7) : cand;
    if (constantTimeEqual(value, expected)) return true;
  }
  return false;
}
