# P0 — WhatsApp Campaign Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o pipeline de campanhas WhatsApp ponta a ponta: disparo automático de campanhas agendadas (claim atômico), processamento de `scheduled_messages` (com opt-out-guard, janela de 24h, recorrência e timezone), correção do bug de IDs temporários de recipients, propagação de status do webhook para `whatsapp_campaign_recipients` (com guard anti-retrógrado e métricas agregadas), bloqueio de envio com template não-APPROVED e verificação operacional de saúde do worker Railway.

**Architecture:** Next.js 14 App Router (rotas cron autenticadas por `x-vercel-cron` / `Bearer CRON_SECRET`, padrão de `send-scheduled-campaigns`), Supabase Postgres com admin client (`supabaseAdmin`, service role, bypassa RLS), fila própria em Upstash Redis (`MessageQueue` em `src/lib/whatsapp/queue.ts`), worker standalone em Railway (`worker/campaign-worker.ts`, que compila `../src/**`), logging estruturado via `wlog` (`src/lib/observability/whatsapp-logger.ts`), guard obrigatório `requireOptIn` (`src/lib/whatsapp/opt-out-guard.ts`).

**Tech Stack:** TypeScript, Next.js 14, Supabase (Postgres + RPC plpgsql), Upstash Redis, Vitest (config em `vitest.config.ts`, testes `src/**/*.test.ts`, setup `src/tests/setup.ts`), Vercel Crons (`vercel.json`), Meta WhatsApp Cloud API.

---

## Contexto e Análise de Impacto

### Divergências encontradas (realidade vs. briefing)

Tudo do briefing foi verificado no worktree `D:\worder1-fwrle`. Divergências e achados extras:

1. **`calculate_next_occurrence` existe apenas em `sql/fase3-scheduled-messages.sql`** (pasta de scripts manuais, NÃO em `supabase/migrations/`). Não há garantia de que está aplicada em produção. **Decisão: recorrência calculada em TypeScript** (`computeNextOccurrence`), determinística e testável, sem dependência do RPC.
2. **`whatsapp_templates.status` é gravado em UPPERCASE** pelos caminhos vivos: sync (`src/app/api/whatsapp/cloud/templates/route.ts:78` faz `.toUpperCase()`), webhook (`webhook-processor.ts:474` idem), resync cron compara `'PENDING'`. Porém o schema legado (`supabase/campaigns-schema.sql:23`) tem default `'pending'` minúsculo. **Decisão: validação case-insensitive** (`status.toUpperCase() === 'APPROVED'`).
3. **`POST /api/whatsapp/campaigns/[id]/send` NÃO tem autenticação nenhuma** (nem `getAuthClient` nem `requireOrgFromAuth`) — qualquer um com o UUID dispara campanha. O plano adiciona auth com `getAuthClient` + escopo de org (mesmo padrão dos siblings `route.ts` e `[id]/route.ts`), além da validação de template.
4. **Bug extra em `createRecipients`**: para `audience_type='import'`, `contact_id` recebe `'imported-${i}'` (string não-UUID) → o INSERT em coluna UUID **falha**, e o erro é ignorado (insert sem check de `error`). Corrigido na Task 2 junto com o bug dos IDs `new-${i}`.
5. **Dois caminhos de envio coexistem**: campanhas usam `whatsapp_instances` + `meta-api.ts` (`sendTemplateMessage`); inbox/IA usam `whatsapp_business_accounts` + `cloud-api.ts` (`createWhatsAppCloudClient`). O sender canônico da branch (usado pelo inbox, com janela de 24h e persistência em `whatsapp_cloud_messages`) é o caminho cloud — o **processador de `scheduled_messages` usará o caminho cloud**. O caminho de campanha permanece como está (refactor fora de escopo).
6. **Existe trigger `trigger_update_campaign_metrics`** (em `supabase/campaigns-schema.sql:218`) que faz 7 `COUNT(*)` por UPDATE de status de recipient — O(N²) quando o webhook passar a atualizar recipients. A migration o remove (se existir) e substitui por incrementos atômicos em RPC. Existe também `update_recipient_status_from_webhook` em `supabase/campaigns-high-scale.sql` (script manual, possivelmente nunca aplicado, e sem incremento de contadores) — substituído por um RPC novo e completo.
7. **Migrations**: a pasta `supabase/migrations/` mistura arquivos datados (`YYYYMMDD_*.sql`, último `20260614_ai_prompt_proposals.sql`) e não-datados legados. Nova migration nomeada `20260615_whatsapp_campaign_pipeline.sql` para ordenar após as existentes.
8. **`vercel.json` tem exatamente 32 crons**; adicionaremos 2 (total 34). Verificar limite do plano Vercel (Pro = 40 crons).
9. **Worker compila `../src/**`** (`worker/tsconfig.json` → `include: ["*.ts", "../src/**/*.ts"]`, alias `@/*` → `src/*`), então módulos novos em `src/lib/whatsapp/` ficam disponíveis no worker Railway sem mudança de build.
10. `sendAlert` (`src/lib/whatsapp/alerts.ts:6`) tem union fechada de `type` — será estendida com `'campaign_worker_stalled'`.

### Mapa de dados interligados

| Tabela | Quem escreve | Quem lê | Impacto deste pacote |
|---|---|---|---|
| `whatsapp_campaigns` | `campaigns/route.ts` (POST), `[id]/schedule`, `campaign-processor` (status running/failed/completed, totais via `increment_campaign_sent` e `checkCampaignCompletion`), **novo cron** (claim `scheduled`→`queued`) | UI `(dashboard)/whatsapp/campaigns/page.tsx` (lê `total_sent/total_delivered/total_read` p/ deliveryRate/readRate), `[id]/route.ts` GET (métricas), métricas agregadas no GET de listagem | Novo status transitório `'queued'`; `total_delivered/total_read/total_failed` passam a ser incrementados pelo webhook via RPC |
| `whatsapp_campaign_recipients` | `campaign-processor` (insert + update sent/failed/skipped), **webhook** (novo: delivered/read/failed via RPC) | `checkCampaignCompletion` (pending count + stats finais), `getRecipients` | Bug dos IDs corrigido habilita TODO o ciclo: insert→sent(meta_message_id)→webhook→completion. Sem org_id na tabela; lookup por `meta_message_id` (índice parcial garantido na migration) |
| `scheduled_messages` | CRUD (`/api/whatsapp/scheduled/*`), **novo cron** (claim `pending`→`processing`→`sent/failed/pending`(recorrência)) | hook `useScheduledMessages`, página `(dashboard)/whatsapp/scheduled/page.tsx` | Novo status transitório `'processing'` (não aparece nos stats da UI durante ~segundos — aceitável); reset de stuck `processing` >10min |
| `whatsapp_cloud_messages` | webhook (status), cloud/messages route, cloud-sender, **novo: scheduled-message-sender** | inbox UI | Mensagens agendadas passam a aparecer no histórico da conversa |
| `whatsapp_cloud_conversations` | webhook, cloud routes | cloud-sender (janela 24h), **novo: scheduled-message-sender** (validação de janela) | leitura apenas |
| `whatsapp_templates` | sync/webhook/resync (status UPPERCASE) | **novo: validação APPROVED** no send + startCampaign + scheduled sender | leitura apenas |
| `whatsapp_opt_status` | webhook STOP handler | `requireOptIn` (campaign-processor já usa; **novo: scheduled sender**) | leitura apenas |
| `notifications` | `whatsapp-dead-alert` (best-effort) | UI de notificações | + alerta de worker parado |
| Redis (Upstash) | `campaignQueue` (worker + processor), **novo: heartbeat key** | `whatsapp-dead-alert` (novo) | chave `whatsapp:campaigns:worker:heartbeat` TTL 180s |

### Riscos de race / duplicação e mitigações

- **Cron de campanhas roda a cada minuto** → claim atômico via RPC `claim_due_whatsapp_campaigns` com `FOR UPDATE SKIP LOCKED` movendo `scheduled`→`queued`. `startCampaign` passa a aceitar `'queued'`. Duas execuções simultâneas nunca pegam a mesma campanha.
- **Campanhas já em `'scheduled'` no banco com `scheduled_at` antigo** dispararão no primeiro tick pós-deploy. Mitigação: campanhas com `scheduled_at < NOW() - 48h` são marcadas `'cancelled'` com log `expired` em vez de enviadas (decisão de produto conservadora — enviar marketing atrasado dias é pior que cancelar).
- **`scheduled_messages`**: claim por UPDATE condicional (`.eq('status','pending')` + `.select()`), idempotente; linhas presas em `processing` >10min voltam a `pending` (crash recovery, `updated_at` mantido por trigger existente).
- **Webhooks fora de ordem** (delivered antes de sent / read sem delivered): RPC `apply_campaign_recipient_webhook` resolve com `SELECT ... FOR UPDATE` + ordinal (mesma semântica do guard `STATUS_ORDINAL` de `webhook-processor.ts:32`), e incrementa contadores por delta exato (read vindo de sent incrementa delivered E read), tudo em uma transação.
- **Dupla contagem de métricas**: `increment_campaign_sent` (no batch) conta sent/failed de envio; o novo RPC conta apenas delivered/read/failed-de-webhook; `checkCampaignCompletion` recomputa totais absolutos no fim (self-healing). O trigger O(N²) é dropado.
- **Compatibilidade**: nenhum dado existente é alterado; status novos (`queued`, `processing`) são VARCHARs sem constraint (verificado nos schemas). UI de campanhas mostra status desconhecido `queued` por segundos entre claim e `running` — cosmético.

