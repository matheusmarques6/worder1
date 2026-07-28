# Inbound Media Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mídia recebida via WhatsApp Cloud API (imagem/vídeo/áudio/documento/sticker) passa a ser baixada da Meta, armazenada no Supabase Storage e exibida no inbox — e mídia enviada deixa de sumir no reload (URL assinada nunca vencida).

**Architecture:** Um novo módulo `src/lib/whatsapp/inbound-media.ts` baixa a mídia da Meta (`WhatsAppCloudAPI.downloadMedia`), sobe para o bucket existente `whatsapp-media` e persiste `media_url`/`media_storage_path`/`media_mime_type`/`media_filename` em `whatsapp_cloud_messages`. O webhook-processor enfileira esse trabalho via QStash (worker novo `/api/workers/whatsapp-inbound-media`) com fallback inline quando QStash não está configurado — falha de download NUNCA quebra a persistência da mensagem (fica `media_download_status='failed'`). Uma migração recria a view `whatsapp_inbox_messages` expondo as colunas reais de mídia, e o GET de mensagens re-assina a URL a partir de `media_storage_path` a cada leitura, então nenhuma URL vencida chega à UI.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + Storage, client `@supabase/supabase-js`), Upstash QStash, Vitest.

## Global Constraints

- Next.js fixo em `14.0.4` — não subir versão, não usar APIs de Next 15.
- Nenhuma dependência nova no `package.json`.
- Testes com Vitest (`npm run test`); testes colocados junto do módulo (`src/lib/whatsapp/*.test.ts`), estilo `vi.mock` de módulos (ver `campaign-recipient-status.test.ts`).
- Migrações novas em `supabase/migrations/` com prefixo `YYYYMMDD_` (padrão dos commits recentes, ex.: `20260720_unified_inbox_unique_indexes.sql`); NÃO editar migrações históricas (`worder-cloud-api-fixes/*.sql`, `docs/ALL-MIGRATIONS-CONSOLIDATED.sql`).
- Reutilizar o bucket Storage existente `whatsapp-media` (criado em `sql/storage-bucket-midia.sql`) — não criar bucket novo.
- `supabaseAdmin` (`@/lib/supabase-admin`) só em código server-side.
- Token da conta SEMPRE via `getAccessToken(account)` de `src/lib/whatsapp/account-loader.ts` (nunca ler `access_token` direto).
- Logs de backend WhatsApp via `wlog` (`@/lib/observability/whatsapp-logger`); erros de pipeline de mídia nunca propagam para o caller do webhook.
- Prosa/comentários de negócio em pt-BR como o resto do repo; identificadores de código em inglês.

---

### Task 1: Migração SQL — colunas de mídia em `whatsapp_cloud_messages` + view `whatsapp_inbox_messages` com mídia real

**Files:**
- Create: `supabase/migrations/20260727_inbound_media_pipeline.sql`

**Interfaces:**
- Consumes: schema atual de `whatsapp_cloud_messages` (`worder-cloud-api-fixes/01-migration-cloud-api-schema.sql:286-320` — NÃO tem colunas de mídia versionadas, embora produção já as tenha via hotfix, pois `media/route.ts:242-245` grava `media_url`/`media_filename`/`media_mime_type`/`media_storage_path`) e a view atual (`worder-cloud-api-fixes/05A-inbox-unification.sql:109-172`).
- Produces: colunas `media_url TEXT`, `media_filename TEXT`, `media_mime_type TEXT`, `media_storage_path TEXT`, `media_download_status TEXT` (+ `delivered_at`/`read_at` defensivas, do plano de recibos) em `whatsapp_cloud_messages` (idempotente); view `whatsapp_inbox_messages` com as MESMAS colunas de antes + `media_storage_path` (nova, logo após `media_mime_type`), com valores reais de mídia nos dois branches e `m.delivered_at`/`m.read_at` reais no branch cloud (ficam NULL até o plano de recibos gravar). Tasks 2, 4 e 5 dependem dessas colunas. A DDL da view é IDÊNTICA à do plano `2026-07-27-delivery-read-receipts` — qualquer ordem de execução converge para a mesma view.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260727_inbound_media_pipeline.sql` com exatamente:

```sql
-- ============================================================
-- Inbound media pipeline (2026-07-27)
--
-- 1. Versiona as colunas de mídia de whatsapp_cloud_messages
--    (produção já tem parte delas via hotfix manual — idempotente).
-- 2. Adiciona media_download_status para o pipeline assíncrono
--    de download de mídia inbound (pending | done | failed).
-- 3. Recria a view whatsapp_inbox_messages expondo media_url /
--    media_filename / media_mime_type / media_storage_path REAIS
--    (antes eram NULL::TEXT fixos nos dois branches — bug que fazia
--    toda mídia, inclusive enviada, sumir no reload do inbox).
-- ============================================================

-- 1. Colunas de mídia (cloud)
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS media_url             TEXT,
  ADD COLUMN IF NOT EXISTS media_filename        TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path    TEXT,
  ADD COLUMN IF NOT EXISTS media_download_status TEXT;

