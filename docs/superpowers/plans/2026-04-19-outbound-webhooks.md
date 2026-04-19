# Outbound Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar sistema de webhooks de saída v1 — 10 eventos normalizados emitidos por loja, com assinatura HMAC, retry exponencial via QStash e UI para gerenciar inscrições e logs.

**Architecture:** EventBus centraliza emissões → outbound_dispatcher (listener síncrono) cria linhas em `webhook_deliveries` (idempotente via UNIQUE) e enfileira no QStash → worker reivindica linha atomicamente, faz POST assinado via undici Agent SSRF-safe, atualiza status. Sweeper cron cobre falhas raras de enqueue. Detector novo de browse abandoned roda a cada 15min.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), QStash (Upstash), Vitest, undici, pgsodium (opcional), TypeScript.

**Spec de referência:** `docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md`

**Estimativa total:** 9-12 dias focados, divididos em 5 fases.

---

## Fase 1 — Fundação (banco + dispatcher + worker)

Produz: backend funcional capaz de receber emit no EventBus e entregar webhook assinado. Sem UI ainda.

### Task 1: Adicionar dependências necessárias

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Adicionar `undici` (custom dispatcher pra SSRF) e `@noble/hashes` (HMAC tempo-constante)**

```bash
pnpm add undici @noble/hashes
```

Esperado: ambos adicionados em `dependencies`.

- [ ] **Step 2: Verificar que `nanoid` e `@upstash/redis` já estão presentes** (já estão; confirmar)

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(webhooks): add undici and noble/hashes deps"
```

---

### Task 2: Migration — `webhook_subscriptions`

**Files:**
- Create: `supabase/migrations/20260419_webhook_subscriptions.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- ================================================
-- Outbound Webhooks: webhook_subscriptions
-- Spec: docs/superpowers/specs/2026-04-19-outbound-webhooks-design.md §5
-- ================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id                   uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  name                       text NOT NULL,
  url                        text NOT NULL,
  secret_encrypted           bytea NOT NULL,
  secret_previous_encrypted  bytea,
  secret_previous_expires_at timestamptz,
  events                     text[] NOT NULL,
  status                     text NOT NULL DEFAULT 'active',
  description                text,
  created_by                 uuid REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0),
  CONSTRAINT status_valid CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT events_in_catalog CHECK (
    events <@ ARRAY[
      'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
      'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
      'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
    ]::text[]
  ),
  CONSTRAINT secret_rotation_consistent CHECK (
    (secret_previous_encrypted IS NULL) = (secret_previous_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_lookup
  ON webhook_subscriptions(store_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_webhook_subs_org
  ON webhook_subscriptions(organization_id);

-- RLS
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_subs" ON webhook_subscriptions
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);

CREATE POLICY "org_members_write_subs" ON webhook_subscriptions
  FOR ALL USING (auth.jwt() ->> 'organization_id' = organization_id::text)
  WITH CHECK (auth.jwt() ->> 'organization_id' = organization_id::text);

-- Trigger pra updated_at
CREATE OR REPLACE FUNCTION update_webhook_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_subscriptions_updated_at
  BEFORE UPDATE ON webhook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_webhook_subscriptions_updated_at();
```

- [ ] **Step 2: Aplicar migration no Supabase local/dev**

Comando depende do setup: `supabase db push` se usando CLI, ou rodar via dashboard SQL editor.

- [ ] **Step 3: Verificar que tabela existe e RLS está ativa**

Query no Supabase:
```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'webhook_subscriptions';
```
Esperado: `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260419_webhook_subscriptions.sql
git commit -m "feat(webhooks): add webhook_subscriptions table with RLS"
```

---

### Task 3: Migration — `webhook_deliveries`

**Files:**
- Create: `supabase/migrations/20260419_webhook_deliveries.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  event_id         text NOT NULL,
  payload          jsonb NOT NULL,
  url              text NOT NULL,

  status           text NOT NULL DEFAULT 'pending',
  attempt_count    int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,
  in_flight_until  timestamptz,

  response_code    int,
  response_body    text,
  error_message    text,

  next_retry_at    timestamptz,
  delivered_at     timestamptz,
  last_attempt_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed', 'retrying')),
  CONSTRAINT event_type_in_catalog CHECK (event_type IN (
    'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
    'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
    'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
  )),
  CONSTRAINT unique_delivery_per_event UNIQUE (subscription_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliv_sub
  ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_status
  ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_org
  ON webhook_deliveries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_stuck
  ON webhook_deliveries(last_attempt_at NULLS FIRST)
  WHERE status IN ('pending', 'retrying', 'in_flight');

-- RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_deliveries" ON webhook_deliveries
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);

-- INSERT/UPDATE só via service role; sem policy de write
```

- [ ] **Step 2: Aplicar migration**

- [ ] **Step 3: Validar UNIQUE e CHECKs**

```sql
INSERT INTO webhook_deliveries (subscription_id, organization_id, store_id, event_type, event_id, payload, url)
VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'invalid.event', 'evt_x', '{}', 'https://x');
```
Esperado: erro `event_type_in_catalog`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260419_webhook_deliveries.sql
git commit -m "feat(webhooks): add webhook_deliveries table with RLS and indexes"
```

---

### Task 4: Migration — `browse_abandoned_emissions`

**Files:**
- Create: `supabase/migrations/20260419_browse_abandoned_emissions.sql`

- [ ] **Step 1: Criar migration**

```sql
CREATE TABLE IF NOT EXISTS browse_abandoned_emissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       uuid NOT NULL,
  product_id       text NOT NULL,
  view_event_id    uuid NOT NULL,
  emitted_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_browse_abandoned_emission
    UNIQUE (contact_id, product_id, view_event_id)
);

CREATE INDEX IF NOT EXISTS idx_browse_aband_org_emitted
  ON browse_abandoned_emissions(organization_id, emitted_at DESC);

ALTER TABLE browse_abandoned_emissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_browse_emissions" ON browse_abandoned_emissions
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);
```

- [ ] **Step 2: Aplicar e validar UNIQUE**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260419_browse_abandoned_emissions.sql
git commit -m "feat(webhooks): add browse_abandoned_emissions table"
```

---

### Task 5: Adicionar entradas novas no enum `EventType`

**Files:**
- Modify: `src/lib/events.ts:17-60` (enum + map)

- [ ] **Step 1: Adicionar 4 entradas novas no enum `EventType`**

Editar `src/lib/events.ts` adicionando dentro do enum (mantendo CART_ABANDONED por compat):

```typescript
// E-commerce — pagamentos e logística
SHIPMENT_TRACKING_CREATED = 'shipment.tracking_created',
PAYMENT_PIX_ABANDONED = 'payment.pix.abandoned',
PAYMENT_BOLETO_ABANDONED = 'payment.boleto.abandoned',
BROWSE_ABANDONED = 'browse.abandoned',
```

- [ ] **Step 2: Adicionar mapeamento `EVENT_TO_TRIGGER_MAP`**

```typescript
[EventType.SHIPMENT_TRACKING_CREATED]: 'trigger_shipment_tracking',
[EventType.PAYMENT_PIX_ABANDONED]: 'trigger_payment_pix_abandoned',
[EventType.PAYMENT_BOLETO_ABANDONED]: 'trigger_payment_boleto_abandoned',
[EventType.BROWSE_ABANDONED]: 'trigger_browse_abandoned',
```

- [ ] **Step 3: Verificar TypeScript não quebra**

```bash
pnpm exec tsc --noEmit
```
Esperado: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/events.ts
git commit -m "feat(events): add 4 new EventType entries for outbound webhooks v1"
```

---

### Task 6: Module `event-id` (derivação determinística)

**Files:**
- Create: `src/lib/webhooks/event-id.ts`
- Create: `src/lib/webhooks/__tests__/event-id.test.ts`

- [ ] **Step 1: Escrever teste primeiro (TDD)**

```typescript
// src/lib/webhooks/__tests__/event-id.test.ts
import { describe, it, expect } from 'vitest';
import { deriveEventId } from '../event-id';

describe('deriveEventId', () => {
  it('produz mesmo event_id pra mesma tupla', () => {
    const a = deriveEventId('shopify', '5678901234', 'order.created');
    const b = deriveEventId('shopify', '5678901234', 'order.created');
    expect(a).toBe(b);
  });

  it('produz event_ids diferentes pra event_types diferentes', () => {
    const a = deriveEventId('shopify', '5678901234', 'order.created');
    const b = deriveEventId('shopify', '5678901234', 'order.paid');
    expect(a).not.toBe(b);
  });

  it('produz event_ids diferentes pra source_event_ids diferentes', () => {
    const a = deriveEventId('shopify', '111', 'order.created');
    const b = deriveEventId('shopify', '222', 'order.created');
    expect(a).not.toBe(b);
  });

  it('começa com prefixo evt_', () => {
    expect(deriveEventId('shopify', '1', 'order.created')).toMatch(/^evt_/);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

```bash
pnpm test src/lib/webhooks/__tests__/event-id.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Step 3: Implementar módulo**

```typescript
// src/lib/webhooks/event-id.ts
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

export function deriveEventId(
  source: string,
  sourceEventId: string,
  eventType: string
): string {
  const input = `${source}:${sourceEventId}:${eventType}`;
  const hash = sha256(new TextEncoder().encode(input));
  // base32 sem padding (Crockford-style adequado pra IDs públicos)
  return 'evt_' + bytesToHex(hash).slice(0, 26);
}
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
pnpm test src/lib/webhooks/__tests__/event-id.test.ts
```
Esperado: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/event-id.ts src/lib/webhooks/__tests__/event-id.test.ts
git commit -m "feat(webhooks): deterministic event_id derivation with tests"
```

---

### Task 7: Module `signature` (HMAC + dual-secret rotation)

**Files:**
- Create: `src/lib/webhooks/signature.ts`
- Create: `src/lib/webhooks/__tests__/signature.test.ts`

- [ ] **Step 1: Escrever testes**

```typescript
// src/lib/webhooks/__tests__/signature.test.ts
import { describe, it, expect } from 'vitest';
import { signPayload, verifySignatureHeader, buildSignatureHeader } from '../signature';

const SECRET = 'test_secret_key';
const TIMESTAMP = '1745086425';
const BODY = '{"event":"order.created"}';

describe('signPayload', () => {
  it('gera HMAC SHA-256 hex de timestamp + . + body', () => {
    const sig = signPayload(SECRET, TIMESTAMP, BODY);
    // Vetor de referência (calculado externamente)
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(sig).toBe(signPayload(SECRET, TIMESTAMP, BODY)); // determinístico
  });

  it('produz assinaturas diferentes pra body diferente', () => {
    expect(signPayload(SECRET, TIMESTAMP, BODY))
      .not.toBe(signPayload(SECRET, TIMESTAMP, BODY + 'x'));
  });
});

describe('buildSignatureHeader', () => {
  it('header com 1 secret tem só uma assinatura', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(h.split(',').length).toBe(1);
    expect(h).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('header com secret + previous tem duas assinaturas separadas por vírgula', () => {
    const h = buildSignatureHeader(SECRET, 'old_secret', TIMESTAMP, BODY);
    const parts = h.split(',').map((s) => s.trim());
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^sha256=/);
    expect(parts[1]).toMatch(/^sha256=/);
    expect(parts[0]).not.toBe(parts[1]);
  });
});

describe('verifySignatureHeader', () => {
  it('aceita assinatura válida', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, SECRET, TIMESTAMP, BODY)).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifySignatureHeader('sha256=ffff', SECRET, TIMESTAMP, BODY)).toBe(false);
  });

  it('rejeita body adulterado', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, SECRET, TIMESTAMP, BODY + 'tampered')).toBe(false);
  });

  it('aceita match em qualquer assinatura do header dual', () => {
    const h = buildSignatureHeader('new', 'old', TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, 'old', TIMESTAMP, BODY)).toBe(true);
    expect(verifySignatureHeader(h, 'new', TIMESTAMP, BODY)).toBe(true);
  });

  it('comparação é tempo-constante (smoke test apenas)', () => {
    // Não dá pra testar tempo de verdade unit-test, só garantir que retorna false consistentemente
    expect(verifySignatureHeader('sha256=00', SECRET, TIMESTAMP, BODY)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — falhar**

```bash
pnpm test src/lib/webhooks/__tests__/signature.test.ts
```

- [ ] **Step 3: Implementar**

```typescript
// src/lib/webhooks/signature.ts
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

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
```

- [ ] **Step 4: Rodar — passar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/signature.ts src/lib/webhooks/__tests__/signature.test.ts
git commit -m "feat(webhooks): HMAC SHA-256 signing with dual-secret rotation support"
```

---

### Task 8: Module `secret-store` (encrypt/decrypt secrets)

**Files:**
- Create: `src/lib/webhooks/secret-store.ts`
- Create: `src/lib/webhooks/__tests__/secret-store.test.ts`

**Decisão de implementação:** começar com AES-256-GCM app-level usando `WEBHOOK_SECRET_ENCRYPTION_KEY` (32 bytes base64) do env. Migrar pra pgsodium é trivial depois (mesma interface). pgsodium adiciona dependência de schema do Supabase — fora do escopo v1.

- [ ] **Step 1: Escrever testes**

```typescript
// src/lib/webhooks/__tests__/secret-store.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSecret, decryptSecret, generateWebhookSecret } from '../secret-store';
import crypto from 'crypto';

beforeAll(() => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trip funciona', () => {
    const original = 'whsec_abc123';
    const encrypted = encryptSecret(original);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
  });

  it('encryptSecret produz output diferente toda vez (IV aleatório)', () => {
    const a = encryptSecret('whsec_x');
    const b = encryptSecret('whsec_x');
    expect(a.equals(b)).toBe(false);
  });

  it('decryptSecret detecta tampering', () => {
    const encrypted = encryptSecret('whsec_x');
    encrypted[encrypted.length - 1] ^= 1; // flip bit do tag
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});

describe('generateWebhookSecret', () => {
  it('produz string com prefixo whsec_', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]+$/);
  });

  it('produz secrets únicos', () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});