---

## File Structure

```
supabase/migrations/20260615_whatsapp_campaign_pipeline.sql   [CRIAR] RPCs de claim + webhook recipient + contadores, índices, drop do trigger O(N²)
src/lib/whatsapp/campaign-processor.ts                        [MODIFICAR] fix IDs reais em createRecipients; aceitar status 'queued'; validação template em startCampaign
src/lib/whatsapp/template-approval.ts                         [CRIAR] isTemplateApproved + ensureCampaignTemplateApproved (validação case-insensitive)
src/lib/whatsapp/template-approval.test.ts                    [CRIAR] testes
src/lib/whatsapp/campaign-processor.test.ts                   [CRIAR] testes do createRecipients (IDs reais)
src/lib/whatsapp/scheduled-campaigns.ts                       [CRIAR] processDueWhatsappCampaigns (claim + dispatch + guard de stale)
src/lib/whatsapp/scheduled-campaigns.test.ts                  [CRIAR] testes
src/app/api/cron/send-scheduled-whatsapp-campaigns/route.ts   [CRIAR] cron (autentica como os 32 existentes)
src/lib/whatsapp/campaign-recipient-status.ts                 [CRIAR] applyCampaignRecipientWebhookStatus (chama RPC)
src/lib/whatsapp/campaign-recipient-status.test.ts            [CRIAR] testes
src/lib/whatsapp/webhook-processor.ts                         [MODIFICAR] processStatus chama o módulo acima
src/lib/whatsapp/scheduled-message-sender.ts                  [CRIAR] claim + validações (opt-out, janela 24h, template) + envio cloud + recorrência TS
src/lib/whatsapp/scheduled-message-sender.test.ts             [CRIAR] testes (computeNextOccurrence, validateScheduledSend)
src/app/api/cron/process-scheduled-messages/route.ts          [CRIAR] cron
src/lib/whatsapp/queue.ts                                     [MODIFICAR] getOldestPendingAgeMs()
src/lib/whatsapp/worker-heartbeat.ts                          [CRIAR] beat/get heartbeat em Redis + evaluateWorkerHealth (pura)
src/lib/whatsapp/worker-heartbeat.test.ts                     [CRIAR] testes da evaluateWorkerHealth
worker/campaign-worker.ts                                     [MODIFICAR] heartbeat no setupHealthCheck + no boot
src/app/api/cron/whatsapp-dead-alert/route.ts                 [MODIFICAR] checagem de fila parada + heartbeat
src/lib/whatsapp/alerts.ts                                    [MODIFICAR] +'campaign_worker_stalled' no union de type
src/app/api/whatsapp/campaigns/[id]/send/route.ts             [MODIFICAR] auth + validação de template APPROVED
vercel.json                                                   [MODIFICAR] +2 crons
```

---

## Task 1 — Migration: RPCs, índices e limpeza de trigger

**Files:**
- Create: `supabase/migrations/20260615_whatsapp_campaign_pipeline.sql`

TDD não se aplica (SQL puro). Verificação manual ao final.

- [ ] Criar `supabase/migrations/20260615_whatsapp_campaign_pipeline.sql` com o conteúdo completo:

```sql
-- =============================================
-- P0 — WhatsApp Campaign Pipeline
-- 1) Índices garantidos (schemas legados podem não tê-los em prod)
-- 2) Claim atômico de campanhas agendadas (FOR UPDATE SKIP LOCKED)
-- 3) Aplicação retrograde-safe de status de webhook em campaign_recipients
--    com incremento de contadores por delta exato (1 transação)
-- 4) Remove trigger O(N^2) de recontagem (substituído pelos deltas do item 3;
--    checkCampaignCompletion recomputa totais absolutos no fim da campanha)
-- =============================================

-- 1) Índices
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled
  ON whatsapp_campaigns(scheduled_at) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_recipients_meta_msg
  ON whatsapp_campaign_recipients(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
  ON scheduled_messages(scheduled_at) WHERE status IN ('pending', 'processing');

-- 2) Claim atômico de campanhas agendadas
CREATE OR REPLACE FUNCTION claim_due_whatsapp_campaigns(p_limit INT DEFAULT 3)
RETURNS SETOF whatsapp_campaigns AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_campaigns c
  SET status = 'queued', updated_at = NOW()
  WHERE c.id IN (
    SELECT w.id FROM whatsapp_campaigns w
    WHERE w.status = 'scheduled' AND w.scheduled_at <= NOW()
    ORDER BY w.scheduled_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION claim_due_whatsapp_campaigns TO service_role;

-- 3) Webhook -> recipient (anti-retrógrado + contadores por delta)
CREATE OR REPLACE FUNCTION apply_campaign_recipient_webhook(
  p_meta_message_id VARCHAR,
  p_new_status VARCHAR,
  p_error_code VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(recipient_id UUID, out_campaign_id UUID, applied BOOLEAN) AS $$
DECLARE
  v_id UUID;
  v_campaign UUID;
  v_old VARCHAR;
  v_old_ord INT;
  v_new_ord INT;
BEGIN
  SELECT r.id, r.campaign_id, r.status INTO v_id, v_campaign, v_old
  FROM whatsapp_campaign_recipients r
  WHERE r.meta_message_id = p_meta_message_id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN; -- mensagem não pertence a campanha (caminho comum: inbox)
  END IF;

  v_old_ord := CASE v_old
    WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
    WHEN 'failed' THEN 4 ELSE 0 END;
  v_new_ord := CASE p_new_status
    WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
    WHEN 'failed' THEN 4 ELSE 0 END;

  -- Guard anti-retrógrado (mesma semântica do STATUS_ORDINAL do
  -- webhook-processor para whatsapp_cloud_messages); failed sempre aplica.
  IF v_new_ord <= v_old_ord AND p_new_status <> 'failed' THEN
    RETURN QUERY SELECT v_id, v_campaign, FALSE;
    RETURN;
  END IF;

  UPDATE whatsapp_campaign_recipients SET
    status = p_new_status,
    delivered_at = CASE WHEN p_new_status IN ('delivered','read') AND delivered_at IS NULL
                        THEN p_timestamp ELSE delivered_at END,
    read_at      = CASE WHEN p_new_status = 'read' AND read_at IS NULL
                        THEN p_timestamp ELSE read_at END,
    failed_at    = CASE WHEN p_new_status = 'failed' AND failed_at IS NULL
                        THEN p_timestamp ELSE failed_at END,
    error_code   = COALESCE(p_error_code, error_code),
    error_message = COALESCE(p_error_message, error_message)
  WHERE id = v_id;

  -- Contadores por delta exato:
  --  read vindo direto de sent => +delivered E +read
  UPDATE whatsapp_campaigns SET
    total_delivered = COALESCE(total_delivered, 0) +
      CASE WHEN p_new_status IN ('delivered','read') AND v_old_ord < 2 THEN 1 ELSE 0 END,
    total_read = COALESCE(total_read, 0) +
      CASE WHEN p_new_status = 'read' AND v_old_ord < 3 THEN 1 ELSE 0 END,
    total_failed = COALESCE(total_failed, 0) +
      CASE WHEN p_new_status = 'failed' AND v_old <> 'failed' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = v_campaign;

  RETURN QUERY SELECT v_id, v_campaign, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION apply_campaign_recipient_webhook TO service_role;

-- 4) Remove o trigger de recontagem total (7 COUNT(*) por update de status;
--    com webhook atualizando recipients viraria O(N^2) por campanha).
DROP TRIGGER IF EXISTS trigger_update_campaign_metrics ON whatsapp_campaign_recipients;
```

- [ ] Verificação manual de sintaxe: `npx supabase db lint 2>$null` (se o CLI não estiver configurado, validar visualmente; a aplicação real ocorre via `mcp__supabase__apply_migration` ou SQL Editor no deploy)
- [ ] Commit: `git add supabase/migrations/20260615_whatsapp_campaign_pipeline.sql && git commit -m "feat(whatsapp): migration P0 — claim de campanhas, webhook->recipients e indices"`

---

## Task 2 — Bug dos IDs temporários em `createRecipients`

O bug verificado (`campaign-processor.ts:678-681`): `createRecipients` insere em batches de 500 **sem** `.select()` e retorna `id: 'new-${i}'`. Depois, `processBatch` faz `UPDATE ... .eq('id', 'new-0')` (linhas 455, 509, 532) — o update **nunca acha a linha** (e em coluna UUID o filtro com string inválida erra), então: `meta_message_id` nunca é gravado, status nunca vira `sent`, `checkCampaignCompletion` vê `pending > 0` para sempre e a campanha fica eternamente `running`. Bug extra: `contact_id: 'imported-${i}'` (não-UUID) quebra o INSERT silenciosamente para audiência `import`.