COMMENT ON COLUMN whatsapp_cloud_messages.media_download_status IS
  'Pipeline de mídia inbound: pending (aguardando worker) | done | failed. NULL = mensagem sem mídia ou outbound.';

-- 1b. Defensivo: colunas do plano 2026-07-27-delivery-read-receipts.
--     No-op se aquele plano já rodou. Garante que as DUAS migrações
--     produzam a MESMA view superset, independente da ordem de execução.
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- 2. Colunas de mídia (legacy) — inbox-schema.sql já as adiciona em
--    alguns ambientes; garantimos aqui de forma idempotente.
DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS media_url       TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS media_filename  VARCHAR(255);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping media columns';
END $$;

-- 3. Recria a view. DROP + CREATE (não OR REPLACE) porque adicionamos
--    a coluna media_storage_path no meio da lista.
DROP VIEW IF EXISTS whatsapp_inbox_messages;

CREATE VIEW whatsapp_inbox_messages AS

-- Cloud API messages
SELECT
  m.id,
  m.organization_id,
  'cloud'::TEXT                          AS provider,
  m.conversation_id,
  m.message_id,
  m.message_id                           AS wa_message_id,
  m.direction,
  m.message_type,
  m.content,
  m.text_body,
  m.caption,
  m.media_id,
  m.media_url,
  m.media_filename,
  m.media_mime_type,
  m.media_storage_path,
  m.template_name,
  m.status,
  m.error_code,
  m.error_message,
  FALSE                                   AS sent_by_bot,
  m.delivered_at,
  m.read_at,
  m.timestamp                            AS sent_at,
  m.created_at
FROM whatsapp_cloud_messages m

UNION ALL

-- Legacy Evolution messages (JOIN to get organization_id)
SELECT
  lm.id,
  lc.organization_id,
  'evolution'::TEXT                       AS provider,
  lm.conversation_id,
  lm.id::TEXT                            AS message_id,
  lm.id::TEXT                            AS wa_message_id,
  'inbound'::TEXT                        AS direction,
  'text'::TEXT                           AS message_type,
  lm.content::JSONB                      AS content,
  CASE
    WHEN lm.content IS NOT NULL THEN lm.content::TEXT
    ELSE ''
  END                                    AS text_body,
  NULL::TEXT                              AS caption,
  NULL::TEXT                              AS media_id,
  lm.media_url,
  lm.media_filename::TEXT                AS media_filename,
  lm.media_mime_type::TEXT               AS media_mime_type,
  NULL::TEXT                              AS media_storage_path,
  NULL::TEXT                              AS template_name,
  'sent'::TEXT                           AS status,
  NULL::TEXT                              AS error_code,
  NULL::TEXT                              AS error_message,
  FALSE                                   AS sent_by_bot,
  NULL::TIMESTAMPTZ                       AS delivered_at,
  NULL::TIMESTAMPTZ                       AS read_at,
  lm.created_at                          AS sent_at,
  lm.created_at
FROM whatsapp_messages lm
JOIN whatsapp_conversations lc ON lc.id = lm.conversation_id;

SELECT 'Inbound media pipeline migration applied' AS resultado;
```

- [ ] **Step 2: Aplicar em dev/staging e verificar (não há teste automatizado de DB no repo — verificação manual)**

Aplicar o arquivo inteiro no Supabase SQL Editor do projeto de desenvolvimento (padrão do repo: aplicar e versionar — ver commit `bdac86df`). Em seguida rodar:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'whatsapp_cloud_messages'
  AND column_name IN ('media_url','media_filename','media_mime_type','media_storage_path','media_download_status');

SELECT media_url, media_filename, media_mime_type, media_storage_path
FROM whatsapp_inbox_messages
WHERE provider = 'cloud'
ORDER BY created_at DESC
LIMIT 5;
```