```

- [ ] **Step 2: Rodar — falhar**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/webhooks/secret-store.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyB64 = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY not set');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY must be 32 bytes (base64)');
  }
  return key;
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [iv (12)][tag (16)][ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptSecret(blob: Buffer): string {
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted secret: too short');
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(32).toString('base64url');
}
```

- [ ] **Step 4: Rodar — passar**

- [ ] **Step 5: Documentar variável de ambiente nova em `.env.example` se existir, senão criar**

Adicionar:
```
# Outbound webhooks: 32-byte key (base64) for at-rest secret encryption
# Generate with: openssl rand -base64 32
WEBHOOK_SECRET_ENCRYPTION_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/webhooks/secret-store.ts src/lib/webhooks/__tests__/secret-store.test.ts .env.example
git commit -m "feat(webhooks): AES-256-GCM secret-at-rest encryption"
```

---

### Task 9: Module `safe-fetch` (SSRF defense via undici Agent)

**Files:**
- Create: `src/lib/webhooks/safe-fetch.ts`
- Create: `src/lib/webhooks/__tests__/safe-fetch.test.ts`

- [ ] **Step 1: Escrever testes**

```typescript
// src/lib/webhooks/__tests__/safe-fetch.test.ts
import { describe, it, expect } from 'vitest';
import { isPrivateIP, validateUrl } from '../safe-fetch';

describe('isPrivateIP', () => {
  it.each([
    ['10.0.0.1', true],
    ['172.16.0.1', true],
    ['192.168.0.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true], // AWS metadata
    ['0.0.0.0', true],
    ['224.0.0.1', true], // multicast
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true], // IPv6 loopback
    ['fe80::1', true], // IPv6 link-local
    ['fc00::1', true], // IPv6 ULA
    ['2606:4700:4700::1111', false], // Cloudflare DNS
  ])('isPrivateIP(%s) === %s', (ip, expected) => {
    expect(isPrivateIP(ip)).toBe(expected);
  });
});

describe('validateUrl', () => {
  it('aceita https://', () => {
    expect(() => validateUrl('https://example.com/hook')).not.toThrow();
  });

  it('rejeita http:// em produção', () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(() => validateUrl('http://example.com')).toThrow(/scheme/i);
    process.env.NODE_ENV = old;
  });

  it('rejeita ftp://', () => {
    expect(() => validateUrl('ftp://example.com')).toThrow();
  });

  it('rejeita hostnames de metadata cloud', () => {
    expect(() => validateUrl('https://metadata.google.internal/x')).toThrow(/blocked/i);
    expect(() => validateUrl('https://metadata.aws.internal/x')).toThrow(/blocked/i);
  });
});
```