**Files:**
- Modify: `src/lib/whatsapp/campaign-processor.ts`
- Test: `src/lib/whatsapp/campaign-processor.test.ts`

- [ ] Escrever teste que falha em `src/lib/whatsapp/campaign-processor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks antes do import — vitest hoist (padrão de opt-out-guard.test.ts)
const inserted: any[] = []
const mockSelect = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      // createRecipients: insert(...).select(...)
      insert: vi.fn((rows: any[]) => {
        inserted.push(...rows)
        return {
          select: mockSelect,
        }
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}))

vi.mock('./queue', () => ({
  campaignQueue: { add: vi.fn(), getStats: vi.fn(), complete: vi.fn(), fail: vi.fn(), recoverStuckJobs: vi.fn() },
  MessageQueue: class {},
}))
vi.mock('./rate-limiter', () => ({ getRateLimiter: vi.fn(), WhatsAppRateLimiter: class {} }))
vi.mock('./circuit-breaker', () => ({ getCircuitBreaker: vi.fn(), CircuitBreaker: class {} }))
vi.mock('./meta-api', () => ({ sendTemplateMessage: vi.fn() }))
vi.mock('./opt-out-guard', () => ({ requireOptIn: vi.fn() }))
vi.mock('./alerts', () => ({ sendAlert: vi.fn() }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import CampaignProcessor from './campaign-processor'

describe('createRecipients', () => {
  beforeEach(() => {
    inserted.length = 0
    mockSelect.mockReset()
  })

  it('retorna IDs REAIS do banco (insert().select()), nunca new-N', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 'uuid-real-1', phone_number: '5511999990001', contact_name: 'A', resolved_variables: {}, retry_count: 0 },
        { id: 'uuid-real-2', phone_number: '5511999990002', contact_name: 'B', resolved_variables: {}, retry_count: 0 },
      ],
      error: null,
    })

    const processor = new CampaignProcessor()
    const campaign = {
      id: 'camp-1',
      organization_id: 'org-1',
      audience_type: 'import',
      imported_contacts: [
        { phone: '5511999990001', name: 'A' },
        { phone: '5511999990002', name: 'B' },
      ],
      template_variables: {},
    }

    const recipients = await (processor as any).createRecipients(campaign)

    expect(recipients).toHaveLength(2)
    expect(recipients.map((r: any) => r.id)).toEqual(['uuid-real-1', 'uuid-real-2'])
    expect(recipients.some((r: any) => String(r.id).startsWith('new-'))).toBe(false)
    // contact_id de import NÃO pode ser string não-UUID
    expect(inserted.every(r => r.contact_id === null || /^[0-9a-f-]{36}$/i.test(r.contact_id))).toBe(true)
  })

  it('propaga erro do insert em vez de ignorar', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'contact_id uuid inválido' } })
    const processor = new CampaignProcessor()
    const campaign = {
      id: 'camp-1', organization_id: 'org-1', audience_type: 'import',
      imported_contacts: [{ phone: '5511999990001', name: 'A' }], template_variables: {},
    }
    await expect((processor as any).createRecipients(campaign)).rejects.toThrow(/contact_id/)
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/campaign-processor.test.ts` — **esperado: 2 testes FALHAM** (retorno atual é `new-0`/`new-1` e erro é engolido)
- [ ] Implementar em `src/lib/whatsapp/campaign-processor.ts` — substituir o bloco "Criar recipients" até o `return` final de `createRecipients` (linhas ~658-682) por:

```typescript
    // Criar recipients. contact_id só é gravado quando é UUID real
    // (audiência 'import' gera ids sintéticos que NÃO podem ir pra coluna UUID).
    const isUuid = (v: any) =>
      typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

    const recipients = contacts.map(contact => ({
      campaign_id: campaign.id,
      contact_id: isUuid(contact.id) ? contact.id : null,
      phone_number: contact.phone_number,
      contact_name: contact.name,
      status: 'pending',
      resolved_variables: this.resolveVariables(campaign.template_variables, contact),
      queued_at: new Date().toISOString(),
    }))

    // Inserir em batches COM .select() pra retornar os IDs reais do banco.
    // Bug anterior: insert sem select + retorno de id 'new-${i}' fazia todos
    // os UPDATEs do processBatch (.eq('id', 'new-0')) falharem — recipient
    // nunca virava 'sent', meta_message_id nunca era gravado e a campanha
    // ficava 'running' pra sempre (checkCampaignCompletion via pending > 0).
    const insertBatchSize = 500
    const created: any[] = []
    for (let i = 0; i < recipients.length; i += insertBatchSize) {
      const { data, error } = await supabase
        .from('whatsapp_campaign_recipients')
        .insert(recipients.slice(i, i + insertBatchSize))
        .select('id, phone_number, contact_name, resolved_variables, retry_count')

      if (error) {
        throw new Error(`Failed to create recipients (batch ${i / insertBatchSize}): ${error.message}`)
      }
      created.push(...(data || []))
    }

    return created
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/campaign-processor.test.ts` — **esperado: 2 passed**
- [ ] Rodar suite inteira para regressão: `npx vitest run src/lib/whatsapp` — **esperado: 0 failed**
- [ ] Commit: `git add -A && git commit -m "fix(whatsapp): createRecipients retorna IDs reais do banco — corrige campanha presa em running"`

---

## Task 3 — Validação de template APPROVED (criação permite draft; envio bloqueia)

Decisão confirmada: criação/agendamento com template pendente é permitida; **envio é bloqueado** em `POST /send` (com auth, que hoje não existe) e em `startCampaign` (defesa em profundidade — cobre o cron e o resume).

**Files:**
- Create: `src/lib/whatsapp/template-approval.ts`
- Test: `src/lib/whatsapp/template-approval.test.ts`
- Modify: `src/lib/whatsapp/campaign-processor.ts`, `src/app/api/whatsapp/campaigns/[id]/send/route.ts`

- [ ] Escrever `src/lib/whatsapp/template-approval.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMaybeSingle = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
          eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
        })),
      })),
    })),
  },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { isTemplateApproved, ensureCampaignTemplateApproved } from './template-approval'

describe('isTemplateApproved', () => {
  it('aceita APPROVED em qualquer case (banco mistura APPROVED e approved)', () => {
    expect(isTemplateApproved('APPROVED')).toBe(true)
    expect(isTemplateApproved('approved')).toBe(true)
    expect(isTemplateApproved('Approved')).toBe(true)
  })
  it('rejeita pending/rejected/paused/disabled/null', () => {
    for (const s of ['PENDING', 'pending', 'REJECTED', 'PAUSED', 'DISABLED', null, undefined, '']) {
      expect(isTemplateApproved(s as any)).toBe(false)
    }
  })
})

describe('ensureCampaignTemplateApproved', () => {
  beforeEach(() => mockMaybeSingle.mockReset())

  it('ok=true quando template_id aponta pra template APPROVED', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'APPROVED', name: 'promo' } })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-1', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(true)
  })

  it('ok=false com motivo claro quando status != approved', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: 'PENDING', name: 'promo' } })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-1', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/PENDING/)
  })

  it('ok=false quando template não existe', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null })
    const r = await ensureCampaignTemplateApproved({ template_id: 'tpl-x', template_name: null, organization_id: 'org-1' })
    expect(r.ok).toBe(false)
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/template-approval.test.ts` — **esperado: FALHA (módulo não existe)**
- [ ] Criar `src/lib/whatsapp/template-approval.ts`:

```typescript
// =============================================
// P0 — Validação de template APPROVED.
// Política: criar/agendar campanha com template pendente é permitido,
// mas ENVIAR é bloqueado (send route + startCampaign — defesa em profundidade).
// O status no banco mistura cases: sync/webhook gravam UPPERCASE
// ('APPROVED'), o schema legado tem default 'pending' minúsculo —
// comparação SEMPRE case-insensitive.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

export function isTemplateApproved(status: string | null | undefined): boolean {
  return (status || '').toUpperCase() === 'APPROVED'
}

export interface TemplateApprovalCheck {
  ok: boolean
  reason?: string
  template?: { name: string; status: string }
}

/**
 * Resolve o template da campanha (por template_id; fallback por
 * name + organization_id) e exige status APPROVED.
 */
export async function ensureCampaignTemplateApproved(campaign: {
  template_id?: string | null
  template_name?: string | null
  organization_id: string
}): Promise<TemplateApprovalCheck> {
  let row: { status: string; name: string } | null = null

  if (campaign.template_id) {
    const { data } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('status, name')
      .eq('id', campaign.template_id)
      .maybeSingle()
    row = data
  }

  if (!row && campaign.template_name) {
    const { data } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('status, name')
      .eq('organization_id', campaign.organization_id)
      .eq('name', campaign.template_name)
      .maybeSingle()
    row = data
  }

  if (!row) {
    return { ok: false, reason: 'Template da campanha não encontrado. Sincronize os templates antes de enviar.' }
  }

  if (!isTemplateApproved(row.status)) {
    wlog.warn('whatsapp.campaign.template_not_approved', {
      organization_id: campaign.organization_id,
      template_name: row.name,
      template_status: row.status,
    })
    return {
      ok: false,
      reason: `Template "${row.name}" não está aprovado pela Meta (status: ${row.status}). Aguarde a aprovação para enviar.`,
      template: row,
    }
  }

  return { ok: true, template: row }
}
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/template-approval.test.ts` — **esperado: 5 passed**
- [ ] Em `src/lib/whatsapp/campaign-processor.ts`, dentro de `startCampaign`, logo após o check de status (linha ~128), adicionar (com import no topo `import { ensureCampaignTemplateApproved } from './template-approval'`):

