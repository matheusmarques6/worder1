# Delivery/Read Receipts (WhatsApp Inbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir e exibir os timestamps de entrega (`delivered_at`) e leitura (`read_at`) das mensagens outbound do WhatsApp Cloud API no inbox, com tooltip nos checks estilo WhatsApp.

**Architecture:** O webhook de status da Meta (`statuses[].timestamp`, epoch em segundos como string) passa a alimentar duas novas colunas `delivered_at`/`read_at` em `whatsapp_cloud_messages`, calculadas por uma função pura testável (`statusTimestampFields`) que respeita o guard monotônico já existente em `processStatus`. A view `whatsapp_inbox_messages` é recriada expondo as colunas reais (hoje fixa `NULL`), o GET do inbox já as mapeia, e o `MessageBubble` ganha tooltip com os horários nos ícones ✓/✓✓/✓✓-azul já renderizados.

**Tech Stack:** Next.js 14.0.4 (App Router), TypeScript 5, Supabase (Postgres), Vitest 1.2, Lucide React, Tailwind CSS.

## Global Constraints

- **Coordenação de view:** o plano paralelo `docs/superpowers/plans/2026-07-27-inbound-media-pipeline.md` TAMBÉM recria a view `whatsapp_inbox_messages`. As duas migrações usam DDL de view IDÊNTICA (superset: mídia + `media_storage_path` + `delivered_at`/`read_at` reais) com `ADD COLUMN IF NOT EXISTS` defensivo para as colunas do outro plano e `DROP VIEW IF EXISTS` + `CREATE VIEW` (não `OR REPLACE`, que falharia com a mudança na lista de colunas). Qualquer ordem de execução converge para a mesma view final. Se a DDL de um plano mudar, a do outro DEVE mudar junto.
- A migração da Task 2 deve ser aplicada no banco de produção ANTES do deploy do código da Task 3 (o `UPDATE` com coluna inexistente falha no Supabase).
- Preservar o guard monotônico de status existente em `processStatus` (`sent(1) < delivered(2) < read(3)`; `failed(4)` sempre aplica) — não alterar `STATUS_ORDINAL` nem o early-return de retrograde.
- Nunca sobrescrever `delivered_at`/`read_at` já persistidos (primeiro webhook vence).
- `read` implica `delivered`: se o webhook de `delivered` for pulado pela Meta, o `read` preenche ambos.
- Testes: Vitest, colocados como `*.test.ts` ao lado do código em `src/lib/whatsapp/` (padrão do repo, ex.: `campaign-recipient-status.test.ts`). Comando: `npm test` ou `npx vitest run <arquivo>`.
- Não há testes de UI/rotas no repo para esta área — frontend e wiring do processor usam verificação manual explícita + `npx tsc --noEmit`.
- Migrations versionadas em `supabase/migrations/` com prefixo `YYYYMMDD_` (padrão do repo). O arquivo histórico `worder-cloud-api-fixes/05A-inbox-unification.sql` NÃO deve ser editado — é registro do que foi aplicado; a nova migration o supersede.
- Prosa/comentários de negócio em pt-BR, código (identificadores) em inglês — convenção observada no repo.
- Fatos verificados na leitura do código (não retrabalhar): o GET `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:65` JÁ mapeia `delivered_at`/`read_at` da view; o tipo `InboxMessage` (`src/types/inbox.ts:214-215`) JÁ declara `delivered_at?`/`read_at?`; o hook `src/hooks/useInboxMessages.ts:380-393` JÁ seta os campos otimisticamente via realtime. Esses pontos são só verificação, não implementação.

---

### Task 1: Função pura `statusTimestampFields` (status → timestamps) com testes