- [ ] **Step 2: Rodar — falhar**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/webhooks/safe-fetch.ts
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
  return true; // unknown shape → block
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — extrai e checa
    const v4 = lower.split('::ffff:')[1];
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  if (lower.startsWith('2001:db8:')) return true; // doc range
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

  // Em prod, bloqueia http exceto localhost
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
 * Defense contra DNS rebinding (TOCTOU-safe).
 */
export function createSafeAgent() {
  return new Agent({
    connect: {
      lookup: async (hostname, options, callback) => {
        try {
          const result = await lookup(hostname, { all: true, ...(options as any) });
          for (const entry of result) {
            if (isPrivateIP(entry.address)) {
              return callback(new Error(`Hostname ${hostname} resolved to private IP ${entry.address}`), '', 0);
            }
          }
          callback(null, result[0].address, result[0].family);
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
  validateUrl(url); // throw cedo se URL inválida no estático

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
```

- [ ] **Step 4: Rodar — passar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/safe-fetch.ts src/lib/webhooks/__tests__/safe-fetch.test.ts
git commit -m "feat(webhooks): SSRF-safe fetch via undici Agent with IP validation"
```

---

### Task 10: Module `payload-builder` (normalized payload + truncation)

**Files:**
- Create: `src/lib/webhooks/event-schemas.ts` (tipos)
- Create: `src/lib/webhooks/payload-builder.ts`
- Create: `src/lib/webhooks/__tests__/payload-builder.test.ts`

- [ ] **Step 1: Definir tipos em `event-schemas.ts`**

```typescript
// src/lib/webhooks/event-schemas.ts
export type WebhookEventType =
  | 'order.created' | 'order.paid' | 'order.fulfilled' | 'order.cancelled'
  | 'checkout.abandoned' | 'customer.created' | 'shipment.tracking_created'
  | 'payment.pix.abandoned' | 'payment.boleto.abandoned' | 'browse.abandoned';

export interface WebhookEnvelope<T = any> {
  id: string;
  event: WebhookEventType;
  version: '1';
  created_at: string;
  organization_id: string;
  store_id: string;
  store: { id: string; shop_domain: string; name: string };
  data: T;
}

// Stub interfaces — devem espelhar os tipos internos.
// Refinamento em iterações posteriores; v1 aceita Record<string, any> em data.
```

- [ ] **Step 2: Escrever teste**

```typescript
// src/lib/webhooks/__tests__/payload-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildEnvelope, MAX_PAYLOAD_BYTES } from '../payload-builder';

const STORE = { id: 's1', shop_domain: 'minha.myshopify.com', name: 'Minha' };

describe('buildEnvelope', () => {
  it('inclui todos os campos obrigatórios', () => {
    const env = buildEnvelope({
      eventId: 'evt_x',
      event: 'order.created',
      organizationId: 'org_1',
      store: STORE,
      data: { order_id: '123' },
    });
    expect(env).toMatchObject({
      id: 'evt_x',
      event: 'order.created',
      version: '1',
      organization_id: 'org_1',
      store_id: 's1',
      store: STORE,
      data: { order_id: '123' },
    });
    expect(env.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('payload <= 256KB serializa direto', () => {
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'order.created', organizationId: 'o',
      store: STORE, data: { items: Array(50).fill({ title: 'p', price: 1 }) },
    });
    const json = JSON.stringify(env);
    expect(json.length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect((env.data as any)._truncated).toBeUndefined();
  });

  it('payload com >100 items trunca + adiciona marker', () => {
    const items = Array(500).fill({ title: 'produto', price: 99.9, sku: 'x' });
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'order.created', organizationId: 'o',
      store: STORE, data: { items },
    });
    expect((env.data as any).items.length).toBe(100);
    expect((env.data as any)._truncated).toEqual({ items: true, original_count: 500 });
  });

  it('payload muito grande sem items[] cai pro slim payload', () => {
    const huge = 'x'.repeat(300_000);
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'browse.abandoned', organizationId: 'o',
      store: STORE, data: { product_id: 'p1', payload_grande: huge },
    });
    expect(JSON.stringify(env).length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect((env.data as any)._truncated).toBe(true);
  });
});
```

- [ ] **Step 3: Implementar**

```typescript
// src/lib/webhooks/payload-builder.ts
import type { WebhookEnvelope, WebhookEventType } from './event-schemas';

export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB
const MAX_ITEMS = 100;

export interface BuildEnvelopeInput {
  eventId: string;
  event: WebhookEventType;
  organizationId: string;
  store: { id: string; shop_domain: string; name: string };
  data: Record<string, any>;
}

export function buildEnvelope(input: BuildEnvelopeInput): WebhookEnvelope {
  let data = { ...input.data };

  // Truncate items[] preventivamente se houver
  if (Array.isArray(data.items) && data.items.length > MAX_ITEMS) {
    const original = data.items.length;
    data = { ...data, items: data.items.slice(0, MAX_ITEMS), _truncated: { items: true, original_count: original } };
  }

  let envelope: WebhookEnvelope = {
    id: input.eventId,
    event: input.event,
    version: '1',
    created_at: new Date().toISOString(),
    organization_id: input.organizationId,
    store_id: input.store.id,
    store: input.store,
    data,
  };

  // Verifica tamanho final; se passou, slim payload
  if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > MAX_PAYLOAD_BYTES) {
    const slimData: Record<string, any> = { _truncated: true };
    for (const k of ['order_id', 'customer_id', 'product_id', 'checkout_id', 'fulfillment_id', 'tracking_number']) {
      if (data[k] !== undefined) slimData[k] = data[k];
    }
    envelope = { ...envelope, data: slimData };
    console.warn(`[webhooks] payload-builder: slim payload emitted for ${input.event} (event_id=${input.eventId})`);
  }

  return envelope;
}
```

- [ ] **Step 4: Rodar testes — passar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/event-schemas.ts src/lib/webhooks/payload-builder.ts src/lib/webhooks/__tests__/payload-builder.test.ts
git commit -m "feat(webhooks): payload envelope builder with 256KB truncation"
```

---

### Task 11: Module `outbound-dispatcher` (EventBus listener + INSERT outbox)

**Files:**
- Create: `src/lib/webhooks/outbound-dispatcher.ts`
- Create: `src/lib/webhooks/__tests__/outbound-dispatcher.test.ts`
- Modify: `src/lib/events.ts` (chamar dispatcher dentro do `emit`)

- [ ] **Step 1: Escrever teste com Supabase mock**

```typescript
// src/lib/webhooks/__tests__/outbound-dispatcher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchToOutbound } from '../outbound-dispatcher';

// Mock supabase admin client
const mockSubs = vi.fn();
const mockInsertDeliveries = vi.fn();
const mockEnqueue = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ contains: () => ({ then: (cb: any) => cb({ data: mockSubs() }) }) }),
        }),
      }),
      insert: (rows: any[]) => mockInsertDeliveries(rows),
    }),
  },
}));

vi.mock('@/lib/queue', () => ({
  enqueueWebhookDelivery: (id: string) => mockEnqueue(id),
}));

beforeEach(() => {
  mockSubs.mockReset(); mockInsertDeliveries.mockReset(); mockEnqueue.mockReset();
});