```typescript
      // P0 — defesa em profundidade: nunca enviar com template não-APPROVED
      // (o send route também valida; aqui cobre cron e resume).
      const tplCheck = await ensureCampaignTemplateApproved(campaign)
      if (!tplCheck.ok) {
        throw new Error(tplCheck.reason || 'Template not approved')
      }
```

- [ ] Substituir `src/app/api/whatsapp/campaigns/[id]/send/route.ts` por (adiciona auth — hoje a rota é pública — e a validação):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
import { campaignProcessor } from '@/lib/whatsapp/campaign-processor'
import { ensureCampaignTemplateApproved } from '@/lib/whatsapp/template-approval'
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/campaigns/[id]/send - Iniciar envio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // P0: rota era pública — agora exige usuário autenticado e a campanha
    // precisa pertencer a uma org do usuário (mesmo padrão de [id]/route.ts).
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      auth.user.organization_id,
      ...(memberships?.map((m: any) => m.organization_id) || []),
    ])]

    const { data: campaign } = await supabase
      .from('whatsapp_campaigns')
      .select('id, organization_id, template_id, template_name')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // P0: bloquear envio com template não-APPROVED (draft pendente é
    // permitido na criação; envio não).
    const tplCheck = await ensureCampaignTemplateApproved(campaign)
    if (!tplCheck.ok) {
      return NextResponse.json({ error: tplCheck.reason, code: 'TEMPLATE_NOT_APPROVED' }, { status: 400 })
    }

    const result = await campaignProcessor.startCampaign(id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Campaign queued for processing',
      totalRecipients: result.totalRecipients,
      totalBatches: result.totalBatches,
    })
  } catch (error: any) {
    console.error('Error sending campaign:', error)
    return NextResponse.json({ error: error.message || 'Failed to send campaign' }, { status: 500 })
  }
}
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp` e `npx tsc --noEmit` — **esperado: 0 failed / sem erros novos de tipo nos arquivos tocados**
- [ ] Commit: `git add -A && git commit -m "feat(whatsapp): bloquear envio de campanha com template nao-APPROVED + auth no send"`

---

## Task 4 — Cron de campanhas WhatsApp agendadas

**Files:**
- Create: `src/lib/whatsapp/scheduled-campaigns.ts`
- Test: `src/lib/whatsapp/scheduled-campaigns.test.ts`
- Create: `src/app/api/cron/send-scheduled-whatsapp-campaigns/route.ts`
- Modify: `src/lib/whatsapp/campaign-processor.ts` (aceitar status `'queued'`), `vercel.json`

- [ ] Escrever `src/lib/whatsapp/scheduled-campaigns.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.fn()
const mockUpdateEq = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: mockUpdateEq })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { processDueWhatsappCampaigns, STALE_CAMPAIGN_MS } from './scheduled-campaigns'