**Files:**
- Create: `src/lib/whatsapp/status-timestamps.ts`
- Test: `src/lib/whatsapp/status-timestamps.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependências do repo).
- Produces:
  - `epochToIso(epoch: string | number | undefined | null): string | null` — converte epoch da Meta (segundos, string) em ISO 8601; `null` para entrada ausente/ inválida.
  - `statusTimestampFields(newStatus: string, epochTimestamp: string | number | undefined | null, context?: { currentDeliveredAt?: string | null; currentReadAt?: string | null }): { delivered_at?: string; read_at?: string }` — campos a mesclar no `UPDATE` de `whatsapp_cloud_messages`. A Task 3 importa exatamente esses nomes de `./status-timestamps`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/status-timestamps.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { epochToIso, statusTimestampFields } from './status-timestamps'

describe('epochToIso', () => {
  it('converte epoch em segundos (string, formato da Meta) para ISO', () => {
    expect(epochToIso('1753600000')).toBe('2025-07-27T07:06:40.000Z')
  })

  it('aceita number', () => {
    expect(epochToIso(1753600000)).toBe('2025-07-27T07:06:40.000Z')
  })

  it('retorna null para entrada ausente ou inválida', () => {
    expect(epochToIso(undefined)).toBeNull()
    expect(epochToIso(null)).toBeNull()
    expect(epochToIso('')).toBeNull()
    expect(epochToIso('abc')).toBeNull()
    expect(epochToIso('-5')).toBeNull()
  })
})

describe('statusTimestampFields', () => {
  it("'delivered' preenche delivered_at a partir do timestamp do webhook", () => {
    expect(statusTimestampFields('delivered', '1753600000')).toEqual({
      delivered_at: '2025-07-27T07:06:40.000Z',
    })
  })

  it("'read' preenche read_at E delivered_at (read implica delivered)", () => {
    expect(statusTimestampFields('read', '1753600000')).toEqual({
      delivered_at: '2025-07-27T07:06:40.000Z',
      read_at: '2025-07-27T07:06:40.000Z',
    })
  })

  it("'read' não sobrescreve delivered_at já persistido", () => {
    expect(
      statusTimestampFields('read', '1753600000', {
        currentDeliveredAt: '2025-07-27T07:00:00.000Z',
      }),
    ).toEqual({ read_at: '2025-07-27T07:06:40.000Z' })
  })

  it("'delivered' repetido não sobrescreve delivered_at já persistido", () => {
    expect(
      statusTimestampFields('delivered', '1753601000', {
        currentDeliveredAt: '2025-07-27T07:06:40.000Z',
      }),
    ).toEqual({})
  })

  it("'read' repetido não sobrescreve read_at já persistido", () => {
    expect(
      statusTimestampFields('read', '1753602000', {
        currentDeliveredAt: '2025-07-27T07:06:40.000Z',
        currentReadAt: '2025-07-27T07:10:00.000Z',
      }),
    ).toEqual({})
  })

  it("'sent' e 'failed' não geram timestamps", () => {
    expect(statusTimestampFields('sent', '1753600000')).toEqual({})
    expect(statusTimestampFields('failed', '1753600000')).toEqual({})
  })

  it('timestamp ausente cai no fallback now() em ISO (delivered)', () => {
    const before = Date.now()
    const fields = statusTimestampFields('delivered', undefined)
    const after = Date.now()
    expect(fields.delivered_at).toBeDefined()
    const t = new Date(fields.delivered_at!).getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/status-timestamps.test.ts`
Expected: FAIL — `Cannot find module './status-timestamps'` (ou equivalente de resolução de import).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/status-timestamps.ts`:

```ts
/**
 * Mapeia um status webhook da Meta (statuses[].status + statuses[].timestamp,
 * epoch em SEGUNDOS como string) para os campos delivered_at/read_at a mesclar
 * no UPDATE de whatsapp_cloud_messages.
 *
 * Regras:
 *   - 'delivered' → delivered_at (se ainda não persistido)
 *   - 'read'      → read_at (se ainda não persistido) + delivered_at (se
 *                   ausente — Meta às vezes pula o webhook de delivered)
 *   - 'sent'/'failed'/outros → {} (nenhum timestamp)
 *   - Nunca sobrescreve valor já persistido (primeiro webhook vence).
 *   - timestamp ausente/inválido → fallback now() (melhor aproximação).
 *
 * Função pura — o guard monotônico de status continua em processStatus.
 */

export interface StatusTimestampContext {
  currentDeliveredAt?: string | null;
  currentReadAt?: string | null;
}

export interface StatusTimestampFields {
  delivered_at?: string;
  read_at?: string;
}