Esperado: primeira query retorna as 5 colunas; segunda query executa sem erro e — para mensagens de mídia ENVIADAS pelo inbox após o deploy antigo — `media_url`/`media_filename` deixam de ser NULL (o bug do reload some já com essa migração).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260727_inbound_media_pipeline.sql
git commit -m "fix(db): expor media_url/filename/mime/storage_path reais na view whatsapp_inbox_messages + versionar colunas de midia"
```

---

### Task 2: Módulo `inbound-media.ts` — download da Meta → Supabase Storage → update da row (TDD)

**Files:**
- Create: `src/lib/whatsapp/inbound-media.ts`
- Test: `src/lib/whatsapp/inbound-media.test.ts`

**Interfaces:**
- Consumes: `createWhatsAppCloudClient(config)` e `WhatsAppCloudAPI.downloadMedia(mediaId): Promise<{ data: Uint8Array; mimeType: string }>` (`src/lib/whatsapp/cloud-api.ts:566-580`); `getAccessToken(account): string` (`src/lib/whatsapp/account-loader.ts:25`); `supabaseAdmin` (`@/lib/supabase-admin`); `wlog` (`@/lib/observability/whatsapp-logger`); colunas da Task 1.
- Produces (Tasks 3 e 4 consomem exatamente estas assinaturas):

```ts
export interface InboundMediaJob {
  cloudMessageId: string;   // whatsapp_cloud_messages.id (uuid)
  accountId: string;        // whatsapp_business_accounts.id (uuid)
  organizationId: string;
}
export interface InboundMediaResult { ok: boolean; reason?: string }
export function extensionFromMime(mime: string): string
export function buildStoragePath(orgId: string, conversationId: string, messageDbId: string, mime: string): string
export async function processInboundMedia(job: InboundMediaJob): Promise<InboundMediaResult>
```

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/inbound-media.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDownloadMedia = vi.fn()
vi.mock('./cloud-api', () => ({
  createWhatsAppCloudClient: vi.fn(() => ({ downloadMedia: mockDownloadMedia })),
}))
vi.mock('./account-loader', () => ({
  getAccessToken: vi.fn(() => 'token-123'),
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Estado mutável que o mock do supabase-admin devolve por tabela.
const rows: { message: any; account: any } = { message: null, account: null }
const mockUpdate = vi.fn()
const mockUpload = vi.fn()
const mockCreateSignedUrl = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'whatsapp_cloud_messages' ? rows.message : rows.account,
            error: null,
          }),
        }),
      }),
      update: (values: any) => {
        mockUpdate(table, values)
        return { eq: async () => ({ error: null }) }
      },
    }),
    storage: {
      from: () => ({
        upload: (...args: any[]) => mockUpload(...args),
        createSignedUrl: (...args: any[]) => mockCreateSignedUrl(...args),
      }),
    },
  },
}))

import { processInboundMedia, extensionFromMime, buildStoragePath } from './inbound-media'

const JOB = { cloudMessageId: 'msg-1', accountId: 'acc-1', organizationId: 'org-1' }

describe('extensionFromMime', () => {
  it('mapeia MIMEs conhecidos do WhatsApp', () => {
    expect(extensionFromMime('image/jpeg')).toBe('jpg')
    expect(extensionFromMime('audio/ogg')).toBe('ogg')
    expect(extensionFromMime('application/pdf')).toBe('pdf')
  })
  it('ignora sufixo de codecs (Meta manda "audio/ogg; codecs=opus")', () => {
    expect(extensionFromMime('audio/ogg; codecs=opus')).toBe('ogg')
  })
  it('cai para o subtipo do MIME e por fim para bin', () => {
    expect(extensionFromMime('image/tiff')).toBe('tiff')
    expect(extensionFromMime('')).toBe('bin')
  })
})

describe('buildStoragePath', () => {
  it('monta org/conversation/messageId.ext (mesmo layout do envio outbound)', () => {
    expect(buildStoragePath('org-1', 'conv-1', 'msg-1', 'image/jpeg'))
      .toBe('org-1/conv-1/msg-1.jpg')
  })
})

describe('processInboundMedia', () => {
  beforeEach(() => {
    mockDownloadMedia.mockReset()
    mockUpdate.mockReset()
    mockUpload.mockReset()
    mockCreateSignedUrl.mockReset()
    rows.message = {
      id: 'msg-1',
      media_id: 'meta-media-9',
      conversation_id: 'conv-1',
      message_type: 'image',
      content: { image: { id: 'meta-media-9', mime_type: 'image/jpeg' } },
      media_download_status: 'pending',
    }
    rows.account = { id: 'acc-1', phone_number_id: 'pn-1', access_token: 'raw-token' }
    mockUpload.mockResolvedValue({ error: null })
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null })
  })

  it('baixa da Meta, sobe pro Storage e persiste media_url/storage_path/mime/filename + done', async () => {
    mockDownloadMedia.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' })

    const result = await processInboundMedia(JOB)

    expect(result.ok).toBe(true)
    expect(mockDownloadMedia).toHaveBeenCalledWith('meta-media-9')
    expect(mockUpload).toHaveBeenCalledWith(
      'org-1/conv-1/msg-1.jpg',
      expect.anything(),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true }),
    )
    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_url: 'https://signed.example/x',
      media_storage_path: 'org-1/conv-1/msg-1.jpg',
      media_mime_type: 'image/jpeg',
      media_filename: 'image-msg-1.jpg',
      media_download_status: 'done',
    }))
  })

  it('usa o filename original quando a mensagem é documento', async () => {
    rows.message.message_type = 'document'
    rows.message.content = { document: { id: 'meta-media-9', filename: 'nota-fiscal.pdf' } }
    mockDownloadMedia.mockResolvedValue({ data: new Uint8Array([1]), mimeType: 'application/pdf' })

    await processInboundMedia(JOB)

    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_filename: 'nota-fiscal.pdf',
    }))
  })

  it('falha de download NÃO lança: marca media_download_status=failed e resolve', async () => {
    mockDownloadMedia.mockRejectedValue(new Error('meta 401'))

    const result = await processInboundMedia(JOB)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('meta 401')
    expect(mockUpdate).toHaveBeenCalledWith('whatsapp_cloud_messages', expect.objectContaining({
      media_download_status: 'failed',
    }))
  })

  it('é idempotente: status done pula download (retry do QStash vira no-op)', async () => {
    rows.message.media_download_status = 'done'
    const result = await processInboundMedia(JOB)
    expect(result).toEqual({ ok: true, reason: 'already_done' })
    expect(mockDownloadMedia).not.toHaveBeenCalled()
  })

  it('mensagem sem media_id retorna no_media_id sem tocar Storage', async () => {
    rows.message.media_id = null
    const result = await processInboundMedia(JOB)
    expect(result).toEqual({ ok: false, reason: 'no_media_id' })
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/whatsapp/inbound-media.test.ts`
Esperado: FAIL — `Cannot find module './inbound-media'` (ou equivalente do Vite: "Failed to resolve import").

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/inbound-media.ts`:

```ts
/**
 * Inbound media pipeline — baixa mídia recebida da Meta e persiste no
 * Supabase Storage (bucket 'whatsapp-media', o mesmo do envio outbound
 * em /api/whatsapp/inbox/conversations/[id]/media).
 *
 * Chamado pelo worker /api/workers/whatsapp-inbound-media (QStash) ou
 * inline pelo webhook-processor quando QStash não está configurado.
 *
 * Contrato de erro: NUNCA lança. Falha de download marca
 * media_download_status='failed' e resolve — a mensagem já foi salva
 * pelo webhook-processor e continua visível no inbox (sem mídia).
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from './cloud-api';
import { getAccessToken } from './account-loader';
import { wlog } from '@/lib/observability/whatsapp-logger';

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
const SIGNED_URL_EXPIRY = 3600; // 1h — o GET de mensagens re-assina a cada leitura

export interface InboundMediaJob {
  cloudMessageId: string; // whatsapp_cloud_messages.id (uuid)
  accountId: string;      // whatsapp_business_accounts.id (uuid)
  organizationId: string;
}

export interface InboundMediaResult {
  ok: boolean;
  reason?: string;
}

// MIMEs que a Meta entrega em mídia inbound (Cloud API).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp', // stickers chegam como image/webp
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',   // voice notes: "audio/ogg; codecs=opus"
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function extensionFromMime(mime: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  return MIME_EXT[base] || base.split('/')[1] || 'bin';
}

export function buildStoragePath(
  orgId: string,
  conversationId: string,
  messageDbId: string,
  mime: string,
): string {
  return `${orgId}/${conversationId}/${messageDbId}.${extensionFromMime(mime)}`;
}

export async function processInboundMedia(job: InboundMediaJob): Promise<InboundMediaResult> {
  const { data: row } = await supabase
    .from('whatsapp_cloud_messages')
    .select('id, media_id, conversation_id, message_type, content, media_download_status')
    .eq('id', job.cloudMessageId)
    .maybeSingle();

  if (!row) return { ok: false, reason: 'message_not_found' };
  if (!row.media_id) return { ok: false, reason: 'no_media_id' };
  // Idempotência: retry do QStash (ou corrida enqueue+inline) vira no-op.
  if (row.media_download_status === 'done') return { ok: true, reason: 'already_done' };

  const { data: account } = await supabase
    .from('whatsapp_business_accounts')
    .select('*')
    .eq('id', job.accountId)
    .maybeSingle();

  if (!account) return { ok: false, reason: 'account_not_found' };

  try {
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
    });

    const { data, mimeType } = await client.downloadMedia(row.media_id);

    const storagePath = buildStoragePath(
      job.organizationId,
      row.conversation_id || 'no-conversation',
      row.id,
      mimeType,
    );

    const { error: uploadError } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .upload(storagePath, Buffer.from(data), {
        contentType: mimeType || 'application/octet-stream',
        upsert: true, // retry sobrescreve o mesmo path (path é derivado do id da row)
        cacheControl: '3600',
      });
    if (uploadError) throw new Error(`storage_upload_failed: ${uploadError.message}`);

    let mediaUrl: string | null = null;
    const { data: signed } = await supabase.storage
      .from(WHATSAPP_MEDIA_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
    if (signed?.signedUrl) mediaUrl = signed.signedUrl;

    const filename =
      row.content?.document?.filename ||
      `${row.message_type || 'media'}-${row.id}.${extensionFromMime(mimeType)}`;

    await supabase
      .from('whatsapp_cloud_messages')
      .update({
        media_url: mediaUrl,
        media_storage_path: storagePath,
        media_mime_type: mimeType,
        media_filename: filename,
        media_download_status: 'done',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    return { ok: true };
  } catch (err: any) {
    wlog.error('whatsapp.media.inbound_download_failed', {
      error: err?.message,
      cloud_message_id: job.cloudMessageId,
      media_id: row.media_id,
    });
    await supabase
      .from('whatsapp_cloud_messages')
      .update({
        media_download_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, reason: err?.message || 'download_failed' };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/lib/whatsapp/inbound-media.test.ts`
Esperado: PASS (9 testes).

- [ ] **Step 5: Rodar a suíte inteira para garantir zero regressão**

Run: `npm run test`
Esperado: todos os testes existentes continuam verdes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/inbound-media.ts src/lib/whatsapp/inbound-media.test.ts
git commit -m "feat(whatsapp): modulo de download de midia inbound (Meta -> Supabase Storage) com contrato nunca-lanca"
```

---

### Task 3: Fila QStash + worker `/api/workers/whatsapp-inbound-media`

**Files:**
- Modify: `src/lib/queue.ts` (inserir nova função após `enqueueWhatsAppAiRespond`, ~linha 430)
- Create: `src/app/api/workers/whatsapp-inbound-media/route.ts`

**Interfaces:**
- Consumes: `processInboundMedia(job: InboundMediaJob): Promise<InboundMediaResult>` e `InboundMediaJob` da Task 2; helpers privados `getQStashClient()`/`getBaseUrl()` já existentes em `queue.ts`; padrão de verificação de assinatura QStash de `src/app/api/workers/whatsapp-webhook/route.ts:27-75`.
- Produces (Task 4 consome):

```ts
// src/lib/queue.ts
export async function enqueueWhatsAppInboundMedia(
  job: { cloudMessageId: string; accountId: string; organizationId: string }
): Promise<string | null>  // null quando QStash/APP_URL não configurados
```

- [ ] **Step 1: Adicionar `enqueueWhatsAppInboundMedia` em `src/lib/queue.ts`**

Inserir logo após o fechamento de `enqueueWhatsAppAiRespond` (após a linha 430):

```ts
/**
 * Enfileira o download de mídia INBOUND de uma mensagem já persistida.
 *
 * O webhook-processor salva a mensagem com media_id + media_download_status
 * ='pending' e chama esta função. O worker /api/workers/whatsapp-inbound-media
 * baixa da Meta e sobe pro Supabase Storage. Retorna null quando QStash não
 * está configurado — o caller roda processInboundMedia inline como fallback.
 */