describe('processDueWhatsappCampaigns', () => {
  const startCampaign = vi.fn()

  beforeEach(() => {
    mockRpc.mockReset()
    mockUpdateEq.mockReset().mockResolvedValue({ error: null })
    startCampaign.mockReset().mockResolvedValue({ success: true, totalRecipients: 10, totalBatches: 1 })
  })

  it('dispara startCampaign para cada campanha claimada pelo RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'c1', organization_id: 'o1', scheduled_at: new Date(Date.now() - 60_000).toISOString() },
        { id: 'c2', organization_id: 'o1', scheduled_at: new Date(Date.now() - 120_000).toISOString() },
      ],
      error: null,
    })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(mockRpc).toHaveBeenCalledWith('claim_due_whatsapp_campaigns', { p_limit: 3 })
    expect(startCampaign).toHaveBeenCalledTimes(2)
    expect(result.dispatched).toBe(2)
  })

  it('cancela (não envia) campanha stale agendada há mais de 48h', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'old', organization_id: 'o1', scheduled_at: new Date(Date.now() - STALE_CAMPAIGN_MS - 1000).toISOString() }],
      error: null,
    })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(startCampaign).not.toHaveBeenCalled()
    expect(result.expired).toBe(1)
  })

  it('retorna dispatched=0 quando não há campanhas due', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await processDueWhatsappCampaigns({ startCampaign })
    expect(result.dispatched).toBe(0)
  })

  it('propaga falha do RPC como erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
    await expect(processDueWhatsappCampaigns({ startCampaign })).rejects.toThrow(/function does not exist/)
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/scheduled-campaigns.test.ts` — **esperado: FALHA (módulo não existe)**
- [ ] Criar `src/lib/whatsapp/scheduled-campaigns.ts`:

```typescript
// =============================================
// P0 — Disparo de campanhas WhatsApp agendadas.
// Claim atômico via RPC claim_due_whatsapp_campaigns (FOR UPDATE SKIP
// LOCKED, scheduled -> queued). O cron roda a cada minuto; o claim
// garante que duas execuções nunca disparam a mesma campanha 2x.
// Campanhas com scheduled_at > 48h no passado (estado pré-deploy deste
// cron) são CANCELADAS em vez de enviadas — marketing atrasado dias é
// pior que não enviar.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

export const STALE_CAMPAIGN_MS = 48 * 60 * 60 * 1000

export interface DispatchDeps {
  startCampaign: (campaignId: string) => Promise<{ success: boolean; error?: string; totalRecipients?: number }>
}

export interface DispatchResult {
  dispatched: number
  expired: number
  failed: number
  results: Array<{ id: string; outcome: 'started' | 'expired' | 'failed'; error?: string }>
}

export async function processDueWhatsappCampaigns(deps: DispatchDeps): Promise<DispatchResult> {
  const { data: due, error } = await supabaseAdmin.rpc('claim_due_whatsapp_campaigns', { p_limit: 3 })
  if (error) throw new Error(`claim_due_whatsapp_campaigns failed: ${error.message}`)

  const result: DispatchResult = { dispatched: 0, expired: 0, failed: 0, results: [] }
  if (!due || due.length === 0) return result

  const cutoff = Date.now() - STALE_CAMPAIGN_MS

  for (const camp of due) {
    if (camp.scheduled_at && new Date(camp.scheduled_at).getTime() < cutoff) {
      await supabaseAdmin
        .from('whatsapp_campaigns')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', camp.id)
      await supabaseAdmin.from('whatsapp_campaign_logs').insert({
        campaign_id: camp.id,
        log_type: 'warning',
        message: `Campanha expirada: agendada para ${camp.scheduled_at}, mais de 48h no passado. Cancelada automaticamente.`,
      })
      wlog.warn('whatsapp.campaign.scheduled_expired', {
        campaign_id: camp.id,
        organization_id: camp.organization_id,
        scheduled_at: camp.scheduled_at,
      })
      result.expired++
      result.results.push({ id: camp.id, outcome: 'expired' })
      continue
    }

    try {
      const start = await deps.startCampaign(camp.id)
      if (start.success) {
        result.dispatched++
        result.results.push({ id: camp.id, outcome: 'started' })
        wlog.info('whatsapp.campaign.scheduled_dispatched', {
          campaign_id: camp.id,
          organization_id: camp.organization_id,
          total_recipients: start.totalRecipients,
        })
      } else {
        // startCampaign já marcou a campanha como 'failed' e logou.
        result.failed++
        result.results.push({ id: camp.id, outcome: 'failed', error: start.error })
      }
    } catch (err: any) {
      result.failed++
      result.results.push({ id: camp.id, outcome: 'failed', error: err?.message })
      wlog.error('whatsapp.campaign.scheduled_dispatch_error', {
        campaign_id: camp.id,
        error: err?.message,
      })
    }
  }

  return result
}
```

- [ ] Em `src/lib/whatsapp/campaign-processor.ts:126`, trocar a linha do check de status para aceitar o status de claim do cron:

```typescript
      if (!['draft', 'scheduled', 'paused', 'queued'].includes(campaign.status)) {
        throw new Error(`Campaign cannot be started (status: ${campaign.status})`)
      }
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/scheduled-campaigns.test.ts` — **esperado: 4 passed**
- [ ] Criar `src/app/api/cron/send-scheduled-whatsapp-campaigns/route.ts` (auth idêntica aos crons existentes):

```typescript
/**
 * CRON: Send scheduled WhatsApp campaigns
 * /api/cron/send-scheduled-whatsapp-campaigns
 *
 * A cada minuto, claima atomicamente (RPC FOR UPDATE SKIP LOCKED)
 * whatsapp_campaigns com status='scheduled' e scheduled_at <= now()
 * e dispara campaignProcessor.startCampaign (que enfileira batches
 * no Upstash Redis pro worker Railway processar).
 */

import { NextRequest, NextResponse } from 'next/server'
import { campaignProcessor } from '@/lib/whatsapp/campaign-processor'
import { processDueWhatsappCampaigns } from '@/lib/whatsapp/scheduled-campaigns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processDueWhatsappCampaigns({
      startCampaign: (id) => campaignProcessor.startCampaign(id),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
```

- [ ] Adicionar em `vercel.json` (dentro do array `crons`, após a entrada de `whatsapp-messaging-limit-check`):

```json
    {
      "path": "/api/cron/send-scheduled-whatsapp-campaigns",
      "schedule": "* * * * *"
    }
```

- [ ] Verificação manual: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"` — **esperado: `vercel.json OK`**
- [ ] Commit: `git add -A && git commit -m "feat(whatsapp): cron de campanhas agendadas com claim atomico (SKIP LOCKED)"`

---

## Task 5 — Webhook → `whatsapp_campaign_recipients`

`processStatus` (`webhook-processor.ts:416-465`) hoje só atualiza `whatsapp_cloud_messages`. Com a Task 2, `meta_message_id` passa a ser gravado nos recipients; agora o webhook fecha o ciclo. A UI lê: listagem (`campaigns/page.tsx:221-222`) e detalhe (`[id]/route.ts:50-56`) — ambas de `whatsapp_campaigns.total_*`, que o RPC da Task 1 incrementa por delta.

**Files:**
- Create: `src/lib/whatsapp/campaign-recipient-status.ts`
- Test: `src/lib/whatsapp/campaign-recipient-status.test.ts`
- Modify: `src/lib/whatsapp/webhook-processor.ts`

- [ ] Escrever `src/lib/whatsapp/campaign-recipient-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { rpc: (...args: any[]) => mockRpc(...args) },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { applyCampaignRecipientWebhookStatus } from './campaign-recipient-status'

describe('applyCampaignRecipientWebhookStatus', () => {
  beforeEach(() => mockRpc.mockReset())

  it('chama o RPC com meta_message_id, status e erros', async () => {
    mockRpc.mockResolvedValue({ data: [{ recipient_id: 'r1', out_campaign_id: 'c1', applied: true }], error: null })
    const applied = await applyCampaignRecipientWebhookStatus('wamid.X', 'delivered', {
      errorCode: undefined, errorMessage: undefined,
    })
    expect(mockRpc).toHaveBeenCalledWith('apply_campaign_recipient_webhook', expect.objectContaining({
      p_meta_message_id: 'wamid.X',
      p_new_status: 'delivered',
    }))
    expect(applied).toBe(true)
  })

  it('retorna false quando mensagem não é de campanha (RPC sem linhas)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const applied = await applyCampaignRecipientWebhookStatus('wamid.inbox', 'read')
    expect(applied).toBe(false)
  })

  it('não lança quando o RPC falha (best-effort; cloud_messages já foi atualizado)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(applyCampaignRecipientWebhookStatus('wamid.X', 'read')).resolves.toBe(false)
  })

  it('ignora status fora do ciclo (ex.: warning)', async () => {
    const applied = await applyCampaignRecipientWebhookStatus('wamid.X', 'warning' as any)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(applied).toBe(false)
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/campaign-recipient-status.test.ts` — **esperado: FALHA (módulo não existe)**
- [ ] Criar `src/lib/whatsapp/campaign-recipient-status.ts`:

```typescript
// =============================================
// P0 — Propagação de status de webhook pra whatsapp_campaign_recipients.
// Toda a lógica (lookup por meta_message_id, guard anti-retrógrado e
// incremento de contadores da campanha por delta) vive no RPC
// apply_campaign_recipient_webhook (migration 20260615) em UMA transação
// com FOR UPDATE — imune à corrida delivered/read entre workers QStash.
// Chamado de processStatus (webhook-processor) como best-effort: a
// atualização de whatsapp_cloud_messages nunca é bloqueada por isto.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

const CAMPAIGN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed'])

export async function applyCampaignRecipientWebhookStatus(
  metaMessageId: string,
  newStatus: string,
  opts: { errorCode?: string; errorMessage?: string } = {},
): Promise<boolean> {
  if (!metaMessageId || !CAMPAIGN_STATUSES.has(newStatus)) return false

  const { data, error } = await supabaseAdmin.rpc('apply_campaign_recipient_webhook', {
    p_meta_message_id: metaMessageId,
    p_new_status: newStatus,
    p_error_code: opts.errorCode ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_timestamp: new Date().toISOString(),
  })

  if (error) {
    // Best-effort: loga e segue — o status em whatsapp_cloud_messages já foi
    // persistido pelo caller; recipient fica eventualmente consistente via
    // checkCampaignCompletion (recompute absoluto no fim da campanha).
    wlog.error('whatsapp.campaign.recipient_webhook_rpc_error', {
      meta_message_id: metaMessageId,
      new_status: newStatus,
      error: error.message,
    })
    return false
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return false // mensagem não pertence a campanha — caminho comum

  if (row.applied === false) {
    wlog.info('whatsapp.campaign.recipient_retrograde_skipped', {
      meta_message_id: metaMessageId,
      to: newStatus,
    })
  }
  return row.applied === true
}
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/campaign-recipient-status.test.ts` — **esperado: 4 passed**
- [ ] Em `src/lib/whatsapp/webhook-processor.ts`: adicionar import no topo (`import { applyCampaignRecipientWebhookStatus } from './campaign-recipient-status';`) e, no FINAL de `processStatus` (após o `await supabase.from('whatsapp_cloud_messages').update(...)` da linha ~461-464), adicionar:

```typescript
  // P0 — se a mensagem pertence a uma campanha (meta_message_id gravado pelo
  // campaign-processor), propaga delivered/read/failed pro recipient e pros
  // contadores da campanha. Best-effort: nunca falha o processamento do webhook.
  await applyCampaignRecipientWebhookStatus(messageId, newStatus, {
    errorCode: errors?.[0]?.code?.toString(),
    errorMessage: errors?.[0]?.message || errors?.[0]?.title,
  });
```

  Atenção: o guard de retrógrado das linhas 428-438 dá `return` antecipado quando o status de `whatsapp_cloud_messages` regrediria — mas mensagens de campanha **não existem** em `whatsapp_cloud_messages` (são enviadas via meta-api e gravadas só em recipients), então `currentRow` é null, ordinal 0, e o fluxo sempre chega ao final. Sem mudança necessária no guard.
- [ ] Rodar: `npx vitest run src/lib/whatsapp` — **esperado: 0 failed**
- [ ] Commit: `git add -A && git commit -m "feat(whatsapp): webhook propaga delivered/read/failed para campaign_recipients com guard anti-retrogrado"`

---

## Task 6 — Processador de `scheduled_messages`

Caminho canônico cloud: `whatsapp_business_accounts` + `createWhatsAppCloudClient` (como `cloud/messages/route.ts`), persistindo em `whatsapp_cloud_messages`. Recorrência em TS (`calculate_next_occurrence` SQL não é confiável em prod — ver divergência 1). Janela de 24h: texto livre fora da janela → `failed` com erro claro; template exige APPROVED.

**Nota sobre a coluna `timezone`:** `scheduled_at` é `TIMESTAMPTZ` (instante absoluto) — a comparação `scheduled_at <= now()` independe de timezone. A coluna `timezone` da tabela NÃO precisa entrar no cálculo do disparo; a recorrência soma intervalos fixos em UTC, o que preserva o horário de parede para zonas sem DST (caso do default `America/Sao_Paulo`, sem DST desde 2019). Decisão consciente: não converter por timezone na recorrência (YAGNI); se um dia houver orgs em zonas com DST, tratar como follow-up.

**Files:**
- Create: `src/lib/whatsapp/scheduled-message-sender.ts`
- Test: `src/lib/whatsapp/scheduled-message-sender.test.ts`
- Create: `src/app/api/cron/process-scheduled-messages/route.ts`
- Modify: `vercel.json`

- [ ] Escrever `src/lib/whatsapp/scheduled-message-sender.test.ts` (testa as funções puras — recorrência e decisão de envio):

```typescript
import { describe, it, expect } from 'vitest'
import { computeNextOccurrence, validateScheduledSend } from './scheduled-message-sender'

describe('computeNextOccurrence', () => {
  const base = '2026-06-10T14:00:00.000Z'

  it('daily soma 1 dia', () => {
    expect(computeNextOccurrence(base, 'daily', null)).toBe('2026-06-11T14:00:00.000Z')
  })
  it('weekly soma 7 dias', () => {
    expect(computeNextOccurrence(base, 'weekly', null)).toBe('2026-06-17T14:00:00.000Z')
  })
  it('monthly soma 1 mês preservando dia/hora (UTC)', () => {
    expect(computeNextOccurrence(base, 'monthly', null)).toBe('2026-07-10T14:00:00.000Z')
  })
  it('monthly clampa fim de mês (31 jan -> 28 fev)', () => {
    expect(computeNextOccurrence('2026-01-31T10:00:00.000Z', 'monthly', null)).toBe('2026-02-28T10:00:00.000Z')
  })
  it('retorna null quando próxima ocorrência passa do recurrence_end_date', () => {
    expect(computeNextOccurrence(base, 'daily', '2026-06-10')).toBeNull()
  })
  it('retorna null sem recorrência', () => {
    expect(computeNextOccurrence(base, null, null)).toBeNull()
  })
})

describe('validateScheduledSend', () => {
  const openConv = { is_window_open: true, window_expires_at: new Date(Date.now() + 3600_000).toISOString() }
  const closedConv = { is_window_open: false, window_expires_at: null }

  it('texto livre com janela aberta => ok', () => {
    expect(validateScheduledSend({ messageType: 'text', conversation: openConv, templateStatus: null }).ok).toBe(true)
  })
  it('texto livre fora da janela => erro claro WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({ messageType: 'text', conversation: closedConv, templateStatus: null })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('WINDOW_EXPIRED')
    expect(r.errorMessage).toMatch(/24h/i)
  })
  it('texto livre sem conversa => WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({ messageType: 'text', conversation: null, templateStatus: null })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('WINDOW_EXPIRED')
  })
  it('janela expirada por timestamp mesmo com is_window_open=true => WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({
      messageType: 'text',
      conversation: { is_window_open: true, window_expires_at: new Date(Date.now() - 1000).toISOString() },
      templateStatus: null,
    })
    expect(r.ok).toBe(false)
  })
  it('template APPROVED fora da janela => ok (template abre conversa)', () => {
    expect(validateScheduledSend({ messageType: 'template', conversation: null, templateStatus: 'APPROVED' }).ok).toBe(true)
  })
  it('template não aprovado => TEMPLATE_NOT_APPROVED', () => {
    const r = validateScheduledSend({ messageType: 'template', conversation: null, templateStatus: 'PENDING' })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('TEMPLATE_NOT_APPROVED')
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/scheduled-message-sender.test.ts` — **esperado: FALHA (módulo não existe)**
- [ ] Criar `src/lib/whatsapp/scheduled-message-sender.ts`:

```typescript
// =============================================
// P0 — Processador de scheduled_messages.
// Claim por UPDATE condicional pending->processing (idempotente entre
// ticks); envio pelo caminho canônico cloud (whatsapp_business_accounts +
// createWhatsAppCloudClient), com opt-out-guard OBRIGATÓRIO, validação de
// janela 24h (texto livre fora da janela => failed com erro claro;
// template exige APPROVED), persistência em whatsapp_cloud_messages e
// recorrência calculada em TS (calculate_next_occurrence SQL existe só em
// sql/fase3-scheduled-messages.sql — não confiável em prod).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { createWhatsAppCloudClient, normalizePhone } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import { requireOptIn, type TemplateCategory } from '@/lib/whatsapp/opt-out-guard'
import { isTemplateApproved } from '@/lib/whatsapp/template-approval'
import { wlog } from '@/lib/observability/whatsapp-logger'

const BATCH_LIMIT = 25            // mensagens por tick (cron roda a cada minuto)
const STUCK_PROCESSING_MS = 10 * 60 * 1000
const EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000 // pending atrasado > 6h não envia mais

// ---------------------------------------------
// Funções puras (testáveis)
// ---------------------------------------------

export function computeNextOccurrence(
  scheduledAt: string,
  recurrence: 'daily' | 'weekly' | 'monthly' | null | undefined,
  recurrenceEndDate: string | null | undefined,
): string | null {
  if (!recurrence) return null
  const d = new Date(scheduledAt)
  if (Number.isNaN(d.getTime())) return null

  const next = new Date(d)
  if (recurrence === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1)
  } else if (recurrence === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7)
  } else if (recurrence === 'monthly') {
    // soma 1 mês com clamp de fim de mês (31 jan -> 28/29 fev)
    const day = next.getUTCDate()
    next.setUTCDate(1)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, lastDay))
  } else {
    return null
  }

  if (recurrenceEndDate) {
    // recurrence_end_date é DATE — comparar pela data (UTC)
    const endOfDay = new Date(`${recurrenceEndDate}T23:59:59.999Z`)
    if (next.getTime() > endOfDay.getTime()) return null
  }

  return next.toISOString()
}

export interface ScheduledSendValidation {
  ok: boolean
  errorCode?: 'WINDOW_EXPIRED' | 'TEMPLATE_NOT_APPROVED'
  errorMessage?: string
}

export function validateScheduledSend(input: {
  messageType: string
  conversation: { is_window_open: boolean | null; window_expires_at: string | null } | null
  templateStatus: string | null
}): ScheduledSendValidation {
  if (input.messageType === 'template') {
    if (!isTemplateApproved(input.templateStatus)) {
      return {
        ok: false,
        errorCode: 'TEMPLATE_NOT_APPROVED',
        errorMessage: `Template não aprovado pela Meta (status: ${input.templateStatus ?? 'desconhecido'}).`,
      }
    }
    return { ok: true } // template aprovado abre conversa — janela não importa
  }

  // Conteúdo livre (texto/mídia): Meta rejeita fora da janela de 24h.
  const conv = input.conversation
  const windowExpired =
    !conv ||
    conv.is_window_open === false ||
    (conv.window_expires_at && new Date(conv.window_expires_at).getTime() < Date.now())

  if (windowExpired) {
    return {
      ok: false,
      errorCode: 'WINDOW_EXPIRED',
      errorMessage:
        'Fora da janela de 24h da Meta — mensagem livre seria rejeitada. Reagende usando um template aprovado.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------
// Processamento
// ---------------------------------------------

export interface ProcessScheduledResult {
  claimed: number
  sent: number
  failed: number
  rescheduled: number
  expired: number
  recovered: number
}

export async function processDueScheduledMessages(): Promise<ProcessScheduledResult> {
  const result: ProcessScheduledResult = { claimed: 0, sent: 0, failed: 0, rescheduled: 0, expired: 0, recovered: 0 }
  const nowIso = new Date().toISOString()

  // 0) Crash recovery: linhas presas em 'processing' há >10min voltam pra pending
  const { data: recovered } = await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('updated_at', new Date(Date.now() - STUCK_PROCESSING_MS).toISOString())
    .select('id')
  result.recovered = recovered?.length || 0

  // 1) Buscar candidatas
  const { data: due, error } = await supabaseAdmin
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(`scheduled_messages fetch failed: ${error.message}`)
  if (!due || due.length === 0) return result

  for (const msg of due) {
    // 2) Claim atômico por linha (cron roda a cada minuto — duas execuções
    //    concorrentes nunca processam a mesma row).
    const { data: claimed } = await supabaseAdmin
      .from('scheduled_messages')
      .update({ status: 'processing' })
      .eq('id', msg.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) continue
    result.claimed++

    try {
      const outcome = await processOne(msg)
      result[outcome]++
    } catch (err: any) {
      result.failed++
      await markFailed(msg.id, 'INTERNAL_ERROR', err?.message || 'unknown error')
    }
  }

  return result
}

async function processOne(
  msg: any,
): Promise<'sent' | 'failed' | 'rescheduled' | 'expired'> {
  // Expirado: agendado há horas (acúmulo pré-deploy ou cron parado).
  if (new Date(msg.scheduled_at).getTime() < Date.now() - EXPIRE_AFTER_MS) {
    await markFailed(msg.id, 'EXPIRED', 'Agendamento expirado (mais de 6h no passado) — não enviado.')
    return 'expired'
  }

  // 1) Resolver conta de envio: instance_id quando aponta pra uma
  //    whatsapp_business_accounts da org; fallback: primeira conta ativa.
  let account: any = null
  if (msg.instance_id) {
    const { data } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', msg.instance_id)
      .eq('organization_id', msg.organization_id)
      .eq('status', 'active')
      .maybeSingle()
    account = data
  }
  if (!account) {
    const { data } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('organization_id', msg.organization_id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    account = data
  }
  if (!account) {
    await markFailed(msg.id, 'NO_ACCOUNT', 'Nenhuma conta WhatsApp ativa na organização.')
    return 'failed'
  }

  const phone = normalizePhone(msg.phone_number)

  // 2) Categoria do template (pro bypass transacional do opt-out-guard)
  let tplCategory: TemplateCategory | undefined
  let tplStatus: string | null = null
  if (msg.message_type === 'template' && msg.template_name) {
    const { data: tpl } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('category, status')
      .eq('waba_id', account.id)
      .eq('name', msg.template_name)
      .maybeSingle()
    tplStatus = tpl?.status ?? null
    const upper = (tpl?.category || '').toUpperCase()
    if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') {
      tplCategory = upper as TemplateCategory
    }
  }

  // 3) Opt-out guard — OBRIGATÓRIO em todo sender novo da branch.
  const optCheck = await requireOptIn(msg.organization_id, phone, tplCategory, {
    sender: 'scheduled-message-sender',
  })
  if (!optCheck.allowed) {
    await markFailed(msg.id, 'OPTED_OUT', 'Contato optou por não receber mensagens (opt-out).')
    return 'failed'
  }

  // 4) Janela de 24h + template aprovado
  let conversation: any = null
  {
    const { data } = await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .select('id, is_window_open, window_expires_at, store_id')
      .eq('waba_id', account.id)
      .eq('wa_id', phone)
      .maybeSingle()
    conversation = data
  }

  const validation = validateScheduledSend({
    messageType: msg.message_type,
    conversation,
    templateStatus: tplStatus,
  })
  if (!validation.ok) {
    await markFailed(msg.id, validation.errorCode!, validation.errorMessage!)
    return 'failed'
  }

  // 5) Enviar pelo cliente cloud canônico
  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account),
    wabaId: account.waba_id,
  })

  let sendResult: any
  let messageContent: any = {}
  let textBody = ''
  try {
    switch (msg.message_type) {
      case 'text':
        sendResult = await client.sendText(phone, msg.content)
        messageContent = { text: { body: msg.content } }
        textBody = msg.content
        break
      case 'image':
        sendResult = await client.sendImage(phone, { link: msg.media_url }, msg.content || undefined)
        messageContent = { image: { link: msg.media_url, caption: msg.content } }
        textBody = msg.content || '[Imagem]'
        break
      case 'video':
        sendResult = await client.sendVideo(phone, { link: msg.media_url }, msg.content || undefined)
        messageContent = { video: { link: msg.media_url, caption: msg.content } }
        textBody = msg.content || '[Vídeo]'
        break
      case 'audio':
        sendResult = await client.sendAudio(phone, { link: msg.media_url })
        messageContent = { audio: { link: msg.media_url } }
        textBody = '[Áudio]'
        break
      case 'document':
        sendResult = await client.sendDocument(phone, { link: msg.media_url, filename: msg.media_filename }, msg.content || undefined)
        messageContent = { document: { link: msg.media_url, filename: msg.media_filename } }
        textBody = msg.content || `[Documento: ${msg.media_filename}]`
        break
      case 'template': {
        // template_params (jsonb): array de strings => body parameters
        const components = Array.isArray(msg.template_params) && msg.template_params.length > 0
          ? [{ type: 'body', parameters: msg.template_params.map((v: any) => ({ type: 'text', text: String(v) })) }]
          : undefined
        sendResult = await client.sendTemplate(phone, msg.template_name, 'pt_BR', components)
        messageContent = { template: { name: msg.template_name, language: 'pt_BR', components } }
        textBody = `[Template: ${msg.template_name}]`
        break
      }
      default:
        await markFailed(msg.id, 'INVALID_TYPE', `Tipo de mensagem não suportado: ${msg.message_type}`)
        return 'failed'
    }
  } catch (apiError: any) {
    await markFailed(msg.id, apiError?.code?.toString() || 'META_API_ERROR', apiError?.message || 'Falha no envio')
    wlog.error('whatsapp.scheduled.send_error', {
      scheduled_message_id: msg.id,
      organization_id: msg.organization_id,
      code: apiError?.code,
      error: apiError?.message,
    })
    return 'failed'
  }

  const metaMessageId = sendResult?.messages?.[0]?.id || null

  // 6) Persistir no histórico da conversa (espelha cloud/messages/route.ts)
  if (conversation?.id && metaMessageId) {
    await supabaseAdmin.from('whatsapp_cloud_messages').upsert({
      organization_id: msg.organization_id,
      store_id: msg.store_id || conversation.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: metaMessageId,
      direction: 'outbound',
      from_number: account.phone_number,
      to_number: phone,
      message_type: msg.message_type,
      content: messageContent,
      text_body: textBody,
      template_name: msg.template_name || null,
      status: 'sent',
      timestamp: new Date().toISOString(),
    }, { onConflict: 'message_id' })

    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: textBody.substring(0, 100),
        last_message_direction: 'outbound',
      })
      .eq('id', conversation.id)
  }

  // 7) Sucesso + recorrência (mesma row: schema tem recurrence_count e
  //    next_occurrence_at na própria linha)
  const next = computeNextOccurrence(msg.scheduled_at, msg.recurrence, msg.recurrence_end_date)
  if (next) {
    await supabaseAdmin
      .from('scheduled_messages')
      .update({
        status: 'pending',
        scheduled_at: next,
        next_occurrence_at: next,
        recurrence_count: (msg.recurrence_count || 0) + 1,
        sent_at: new Date().toISOString(),
        message_id: metaMessageId,
        error_message: null,
        error_code: null,
      })
      .eq('id', msg.id)
    wlog.info('whatsapp.scheduled.sent_rescheduled', {
      scheduled_message_id: msg.id, next_occurrence: next,
    })
    return 'rescheduled'
  }

  await supabaseAdmin
    .from('scheduled_messages')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      message_id: metaMessageId,
      error_message: null,
      error_code: null,
    })
    .eq('id', msg.id)
  wlog.info('whatsapp.scheduled.sent', { scheduled_message_id: msg.id, meta_message_id: metaMessageId })
  return 'sent'
}

async function markFailed(id: string, code: string, message: string): Promise<void> {
  await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: 'failed', error_code: code, error_message: message })
    .eq('id', id)
  wlog.warn('whatsapp.scheduled.failed', { scheduled_message_id: id, error_code: code })
}
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/scheduled-message-sender.test.ts` — **esperado: 13 passed**
- [ ] Criar `src/app/api/cron/process-scheduled-messages/route.ts`:

```typescript
/**
 * CRON: Process due scheduled WhatsApp messages
 * /api/cron/process-scheduled-messages
 *
 * A cada minuto: claim pending->processing (UPDATE condicional por linha),
 * envia pelo caminho cloud canônico com opt-out-guard + janela 24h +
 * template APPROVED, e reagenda recorrências (daily/weekly/monthly).
 */

import { NextRequest, NextResponse } from 'next/server'
import { processDueScheduledMessages } from '@/lib/whatsapp/scheduled-message-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processDueScheduledMessages()
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
```

- [ ] Adicionar em `vercel.json` (array `crons`):

```json
    {
      "path": "/api/cron/process-scheduled-messages",
      "schedule": "* * * * *"
    }
```

- [ ] Verificação manual: `node -e "const v=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('crons:', v.crons.length)"` — **esperado: `crons: 34`**
- [ ] Rodar: `npx tsc --noEmit` — **esperado: sem erros novos nos arquivos tocados**
- [ ] Commit: `git add -A && git commit -m "feat(whatsapp): processador de scheduled_messages com opt-out, janela 24h e recorrencia"`

---

## Task 7 — Saúde do worker (heartbeat + alerta)

**Files:**
- Create: `src/lib/whatsapp/worker-heartbeat.ts`
- Test: `src/lib/whatsapp/worker-heartbeat.test.ts`
- Modify: `src/lib/whatsapp/queue.ts`, `worker/campaign-worker.ts`, `src/app/api/cron/whatsapp-dead-alert/route.ts`, `src/lib/whatsapp/alerts.ts`

- [ ] Escrever `src/lib/whatsapp/worker-heartbeat.test.ts` (função de decisão pura):

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateWorkerHealth } from './worker-heartbeat'