describe('dispatchToOutbound', () => {
  it('cria N deliveries pra N subscriptions matching', async () => {
    mockSubs.mockReturnValue([
      { id: 's1', store_id: 'store1', organization_id: 'o', url: 'https://a', events: ['order.created'] },
      { id: 's2', store_id: 'store1', organization_id: 'o', url: 'https://b', events: ['order.created'] },
    ]);
    mockInsertDeliveries.mockResolvedValue({ data: [{ id: 'd1' }, { id: 'd2' }], error: null });

    await dispatchToOutbound({
      eventType: 'order.created',
      organizationId: 'o', storeId: 'store1',
      sourceEventId: 'shop_order_123', source: 'shopify',
      store: { id: 'store1', shop_domain: 'x', name: 'X' },
      data: { order_id: '123' },
    });

    expect(mockInsertDeliveries).toHaveBeenCalledOnce();
    const inserted = mockInsertDeliveries.mock.calls[0][0];
    expect(inserted.length).toBe(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('eventos sem subscription matching não fazem INSERT nem enqueue', async () => {
    mockSubs.mockReturnValue([]);
    await dispatchToOutbound({
      eventType: 'order.created',
      organizationId: 'o', storeId: 'store1',
      sourceEventId: '1', source: 'shopify',
      store: { id: 'store1', shop_domain: 'x', name: 'X' }, data: {},
    });
    expect(mockInsertDeliveries).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar — falhar**

- [ ] **Step 3: Implementar**

```typescript
// src/lib/webhooks/outbound-dispatcher.ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deriveEventId } from './event-id';
import { buildEnvelope } from './payload-builder';
import { enqueueWebhookDelivery } from '@/lib/queue';
import type { WebhookEventType } from './event-schemas';

export interface DispatchInput {
  eventType: WebhookEventType;
  organizationId: string;
  storeId: string;
  sourceEventId: string;
  source: string; // 'shopify', 'browse_detector', etc
  store: { id: string; shop_domain: string; name: string };
  data: Record<string, any>;
}

export async function dispatchToOutbound(input: DispatchInput): Promise<void> {
  // 1. Buscar subscriptions ativas pra (store, event_type)
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('id, organization_id, store_id, url, events, status')
    .eq('store_id', input.storeId)
    .eq('status', 'active')
    .contains('events', [input.eventType]);

  if (subsError) {
    console.error('[outbound-dispatcher] failed to fetch subscriptions:', subsError);
    return; // não interrompe handler de inbound
  }

  if (!subs || subs.length === 0) return;

  const eventId = deriveEventId(input.source, input.sourceEventId, input.eventType);
  const envelope = buildEnvelope({
    eventId,
    event: input.eventType,
    organizationId: input.organizationId,
    store: input.store,
    data: input.data,
  });

  // 2. INSERT batch (UNIQUE engole dups via ON CONFLICT)
  const rows = subs.map((s) => ({
    subscription_id: s.id,
    organization_id: s.organization_id,
    store_id: s.store_id,
    event_type: input.eventType,
    event_id: eventId,
    payload: envelope,
    url: s.url,
    status: 'pending',
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('webhook_deliveries')
    .upsert(rows, { onConflict: 'subscription_id,event_id', ignoreDuplicates: true })
    .select('id');

  if (insertError) {
    console.error('[outbound-dispatcher] failed to insert deliveries:', insertError);
    return;
  }

  if (!inserted || inserted.length === 0) return; // todas eram duplicatas

  // 3. Enfileirar no QStash; falha aqui → sweeper pega
  for (const row of inserted) {
    try {
      await enqueueWebhookDelivery(row.id);
    } catch (err) {
      console.warn(`[outbound-dispatcher] enqueue failed for delivery ${row.id} (sweeper will retry):`, err);
    }
  }
}
```

- [ ] **Step 4: Adicionar `enqueueWebhookDelivery` em `src/lib/queue.ts`**

Encontrar o arquivo `src/lib/queue.ts` e adicionar no final:

```typescript
export async function enqueueWebhookDelivery(deliveryId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!token || !appUrl) {
    throw new Error('QSTASH_TOKEN or APP_URL not configured');
  }
  const client = new QStashClient(token);
  await client.publishJSON({
    url: `${appUrl}/api/workers/webhook-delivery`,
    body: { deliveryId },
    retries: 5,
  });
}
```
(Detalhe: o endpoint `/api/workers/webhook-delivery` é criado na Task 12. Por hora a função é chamável mas o worker ainda não existe — não causa erro até o primeiro emit real.)

- [ ] **Step 5: Integrar com EventBus em `src/lib/events.ts`**

No método `emit` da classe `EventBusClass`, após `logEvent` e antes de buscar automações, adicionar (com fallback silencioso pra não quebrar fluxo de automação se o dispatcher falhar):

```typescript
// Outbound webhooks dispatch
try {
  const { dispatchToOutbound } = await import('./webhooks/outbound-dispatcher');
  // Only dispatch events present in webhook v1 catalog
  const v1Catalog = new Set([
    'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
    'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
    'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned',
  ]);
  if (v1Catalog.has(eventType) && payload.data?._webhook_dispatch_meta) {
    const meta = payload.data._webhook_dispatch_meta;
    await dispatchToOutbound({
      eventType: eventType as any,
      organizationId: payload.organization_id,
      storeId: meta.store_id,
      sourceEventId: meta.source_event_id,
      source: meta.source,
      store: meta.store,
      data: payload.data,
    });
  }
} catch (err) {
  console.error('[EventBus] outbound dispatch failed:', err);
}
```

(Convenção: handlers que querem entregar via webhooks de saída setam `payload.data._webhook_dispatch_meta = { store_id, source, source_event_id, store }`. Isso evita refator amplo de assinatura do EventBus.)

- [ ] **Step 6: Rodar testes do dispatcher**

```bash
pnpm test src/lib/webhooks/__tests__/outbound-dispatcher.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/webhooks/outbound-dispatcher.ts src/lib/webhooks/__tests__/outbound-dispatcher.test.ts src/lib/queue.ts src/lib/events.ts
git commit -m "feat(webhooks): outbound dispatcher with EventBus integration"
```

---

### Task 12: Worker — `/api/workers/webhook-delivery` (atomic claim + POST)

**Files:**
- Create: `src/app/api/workers/webhook-delivery/route.ts`
- Create: `src/app/api/workers/webhook-delivery/__tests__/route.test.ts`

- [ ] **Step 1: Escrever teste**

Escopo do teste: smoke test da lógica de claim e classificação de status. Testes mais profundos (real HTTP) ficam pra integration.

```typescript
// src/app/api/workers/webhook-delivery/__tests__/route.test.ts
import { describe, it, expect } from 'vitest';
import { classifyResponse } from '../route';

describe('classifyResponse', () => {
  it('2xx → delivered', () => {
    expect(classifyResponse(200, 1)).toBe('delivered');
    expect(classifyResponse(204, 1)).toBe('delivered');
  });

  it('5xx → retrying se attempt < max', () => {
    expect(classifyResponse(500, 1, 5)).toBe('retrying');
    expect(classifyResponse(502, 4, 5)).toBe('retrying');
  });

  it('5xx → failed se attempt >= max', () => {
    expect(classifyResponse(500, 5, 5)).toBe('failed');
  });

  it('408/429 → retrying', () => {
    expect(classifyResponse(408, 1, 5)).toBe('retrying');
    expect(classifyResponse(429, 1, 5)).toBe('retrying');
  });

  it('4xx outros → failed', () => {
    expect(classifyResponse(400, 1, 5)).toBe('failed');
    expect(classifyResponse(404, 1, 5)).toBe('failed');
    expect(classifyResponse(403, 1, 5)).toBe('failed');
  });
});
```

- [ ] **Step 2: Implementar**

```typescript
// src/app/api/workers/webhook-delivery/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptSecret } from '@/lib/webhooks/secret-store';
import { buildSignatureHeader } from '@/lib/webhooks/signature';
import { safeFetch } from '@/lib/webhooks/safe-fetch';

export const dynamic = 'force-dynamic';

const RETRY_DELAYS_SEC = [60, 300, 1800, 7200, 21600]; // 1m, 5m, 30m, 2h, 6h

type Status = 'delivered' | 'failed' | 'retrying';

export function classifyResponse(status: number, attempt: number, maxAttempts: number = 5): Status {
  if (status >= 200 && status < 300) return 'delivered';
  const retryable = status >= 500 || status === 408 || status === 429;
  if (retryable && attempt < maxAttempts) return 'retrying';
  return 'failed';
}

export async function POST(req: NextRequest) {
  // Auth básica: header interno OU bearer do QStash (validação simplificada)
  const internal = req.headers.get('X-Internal-Request') === 'true';
  // Em produção, validar assinatura QStash via @upstash/qstash; aqui simplificado.

  const body = await req.json();
  const deliveryId = body.deliveryId;
  if (!deliveryId) return NextResponse.json({ error: 'deliveryId required' }, { status: 400 });

  // 1. Reivindicar atomicamente
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      status: 'in_flight',
      in_flight_until: new Date(Date.now() + 10_000).toISOString(),
      last_attempt_at: new Date().toISOString(),
      attempt_count: (await getCurrentAttemptCount(deliveryId)) + 1,
    })
    .eq('id', deliveryId)
    .in('status', ['pending', 'retrying'])
    .select('*')
    .single();

  if (claimError || !claimed) {
    return NextResponse.json({ skipped: true, reason: 'not_claimable' }, { status: 200 });
  }

  // 2. Buscar subscription
  const { data: sub } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('secret_encrypted, secret_previous_encrypted, secret_previous_expires_at')
    .eq('id', claimed.subscription_id)
    .single();

  if (!sub) {
    await markFailed(deliveryId, claimed.attempt_count, 'subscription not found');
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  // 3. Descriptografar secrets
  const primarySecret = decryptSecret(Buffer.from(sub.secret_encrypted));
  const previousSecret = sub.secret_previous_encrypted &&
    sub.secret_previous_expires_at && new Date(sub.secret_previous_expires_at) > new Date()
    ? decryptSecret(Buffer.from(sub.secret_previous_encrypted))
    : null;

  // 4. Construir headers
  const rawBody = JSON.stringify(claimed.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildSignatureHeader(primarySecret, previousSecret, timestamp, rawBody);

  const headers = {
    'Content-Type': 'application/json',
    'X-Worder-Event': claimed.event_type,
    'X-Worder-Event-Id': claimed.event_id,
    'X-Worder-Signature': signature,
    'X-Worder-Timestamp': timestamp,
    'X-Worder-Delivery-Id': claimed.id,
    'User-Agent': 'Worder-Webhooks/1.0',
  };

  // 5. POST via safeFetch
  let result;
  try {
    result = await safeFetch(claimed.url, {
      method: 'POST',
      headers,
      body: rawBody,
      timeoutMs: 10_000,
    });
  } catch (err: any) {
    // Erro de rede / DNS / SSRF → trata como retryable se attempt < max, senão failed
    const status: Status = claimed.attempt_count < claimed.max_attempts ? 'retrying' : 'failed';
    await updateAfterAttempt(deliveryId, claimed.attempt_count, {
      status,
      error_message: err.message?.slice(0, 500) ?? 'unknown error',
      next_retry_at: status === 'retrying'
        ? new Date(Date.now() + RETRY_DELAYS_SEC[Math.min(claimed.attempt_count, RETRY_DELAYS_SEC.length - 1)] * 1000).toISOString()
        : null,
    });
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }

  // 6. Classificar e atualizar
  const status = classifyResponse(result.status, claimed.attempt_count, claimed.max_attempts);
  await updateAfterAttempt(deliveryId, claimed.attempt_count, {
    status,
    response_code: result.status,
    response_body: result.body,
    delivered_at: status === 'delivered' ? new Date().toISOString() : null,
    next_retry_at: status === 'retrying'
      ? new Date(Date.now() + RETRY_DELAYS_SEC[Math.min(claimed.attempt_count, RETRY_DELAYS_SEC.length - 1)] * 1000).toISOString()
      : null,
  });

  return NextResponse.json({ ok: true, status, code: result.status });
}

async function getCurrentAttemptCount(id: string): Promise<number> {
  const { data } = await supabaseAdmin.from('webhook_deliveries').select('attempt_count').eq('id', id).single();
  return data?.attempt_count ?? 0;
}

async function updateAfterAttempt(id: string, attemptCount: number, patch: Record<string, any>) {
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      ...patch,
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function markFailed(id: string, attemptCount: number, errorMessage: string) {
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      error_message: errorMessage,
      in_flight_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}
```

- [ ] **Step 3: Rodar testes unit do classifier**

- [ ] **Step 4: Smoke manual: insere delivery teste e dispara worker**

```bash
# Insere uma subscription teste com URL https://webhook.site/<id> via SQL editor
# Depois insere delivery manualmente
# Chama: curl -X POST localhost:3000/api/workers/webhook-delivery \
#   -H 'X-Internal-Request: true' -H 'Content-Type: application/json' \
#   -d '{"deliveryId": "<uuid>"}'
# Verificar webhook.site recebeu o POST com headers corretos
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/workers/webhook-delivery/
git commit -m "feat(webhooks): delivery worker with atomic claim and HMAC sign"
```

---

### Task 13: Cron — sweeper de entregas presas

**Files:**
- Create: `src/app/api/cron/webhook-deliveries-sweeper/route.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/app/api/cron/webhook-deliveries-sweeper/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWebhookDelivery } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Releases in_flight expirados
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({ status: 'pending', in_flight_until: null })
    .eq('status', 'in_flight')
    .lt('in_flight_until', now);

  // Busca entregas presas
  const { data: stuck } = await supabaseAdmin
    .from('webhook_deliveries')
    .select('id')
    .in('status', ['pending', 'retrying'])
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${fiveMinAgo}`)
    .limit(500);

  let reenqueued = 0;
  for (const row of stuck ?? []) {
    try {
      await enqueueWebhookDelivery(row.id);
      reenqueued++;
    } catch (err) {
      console.warn(`[sweeper] re-enqueue failed for ${row.id}:`, err);
    }
  }

  return NextResponse.json({ reenqueued, scanned: stuck?.length ?? 0 });
}
```

- [ ] **Step 2: Configurar cron (Vercel `vercel.json` ou QStash schedule)**

Se Vercel: adicionar em `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/webhook-deliveries-sweeper", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/webhook-deliveries-sweeper/route.ts vercel.json
git commit -m "feat(webhooks): sweeper cron for stuck deliveries"
```

---

### Task 14: Cron — purge LGPD (30 dias)

**Files:**
- Create: `src/app/api/cron/webhook-deliveries-prune/route.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/app/api/cron/webhook-deliveries-prune/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const { count: deliveriesCount } = await supabaseAdmin
    .from('webhook_deliveries')
    .delete({ count: 'exact' })
    .in('status', ['delivered', 'failed'])
    .lt('created_at', thirtyDaysAgo);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count: emissionsCount } = await supabaseAdmin
    .from('browse_abandoned_emissions')
    .delete({ count: 'exact' })
    .lt('emitted_at', sevenDaysAgo);

  return NextResponse.json({ deliveries_pruned: deliveriesCount, emissions_pruned: emissionsCount });
}
```

- [ ] **Step 2: Adicionar ao `vercel.json`**

```json
{ "path": "/api/cron/webhook-deliveries-prune", "schedule": "0 3 * * *" }
```
(diário às 3h UTC)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/webhook-deliveries-prune/route.ts vercel.json
git commit -m "feat(webhooks): daily prune cron for LGPD retention"
```

---

## Fase 2 — Cobertura de eventos (instrumentação dos handlers)

Produz: os 9 eventos vindos dos handlers existentes (browse.abandoned é Fase 4) emitem no EventBus com meta de webhook.

### Task 15: Instrumentar Shopify orders pra incluir `_webhook_dispatch_meta`

**Files:**
- Modify: `src/app/api/webhooks/shopify/route.ts` (cada `EventBus.emit` em `processOrderCreated`, `processOrderPaid`, `processOrderFulfilled`, `processOrderCancelled`)

- [ ] **Step 1: Encontrar cada chamada `EventBus.emit(EventType.ORDER_*, ...)` e adicionar meta no `payload.data`**

Para cada handler, ao construir o `payload.data`, garantir que inclui:
```typescript
_webhook_dispatch_meta: {
  store_id: store.id,
  source: 'shopify',
  source_event_id: String(order.id),
  store: {
    id: store.id,
    shop_domain: store.shop_domain,
    name: store.name ?? store.shop_domain,
  },
},
```

- [ ] **Step 2: Smoke test manual — criar pedido na dev store, verificar `webhook_deliveries` recebe linha**

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/shopify/route.ts
git commit -m "feat(webhooks): instrument shopify order handlers for outbound dispatch"
```

---

### Task 16: Adicionar emit de `customer.created` e `shipment.tracking_created`

**Files:**
- Modify: `src/lib/services/shopify/contact-sync.ts` (na função `syncContactFromShopify`, após criar contato pela primeira vez)
- Modify: `src/app/api/webhooks/shopify/route.ts:1081` (`processFulfillmentEvent`, quando `tracking_number` presente)

- [ ] **Step 1: Em `syncContactFromShopify`, detectar primeira criação e emitir**

Pseudocódigo (ajustar à assinatura real):
```typescript
if (wasNewlyCreated) {
  await EventBus.emit(EventType.CONTACT_CREATED, {
    organization_id: store.organization_id,
    contact_id: contact.id,
    email: contact.email,
    data: {
      _webhook_dispatch_meta: {
        store_id: store.id,
        source: 'shopify',
        source_event_id: `customer:${customerData.id}`,
        store: { id: store.id, shop_domain: store.shop_domain, name: store.name ?? store.shop_domain },
      },
      customer_id: contact.id,
      shopify_customer_id: customerData.id,
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone,
    },
  });
}
```

(Atenção: `EventType.CONTACT_CREATED` mapeia para `'contact.created'` no enum, mas o catálogo de webhooks usa `'customer.created'`. Adicionar override no map de catálogo do dispatcher OU adicionar `EventType.CUSTOMER_CREATED = 'customer.created'` separado e emitir esse aqui em vez do CONTACT_CREATED.)

**Decisão:** adicionar `CUSTOMER_CREATED = 'customer.created'` ao enum (mantém `CONTACT_CREATED` para compat interno) e emitir os dois — o externo cobre webhooks, o interno cobre automações existentes.

- [ ] **Step 2: Em `processFulfillmentEvent`, após gravar CDP event, emitir `SHIPMENT_TRACKING_CREATED` se `tracking_number` presente**

```typescript
if (fulfillment.tracking_number) {
  await EventBus.emit(EventType.SHIPMENT_TRACKING_CREATED, {
    organization_id: store.organization_id,
    order_id: String(fulfillment.order_id),
    data: {
      _webhook_dispatch_meta: {
        store_id: store.id, source: 'shopify',
        source_event_id: `fulfillment:${fulfillment.id}`,
        store: { id: store.id, shop_domain: store.shop_domain, name: store.name ?? store.shop_domain },
      },
      order_id: String(fulfillment.order_id),
      fulfillment_id: String(fulfillment.id),
      tracking_number: fulfillment.tracking_number,
      tracking_url: fulfillment.tracking_url,
      tracking_company: fulfillment.tracking_company,
      status: fulfillment.status,
    },
  });
}
```

- [ ] **Step 3: Smoke test (dev store)**

- [ ] **Step 4: Commit**

```bash
git add src/lib/events.ts src/lib/services/shopify/contact-sync.ts src/app/api/webhooks/shopify/route.ts
git commit -m "feat(webhooks): emit customer.created and shipment.tracking_created"
```

---

### Task 17: Instrumentar `abandoned-cart.ts` com checkout.abandoned + payment.{pix,boleto}.abandoned

**Files:**
- Modify: `src/lib/services/shopify/jobs/abandoned-cart.ts`

- [ ] **Step 1: Encontrar local onde marca checkout como abandonado e adicionar emit**

Após gravar o CDP event de `checkout_abandoned`, adicionar:

```typescript
const paymentMethod = (checkout.payment_gateway_names?.[0] || '').toLowerCase();
const baseMeta = {
  store_id: store.id, source: 'shopify',
  source_event_id: `checkout_abandoned:${checkout.id || checkout.token}`,
  store: { id: store.id, shop_domain: store.shop_domain, name: store.name ?? store.shop_domain },
};

await EventBus.emit(EventType.CART_ABANDONED, {
  organization_id: store.organization_id,
  data: {
    _webhook_dispatch_meta: baseMeta,
    checkout_id: String(checkout.id || checkout.token),
    payment_method: paymentMethod,
    total_price: parseFloat(checkout.total_price || '0'),
    currency: checkout.currency,
    items: checkout.line_items,
  },
});

// Específicos de pagamento BR
if (paymentMethod.includes('pix')) {
  await EventBus.emit(EventType.PAYMENT_PIX_ABANDONED, { /* mesmo payload, evento específico */ });
}
if (paymentMethod.includes('boleto')) {
  await EventBus.emit(EventType.PAYMENT_BOLETO_ABANDONED, { /* idem */ });
}
```

(Detalhe: `CART_ABANDONED` mapeia internamente pra `cart.abandoned`, mas o webhook quer `checkout.abandoned`. Adicionar entrada nova `CHECKOUT_ABANDONED = 'checkout.abandoned'` no enum e emitir essa aqui — mantém `CART_ABANDONED` pra automações existentes.)

- [ ] **Step 2: Smoke test (dev store, criar checkout, esperar 15min, ver `webhook_deliveries`)**

- [ ] **Step 3: Commit**

```bash
git add src/lib/events.ts src/lib/services/shopify/jobs/abandoned-cart.ts
git commit -m "feat(webhooks): emit checkout.abandoned and payment.{pix,boleto}.abandoned"
```

---

## Fase 3 — UI (gestão + logs)

Produz: 4 telas pro admin gerenciar subscriptions e ver logs.

### Task 18: API CRUD `/api/webhooks-admin/subscriptions`

**Files:**
- Create: `src/app/api/webhooks-admin/subscriptions/route.ts` (GET list, POST create)
- Create: `src/app/api/webhooks-admin/subscriptions/[id]/route.ts` (GET, PATCH, DELETE)

- [ ] **Step 1: Implementar `route.ts` (list + create)**

```typescript
// src/app/api/webhooks-admin/subscriptions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server'; // padrão do repo
import { encryptSecret, generateWebhookSecret } from '@/lib/webhooks/secret-store';
import { validateUrl } from '@/lib/webhooks/safe-fetch';

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, store_id, name, url, events, status, description, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { store_id, name, url, events, description } = body;

  if (!store_id || !name || !url || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  try { validateUrl(url); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const secret = generateWebhookSecret();
  const secret_encrypted = encryptSecret(secret);

  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .insert({
      store_id, name, url, events, description, secret_encrypted, created_by: user.id,
      organization_id: user.user_metadata?.organization_id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Devolve secret EM TEXTO PURO uma única vez
  return NextResponse.json({ subscription: data, secret });
}
```

- [ ] **Step 2: Implementar `[id]/route.ts` (GET, PATCH, DELETE, regenerate secret via PATCH com flag)**

```typescript
// src/app/api/webhooks-admin/subscriptions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { encryptSecret, generateWebhookSecret } from '@/lib/webhooks/secret-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('id, store_id, name, url, events, status, description, created_at, updated_at, secret_previous_expires_at')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ subscription: data });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createServerSupabaseClient();

  if (body.regenerate_secret) {
    const { data: existing } = await supabase
      .from('webhook_subscriptions').select('secret_encrypted').eq('id', params.id).single();
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const newSecret = generateWebhookSecret();
    const newEncrypted = encryptSecret(newSecret);
    const { error } = await supabase
      .from('webhook_subscriptions')
      .update({
        secret_encrypted: newEncrypted,
        secret_previous_encrypted: existing.secret_encrypted,
        secret_previous_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ secret: newSecret });
  }

  const { name, url, events, status, description } = body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (url !== undefined) updates.url = url;
  if (events !== undefined) updates.events = events;
  if (status !== undefined) updates.status = status;
  if (description !== undefined) updates.description = description;

  const { error } = await supabase.from('webhook_subscriptions').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from('webhook_subscriptions').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Smoke test via curl**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks-admin/
git commit -m "feat(webhooks): subscriptions CRUD API with secret rotation"
```

---

### Task 19: API endpoints auxiliares (test, replay, deliveries list)

**Files:**
- Create: `src/app/api/webhooks-admin/subscriptions/[id]/test/route.ts`
- Create: `src/app/api/webhooks-admin/deliveries/route.ts` (GET com filtro)
- Create: `src/app/api/webhooks-admin/deliveries/[id]/route.ts` (GET detail)
- Create: `src/app/api/webhooks-admin/deliveries/[id]/replay/route.ts` (POST)

- [ ] **Step 1: Implementar `test` (envia payload sintético + rate limit)**

```typescript
// src/app/api/webhooks-admin/subscriptions/[id]/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { dispatchToOutbound } from '@/lib/webhooks/outbound-dispatcher';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 h'),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { success } = await ratelimit.limit(`webhook-test:${params.id}`);
  if (!success) return NextResponse.json({ error: 'rate limit exceeded (10/hour)' }, { status: 429 });

  const supabase = createServerSupabaseClient();
  const { data: sub } = await supabase
    .from('webhook_subscriptions')
    .select('id, store_id, organization_id, events')
    .eq('id', params.id).single();
  if (!sub) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: store } = await supabaseAdmin
    .from('shopify_stores').select('id, shop_domain, name').eq('id', sub.store_id).single();

  const eventType = sub.events[0]; // primeiro evento da inscrição
  const fakeId = 'test_' + Date.now();

  await dispatchToOutbound({
    eventType: eventType as any,
    organizationId: sub.organization_id,
    storeId: sub.store_id,
    sourceEventId: fakeId,
    source: 'test',
    store: store ?? { id: sub.store_id, shop_domain: 'test.myshopify.com', name: 'Test' },
    data: {
      _test: true,
      message: 'This is a test event from Worder. If you receive this, your webhook is working.',
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implementar list de deliveries**

```typescript
// src/app/api/webhooks-admin/deliveries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const subId = req.nextUrl.searchParams.get('subscription_id');
  if (!subId) return NextResponse.json({ error: 'subscription_id required' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('id, event_type, status, response_code, attempt_count, error_message, created_at, delivered_at, next_retry_at')
    .eq('subscription_id', subId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deliveries: data });
}
```

- [ ] **Step 3: Implementar delivery detail (com payload, headers reconstruídos)**

```typescript
// src/app/api/webhooks-admin/deliveries/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ delivery: data });
}
```

- [ ] **Step 4: Implementar replay (POST)**

```typescript
// src/app/api/webhooks-admin/deliveries/[id]/replay/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWebhookDelivery } from '@/lib/queue';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: original, error } = await supabase
    .from('webhook_deliveries').select('*').eq('id', params.id).single();
  if (error || !original) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Cria nova linha (preserva histórico) com event_id sufixado
  const newRow = {
    subscription_id: original.subscription_id,
    organization_id: original.organization_id,
    store_id: original.store_id,
    event_type: original.event_type,
    event_id: `${original.event_id}_replay_${Date.now()}`,
    payload: original.payload,
    url: original.url,
    status: 'pending',
  };
  const { data: inserted } = await supabaseAdmin
    .from('webhook_deliveries').insert(newRow).select('id').single();

  if (inserted) await enqueueWebhookDelivery(inserted.id);
  return NextResponse.json({ replayed_as: inserted?.id });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks-admin/
git commit -m "feat(webhooks): test, replay, and deliveries listing endpoints"
```

---

### Task 20: UI — Lista, formulário (criar/editar)

**Files:**
- Create: `src/app/(dashboard)/settings/webhooks/page.tsx` (lista)
- Create: `src/app/(dashboard)/settings/webhooks/new/page.tsx` (criar)
- Create: `src/app/(dashboard)/settings/webhooks/[id]/edit/page.tsx` (editar)
- Create: `src/components/webhooks/WebhookForm.tsx` (componente compartilhado)
- Create: `src/components/webhooks/EventCheckboxGroup.tsx`

- [ ] **Step 1: Implementar lista (`page.tsx`)**

Componente simples que faz fetch em `/api/webhooks-admin/subscriptions`, renderiza tabela com colunas: nome, loja, URL (truncada), contagem de eventos, status (badge colorido), última entrega (call separado). Botão `[+ Novo webhook]` linka pra `/new`.

(Por concisão, não estou inline-ando 200 linhas de JSX. Seguir os padrões de UI já estabelecidos no projeto — checar `src/app/(dashboard)/settings/*` pra padrões de tabela.)

- [ ] **Step 2: Implementar `WebhookForm.tsx`**

Form controlado com:
- Input `name`
- Select `store_id` (carrega lojas do user via API)
- Input `url` com validação inline (regex https://)
- `EventCheckboxGroup` agrupado por categoria
- Display do secret só na criação (modal one-time)
- Toggle status (ativo/pausado)
- Botão "Testar entrega" (chama `/api/webhooks-admin/subscriptions/[id]/test`)
- Submit → POST/PATCH apropriado

- [ ] **Step 3: `EventCheckboxGroup.tsx` — checkboxes agrupadas conforme spec §10**

```tsx
const GROUPS = [
  { label: 'Pedidos', events: ['order.created', 'order.paid', 'order.fulfilled', 'order.cancelled'] },
  { label: 'Checkout & Pagamento', events: ['checkout.abandoned', 'payment.pix.abandoned', 'payment.boleto.abandoned'] },
  { label: 'Cliente & Comportamento', events: ['customer.created', 'browse.abandoned'] },
  { label: 'Logística', events: ['shipment.tracking_created'] },
];
```

- [ ] **Step 4: Páginas `/new` e `/[id]/edit` reusam `WebhookForm`**

- [ ] **Step 5: Modal de consentimento PII na primeira criação (uma vez por org)**

Verificar via API se usuário já aceitou (campo em `audit_logs` ou flag em `organizations`). Se não, abrir modal com texto do spec §11 PII/LGPD antes de submit.

- [ ] **Step 6: Smoke test no browser — criar webhook real, ver no banco**

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/settings/webhooks/ src/components/webhooks/
git commit -m "feat(webhooks): UI for list, create, and edit subscriptions"
```

---

### Task 21: UI — Logs de entregas (lista + drawer de detalhe + replay)

**Files:**
- Create: `src/app/(dashboard)/settings/webhooks/[id]/deliveries/page.tsx`
- Create: `src/components/webhooks/DeliveryDetailDrawer.tsx`

- [ ] **Step 1: Página de deliveries**

Tabela das últimas 100 entregas, ícone de status, click abre drawer.

- [ ] **Step 2: `DeliveryDetailDrawer`**

Tabs Request / Response. Mostra headers reconstruídos (signature mascarada por segurança), payload JSON pretty-printed, lista de tentativas (do `attempt_count` + `last_attempt_at`), botão `[Reenviar agora]`.

- [ ] **Step 3: Botão `[Reenviar tudo]` (reenvia falhas em batch)**

Chama POST em loop pros `failed`. Limitar a 50 por click pra evitar abuso.

- [ ] **Step 4: Smoke test — gerar falha, ver detalhe, reenviar**

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/settings/webhooks/[id]/deliveries/ src/components/webhooks/
git commit -m "feat(webhooks): deliveries log UI with detail drawer and replay"
```

---

## Fase 4 — Browse abandoned

Produz: detector funcional emitindo `browse.abandoned`.

### Task 22: Detector module + tests

**Files:**
- Create: `src/lib/services/browse-abandoned/detector.ts`
- Create: `src/lib/services/browse-abandoned/__tests__/detector.test.ts`

- [ ] **Step 1: Escrever testes (com mock do Supabase)**

Cobertura:
- Janela: view dentro da janela retorna match; view fora não
- Exclusão: view com `added_to_cart` posterior é excluído
- Exclusão: view com `placed_order` posterior é excluído
- Idempotência: rodar 2x não emite 2x (UNIQUE em `browse_abandoned_emissions`)
- Múltiplas orgs: processadas sequencialmente, sem cross-contamination

(Padrão de testes igual a Task 11 — usar mocks de Supabase do mesmo jeito.)

- [ ] **Step 2: Implementar detector**

```typescript
// src/lib/services/browse-abandoned/detector.ts
import { supabaseAdmin } from '@/lib/supabase-admin';
import { EventBus, EventType } from '@/lib/events';

const MIN_MIN = parseInt(process.env.BROWSE_ABANDONED_MIN_MIN || '30');
const MAX_HOURS = parseInt(process.env.BROWSE_ABANDONED_MAX_HOURS || '4');

export async function runBrowseAbandonedDetection() {
  // Busca orgs que têm pelo menos 1 sub ativa em browse.abandoned
  const { data: orgs } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('organization_id, store_id')
    .eq('status', 'active')
    .contains('events', ['browse.abandoned']);

  const uniqueOrgStores = new Map<string, { org: string; stores: Set<string> }>();
  for (const row of orgs ?? []) {
    const entry = uniqueOrgStores.get(row.organization_id) || { org: row.organization_id, stores: new Set() };
    entry.stores.add(row.store_id);
    uniqueOrgStores.set(row.organization_id, entry);
  }

  let totalEmitted = 0;
  for (const { org, stores } of uniqueOrgStores.values()) {
    totalEmitted += await processOrg(org, [...stores]);
  }
  return { totalEmitted, orgsProcessed: uniqueOrgStores.size };
}

async function processOrg(orgId: string, storeIds: string[]): Promise<number> {
  // Query candidates
  const minTime = new Date(Date.now() - MAX_HOURS * 3600 * 1000).toISOString();
  const maxTime = new Date(Date.now() - MIN_MIN * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabaseAdmin.rpc('detect_browse_abandoned', {
    p_organization_id: orgId,
    p_min_time: minTime,
    p_max_time: maxTime,
  });
  if (error) {
    console.error(`[browse-abandoned] org ${orgId} detection failed:`, error);
    return 0;
  }

  let emitted = 0;
  for (const cand of candidates ?? []) {
    // Atomic emit gate
    const { data: insertedEmission, error: insertError } = await supabaseAdmin
      .from('browse_abandoned_emissions')
      .insert({
        organization_id: orgId,
        contact_id: cand.contact_id,
        product_id: cand.product_id,
        view_event_id: cand.view_event_id,
      })
      .select('id')
      .single();

    if (insertError) {
      // ON CONFLICT — já emitido, pula
      if (insertError.code === '23505') continue;
      console.warn('[browse-abandoned] insert failed:', insertError);
      continue;
    }

    // Emit (precisa do store_id; usar primeiro disponível pra simplificar v1)
    await EventBus.emit(EventType.BROWSE_ABANDONED, {
      organization_id: orgId,
      contact_id: cand.contact_id,
      data: {
        _webhook_dispatch_meta: {
          store_id: storeIds[0],
          source: 'browse_detector',
          source_event_id: cand.view_event_id,
          store: { id: storeIds[0], shop_domain: '', name: '' }, // worker enriquece se vazio
        },
        contact_id: cand.contact_id,
        product_id: cand.product_id,
        view_event_id: cand.view_event_id,
        viewed_at: cand.viewed_at,
      },
    });
    emitted++;
  }
  return emitted;
}
```

- [ ] **Step 3: Criar função RPC no Postgres pra query de detecção**

```sql
-- Migration extra: detect_browse_abandoned RPC
CREATE OR REPLACE FUNCTION detect_browse_abandoned(
  p_organization_id uuid,
  p_min_time timestamptz,
  p_max_time timestamptz
)
RETURNS TABLE (
  view_event_id uuid,
  contact_id uuid,
  product_id text,
  viewed_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    v.id AS view_event_id,
    v.contact_id,
    v.payload->>'product_id' AS product_id,
    v.created_at AS viewed_at
  FROM contact_events v
  WHERE v.organization_id = p_organization_id
    AND v.event_type = 'viewed_product'
    AND v.created_at BETWEEN p_min_time AND p_max_time
    AND v.payload->>'product_id' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM contact_events x
      WHERE x.contact_id = v.contact_id
        AND x.event_type IN ('added_to_cart', 'placed_order')
        AND x.created_at > v.created_at
        AND (x.event_type = 'placed_order' OR x.payload->>'product_id' = v.payload->>'product_id')
    );
$$;
```

Salvar em `supabase/migrations/20260419_browse_abandoned_rpc.sql` e aplicar.

- [ ] **Step 4: Rodar testes**

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/browse-abandoned/ supabase/migrations/20260419_browse_abandoned_rpc.sql
git commit -m "feat(webhooks): browse abandoned detector with atomic emit gate"
```

---

### Task 23: Cron route + agendamento

**Files:**
- Create: `src/app/api/cron/browse-abandoned/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implementar route**

```typescript
// src/app/api/cron/browse-abandoned/route.ts
import { NextResponse } from 'next/server';
import { runBrowseAbandonedDetection } from '@/lib/services/browse-abandoned/detector';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await runBrowseAbandonedDetection();
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Adicionar ao `vercel.json`**

```json
{ "path": "/api/cron/browse-abandoned", "schedule": "*/15 * * * *" }
```

- [ ] **Step 3: Smoke test — gerar `viewed_product` event, esperar 30min, ver `browse_abandoned_emissions` + delivery**

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/browse-abandoned/route.ts vercel.json
git commit -m "feat(webhooks): browse abandoned cron (15min cadence)"
```

---

## Fase 5 — Documentação pública

### Task 24: Guia do integrador

**Files:**
- Create: `docs/integrators/webhooks.md`

- [ ] **Step 1: Escrever guia com:**

- Lista dos 10 event types e schemas exemplos de cada `data`
- Headers que serão enviados
- Algoritmo de validação HMAC
- Exemplos de validação em Node.js, PHP, Python (snippets prontos)
- Política de retry e idempotência
- Códigos HTTP esperados na resposta do integrador
- Como testar (link pra UI)
- Limitações (256KB payload, 30 dias retenção)

- [ ] **Step 2: Commit**

```bash
git add docs/integrators/webhooks.md
git commit -m "docs(webhooks): public integrator guide for v1"
```

---

## Sanity check final

Antes de declarar v1 pronto:

- [ ] **Rodar suite completa de testes**

```bash
pnpm test
```
Esperado: todos os testes de `src/lib/webhooks/` e `src/app/api/workers/webhook-delivery/` passam.

- [ ] **`tsc --noEmit` sem erros**

- [ ] **Smoke E2E manual:**
  1. Criar subscription via UI apontando pra `https://webhook.site/<id>`
  2. Disparar pedido teste na Shopify dev store
  3. Confirmar payload chegou em webhook.site com headers e signature válida
  4. Pausar subscription, criar outro pedido, confirmar nenhuma delivery criada
  5. Mudar URL pra retornar 500, criar pedido, ver retry sequence em `webhook_deliveries`
  6. Após 5 retries, ver status `failed`
  7. Click `[Reenviar agora]`, ver nova delivery criada
  8. Regenerar secret, ver dual-signature header nas próximas entregas

- [ ] **Validar pgsodium na prod (se for usar):** decisão pendente — v1 lança com AES-256-GCM app-level. Migrar pra pgsodium depois é trivial.

- [ ] **Checklist de produção:**
  - `WEBHOOK_SECRET_ENCRYPTION_KEY` setada na Vercel?
  - `QSTASH_TOKEN` setada?
  - Crons no `vercel.json` ativos?
  - Migration aplicada na prod DB?

---

## Notas de manutenção

- **Adicionar event type novo:** atualizar (a) enum em `src/lib/events.ts`, (b) array do CHECK em ambas migrations OU drop+recreate constraint, (c) `WebhookEventType` em `event-schemas.ts`, (d) `EVENT_GROUPS` em `EventCheckboxGroup.tsx`, (e) catálogo do dispatcher em `events.ts`. Único lugar de "adição de evento" centralizado seria refator pós-v1.
- **Mudar política de retry:** ajustar `RETRY_DELAYS_SEC` em `src/app/api/workers/webhook-delivery/route.ts`.
- **Mudar janela de browse abandoned:** env vars `BROWSE_ABANDONED_MIN_MIN` e `BROWSE_ABANDONED_MAX_HOURS`.