export async function enqueueWhatsAppInboundMedia(
  job: { cloudMessageId: string; accountId: string; organizationId: string }
): Promise<string | null> {
  const client = getQStashClient();
  if (!client) {
    console.warn('[Queue] QStash not configured — inbound media will run inline');
    return null;
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.warn('[Queue] APP_URL not configured');
    return null;
  }

  const response = await client.publishJSON({
    url: `${baseUrl}/api/workers/whatsapp-inbound-media`,
    body: job,
    // 2 retries: URL de mídia da Meta expira em ~5min, mais que isso é inútil.
    // processInboundMedia é idempotente (skip quando done, upsert no Storage).
    retries: 2,
  });

  console.log(
    `[Queue] Enqueued inbound media msg=${job.cloudMessageId}, messageId: ${response.messageId}`
  );
  return response.messageId;
}
```

- [ ] **Step 2: Criar o worker**

Criar `src/app/api/workers/whatsapp-inbound-media/route.ts`:

```ts
/**
 * Inbound media worker — baixa mídia de mensagem inbound já persistida.
 *
 * Disparado pelo QStash via enqueueWhatsAppInboundMedia (webhook-processor).
 * Auth: mesma verificação de assinatura de /api/workers/whatsapp-webhook.
 *
 * Códigos de resposta:
 *   200 — done (ou no-op idempotente / job inválido não-retryável)
 *   500 — falha transiente (download/upload) => QStash re-tenta (retries: 2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import {
  processInboundMedia,
  type InboundMediaJob,
} from '@/lib/whatsapp/inbound-media';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getQstashReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  return new Receiver({ currentSigningKey: current, nextSigningKey: next });
}

// Falhas definitivas: re-tentar não muda o resultado, responder 200.
const NON_RETRYABLE = new Set(['message_not_found', 'no_media_id', 'account_not_found']);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const receiver = getQstashReceiver();

  if (process.env.NODE_ENV === 'production') {
    if (!signature || !receiver) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const valid = await receiver.verify({ signature, body: rawBody });
    if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  } else if (receiver && signature) {
    const valid = await receiver.verify({ signature, body: rawBody });
    if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  } else if (req.headers.get('x-internal-request') !== 'true') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let job: InboundMediaJob;
  try {
    job = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!job?.cloudMessageId || !job?.accountId || !job?.organizationId) {
    return NextResponse.json({ error: 'cloudMessageId, accountId, organizationId required' }, { status: 400 });
  }

  const result = await processInboundMedia(job);

  if (!result.ok && !NON_RETRYABLE.has(result.reason || '')) {
    // Transiente (ex.: Meta 5xx) — 500 faz o QStash re-driver.
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Verificação manual do worker (rotas de worker não têm suíte de teste no repo)**

Com `npm run dev` rodando e SEM `QSTASH_CURRENT_SIGNING_KEY` no `.env.local` (caminho `x-internal-request`):

```bash
curl -s -X POST http://localhost:3000/api/workers/whatsapp-inbound-media \
  -H "content-type: application/json" \
  -H "x-internal-request: true" \
  -d '{"cloudMessageId":"00000000-0000-0000-0000-000000000000","accountId":"00000000-0000-0000-0000-000000000000","organizationId":"00000000-0000-0000-0000-000000000000"}'
```

Esperado: HTTP 200 com `{"ok":false,"reason":"message_not_found"}` (job inválido é não-retryável). Sem o header `x-internal-request`: HTTP 401.

- [ ] **Step 4: Rodar a suíte**

Run: `npm run test`
Esperado: verde (nenhum teste toca queue.ts/worker; garante que o import de `inbound-media` não quebrou nada).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue.ts src/app/api/workers/whatsapp-inbound-media/route.ts
git commit -m "feat(whatsapp): fila QStash + worker de download de midia inbound"
```

---

### Task 4: Wiring no webhook-processor — enfileirar download (fallback inline) sem quebrar a persistência

**Files:**
- Modify: `src/lib/whatsapp/webhook-processor.ts:256-278` (o INSERT em `processMessage`)

**Interfaces:**
- Consumes: `enqueueWhatsAppInboundMedia(job)` (Task 3), `processInboundMedia(job)` (Task 2), coluna `media_download_status` (Task 1). Segue o mesmo padrão de dynamic import + try/catch usado pelo debounce da IA no mesmo arquivo (linhas 361-410).
- Produces: mensagens inbound com mídia são salvas com `media_download_status='pending'` e o pipeline de download é disparado; qualquer erro do pipeline é engolido (mensagem permanece salva).

- [ ] **Step 1: Substituir o bloco de INSERT**

Em `src/lib/whatsapp/webhook-processor.ts`, substituir o trecho atual (linhas 256-278):

```ts
  await supabase.from('whatsapp_cloud_messages').insert({
    organization_id: account.organization_id,
    store_id: account.store_id || conversation.store_id || null,
    waba_id: account.id,
    conversation_id: conversation.id,
    message_id: message.id,
    direction: 'inbound',
    from_number: phoneNumber,
    to_number: account.phone_number,
    message_type: messageType,
    content,
    text_body: textBody,
    caption:
      message.image?.caption || message.video?.caption || message.document?.caption,
    media_id:
      message.image?.id ||
      message.video?.id ||
      message.audio?.id ||
      message.document?.id ||
      message.sticker?.id,
    status: 'received',
    timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
  });
```

por:

```ts
  const mediaId =
    message.image?.id ||
    message.video?.id ||
    message.audio?.id ||
    message.document?.id ||
    message.sticker?.id;

  const { data: insertedMsg } = await supabase
    .from('whatsapp_cloud_messages')
    .insert({
      organization_id: account.organization_id,
      store_id: account.store_id || conversation.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: message.id,
      direction: 'inbound',
      from_number: phoneNumber,
      to_number: account.phone_number,
      message_type: messageType,
      content,
      text_body: textBody,
      caption:
        message.image?.caption || message.video?.caption || message.document?.caption,
      media_id: mediaId,
      media_download_status: mediaId ? 'pending' : null,
      status: 'received',
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    })
    .select('id')
    .maybeSingle();

  // ============================================================
  // PIPELINE DE MÍDIA INBOUND — nunca quebra a persistência.
  // Preferência: QStash (async). Fallback: inline (ambientes sem fila).
  // Falha aqui deixa media_download_status='pending'/'failed' e a
  // mensagem segue visível no inbox (sem mídia).
  // ============================================================
  if (mediaId && insertedMsg?.id) {
    try {
      const mediaJob = {
        cloudMessageId: insertedMsg.id,
        accountId: account.id,
        organizationId: account.organization_id,
      };
      const { enqueueWhatsAppInboundMedia } = await import('@/lib/queue');
      const queued = await enqueueWhatsAppInboundMedia(mediaJob);
      if (!queued) {
        const { processInboundMedia } = await import('./inbound-media');
        await processInboundMedia(mediaJob);
      }
    } catch (err: any) {
      wlog.error('whatsapp.media.inbound_pipeline_error', {
        error: err?.message,
        message_id: message.id,
        conversation_id: conversation.id,
      });
    }
  }
```

Nota: `.select('id').maybeSingle()` no INSERT não muda a semântica de erro — o supabase-js não lança; se o insert falhar, `insertedMsg` é null e o pipeline é pulado (comportamento tolerante idêntico ao anterior).

- [ ] **Step 2: Rodar a suíte**

Run: `npm run test`
Esperado: verde (webhook-processor não tem teste próprio; garante compilação dos imports via testes vizinhos que importam módulos da pasta).

- [ ] **Step 3: Verificação manual — mensagem com media_id inválido é salva mesmo com download falhando**

Com `npm run dev` rodando, criar um evento de webhook fake apontando para uma conta real de dev. Primeiro pegar dados reais:

```sql
SELECT id, phone_number_id, waba_id FROM whatsapp_business_accounts LIMIT 1;
```

Inserir o evento e processá-lo via worker de webhook (substituir `PHONE_NUMBER_ID` e `WABA_ID` pelos valores acima):

```sql
INSERT INTO whatsapp_webhook_events (raw_payload, status)
VALUES (
  '{"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"PHONE_NUMBER_ID"},"contacts":[{"wa_id":"5511999990000","profile":{"name":"Teste Midia"}}],"messages":[{"from":"5511999990000","id":"wamid.TEST_MEDIA_1","timestamp":"1753600000","type":"image","image":{"id":"FAKE_MEDIA_ID","mime_type":"image/jpeg","sha256":"x"}}]}}]}]}'::jsonb,
  'pending'
) RETURNING id;
```

```bash
curl -s -X POST http://localhost:3000/api/workers/whatsapp-webhook \
  -H "content-type: application/json" \
  -H "x-internal-request: true" \
  -d '{"eventId":"<id retornado acima>"}'
```

Verificar:

```sql
SELECT message_type, media_id, media_download_status, media_url
FROM whatsapp_cloud_messages WHERE message_id = 'wamid.TEST_MEDIA_1';
```

Esperado: 1 row com `message_type='image'`, `media_id='FAKE_MEDIA_ID'`, `media_download_status='failed'` (Meta rejeita o id fake) e `media_url` NULL — provando que falha de download NÃO impede a persistência da mensagem. Limpar depois: `DELETE FROM whatsapp_cloud_messages WHERE message_id = 'wamid.TEST_MEDIA_1';`

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/webhook-processor.ts
git commit -m "feat(whatsapp): webhook enfileira download de midia inbound (fallback inline) sem quebrar persistencia"
```

---

### Task 5: URL assinada sempre válida — re-assinar no GET de mensagens + corrigir rota de refresh + sticker no ChatPanel

**Decisão (avaliada conforme pedido):** re-assinar no GET de `messages/route.ts` a partir de `media_storage_path` é a solução principal — a UI nunca recebe URL vencida, sem precisar de caller novo de refresh nem timer no front (a rota de refresh existente não tem NENHUM caller na UI hoje). A rota de refresh (`media/route.ts` GET) é mantida como fallback pontual, mas corrigida para consultar `whatsapp_cloud_messages` — hoje consulta `whatsapp_messages` (tabela legada errada) e sempre retorna 404 para mensagens cloud.

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:44-67` (GET)
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts:314-320` (GET de refresh)
- Modify: `src/components/whatsapp/inbox/ChatPanel.tsx:119-147` (render de sticker)

**Interfaces:**
- Consumes: coluna `media_storage_path` exposta pela view (Task 1); `supabase.storage.from('whatsapp-media').createSignedUrls(paths: string[], expiresIn: number)` do supabase-js v2 (batch — 1 chamada por página de mensagens); tipo `InboxMessage` (`src/types/inbox.ts:166` — já inclui `message_type: 'sticker'` e `media_url?`).
- Produces: resposta do GET `/api/whatsapp/inbox/conversations/[id]/messages` com `media_url` sempre fresco (assinado na hora quando há `media_storage_path`).

- [ ] **Step 1: Re-assinar no GET de mensagens**

Em `messages/route.ts`, substituir o bloco (linhas 44-67):

```ts
    const { data, error } = await query
    if (error) throw error

    const hasMore = (data?.length || 0) > limit
    const messages = hasMore ? data?.slice(0, limit) : data
```

por:

```ts
    const { data, error } = await query
    if (error) throw error

    const hasMore = (data?.length || 0) > limit
    const messages = hasMore ? data?.slice(0, limit) : data

    // Re-assina URLs de mídia a partir do storage_path a CADA leitura.
    // A URL persistida em media_url expira em 1h; sem isso, mídia (inclusive
    // enviada) quebra no reload. 1 chamada batch por página de mensagens.
    const mediaPaths = (messages || [])
      .map(m => m.media_storage_path)
      .filter((p): p is string => !!p)
    const signedByPath: Record<string, string> = {}
    if (mediaPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrls(mediaPaths, 3600)
      for (const s of signed || []) {
        if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl
      }
    }
```

e no `formatted` (linha 63), trocar:

```ts
      media_url: m.media_url, media_filename: m.media_filename, media_mime_type: m.media_mime_type,
```

por:

```ts
      media_url: (m.media_storage_path && signedByPath[m.media_storage_path]) || m.media_url,
      media_filename: m.media_filename, media_mime_type: m.media_mime_type,
```

- [ ] **Step 2: Corrigir a tabela da rota de refresh**

Em `media/route.ts` GET (linha 314-315), trocar:

```ts
    const { data: message, error } = await supabase
      .from('whatsapp_messages')
```

por:

```ts
    const { data: message, error } = await supabase
      .from('whatsapp_cloud_messages')
```

(as colunas consultadas — `media_storage_path`, `media_url`, `conversation_id`, `organization_id` — existem em `whatsapp_cloud_messages` após a Task 1).

- [ ] **Step 3: Renderizar sticker no ChatPanel**

Em `ChatPanel.tsx`, logo após o bloco de imagem (após a linha 127, antes do bloco de vídeo), adicionar:

```tsx
          {message.message_type === 'sticker' && message.media_url && (
            <img
              src={message.media_url}
              alt="Figurinha"
              loading="lazy"
              className="rounded-lg mb-2 w-32 h-32 object-contain"
            />
          )}
```

- [ ] **Step 4: Rodar a suíte e verificação manual da UI**

Run: `npm run test`
Esperado: verde.

Manual (com `npm run dev` e uma conversa cloud que já tenha mídia enviada antes desta mudança):
1. Abrir `http://localhost:3000` → inbox WhatsApp → abrir a conversa.
2. Observar: a mídia enviada anteriormente agora APARECE (antes sumia porque a view devolvia NULL).
3. Forçar URL vencida para provar a re-assinatura: `UPDATE whatsapp_cloud_messages SET media_url = 'https://expired.invalid/x' WHERE media_storage_path IS NOT NULL AND conversation_id = '<id da conversa>';` → recarregar a página → mídia continua renderizando (URL veio de `createSignedUrls`, não da coluna).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts" src/components/whatsapp/inbox/ChatPanel.tsx
git commit -m "fix(inbox): re-assinar media_url no GET de mensagens (nunca servir URL vencida) + refresh na tabela correta + render de sticker"
```

---

### Task 6: Verificação manual end-to-end (WhatsApp real)

**Files:**
- Test: nenhum arquivo — validação manual em ambiente com webhook Meta apontado (staging/produção ou dev com túnel) após deploy/aplicação da migração da Task 1.

**Interfaces:**
- Consumes: todo o pipeline das Tasks 1-5.
- Produces: confirmação de que o fluxo inbound completo funciona com a Meta real.

- [ ] **Step 1: Pré-condição**

Confirmar que a migração da Task 1 foi aplicada no ambiente-alvo e que o deploy contém as Tasks 2-5. Conferir env: `QSTASH_TOKEN` presente (caminho async) — ou ausente (testará o fallback inline).

- [ ] **Step 2: Enviar mídia real de um celular para o número WhatsApp da conta**

Enviar, em sequência, para o número conectado: 1 foto (com legenda), 1 áudio (voice note), 1 vídeo curto, 1 PDF e 1 sticker.

- [ ] **Step 3: Verificar persistência no banco**

```sql
SELECT message_type, media_id, media_download_status, media_storage_path,
       media_mime_type, media_filename, caption
FROM whatsapp_cloud_messages
WHERE direction = 'inbound' AND media_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

Esperado: 5 rows (image/audio/video/document/sticker) com `media_download_status='done'`, `media_storage_path` no formato `<org>/<conversation>/<message>.<ext>`, `media_mime_type` real da Meta e, no document, `media_filename` = nome original do PDF. Se alguma ficar `pending` por mais de ~1 min, checar logs do worker `whatsapp-inbound-media` (QStash dashboard / Vercel logs, evento `whatsapp.media.inbound_download_failed`).

- [ ] **Step 4: Verificar no Storage**

No Supabase Dashboard → Storage → bucket `whatsapp-media` → navegar até `<org>/<conversation>/` e confirmar os 5 objetos com tamanho > 0.

- [ ] **Step 5: Verificar no inbox (UI)**

Abrir o inbox → conversa do teste. Esperado: foto renderizada (com legenda abaixo), player de áudio funcional, vídeo com controls, PDF como link com nome do arquivo, sticker como imagem 128px. Recarregar a página (F5): tudo continua renderizando (re-assinatura do GET).

- [ ] **Step 6: Verificar resiliência (mensagem sem mídia intacta)**

Enviar uma mensagem de texto simples pelo celular e confirmar que chega ao inbox normalmente (`media_download_status` NULL) — o pipeline novo não afetou o caminho de texto.

---

## Autocheck final (executado na escrita deste plano)

- **Cobertura do spec:** download inbound async+inline (Tasks 2-4); token via `getAccessToken` (Task 2); bucket `whatsapp-media` reutilizado (Task 2); falha de download não quebra persistência (Task 2 teste 3 + Task 4 Step 3); migração recriando a view com mídia real nos dois branches (Task 1); refresh de URL — decisão justificada: re-assinar no GET + corrigir tabela da rota existente (Task 5); verificação e2e real (Task 6). ✔
- **Placeholders:** nenhum TBD/"similar à Task N"; todo step de código tem código real lido dos arquivos-fonte. ✔
- **Consistência de nomes/tipos:** `InboundMediaJob`/`processInboundMedia`/`enqueueWhatsAppInboundMedia`/`media_download_status`/`media_storage_path` idênticos nas Tasks 1-5; view expõe `media_storage_path` (Task 1) consumido pelo GET (Task 5). ✔