describe('evaluateWorkerHealth', () => {
  it('saudável: fila vazia, sem heartbeat (worker pode estar ocioso/desligado)', () => {
    expect(evaluateWorkerHealth({ pendingCount: 0, oldestPendingAgeMs: null, heartbeatAgeMs: null }).healthy).toBe(true)
  })
  it('saudável: jobs pendentes recentes + heartbeat recente', () => {
    expect(evaluateWorkerHealth({ pendingCount: 5, oldestPendingAgeMs: 30_000, heartbeatAgeMs: 20_000 }).healthy).toBe(true)
  })
  it('saudável: jobs antigos mas worker vivo (pode ser backlog legítimo)', () => {
    expect(evaluateWorkerHealth({ pendingCount: 100, oldestPendingAgeMs: 20 * 60_000, heartbeatAgeMs: 15_000 }).healthy).toBe(true)
  })
  it('NÃO saudável: jobs pendentes >10min e heartbeat ausente', () => {
    const r = evaluateWorkerHealth({ pendingCount: 3, oldestPendingAgeMs: 11 * 60_000, heartbeatAgeMs: null })
    expect(r.healthy).toBe(false)
    expect(r.reason).toMatch(/heartbeat/i)
  })
  it('NÃO saudável: jobs pendentes >10min e heartbeat velho (>2min)', () => {
    const r = evaluateWorkerHealth({ pendingCount: 3, oldestPendingAgeMs: 11 * 60_000, heartbeatAgeMs: 3 * 60_000 })
    expect(r.healthy).toBe(false)
  })
})
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/worker-heartbeat.test.ts` — **esperado: FALHA (módulo não existe)**
- [ ] Criar `src/lib/whatsapp/worker-heartbeat.ts`:

```typescript
// =============================================
// P0 — Heartbeat do campaign worker (Railway).
// O worker grava timestamp em Redis a cada health check (30s, TTL 180s).
// O cron whatsapp-dead-alert combina: fila com pending antigo + heartbeat
// ausente/velho => worker morto/travado => alerta.
// =============================================

