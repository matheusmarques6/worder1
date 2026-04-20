import { Agent, fetch as undiciFetch } from 'undici';
import { lookup } from 'dns/promises';
import net from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.aws.internal',
  'metadata.azure.com',
  'metadata',
]);

export function isPrivateIP(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (
    lower.startsWith('fe80:') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.split('::ffff:')[1];
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  if (lower.startsWith('2001:db8:')) return true;
  return false;
}

export function validateUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  const isProd = process.env.NODE_ENV === 'production';
  const allowedSchemes = isProd ? ['https:'] : ['https:', 'http:'];

  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new Error(`URL scheme must be https:// (got ${parsed.protocol})`);
  }

  if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('http:// only allowed for localhost');
  }

  if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Hostname ${parsed.hostname} is blocked`);
  }

  return parsed;
}

/**
 * Custom undici Agent que valida IPs resolvidos antes de conectar.
 * Defense contra DNS rebinding (TOCTOU-safe): o lookup aqui é o mesmo
 * que undici usa pra abrir o socket.
 */
export function createSafeAgent() {
  return new Agent({
    connect: {
      lookup: async (hostname, options, callback) => {
        try {
          const result = await lookup(hostname, { ...(options as any), all: true });
          const entries = Array.isArray(result) ? result : [result];
          for (const entry of entries) {
            if (isPrivateIP(entry.address)) {
              return callback(
                new Error(`Hostname ${hostname} resolved to private IP ${entry.address}`),
                '',
                0
              );
            }
          }
          callback(null, entries[0].address, entries[0].family);
        } catch (err: any) {
          callback(err, '', 0);
        }
      },
    },
  });
}

export interface SafeFetchResult {
  status: number;
  body: string;
  durationMs: number;
}

export async function safeFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<SafeFetchResult> {
  validateUrl(url);

  const agent = createSafeAgent();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);

  try {
    const res = await undiciFetch(url, {
      method: init.method ?? 'POST',
      headers: init.headers,
      body: init.body,
      dispatcher: agent,
      redirect: 'manual',
      signal: controller.signal,
    });

    const text = await res.text();
    return {
      status: res.status,
      body: text.slice(0, 2048),
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
    await agent.close();
  }
}
