import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function deriveEventId(
  source: string,
  sourceEventId: string,
  eventType: string
): string {
  const input = `${source}:${sourceEventId}:${eventType}`;
  const hash = sha256(new TextEncoder().encode(input));
  return 'evt_' + bytesToHex(hash).slice(0, 26);
}