import { Redis } from '@upstash/redis'

const HEARTBEAT_KEY = 'whatsapp:campaigns:worker:heartbeat'
const HEARTBEAT_TTL_SECONDS = 180

export const STALE_PENDING_THRESHOLD_MS = 10 * 60 * 1000 // job pendente "antigo"
export const HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000        // heartbeat "recente"

let redis: Redis | null = null
function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

/** Chamado pelo worker (Railway) periodicamente. */
export async function beatWorkerHeartbeat(): Promise<void> {
  await getRedis().set(HEARTBEAT_KEY, Date.now(), { ex: HEARTBEAT_TTL_SECONDS })
}

/** Idade do último heartbeat em ms, ou null se ausente/expirado. */
export async function getWorkerHeartbeatAgeMs(): Promise<number | null> {
  const value = await getRedis().get(HEARTBEAT_KEY)
  const ts = Number(value)
  if (!value || !Number.isFinite(ts)) return null
  return Math.max(0, Date.now() - ts)
}

export interface WorkerHealthInput {
  pendingCount: number
  oldestPendingAgeMs: number | null
  heartbeatAgeMs: number | null
}

export interface WorkerHealthResult {
  healthy: boolean
  reason?: string
}

/** Pura — decisão de saúde (testável sem Redis). */
export function evaluateWorkerHealth(input: WorkerHealthInput): WorkerHealthResult {
  const { pendingCount, oldestPendingAgeMs, heartbeatAgeMs } = input

  const hasStaleBacklog =
    pendingCount > 0 &&
    oldestPendingAgeMs !== null &&
    oldestPendingAgeMs > STALE_PENDING_THRESHOLD_MS

  if (!hasStaleBacklog) return { healthy: true }

  const heartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= HEARTBEAT_MAX_AGE_MS
  if (heartbeatFresh) return { healthy: true } // backlog legítimo, worker vivo

  return {
    healthy: false,
    reason:
      `Fila com ${pendingCount} job(s) pendente(s) há mais de ${Math.round((oldestPendingAgeMs || 0) / 60000)}min ` +
      `e sem heartbeat recente do worker (${heartbeatAgeMs === null ? 'ausente' : Math.round(heartbeatAgeMs / 1000) + 's atrás'}).`,
  }
}
```

- [ ] Rodar: `npx vitest run src/lib/whatsapp/worker-heartbeat.test.ts` — **esperado: 5 passed**
- [ ] Em `src/lib/whatsapp/queue.ts`, adicionar método na classe `MessageQueue` (após `getStats`, ~linha 347):

```typescript
  /**
   * Idade (ms) do job pendente mais antigo, ou null se a fila está vazia.
   * Score do sorted set = timestamp de quando o job fica elegível.
   */
  async getOldestPendingAgeMs(): Promise<number | null> {
    const redis = getRedis()
    // zrange com withScores retorna [member, score]
    const entries = await redis.zrange(this.pendingKey, 0, 0, { withScores: true })
    if (!entries || entries.length < 2) return null
    const score = Number(entries[1])
    if (!Number.isFinite(score)) return null
    return Math.max(0, Date.now() - score)
  }