export function epochToIso(epoch: string | number | undefined | null): string | null {
  if (epoch === undefined || epoch === null || epoch === '') return null;
  const seconds = Number(epoch);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

export function statusTimestampFields(
  newStatus: string,
  epochTimestamp: string | number | undefined | null,
  context: StatusTimestampContext = {},
): StatusTimestampFields {
  if (newStatus !== 'delivered' && newStatus !== 'read') return {};

  const iso = epochToIso(epochTimestamp) ?? new Date().toISOString();
  const fields: StatusTimestampFields = {};

  if (newStatus === 'delivered') {
    if (!context.currentDeliveredAt) fields.delivered_at = iso;
  } else {
    // read
    if (!context.currentReadAt) fields.read_at = iso;
    if (!context.currentDeliveredAt) fields.delivered_at = iso;
  }

  return fields;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/status-timestamps.test.ts`
Expected: PASS — 8+ testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/status-timestamps.ts src/lib/whatsapp/status-timestamps.test.ts
git commit -m "feat(whatsapp): funcao pura status->delivered_at/read_at com testes"
```

---

### Task 2: Migração — colunas `delivered_at`/`read_at` + recriar view `whatsapp_inbox_messages`

**Files:**
- Create: `supabase/migrations/20260727_wcm_delivery_read_receipts.sql`

**Interfaces:**
- Consumes: tabela `whatsapp_cloud_messages` (definida em `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql:286-326` — confirmado que NÃO possui `delivered_at`/`read_at`); view atual em `worder-cloud-api-fixes/05A-inbox-unification.sql:109-172` (fixa `NULL::TIMESTAMPTZ AS delivered_at/read_at` nas linhas 133-134 e 167-168).
- Produces: colunas `whatsapp_cloud_messages.delivered_at TIMESTAMPTZ` e `read_at TIMESTAMPTZ` (usadas pela Task 3) e view `whatsapp_inbox_messages` expondo `m.delivered_at`/`m.read_at` no branch cloud (consumida pelo GET já existente).

- [ ] **Step 1: Escrever a migration completa**

Criar `supabase/migrations/20260727_wcm_delivery_read_receipts.sql`:

```sql
-- ============================================================
-- Delivery/Read receipts — timestamps reais no inbox
--
-- 1. Colunas delivered_at/read_at em whatsapp_cloud_messages
--    (alimentadas pelo processStatus a partir de statuses[].timestamp).
-- 2. Recria whatsapp_inbox_messages expondo as colunas reais no
--    branch cloud (antes fixava NULL).
--
-- COORDENACAO: o plano 2026-07-27-inbound-media-pipeline tambem
-- recria esta view. As DUAS migracoes usam DDL de view IDENTICA
-- (superset: colunas de midia + media_storage_path + delivered_at/
-- read_at reais) e ADD COLUMN IF NOT EXISTS defensivo para as
-- colunas do outro plano — qualquer ordem de execucao converge
-- para a mesma view final.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP VIEW IF EXISTS +
-- CREATE VIEW. DROP+CREATE (nao OR REPLACE) porque a lista de
-- colunas muda (media_storage_path entra no meio) e OR REPLACE
-- nao permite alterar a lista de colunas.
-- ============================================================

-- 1. Novas colunas de timestamps de status
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- 1b. Defensivo: colunas de midia do plano inbound-media-pipeline.
--     No-op se aquele plano ja rodou; garante que a view abaixo compile.
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS media_url          TEXT,
  ADD COLUMN IF NOT EXISTS media_filename     TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type    TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

-- 1c. Defensivo: colunas de midia da tabela legacy (mesmo bloco do
--     plano inbound-media-pipeline; no-op se aquele plano ja rodou).
DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS media_url       TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS media_filename  VARCHAR(255);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping media columns';
END $$;

-- 2. Recriar a view unificada do inbox
--    DDL IDENTICA a do plano 2026-07-27-inbound-media-pipeline
--    (superset). Muda vs. 05A-inbox-unification.sql: cloud expoe
--    m.delivered_at/m.read_at e midia real; legacy expoe midia real;
--    media_storage_path entra logo apos media_mime_type.

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

SELECT 'delivered_at/read_at + view whatsapp_inbox_messages atualizados' AS resultado;
```

- [ ] **Step 2: Verificação manual — aplicar no banco**

Aplicar o conteúdo do arquivo no SQL Editor do Supabase (projeto de produção/staging usado pelo app), ou via MCP `apply_migration` se disponível.
Expected: retorno `delivered_at/read_at + view whatsapp_inbox_messages atualizados`, sem erro. Rodar duas vezes para provar idempotência (segunda execução também deve passar).

- [ ] **Step 3: Verificação manual — colunas e view**

No SQL Editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'whatsapp_cloud_messages'
  AND column_name IN ('delivered_at', 'read_at', 'media_url');

SELECT id, status, delivered_at, read_at
FROM whatsapp_inbox_messages
WHERE provider = 'cloud'
LIMIT 3;
```

Expected: primeira query retorna as 3 linhas; segunda executa sem erro (valores `NULL` por enquanto — serão preenchidos pela Task 3).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727_wcm_delivery_read_receipts.sql
git commit -m "feat(db): delivered_at/read_at em whatsapp_cloud_messages + view inbox com timestamps reais"
```

---

### Task 3: `processStatus` grava `delivered_at`/`read_at` a partir de `statuses[].timestamp`

**Files:**
- Modify: `src/lib/whatsapp/webhook-processor.ts:417-465` (função `processStatus`; imports no topo `:20-29`)

**Interfaces:**
- Consumes: `statusTimestampFields(newStatus, epochTimestamp, { currentDeliveredAt, currentReadAt })` de `src/lib/whatsapp/status-timestamps.ts` (Task 1); colunas `delivered_at`/`read_at` (Task 2).
- Produces: rows de `whatsapp_cloud_messages` com `delivered_at`/`read_at` preenchidos — a view (Task 2) e o GET do inbox passam a servir valores reais; frontend (Task 4) os exibe.

- [ ] **Step 1: Adicionar o import da função pura**

Em `src/lib/whatsapp/webhook-processor.ts`, logo após a linha 29 (`import { applyCampaignRecipientWebhookStatus } from './campaign-recipient-status';`):

```ts
import { statusTimestampFields } from './status-timestamps';
```

- [ ] **Step 2: Destructurar `timestamp` do payload de status**

Na linha 418, trocar:

```ts
  const { id: messageId, status: newStatus, errors, conversation, pricing } = status;
```

por:

```ts
  const { id: messageId, status: newStatus, timestamp, errors, conversation, pricing } = status;
```

- [ ] **Step 3: Selecionar os timestamps atuais no guard**

Nas linhas 423-427, trocar o `.select('status')` para incluir os timestamps (necessário para a regra "primeiro webhook vence"):

```ts
  const { data: currentRow } = await supabase
    .from('whatsapp_cloud_messages')
    .select('status, delivered_at, read_at')
    .eq('message_id', messageId)
    .maybeSingle();
```

- [ ] **Step 4: Mesclar os campos no `updateData`**

Nas linhas 441-444, trocar:

```ts
  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
```

por:

```ts
  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    // statuses[].timestamp (epoch string da Meta) -> delivered_at/read_at.
    // Roda DEPOIS do guard monotonico acima; nunca sobrescreve valor ja gravado.
    ...statusTimestampFields(newStatus, timestamp, {
      currentDeliveredAt: currentRow?.delivered_at,
      currentReadAt: currentRow?.read_at,
    }),
  };
```

Não alterar mais nada em `processStatus` — o guard monotônico (`:429-439`), o bloco de `errors`/`conversation`/`pricing` (`:446-460`) e o gate de campanha (`:472-477`) permanecem como estão.

- [ ] **Step 5: Typecheck + suíte completa**

Run: `npx tsc --noEmit`
Expected: sem novos erros (comparar com baseline antes da mudança, se o repo já tiver erros pré-existentes).

Run: `npm test`
Expected: PASS — inclui os testes da Task 1 e os testes existentes de `src/lib/whatsapp/` (nenhuma regressão).

- [ ] **Step 6: Verificação manual end-to-end (parte servidor)**

Pré-requisito: migração da Task 2 aplicada. Com o app deployado (ou dev apontando para o banco migrado e recebendo webhooks via túnel/QStash):
1. Enviar uma mensagem outbound pelo inbox para um número real.
2. Ler a mensagem no celular de destino.
3. No SQL Editor: `SELECT status, delivered_at, read_at FROM whatsapp_cloud_messages ORDER BY created_at DESC LIMIT 1;`

Expected: `status = 'read'`, `delivered_at` e `read_at` preenchidos com horários coerentes (delivered <= read), correspondendo ao horário real do evento (não ao horário de processamento).

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp/webhook-processor.ts
git commit -m "feat(whatsapp): processStatus persiste delivered_at/read_at do webhook de status"
```

---

### Task 4: Frontend — tooltip de horário nos checks do `MessageBubble` + verificação do GET

**Files:**
- Modify: `src/components/whatsapp/inbox/ChatPanel.tsx:53-79` (helpers + `MessageStatus`) e `:185` (call site dentro de `MessageBubble`)
- Verify (sem mudança de código): `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:60-67` e `src/types/inbox.ts:213-215`

**Interfaces:**
- Consumes: `InboxMessage.delivered_at?: string` e `InboxMessage.read_at?: string` (`src/types/inbox.ts:214-215`, já existentes), servidos pelo GET (`route.ts:65`, já mapeados) a partir da view recriada na Task 2.
- Produces: componente `MessageStatus({ status, deliveredAt, readAt })` — ícones ✓ (sent, cinza), ✓✓ (delivered, cinza), ✓✓ (read, ciano) já existentes ganham `title` com "Entregue HH:mm" / "Lida HH:mm".

- [ ] **Step 1: Confirmar que o GET e o tipo já expõem os campos (verificação, não implementação)**

Ler `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:60-67` e confirmar que o map contém `delivered_at: m.delivered_at, read_at: m.read_at`. Ler `src/types/inbox.ts:213-215` e confirmar `delivered_at?: string` / `read_at?: string`.
Expected: ambos presentes (verificado na escrita deste plano) — se presentes, NENHUMA mudança nesses dois arquivos.

- [ ] **Step 2: Adicionar helper de data+hora**

Em `src/components/whatsapp/inbox/ChatPanel.tsx`, logo após `formatMessageTime` (linhas 53-56), adicionar:

```tsx
const formatMessageDateTime = (date?: string) => {
  if (!date) return ''
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
```

- [ ] **Step 3: `MessageStatus` com tooltip**

Substituir o componente `MessageStatus` (linhas 69-79) por:

```tsx
// Status Icon — checks estilo WhatsApp com tooltip de entrega/leitura
function MessageStatus({ status, deliveredAt, readAt }: {
  status: InboxMessage['status']
  deliveredAt?: string
  readAt?: string
}) {
  const tooltip = [
    deliveredAt ? `Entregue ${formatMessageDateTime(deliveredAt)}` : null,
    readAt ? `Lida ${formatMessageDateTime(readAt)}` : null,
  ].filter(Boolean).join(' · ')

  const icon = (() => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-gray-400" />
      case 'sent': return <Check className="w-4 h-4 text-gray-400" />
      case 'delivered': return <CheckCheck className="w-4 h-4 text-gray-400" />
      case 'read': return <CheckCheck className="w-4 h-4 text-cyan-400" />
      case 'failed': return <AlertCircle className="w-4 h-4 text-error-400" />
      default: return <Clock className="w-4 h-4 text-gray-400" />
    }
  })()

  return <span title={tooltip || undefined} className="inline-flex">{icon}</span>
}
```

- [ ] **Step 4: Passar os timestamps no call site**

Na linha 185 (rodapé do `MessageBubble`), trocar:

```tsx
          {isOutbound && <MessageStatus status={message.status} />}
```

por:

```tsx
          {isOutbound && (
            <MessageStatus
              status={message.status}
              deliveredAt={message.delivered_at}
              readAt={message.read_at}
            />
          )}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

Run: `npm run build`
Expected: build Next.js conclui sem erro.

- [ ] **Step 6: Verificação manual no browser**

Pré-requisito: Tasks 2 e 3 aplicadas/deployadas.
1. `npm run dev` e abrir o inbox do WhatsApp.
2. Enviar uma mensagem para um número real; observar ✓ cinza (sent).
3. Quando entregar: ✓✓ cinza; hover no ícone mostra tooltip `Entregue dd/mm HH:mm`.
4. Ler no celular: ✓✓ ciano; hover mostra `Entregue dd/mm HH:mm · Lida dd/mm HH:mm`.
5. Recarregar a página (F5) e confirmar que os tooltips PERSISTEM (agora vêm do banco via GET, não só do estado otimista do realtime em `useInboxMessages.ts:380-393`).
6. Mensagens antigas (anteriores à migração) continuam renderizando sem tooltip e sem erro (campos `NULL`).

Expected: os 6 pontos acima confirmados.

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/inbox/ChatPanel.tsx
git commit -m "feat(inbox): tooltip de entrega/leitura nos checks do MessageBubble"
```

---

## Autocheck (executado na escrita do plano)

- **Cobertura:** migração ADD COLUMN → Task 2; `processStatus` gravando timestamps com guard monotônico intacto → Task 3; recriação da view → Task 2; GET mapeando campos → Task 4 Step 1 (já existente, verificação); MessageBubble com checks + tooltip → Task 4; teste unitário da função pura → Task 1; verificação manual → Tasks 2/3/4. Sem lacunas.
- **Placeholders:** nenhum — todo step tem código real ou comando/expectativa explícita.
- **Consistência de nomes:** `statusTimestampFields`/`epochToIso` (Task 1) = import da Task 3; colunas `delivered_at`/`read_at` (Task 2) = campos do `updateData` (Task 3) = view (Task 2) = GET/`InboxMessage` (Task 4); props `deliveredAt`/`readAt` consistentes entre `MessageStatus` e call site.