```

- [ ] Em `src/lib/whatsapp/alerts.ts:6`, estender o union: adicionar `| 'campaign_worker_stalled'` ao tipo `type`.
- [ ] Em `worker/campaign-worker.ts`: adicionar import `import { beatWorkerHeartbeat } from '../src/lib/whatsapp/worker-heartbeat'` e dentro de `setupHealthCheck()` (no início do callback do `setInterval`, antes do `console.log`) e também no início de `main()` (logo após `checkEnvVars()`):

```typescript
    // Heartbeat: o cron whatsapp-dead-alert usa pra detectar worker morto
    // com fila acumulando.
    await beatWorkerHeartbeat().catch((e: any) =>
      console.warn('⚠️ heartbeat failed (ignored):', e?.message))
```

- [ ] Em `src/app/api/cron/whatsapp-dead-alert/route.ts`, adicionar imports e o bloco de verificação do worker antes do `return` final:

```typescript
import { campaignQueue } from '@/lib/whatsapp/queue';
import { getWorkerHeartbeatAgeMs, evaluateWorkerHealth } from '@/lib/whatsapp/worker-heartbeat';
import { sendAlert } from '@/lib/whatsapp/alerts';
```

```typescript
  // P0 — saúde do campaign worker (Railway): fila com pending antigo +
  // heartbeat ausente => worker morto/travado.
  let workerHealth: any = { healthy: true };
  try {
    const [stats, oldestPendingAgeMs, heartbeatAgeMs] = await Promise.all([
      campaignQueue.getStats(),
      campaignQueue.getOldestPendingAgeMs(),
      getWorkerHeartbeatAgeMs(),
    ]);
    workerHealth = {
      ...evaluateWorkerHealth({ pendingCount: stats.pending, oldestPendingAgeMs, heartbeatAgeMs }),
      pending: stats.pending,
      oldest_pending_age_ms: oldestPendingAgeMs,
      heartbeat_age_ms: heartbeatAgeMs,
    };

    if (!workerHealth.healthy) {
      console.error(`[dead-alert] Campaign worker unhealthy: ${workerHealth.reason}`);
      await sendAlert({
        severity: 'critical',
        type: 'campaign_worker_stalled',
        title: 'Campaign worker parado com fila acumulando',
        message: workerHealth.reason,
        metadata: {
          pending: stats.pending,
          oldest_pending_age_ms: oldestPendingAgeMs,
          heartbeat_age_ms: heartbeatAgeMs,
        },
      }).catch(() => {});
      try {
        await supabaseAdmin.from('notifications').insert({
          type: 'whatsapp_campaign_worker_stalled',
          title: 'Campaign worker parado',
          message: workerHealth.reason,
          severity: 'critical',
          metadata: workerHealth,
          created_at: new Date().toISOString(),
        });
      } catch { /* tabela pode não existir — best-effort, padrão do arquivo */ }
    }
  } catch (e: any) {
    // Redis indisponível não pode derrubar o cron de dead events
    console.log('[dead-alert] worker health check skipped:', e?.message);
  }
```

  E incluir `worker: workerHealth` no JSON de resposta final.
- [ ] Rodar: `npx vitest run src/lib/whatsapp` e `npx tsc --noEmit` — **esperado: 0 failed**
- [ ] Commit: `git add -A && git commit -m "feat(whatsapp): heartbeat do campaign worker + alerta de fila parada no whatsapp-dead-alert"`

---

## Task 8 — Verificação final e regressão

**Files:** nenhum novo.

- [ ] Rodar toda a suíte: `npx vitest run` — **esperado: 0 failed** (suítes pré-existentes: `cloud-api-signature`, `flows-encryption`, `opt-out-guard`, `stop-keywords`, `token-encryption`, `reports-*` + as novas)
- [ ] Typecheck completo: `npx tsc --noEmit` — **esperado: sem erros nos arquivos do pacote** (erros pré-existentes fora do escopo devem ser anotados, não corrigidos)
- [ ] Build do worker: `cd worker && npx tsc --noEmit` — **esperado: sem erros** (valida que `worker-heartbeat.ts` compila no contexto Railway)
- [ ] Checklist manual de deploy (documentar no PR):
  1. Aplicar `20260615_whatsapp_campaign_pipeline.sql` no Supabase ANTES do deploy do app (o cron novo depende do RPC `claim_due_whatsapp_campaigns`; o webhook degrada graciosamente se `apply_campaign_recipient_webhook` faltar).
  2. Conferir no banco quantas `whatsapp_campaigns` estão em `status='scheduled'` com `scheduled_at` no passado — as com menos de 48h dispararão no primeiro tick; comunicar/ajustar antes do deploy se necessário.
  3. Mesmo para `scheduled_messages` `pending` atrasadas (>6h viram `failed/EXPIRED`; <6h serão enviadas).
  4. Redeploy do worker Railway (para ativar o heartbeat) — sem ele o alerta de worker dispara em falso assim que houver backlog >10min.
  5. Confirmar limite de crons do plano Vercel (34 após este pacote).
- [ ] Commit final (se houver ajustes): `git add -A && git commit -m "chore(whatsapp): verificacao final do pacote P0 de campanhas"`

---

### Critical Files for Implementation

- D:\worder1-fwrle\src\lib\whatsapp\campaign-processor.ts (bug dos IDs em `createRecipients:620-682`, status `queued`, validação de template em `startCampaign`, ciclo completo do recipient)
- D:\worder1-fwrle\src\lib\whatsapp\webhook-processor.ts (`processStatus:416-465` — ponto de integração webhook→recipients; padrão `STATUS_ORDINAL:32`)
- D:\worder1-fwrle\src\app\api\cron\send-scheduled-campaigns\route.ts (padrão canônico de cron + claim atômico a replicar)
- D:\worder1-fwrle\src\app\api\whatsapp\cloud\messages\route.ts (sender cloud canônico — opt-out, janela 24h e persistência que o scheduled-message-sender espelha)
- D:\worder1-fwrle\supabase\campaigns-schema.sql (schema real de `whatsapp_campaigns`/`whatsapp_campaign_recipients` e o trigger O(N²) a remover)