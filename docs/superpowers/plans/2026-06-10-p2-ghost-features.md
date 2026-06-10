# P2 — WhatsApp Ghost Features Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugar no fluxo real do WhatsApp as features que já têm schema + API mas estão mortas (business hours, CSAT pós-fechamento, auto-assign de agentes), implementar a ação WhatsApp real das automações legadas, desativar honestamente os stubs Klaviyo/Twilio e corrigir o bug `'RUNNING'` do phonebook.

**Architecture:** Toda lógica nova vive em módulos próprios em `src/lib/whatsapp/` (`business-hours.ts`, `csat.ts`, `auto-assign.ts`, `automation-sender.ts`), chamados por hooks cirúrgicos de ~10 linhas no `webhook-processor.ts` (via dynamic import, padrão já usado no arquivo) e nas rotas de close/transfer. Estados anti-race usam o padrão da branch: colunas de claim + `UPDATE ... WHERE <condição> RETURNING` no Supabase e RPC SQL com `FOR UPDATE SKIP LOCKED`. Toggles por org via `organizations.feature_flags` (helper existente `src/lib/feature-flags.ts`).

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RPCs `SECURITY DEFINER`), QStash workers, Vitest (testes colocados `*.test.ts`, mock de `@/lib/supabase-admin` como em `opt-out-guard.test.ts`), Meta WhatsApp Cloud API via `src/lib/whatsapp/cloud-api.ts`.

---

## Contexto e Análise de Impacto

### Verificação do código real (divergências encontradas e adaptações)

Tudo abaixo foi verificado lendo o worktree `D:\worder1-fwrle` (branch `claude/debug-console-error-FWrLE`, HEAD `7681704a`):

1. **Tabelas do fluxo vivo são as `_cloud_`.** O fluxo inbound real é: `src/app/api/whatsapp/cloud/webhook/route.ts` → QStash → `src/app/api/workers/whatsapp-webhook/route.ts` → `src/lib/whatsapp/webhook-processor.ts` (exatamente 800 linhas), que grava em **`whatsapp_cloud_conversations`** e **`whatsapp_cloud_messages`** — não em `whatsapp_conversations`/`whatsapp_messages` (essas são legado Evolution). O inbox lê pela view UNION **`whatsapp_inbox_conversations`** (`worder-cloud-api-fixes/05A-inbox-unification.sql:48`). Realtime: as tabelas cloud estão na publication `supabase_realtime` (loop em `01-migration-cloud-api-schema.sql:715-727`) — updates de `assigned_to` chegam ao front.
2. **Já existe código de business hours, mas MORTO.** `src/lib/services/whatsapp/webhook-processor.ts:627-705` (`checkBusinessHoursAutoReply`) implementa auto-reply fora de horário — mas esse processor não é importado por nenhuma rota viva (só o de `src/lib/whatsapp/` é usado). Além de morto, tem bugs: sem suporte overnight, sem anti-spam (responde a CADA mensagem), grava em tabela legada. Serve só de referência; **não** reusar.
3. **FK perigosa no CSAT.** `whatsapp_csat_ratings.conversation_id` referencia **`whatsapp_conversations(id)`** (`sql/whatsapp-migration-final.sql:250-259`). Inserts com id de conversa **cloud** violam a FK (se ela existir no banco). A migration deste plano derruba essa FK (não dá para FK apontar p/ duas tabelas).
4. **Close route hoje QUEBRA para conversas Cloud.** `close/route.ts:20-33` faz `UPDATE whatsapp_conversations ... .single()` — para conversa cloud não acha linha → erro → 500 (o front em `ChatPanel.tsx:403-422` engole com `catch {}`). O CSAT existente (`csat/route.ts` + `CSATModal.tsx`) é o **atendente** se auto-avaliando, não o cliente. Pré-requisito do item 2: tornar o close cloud-aware.
5. **Duas engines de automação distintas.** A engine viva do flow-builder (`src/lib/automation/execution-engine.ts` + `node-executors.ts`) **já tem** `action_whatsapp` REAL (Meta API + `requireOptIn` + `whatsapp_sends`, linhas 170-353) e `action_sms` com caminho Twilio real (linha 960+). Os stubs fake são da engine **legada** `src/lib/automation/actions/index.ts` (consumida só por `/api/webhooks/process-queue`): `executeSendWhatsApp` TODO na **linha 474**, Klaviyo na **405**, Twilio na **532** — confirmados. A UI que lista essas ações legadas é `src/components/automation/index.tsx:87-89` (NÃO mexer no Sidebar do flow-builder novo — lá o SMS é real).
6. **Bug phonebook confirmado.** `phonebooks/route.ts:243` compara `status='RUNNING'`; o `campaign-processor.ts:158,346` usa `'running'` minúsculo. A proteção nunca dispara.
7. **Padrões confirmados:** RPC atômico (`20260607_whatsapp_conversation_counters_rpc.sql`), INSERT+fallback de race em `getOrCreateContact`/`getOrCreateConversation`, `wlog`, `requireOrgFromAuth`, feature flags (`20260522_organizations_feature_flags.sql` + `src/lib/feature-flags.ts` com cache 60s), claim atômico anti double-send no worker `whatsapp-ai-respond`. Vitest: `vitest.config.ts` inclui `src/**/*.test.ts`, mocks como em `src/lib/whatsapp/opt-out-guard.test.ts`.
8. **Colunas reais** de `whatsapp_business_hours` (inclui `enable_auto_reply`, `enable_bot_outside_hours`, `out_of_hours_bot_id`, unique `(organization_id, store_id, day_of_week)`), `whatsapp_agent_status` (`status`, `active_conversations`, `max_conversations`, unique `(agent_id, organization_id)`), `whatsapp_queues`/`whatsapp_queue_agents` — confirmadas em `sql/whatsapp-migration-final.sql`.
9. **Datas de migration:** já existem migrations até `20260614_*`; as novas usam prefixo `20260615_` para ordenar depois.

### Decisões de design (documentadas, exigidas pelo pacote)

- **D1 — Bot de IA NÃO é gated por horário.** O bot atende 24/7. O auto-reply de fora de horário só é enviado quando `conversation.ai_enabled === false` (bot desligado/transferido). Justificativa: se a IA vai responder, mandar "estamos fechados" é contraditório, confunde o cliente e custa mensagem. A coluna `enable_bot_outside_hours` existe mas fica **ignorada nesta fase** (YAGNI; documentado no código). Mutuamente exclusivo por construção: o hook de out-of-hours roda só com `ai_enabled === false`, e o debounce da IA só com `ai_enabled !== false`.
- **D2 — Anti-spam out-of-hours:** nova coluna `whatsapp_cloud_conversations.last_out_of_hours_sent_at`; envia no máximo 1 vez por 24h por conversa, com claim atômico (`UPDATE ... WHERE last_out_of_hours_sent_at IS NULL OR < now()-24h` + `select()`) para 2 webhooks simultâneos não duplicarem.
- **D3 — Config do CSAT em `organizations.feature_flags`** (chave `whatsapp_csat: { enabled, message?, template_name?, language?, thank_you_message? }`), lida com `getFeatureFlags()`. Sem tabela nova: o helper já existe, tem cache, e o volume de config é mínimo. Toggle do auto-assign idem: chave booleana `whatsapp_auto_assign`.
- **D4 — Estado `awaiting_csat`:** coluna `csat_requested_at timestamptz` na conversa cloud. Resposta só é interpretada como nota se `now - csat_requested_at < 24h`; a captura zera a coluna com claim atômico (anti-double-insert). Nota aceita: texto `^[1-5]$` ou `interactive.list_reply.id` / `button_reply.id` no formato `csat_N`.
- **D5 — Pesquisa CSAT em janela aberta = mensagem interativa LIST** (botões reply só suportam 3 opções; lista suporta 5 notas — `cloud-api.ts` já tem `sendList`), fallback texto livre se a list falhar. Janela fechada: template configurado em `template_name` (e `APPROVED`) ou skip com `wlog.info`. **Custo:** mensagem dentro da janela de atendimento é grátis (service); template fora da janela é cobrado (utility) — por isso o default sem template é skip.
- **D6 — Auto-assign sem `queue_id` na conversa.** `whatsapp_cloud_conversations` não tem coluna de fila (verificado). v1: RPC escolhe entre agentes `online` com folga da org inteira; **se** a org tem filas ativas com agentes, restringe a agentes membros de alguma fila ativa. Roteamento por fila específica fica para quando conversa tiver fila (anotado no SQL).
- **D7 — Auto-assign dispara em: (a)** conversa nova no webhook, **(b)** transferência da IA para humano (bloco `was_transferred` do `cloud-runner.ts:313`, ponto único pós-transferência). Fallback: ninguém disponível → `NULL`, conversa fica não-atribuída (comportamento atual). Decremento no close (RPC `release_conversation_assignment`), guardado pela transição de status (close idempotente).
- **D8 — Stubs Klaviyo/Twilio da engine legada viram erro explícito** (`success:false`) em vez de sucesso fake, e `action_sms` sai da paleta legada (`components/automation/index.tsx`). O flow-builder novo não é tocado (lá já é real).

### Tabelas tocadas × quem mais lê

| Item | Tabelas (escrita) | Outros leitores afetados |
|---|---|---|
| Business hours | `whatsapp_cloud_conversations` (+1 coluna), `whatsapp_cloud_messages` (insert system msg) | Inbox UI/realtime (mensagem system aparece no chat — desejado); `whatsapp_business_hours` só leitura (UI `BusinessHoursTab.tsx` + rota já existem) |
| CSAT | `whatsapp_csat_ratings` (insert), `whatsapp_cloud_conversations` (+3 colunas: `csat_requested_at`, `resolved_at`, `resolved_by`), `whatsapp_cloud_messages` | `csat/route.ts` GET e `CSATModal` continuam funcionando (FK relaxada não muda SELECTs); métricas futuras leem `whatsapp_csat_ratings` |
| Auto-assign | `whatsapp_cloud_conversations.assigned_to`, `whatsapp_agent_status.active_conversations` | Inbox UI via realtime (update de `assigned_to` chega sozinho); `agents/status/route.ts` lê `whatsapp_agent_status` |
| Automação WhatsApp | `whatsapp_cloud_messages`, `whatsapp_cloud_conversations.last_message_*` | Inbox vê a mensagem da automação na conversa (desejado) |
| Phonebook | nenhuma (só leitura de `whatsapp_campaigns`) | — |

**Compat com conversas existentes:** todas as colunas novas são `NULL`/default — conversa antiga nunca recebeu out-of-hours (`last_out_of_hours_sent_at NULL` ⇒ elegível na próxima mensagem fora de horário, correto) e nunca está `awaiting_csat`. **Atenção:** `increment_conversation_inbound` seta `status='open'` em qualquer inbound — a resposta "5" do CSAT reabre a conversa fechada; aceito (a nota fica registrada; reabrir é o comportamento atual de qualquer inbound).

### Pontos de inserção no webhook-processor (cirúrgicos)

Apenas **um bloco novo** em `processMessage` (após o bloco `RuleEngine`, linhas ~338-345, antes do bloco de debounce da IA, linha ~347) + **uma condição** no `if` do debounce. Tudo via dynamic import e try/catch que nunca quebra a ingestão (padrão já usado no arquivo, linhas 360-409).

## File Structure

```
supabase/migrations/
  20260615_whatsapp_p2_business_hours.sql        # +last_out_of_hours_sent_at
  20260615_whatsapp_p2_csat.sql                   # +csat_requested_at/resolved_*; FK relax
  20260615_whatsapp_p2_auto_assign.sql            # RPCs assign/release
src/lib/whatsapp/
  business-hours.ts        # pura isWithinBusinessHours + orquestrador maybeSendOutOfHoursReply
  business-hours.test.ts
  csat.ts                  # parseCsatRating (pura) + requestCsatSurvey + maybeCaptureCsatResponse
  csat.test.ts
  auto-assign.ts           # maybeAutoAssignConversation + releaseConversationAssignment (RPC wrappers)
  auto-assign.test.ts
  automation-sender.ts     # sendAutomationWhatsApp (sender canônico p/ engine legada)
  automation-sender.test.ts
  campaign-status.ts       # PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES
  campaign-status.test.ts
  webhook-processor.ts     # MODIFY: 1 bloco de hooks + 1 condição
src/lib/ai/cloud-runner.ts # MODIFY: hook auto-assign no bloco was_transferred (~l.313)
src/lib/automation/actions/index.ts              # MODIFY: WhatsApp real; Klaviyo/Twilio erro explícito
src/components/automation/index.tsx              # MODIFY: remover action_sms da paleta legada
src/app/api/whatsapp/phonebooks/route.ts         # MODIFY: l.243
src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts  # MODIFY: cloud-aware + CSAT + release
```

---

### Task 1: Fix bug phonebook `'RUNNING'` vs `'running'`

**Files:**
- Create: `src/lib/whatsapp/campaign-status.ts`
- Test: `src/lib/whatsapp/campaign-status.test.ts`
- Modify: `src/app/api/whatsapp/phonebooks/route.ts:239-244`

- [ ] **Step 1: Escrever teste que falha**

```ts
// src/lib/whatsapp/campaign-status.test.ts
import { describe, it, expect } from 'vitest'
import { PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES } from './campaign-status'

describe('PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES', () => {
  it('usa o enum lowercase real do campaign-processor (status "running")', () => {
    expect(PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES).toContain('running')
  })
  it('NÃO contém o valor legado errado "RUNNING" (bug: proteção nunca disparava)', () => {
    expect(PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES).not.toContain('RUNNING')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/campaign-status.test.ts`
Expected: FAIL — `Cannot find module './campaign-status'`

- [ ] **Step 3: Implementar o módulo**

```ts
// src/lib/whatsapp/campaign-status.ts
// =============================================
// Enum de status de whatsapp_campaigns é LOWERCASE — fonte da verdade:
// campaign-processor.ts seta 'running' (l.158) e checa ['running'] (l.346).
// O DELETE de phonebook comparava 'RUNNING' e a proteção nunca disparava.
// =============================================
export const PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES = ['running'] as const
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/campaign-status.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Aplicar o fix na rota**

Em `src/app/api/whatsapp/phonebooks/route.ts`, adicionar import no topo e trocar a linha 243:

```ts
import { PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES } from '@/lib/whatsapp/campaign-status';
```
```ts
// antes:  .eq('status', 'RUNNING')
        .in('status', [...PHONEBOOK_BLOCKING_CAMPAIGN_STATUSES])
```

- [ ] **Step 6: Typecheck e commit**

Run: `npx tsc --noEmit` → Expected: sem erros novos.

```bash
git add src/lib/whatsapp/campaign-status.ts src/lib/whatsapp/campaign-status.test.ts "src/app/api/whatsapp/phonebooks/route.ts"
git commit -m "fix(whatsapp): protecao de phonebook em uso nunca disparava — enum de campanha e lowercase 'running'"
```

---

### Task 2: Business hours — função pura `isWithinBusinessHours`

**Files:**
- Create: `src/lib/whatsapp/business-hours.ts` (parte pura)
- Test: `src/lib/whatsapp/business-hours.test.ts`

- [ ] **Step 1: Escrever testes que falham (timezone + overnight)**

```ts
// src/lib/whatsapp/business-hours.test.ts
import { describe, it, expect } from 'vitest'
import { isWithinBusinessHours, type BusinessHourRow } from './business-hours'

function row(partial: Partial<BusinessHourRow>): BusinessHourRow {
  return {
    day_of_week: 1, start_time: '09:00', end_time: '18:00',
    is_active: true, timezone: 'America/Sao_Paulo',
    out_of_hours_message: 'Estamos fechados', enable_auto_reply: true,
    ...partial,
  }
}

describe('isWithinBusinessHours', () => {
  it('sem linhas ativas => considera sempre dentro (sem config = sem gating)', () => {
    expect(isWithinBusinessHours([], new Date())).toBe(true)
    expect(isWithinBusinessHours([row({ is_active: false })], new Date())).toBe(true)
  })

  it('dentro do horário no fuso de SP (UTC-3): 2026-06-08 14:00 SP = 17:00 UTC, segunda', () => {
    const now = new Date('2026-06-08T17:00:00Z') // segunda 14:00 em SP
    expect(isWithinBusinessHours([row({ day_of_week: 1 })], now)).toBe(true)
  })

  it('fora do horário: 2026-06-08 20:00 SP (23:00 UTC), segunda 09-18', () => {
    const now = new Date('2026-06-08T23:00:00Z')
    expect(isWithinBusinessHours([row({ day_of_week: 1 })], now)).toBe(false)
  })

  it('timezone importa: 17:00 UTC está DENTRO p/ SP(14h) mas FORA p/ Tokyo(02:00 de terça)', () => {
    const now = new Date('2026-06-08T17:00:00Z')
    expect(isWithinBusinessHours([row({ day_of_week: 1, timezone: 'Asia/Tokyo' })], now)).toBe(false)
  })

  it('dia sem linha ativa => fora (domingo sem config)', () => {
    const sunday = new Date('2026-06-07T17:00:00Z') // domingo 14:00 SP
    expect(isWithinBusinessHours([row({ day_of_week: 1 })], sunday)).toBe(false)
  })

  it('overnight 22:00-06:00: 23:30 SP de segunda está DENTRO', () => {
    const now = new Date('2026-06-09T02:30:00Z') // segunda 23:30 SP
    expect(isWithinBusinessHours(
      [row({ day_of_week: 1, start_time: '22:00', end_time: '06:00' })], now)).toBe(true)
  })

  it('overnight 22:00-06:00: madrugada de TERÇA 03:00 SP coberta pela linha de SEGUNDA', () => {
    const now = new Date('2026-06-09T06:00:00Z') // terça 03:00 SP
    expect(isWithinBusinessHours(
      [row({ day_of_week: 1, start_time: '22:00', end_time: '06:00' })], now)).toBe(true)
  })

  it('overnight 22:00-06:00: 12:00 de segunda está FORA', () => {
    const now = new Date('2026-06-08T15:00:00Z') // segunda 12:00 SP
    expect(isWithinBusinessHours(
      [row({ day_of_week: 1, start_time: '22:00', end_time: '06:00' })], now)).toBe(false)
  })

  it('start_time com segundos (TIME do Postgres vem "09:00:00")', () => {
    const now = new Date('2026-06-08T17:00:00Z')
    expect(isWithinBusinessHours(
      [row({ day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' })], now)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/business-hours.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a parte pura**

```ts
// src/lib/whatsapp/business-hours.ts
// =============================================
// P2 — Business hours plugado no fluxo inbound (Cloud).
//
// Parte PURA (este topo): isWithinBusinessHours — testável sem DB.
// Parte ORQUESTRADORA (Task 3): maybeSendOutOfHoursReply, chamada pelo
// webhook-processor via dynamic import.
//
// DECISÕES (ver plano P2):
//  - Bot de IA NÃO é gated por horário (atende 24/7). Auto-reply de fora de
//    horário só quando ai_enabled === false. enable_bot_outside_hours é
//    IGNORADA nesta fase (YAGNI).
//  - Sem linhas ativas configuradas => "sempre dentro" (sem config, sem gating).
//  - Overnight suportado: linha 22:00-06:00 de segunda cobre seg>=22h E
//    terça<06h (spillover do dia anterior).
// =============================================

export interface BusinessHourRow {
  day_of_week: number          // 0=domingo .. 6=sábado
  start_time: string           // 'HH:MM' ou 'HH:MM:SS' (TIME do Postgres)
  end_time: string
  is_active: boolean
  timezone: string             // ex.: 'America/Sao_Paulo'
  out_of_hours_message?: string | null
  enable_auto_reply?: boolean | null
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Dia-da-semana e minutos locais de `now` no timezone dado. */
export function localDayAndMinutes(now: Date, tz: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  const day = WEEKDAY_INDEX[get('weekday')] ?? 0
  // hour12:false pode devolver '24' à meia-noite em alguns runtimes — normaliza.
  const hour = Number(get('hour')) % 24
  return { day, minutes: hour * 60 + Number(get('minute')) }
}

export function isWithinBusinessHours(hours: BusinessHourRow[], now: Date): boolean {
  const active = (hours || []).filter((h) => h.is_active)
  if (active.length === 0) return true // sem config => sem gating

  for (const h of active) {
    const { day, minutes } = localDayAndMinutes(now, h.timezone || 'America/Sao_Paulo')
    const start = toMinutes(h.start_time)
    const end = toMinutes(h.end_time)

    if (start <= end) {
      // janela normal no mesmo dia
      if (h.day_of_week === day && minutes >= start && minutes < end) return true
    } else {
      // overnight: cobre [start..24h) do próprio dia e [0..end) do dia seguinte
      if (h.day_of_week === day && minutes >= start) return true
      const previousDay = (day + 6) % 7
      if (h.day_of_week === previousDay && minutes < end) return true
    }
  }
  return false
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/business-hours.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/business-hours.ts src/lib/whatsapp/business-hours.test.ts
git commit -m "feat(whatsapp): isWithinBusinessHours pura com timezone e overnight (P2 business hours, parte 1)"
```

---

### Task 3: Business hours — migration + orquestrador + hook no webhook

**Files:**
- Create: `supabase/migrations/20260615_whatsapp_p2_business_hours.sql`
- Modify: `src/lib/whatsapp/business-hours.ts` (acrescentar orquestrador)
- Modify: `src/lib/whatsapp/webhook-processor.ts` (~linha 346, antes do bloco de debounce da IA)
- Test: `src/lib/whatsapp/business-hours.test.ts` (acrescentar teste do seletor de linha)

- [ ] **Step 1: Migration (idempotente, padrão do projeto)**

```sql
-- supabase/migrations/20260615_whatsapp_p2_business_hours.sql
-- =============================================
-- P2 — Business hours no fluxo inbound.
-- Anti-spam do auto-reply fora de horário: no máx 1 envio / 24h / conversa.
-- Claim atômico feito no app: UPDATE ... WHERE last_out_of_hours_sent_at IS NULL
-- OR < now()-24h RETURNING — 2 webhooks simultâneos não duplicam envio.
-- =============================================
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS last_out_of_hours_sent_at timestamptz;

COMMENT ON COLUMN whatsapp_cloud_conversations.last_out_of_hours_sent_at IS
  'P2: último auto-reply de fora de horário enviado nesta conversa (anti-spam 24h).';
```

- [ ] **Step 2: Teste da seleção de linha do dia (pura) — escrever e ver falhar**

Acrescentar ao `business-hours.test.ts`:

```ts
import { pickOutOfHoursConfig } from './business-hours'

describe('pickOutOfHoursConfig', () => {
  it('prefere linhas da loja (store_id) sobre linhas org-wide', () => {
    const orgRow = { ...row({}), store_id: null, out_of_hours_message: 'org' } as any
    const storeRow = { ...row({}), store_id: 'store-1', out_of_hours_message: 'loja' } as any
    const cfg = pickOutOfHoursConfig([orgRow, storeRow], 'store-1')
    expect(cfg?.rows.every(r => (r as any).store_id === 'store-1')).toBe(true)
  })
  it('retorna null quando nenhuma linha ativa tem enable_auto_reply + mensagem', () => {
    const r = { ...row({ enable_auto_reply: false }), store_id: null } as any
    expect(pickOutOfHoursConfig([r], null)).toBeNull()
  })
})
```

Run: `npx vitest run src/lib/whatsapp/business-hours.test.ts` → Expected: FAIL (`pickOutOfHoursConfig` não exportada).

- [ ] **Step 3: Implementar orquestrador no mesmo módulo**

Acrescentar ao final de `src/lib/whatsapp/business-hours.ts`:

```ts
// =============================================
// ORQUESTRADOR — chamado pelo webhook-processor (dynamic import, try/catch
// externo). Nunca lança: erro aqui não pode quebrar a ingestão.
// =============================================
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'

const OUT_OF_HOURS_COOLDOWN_HOURS = 24

export interface OutOfHoursConfig {
  rows: BusinessHourRow[]
  message: string
}

/**
 * Escolhe o conjunto de linhas aplicável (loja > org-wide) e a mensagem.
 * Retorna null se auto-reply não está habilitado ou não há mensagem.
 */
export function pickOutOfHoursConfig(
  allRows: Array<BusinessHourRow & { store_id?: string | null }>,
  accountStoreId: string | null,
): OutOfHoursConfig | null {
  const active = (allRows || []).filter((r) => r.is_active)
  if (active.length === 0) return null

  const storeRows = accountStoreId ? active.filter((r) => r.store_id === accountStoreId) : []
  const rows = storeRows.length > 0 ? storeRows : active.filter((r) => !r.store_id)
  if (rows.length === 0) return null

  const withMsg = rows.find((r) => r.enable_auto_reply && r.out_of_hours_message?.trim())
  if (!withMsg) return null
  return { rows, message: withMsg.out_of_hours_message!.trim() }
}

export async function maybeSendOutOfHoursReply(params: {
  account: any
  conversation: any
  phoneNumber: string
}): Promise<{ sent: boolean; reason?: string }> {
  const { account, conversation, phoneNumber } = params

  // D1: bot 24/7 — auto-reply só quando a IA NÃO vai responder.
  if (conversation?.ai_enabled !== false) return { sent: false, reason: 'ai_handles_conversation' }

  const { data: allRows } = await supabaseAdmin
    .from('whatsapp_business_hours')
    .select('*')
    .eq('organization_id', account.organization_id)

  const cfg = pickOutOfHoursConfig(allRows || [], account.store_id || null)
  if (!cfg) return { sent: false, reason: 'no_config' }
  if (isWithinBusinessHours(cfg.rows, new Date())) return { sent: false, reason: 'within_hours' }

  // Opt-out (texto livre, categoria indefinida): opted_out bloqueia.
  const { requireOptIn } = await import('./opt-out-guard')
  const opt = await requireOptIn(account.organization_id, phoneNumber, undefined, {
    sender: 'webhook.out_of_hours_auto_reply',
  })
  if (!opt.allowed) return { sent: false, reason: 'opted_out' }

  // CLAIM atômico anti-spam/anti-race: só 1 webhook ganha a janela de 24h.
  const cutoff = new Date(Date.now() - OUT_OF_HOURS_COOLDOWN_HOURS * 3600_000).toISOString()
  const { data: claimed } = await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .update({ last_out_of_hours_sent_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .or(`last_out_of_hours_sent_at.is.null,last_out_of_hours_sent_at.lt.${cutoff}`)
    .select('id')
    .maybeSingle()
  if (!claimed) return { sent: false, reason: 'already_sent_in_window' }

  // Envio (inbound acabou de abrir a janela 24h => texto livre ok).
  const { createWhatsAppCloudClient } = await import('./cloud-api')
  const { getAccessToken } = await import('./account-loader')
  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account),
  })
  const result = await client.sendText(phoneNumber, cfg.message)
  const messageId = result.messages?.[0]?.id

  await supabaseAdmin.from('whatsapp_cloud_messages').insert({
    organization_id: account.organization_id,
    store_id: account.store_id || conversation.store_id || null,
    waba_id: account.id,
    conversation_id: conversation.id,
    message_id: messageId,
    direction: 'outbound',
    from_number: account.phone_number,
    to_number: phoneNumber,
    message_type: 'text',
    content: { text: { body: cfg.message } },
    text_body: cfg.message,
    status: 'sent',
    sent_by_bot: true,
    sender: 'system',
    timestamp: new Date().toISOString(),
  })

  wlog.info('whatsapp.business_hours.out_of_hours_reply_sent', {
    conversation_id: conversation.id,
    organization_id: account.organization_id,
  })
  return { sent: true }
}
```

Nota de implementação: confirmar que `createWhatsAppCloudClient` é o export usado em `cloud-sender.ts:29` (é) e que o teste existente não importa o orquestrador no load (os imports de `supabase-admin`/`wlog` no módulo exigem acrescentar ao topo do `business-hours.test.ts` os mesmos `vi.mock('@/lib/supabase-admin', ...)` e `vi.mock('@/lib/observability/whatsapp-logger', ...)` usados em `opt-out-guard.test.ts`).

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run src/lib/whatsapp/business-hours.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Hook cirúrgico no webhook-processor**

Em `src/lib/whatsapp/webhook-processor.ts`, inserir APÓS o bloco `RuleEngine` (após linha ~345, `if (isNewContact && crmContactId) {...}`) e ANTES do comentário `// DEBOUNCE DA IA`:

```ts
  // ============================================================
  // P2 — Fora do horário de atendimento (módulo próprio).
  // Só roda quando a IA NÃO cobre a conversa (D1: bot 24/7).
  // try/catch isolado: nunca quebra a ingestão.
  // ============================================================
  try {
    if (conversation?.ai_enabled === false) {
      const { maybeSendOutOfHoursReply } = await import('./business-hours');
      await maybeSendOutOfHoursReply({ account, conversation, phoneNumber });
    }
  } catch (err: any) {
    wlog.error('whatsapp.business_hours.error', {
      error: err?.message,
      conversation_id: conversation?.id,
    });
  }
```

- [ ] **Step 6: Typecheck + suite e commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/whatsapp/`
Expected: sem erros; suites whatsapp PASS.

```bash
git add supabase/migrations/20260615_whatsapp_p2_business_hours.sql src/lib/whatsapp/business-hours.ts src/lib/whatsapp/business-hours.test.ts src/lib/whatsapp/webhook-processor.ts
git commit -m "feat(whatsapp): auto-reply fora de horario plugado no webhook (anti-spam 24h, opt-out, bot 24/7)"
```

---

### Task 4: CSAT — migration + módulo (parse + captura no webhook)

**Files:**
- Create: `supabase/migrations/20260615_whatsapp_p2_csat.sql`
- Create: `src/lib/whatsapp/csat.ts`
- Test: `src/lib/whatsapp/csat.test.ts`
- Modify: `src/lib/whatsapp/webhook-processor.ts` (mesmo bloco da Task 3 + condição no debounce)

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/20260615_whatsapp_p2_csat.sql
-- =============================================
-- P2 — CSAT pós-fechamento (cliente responde 1-5 no WhatsApp).
--
-- 1) Estado awaiting_csat na conversa cloud: csat_requested_at.
--    Captura zera a coluna com claim atômico (anti double-insert).
--    Expiração: respostas só valem por 24h (constante no app).
-- 2) close cloud-aware precisa de resolved_at / resolved_by (a tabela cloud
--    não tinha — só a legada whatsapp_conversations tinha).
-- 3) FK de whatsapp_csat_ratings apontava para whatsapp_conversations(id)
--    (sql/whatsapp-migration-final.sql:252) — REJEITARIA ids de conversa
--    cloud. Não dá para FK apontar p/ duas tabelas: derruba a FK e mantém
--    índice. Integridade fica por conta do app (mesma decisão de outras
--    colunas *_id soltas do projeto, ex. agent_status.agent_id).
-- =============================================
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS csat_requested_at timestamptz;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

DO $$
DECLARE fk text;
BEGIN
  SELECT conname INTO fk
    FROM pg_constraint
   WHERE conrelid = 'whatsapp_csat_ratings'::regclass
     AND contype = 'f'
     AND confrelid = 'whatsapp_conversations'::regclass;
  IF fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_csat_ratings DROP CONSTRAINT %I', fk);
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- coluna de origem da nota (atendente via modal × cliente via WhatsApp)
ALTER TABLE whatsapp_csat_ratings
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'agent';
```

- [ ] **Step 2: Testes do parser e da decisão de captura — escrever e ver falhar**

```ts
// src/lib/whatsapp/csat.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { parseCsatRating, isAwaitingCsat } from './csat'

describe('parseCsatRating', () => {
  it('texto "5" => 5; com espaços também', () => {
    expect(parseCsatRating('5', undefined)).toBe(5)
    expect(parseCsatRating(' 3 ', undefined)).toBe(3)
  })
  it('texto fora de 1-5 ou não-numérico => null', () => {
    expect(parseCsatRating('0', undefined)).toBeNull()
    expect(parseCsatRating('6', undefined)).toBeNull()
    expect(parseCsatRating('nota 5', undefined)).toBeNull()
    expect(parseCsatRating('', undefined)).toBeNull()
  })
  it('interactive list_reply id csat_4 => 4 (tem prioridade sobre o texto)', () => {
    const msg: any = { interactive: { type: 'list_reply', list_reply: { id: 'csat_4', title: '4' } } }
    expect(parseCsatRating('qualquer', msg)).toBe(4)
  })
  it('interactive button_reply id csat_1 => 1', () => {
    const msg: any = { interactive: { type: 'button_reply', button_reply: { id: 'csat_1', title: '1' } } }
    expect(parseCsatRating('', msg)).toBe(1)
  })
  it('interactive com id fora do padrão => null', () => {
    const msg: any = { interactive: { type: 'list_reply', list_reply: { id: 'other', title: 'x' } } }
    expect(parseCsatRating('', msg)).toBeNull()
  })
})

describe('isAwaitingCsat', () => {
  it('true quando csat_requested_at < 24h atrás', () => {
    const conv = { csat_requested_at: new Date(Date.now() - 3600_000).toISOString() }
    expect(isAwaitingCsat(conv, new Date())).toBe(true)
  })
  it('false quando expirou (>24h) — não interpretar mensagens futuras como nota', () => {
    const conv = { csat_requested_at: new Date(Date.now() - 25 * 3600_000).toISOString() }
    expect(isAwaitingCsat(conv, new Date())).toBe(false)
  })
  it('false quando nunca pediu', () => {
    expect(isAwaitingCsat({ csat_requested_at: null }, new Date())).toBe(false)
  })
})
```

Run: `npx vitest run src/lib/whatsapp/csat.test.ts` → Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/whatsapp/csat.ts`**

```ts
// =============================================
// P2 — CSAT pós-fechamento (Cloud).
//
// Fluxo:
//  - close route chama requestCsatSurvey(): janela 24h aberta => LIST
//    interativa 1-5 (fallback texto); fechada => template configurado em
//    feature_flags.whatsapp_csat.template_name (APPROVED) ou skip com log.
//    Marca csat_requested_at (estado awaiting, expira em 24h).
//  - webhook-processor chama maybeCaptureCsatResponse() ANTES do debounce
//    da IA: se awaiting e a mensagem parseia 1-5, CLAIM atômico
//    (csat_requested_at -> null) + INSERT em whatsapp_csat_ratings.
//
// Config por org (organizations.feature_flags):
//   whatsapp_csat: { enabled: true, message?, template_name?, language?, thank_you_message? }
// =============================================
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'
import type { WebhookMessage } from './cloud-api'

export const CSAT_RESPONSE_WINDOW_HOURS = 24
const DEFAULT_SURVEY_MESSAGE =
  'Como você avalia nosso atendimento? Responda com uma nota de 1 (péssimo) a 5 (excelente).'

export interface CsatFlagConfig {
  enabled?: boolean
  message?: string
  template_name?: string
  language?: string
  thank_you_message?: string
}

// ---------- PURAS ----------

export function parseCsatRating(
  textBody: string | null | undefined,
  message: Pick<WebhookMessage, 'interactive'> | undefined,
): number | null {
  const interactiveId =
    message?.interactive?.list_reply?.id || message?.interactive?.button_reply?.id
  if (interactiveId) {
    const m = /^csat_([1-5])$/.exec(interactiveId)
    return m ? Number(m[1]) : null
  }
  const t = (textBody || '').trim()
  return /^[1-5]$/.test(t) ? Number(t) : null
}

export function isAwaitingCsat(
  conversation: { csat_requested_at?: string | null },
  now: Date,
): boolean {
  if (!conversation?.csat_requested_at) return false
  const requested = new Date(conversation.csat_requested_at).getTime()
  return now.getTime() - requested < CSAT_RESPONSE_WINDOW_HOURS * 3600_000
}

// ---------- ORQUESTRADORES ----------

async function getCsatConfig(organizationId: string): Promise<CsatFlagConfig | null> {
  const { getFeatureFlags } = await import('@/lib/feature-flags')
  const flags = await getFeatureFlags(organizationId)
  const raw = flags['whatsapp_csat']
  if (raw === true) return { enabled: true }
  if (raw && typeof raw === 'object' && (raw as CsatFlagConfig).enabled) return raw as CsatFlagConfig
  return null
}

/** Chamada pela close route. Nunca lança. */
export async function requestCsatSurvey(params: {
  account: any
  conversation: any
  requestedBy?: string
}): Promise<{ requested: boolean; reason?: string }> {
  const { account, conversation } = params
  try {
    const cfg = await getCsatConfig(conversation.organization_id)
    if (!cfg) return { requested: false, reason: 'disabled' }

    const phone = conversation.contact_phone || conversation.wa_id
    if (!phone) return { requested: false, reason: 'no_phone' }

    const { requireOptIn } = await import('./opt-out-guard')
    const opt = await requireOptIn(conversation.organization_id, phone, undefined, {
      sender: 'inbox.csat_survey',
    })
    if (!opt.allowed) return { requested: false, reason: 'opted_out' }

    const windowOpen =
      conversation.is_window_open !== false &&
      conversation.window_expires_at &&
      new Date(conversation.window_expires_at).getTime() > Date.now()

    const { createWhatsAppCloudClient } = await import('./cloud-api')
    const { getAccessToken } = await import('./account-loader')
    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken: getAccessToken(account),
    })

    const body = (cfg.message || DEFAULT_SURVEY_MESSAGE).trim()
    let sentMessageId: string | undefined
    let persistedBody = body

    if (windowOpen) {
      try {
        const res = await client.sendList(phone, body, 'Avaliar', [{
          title: 'Sua nota',
          rows: [1, 2, 3, 4, 5].map((n) => ({ id: `csat_${n}`, title: `${n}` })),
        }])
        sentMessageId = res.messages?.[0]?.id
      } catch {
        const res = await client.sendText(phone, body) // fallback texto livre
        sentMessageId = res.messages?.[0]?.id
      }
    } else if (cfg.template_name) {
      const { data: tpl } = await supabaseAdmin
        .from('whatsapp_templates')
        .select('name, status, language')
        .eq('organization_id', conversation.organization_id)
        .eq('name', cfg.template_name)
        .maybeSingle()
      if (!tpl || tpl.status !== 'APPROVED') {
        wlog.info('whatsapp.csat.skip_template_not_approved', {
          conversation_id: conversation.id, template: cfg.template_name,
        })
        return { requested: false, reason: 'template_not_approved' }
      }
      const res = await client.sendTemplate(phone, cfg.template_name, cfg.language || tpl.language || 'pt_BR')
      sentMessageId = res.messages?.[0]?.id
      persistedBody = `[template:${cfg.template_name}]`
    } else {
      wlog.info('whatsapp.csat.skip_window_closed_no_template', { conversation_id: conversation.id })
      return { requested: false, reason: 'window_closed_no_template' }
    }

    await supabaseAdmin.from('whatsapp_cloud_messages').insert({
      organization_id: conversation.organization_id,
      store_id: conversation.store_id || account.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: sentMessageId,
      direction: 'outbound',
      from_number: account.phone_number,
      to_number: phone,
      message_type: windowOpen ? 'interactive' : 'template',
      content: { text: { body: persistedBody } },
      text_body: persistedBody,
      status: 'sent',
      sent_by_bot: true,
      sender: 'system',
      timestamp: new Date().toISOString(),
    })

    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({ csat_requested_at: new Date().toISOString() })
      .eq('id', conversation.id)

    wlog.info('whatsapp.csat.survey_sent', { conversation_id: conversation.id })
    return { requested: true }
  } catch (err: any) {
    wlog.error('whatsapp.csat.request_error', {
      error: err?.message, conversation_id: params.conversation?.id,
    })
    return { requested: false, reason: 'error' }
  }
}

/** Chamada pelo webhook-processor. Retorna true se a mensagem FOI uma nota. */
export async function maybeCaptureCsatResponse(params: {
  conversation: any
  message: WebhookMessage
  textBody: string
}): Promise<boolean> {
  const { conversation, message, textBody } = params
  if (!isAwaitingCsat(conversation, new Date())) return false

  const rating = parseCsatRating(textBody, message)
  if (rating === null) return false

  // CLAIM atômico: só 1 webhook consegue zerar csat_requested_at.
  const { data: claimed } = await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .update({ csat_requested_at: null })
    .eq('id', conversation.id)
    .not('csat_requested_at', 'is', null)
    .select('id')
    .maybeSingle()
  if (!claimed) return false

  const { error } = await supabaseAdmin.from('whatsapp_csat_ratings').insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id || null,
    agent_id: conversation.assigned_to || null,
    rating,
    source: 'customer',
  })
  if (error) {
    wlog.error('whatsapp.csat.insert_error', { error: error.message, conversation_id: conversation.id })
    return true // claim consumido; não deixar a IA responder a nota mesmo assim
  }
  wlog.info('whatsapp.csat.rating_captured', { conversation_id: conversation.id, rating })
  return true
}
```

Nota: verificar a assinatura real de `client.sendTemplate` em `cloud-api.ts:307` na implementação (ajustar parâmetros se receber objeto de components).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/csat.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Hooks no webhook-processor**

Em `processMessage`, ANTES do hook de business hours adicionado na Task 3, inserir:

```ts
  // ============================================================
  // P2 — CSAT: se a conversa está aguardando nota e a mensagem é 1-5,
  // captura e NÃO aciona IA/out-of-hours para esta mensagem.
  // ============================================================
  let csatCaptured = false;
  try {
    const { maybeCaptureCsatResponse } = await import('./csat');
    csatCaptured = await maybeCaptureCsatResponse({ conversation, message, textBody });
  } catch (err: any) {
    wlog.error('whatsapp.csat.capture_error', {
      error: err?.message,
      conversation_id: conversation?.id,
    });
  }
```

E (a) envolver o hook de business hours da Task 3 com `if (!csatCaptured && conversation?.ai_enabled === false)`, (b) no `if` do debounce da IA (linha ~363) acrescentar a condição `!csatCaptured &&` antes de `messageType === 'text'`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/whatsapp/`
Expected: PASS.

```bash
git add supabase/migrations/20260615_whatsapp_p2_csat.sql src/lib/whatsapp/csat.ts src/lib/whatsapp/csat.test.ts src/lib/whatsapp/webhook-processor.ts
git commit -m "feat(whatsapp): pesquisa CSAT — captura de nota 1-5 no webhook com claim atomico e expiracao 24h"
```

---

### Task 5: Close route cloud-aware + disparo do CSAT

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts` (reescrever handler)

- [ ] **Step 1: Reescrever a rota (cloud primeiro, fallback legado — espelha o padrão de `messages/route.ts:54-56`)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/inbox/conversations/[id]/close
// P2: cloud-aware (antes só atualizava whatsapp_conversations e 500ava em
// conversas Cloud), idempotente (neq status closed), dispara CSAT e libera
// o slot do agente (auto-assign).
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId, userId: authUserId } = auth

    const { id } = params
    const body = await request.json()
    const { resolution } = body
    const nowIso = new Date().toISOString()

    // ---- 1) Tenta CLOUD (idempotente: só transiciona se não-fechada) ----
    const { data: cloudConv } = await supabase
      .from('whatsapp_cloud_conversations')
      .update({ status: 'closed', resolved_at: nowIso, resolved_by: authUserId, updated_at: nowIso })
      .eq('id', id)
      .eq('organization_id', orgId)
      .neq('status', 'closed')
      .select('*, account:whatsapp_business_accounts(*)')
      .maybeSingle()

    if (cloudConv) {
      // libera slot do auto-assign (best-effort)
      try {
        const { releaseConversationAssignment } = await import('@/lib/whatsapp/auto-assign')
        await releaseConversationAssignment(orgId, id)
      } catch { /* Task 6 adiciona o módulo; até lá o import falha silencioso */ }

      // dispara pesquisa CSAT (best-effort, nunca falha o close)
      try {
        const { requestCsatSurvey } = await import('@/lib/whatsapp/csat')
        if (cloudConv.account) {
          await requestCsatSurvey({ account: cloudConv.account, conversation: cloudConv, requestedBy: authUserId })
        }
      } catch { /* logado dentro do módulo */ }

      if (cloudConv.contact_id) {
        await supabase.from('contact_activities').insert({
          organization_id: orgId,
          contact_id: cloudConv.contact_id,
          conversation_id: id,
          activity_type: 'conversation_closed',
          title: 'Conversa fechada',
          description: resolution || null,
          created_by: authUserId,
        })
      }
      return NextResponse.json({ conversation: cloudConv })
    }

    // ---- 2) Fallback LEGADO (Evolution) — comportamento original ----
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({ status: 'closed', resolved_at: nowIso, resolved_by: authUserId, updated_at: nowIso })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*, contact:whatsapp_contacts(id, organization_id)')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      // já fechada (cloud ou legado) — idempotente, não é erro
      return NextResponse.json({ conversation: null, alreadyClosed: true })
    }

    if (data?.contact) {
      await supabase.from('contact_activities').insert({
        organization_id: data.contact.organization_id,
        contact_id: data.contact.id,
        conversation_id: id,
        activity_type: 'conversation_closed',
        title: 'Conversa fechada',
        description: resolution || null,
        created_by: authUserId,
      })
    }
    return NextResponse.json({ conversation: data })
  } catch (error) {
    console.error('Error closing conversation:', error)
    return NextResponse.json({ error: 'Failed to close conversation' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → Expected: ERRO esperado apenas se `@/lib/whatsapp/auto-assign` não existir ainda — para manter o build verde, **nesta task** deixe o bloco do `releaseConversationAssignment` comentado com `// P2 Task 6:` e descomente na Task 6. Expected final: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts"
git commit -m "fix(whatsapp): close de conversa cloud-aware e idempotente + disparo da pesquisa CSAT"
```

---

### Task 6: Auto-assign — RPCs + módulo + hooks (webhook, transfer da IA, close)

**Files:**
- Create: `supabase/migrations/20260615_whatsapp_p2_auto_assign.sql`
- Create: `src/lib/whatsapp/auto-assign.ts`
- Test: `src/lib/whatsapp/auto-assign.test.ts`
- Modify: `src/lib/whatsapp/webhook-processor.ts` (hook `isNewConversation`)
- Modify: `src/lib/ai/cloud-runner.ts:313-333` (bloco `was_transferred`)
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts` (descomentar release)

- [ ] **Step 1: Migration com RPCs atômicos**

```sql
-- supabase/migrations/20260615_whatsapp_p2_auto_assign.sql
-- =============================================
-- P2 — Auto-assign de conversas para agentes humanos.
--
-- assign_conversation_to_agent: escolhe agente ONLINE com folga
-- (active_conversations < max_conversations), menor carga primeiro.
-- FOR UPDATE SKIP LOCKED: 2 webhooks simultâneos não escolhem o mesmo slot
-- sob contenção. UPDATE da conversa guardado por assigned_to IS NULL
-- (idempotente: 2ª chamada vira no-op e devolve NULL).
--
-- Filas (D6): whatsapp_cloud_conversations NÃO tem queue_id. v1: se a org
-- tem filas ativas com agentes, restringe a membros de alguma fila ativa;
-- senão considera todos os agentes com status. Roteamento por fila
-- específica fica para quando a conversa tiver fila.
-- =============================================

CREATE OR REPLACE FUNCTION assign_conversation_to_agent(
  p_conversation_id UUID,
  p_organization_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  SELECT s.agent_id INTO v_agent_id
    FROM whatsapp_agent_status s
   WHERE s.organization_id = p_organization_id
     AND s.status = 'online'
     AND s.active_conversations < s.max_conversations
     AND (
       NOT EXISTS (
         SELECT 1 FROM whatsapp_queue_agents qa
         JOIN whatsapp_queues q ON q.id = qa.queue_id AND q.is_active
         WHERE qa.organization_id = p_organization_id AND qa.is_active
       )
       OR EXISTS (
         SELECT 1 FROM whatsapp_queue_agents qa
         JOIN whatsapp_queues q ON q.id = qa.queue_id AND q.is_active
         WHERE qa.organization_id = p_organization_id
           AND qa.is_active AND qa.agent_id = s.agent_id
       )
     )
   ORDER BY s.active_conversations ASC, s.last_seen_at DESC NULLS LAST
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN NULL; -- ninguém disponível: conversa fica não-atribuída (fallback)
  END IF;

  UPDATE whatsapp_cloud_conversations
     SET assigned_to = v_agent_id, updated_at = now()
   WHERE id = p_conversation_id
     AND organization_id = p_organization_id
     AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RETURN NULL; -- outra chamada já atribuiu (race resolvido)
  END IF;

  UPDATE whatsapp_agent_status
     SET active_conversations = active_conversations + 1, updated_at = now()
   WHERE agent_id = v_agent_id AND organization_id = p_organization_id;

  RETURN v_agent_id;
END $$;

-- Decremento no fechamento. Chamado APENAS quando o close transicionou o
-- status (a route usa UPDATE ... neq('status','closed') => idempotente,
-- então não há double-decrement).
CREATE OR REPLACE FUNCTION release_conversation_assignment(
  p_conversation_id UUID,
  p_organization_id UUID
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE whatsapp_agent_status s
     SET active_conversations = GREATEST(0, s.active_conversations - 1),
         updated_at = now()
    FROM whatsapp_cloud_conversations c
   WHERE c.id = p_conversation_id
     AND c.organization_id = p_organization_id
     AND c.assigned_to IS NOT NULL
     AND s.agent_id = c.assigned_to
     AND s.organization_id = c.organization_id;
$$;

GRANT EXECUTE ON FUNCTION assign_conversation_to_agent(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION release_conversation_assignment(UUID, UUID) TO service_role;
```

- [ ] **Step 2: Teste do wrapper TS (toggle + RPC) — escrever e ver falhar**

```ts
// src/lib/whatsapp/auto-assign.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc: (...a: any[]) => mockRpc(...a) } }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
const mockIsEnabled = vi.fn()
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: (...a: any[]) => mockIsEnabled(...a) }))

import { maybeAutoAssignConversation, releaseConversationAssignment } from './auto-assign'

describe('maybeAutoAssignConversation', () => {
  beforeEach(() => { mockRpc.mockReset(); mockIsEnabled.mockReset() })

  it('não chama RPC quando o flag whatsapp_auto_assign está off (rollout seguro)', async () => {
    mockIsEnabled.mockResolvedValue(false)
    const r = await maybeAutoAssignConversation({ organizationId: 'org', conversationId: 'c1' })
    expect(r).toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('chama o RPC e retorna o agente quando habilitado', async () => {
    mockIsEnabled.mockResolvedValue(true)
    mockRpc.mockResolvedValue({ data: 'agent-1', error: null })
    const r = await maybeAutoAssignConversation({ organizationId: 'org', conversationId: 'c1' })
    expect(mockRpc).toHaveBeenCalledWith('assign_conversation_to_agent', {
      p_conversation_id: 'c1', p_organization_id: 'org',
    })
    expect(r).toBe('agent-1')
  })

  it('retorna null sem lançar quando o RPC erra (nunca quebra o webhook)', async () => {
    mockIsEnabled.mockResolvedValue(true)
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const r = await maybeAutoAssignConversation({ organizationId: 'org', conversationId: 'c1' })
    expect(r).toBeNull()
  })
})

describe('releaseConversationAssignment', () => {
  it('chama o RPC de release', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    await releaseConversationAssignment('org', 'c1')
    expect(mockRpc).toHaveBeenCalledWith('release_conversation_assignment', {
      p_conversation_id: 'c1', p_organization_id: 'org',
    })
  })
})
```

Run: `npx vitest run src/lib/whatsapp/auto-assign.test.ts` → Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/whatsapp/auto-assign.ts`**

```ts
// =============================================
// P2 — Auto-assign de conversas (wrapper dos RPCs atômicos).
// Toggle por org: feature_flags.whatsapp_auto_assign (rollout seguro).
// Fallback: RPC retorna NULL => conversa fica não-atribuída (comportamento
// atual preservado). Nunca lança — chamado de hot paths (webhook, runner).
// =============================================
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const AUTO_ASSIGN_FLAG = 'whatsapp_auto_assign'

export async function maybeAutoAssignConversation(params: {
  organizationId: string
  conversationId: string
}): Promise<string | null> {
  const { organizationId, conversationId } = params
  try {
    if (!(await isFeatureEnabled(organizationId, AUTO_ASSIGN_FLAG))) return null

    const { data, error } = await supabaseAdmin.rpc('assign_conversation_to_agent', {
      p_conversation_id: conversationId,
      p_organization_id: organizationId,
    })
    if (error) {
      wlog.error('whatsapp.auto_assign.rpc_error', {
        error: error.message, conversation_id: conversationId,
      })
      return null
    }
    if (data) {
      wlog.info('whatsapp.auto_assign.assigned', {
        conversation_id: conversationId, agent_id: data,
      })
    }
    return (data as string | null) ?? null
  } catch (err: any) {
    wlog.error('whatsapp.auto_assign.error', { error: err?.message, conversation_id: conversationId })
    return null
  }
}

export async function releaseConversationAssignment(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('release_conversation_assignment', {
      p_conversation_id: conversationId,
      p_organization_id: organizationId,
    })
    if (error) {
      wlog.error('whatsapp.auto_assign.release_error', {
        error: error.message, conversation_id: conversationId,
      })
    }
  } catch (err: any) {
    wlog.error('whatsapp.auto_assign.release_error', { error: err?.message, conversation_id: conversationId })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/auto-assign.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Hooks**

(a) `webhook-processor.ts` — no bloco P2 (após o hook de business hours):

```ts
  // P2 — auto-assign de conversa nova (toggle por org; fallback não-atribuída)
  if (isNewConversation) {
    try {
      const { maybeAutoAssignConversation } = await import('./auto-assign');
      await maybeAutoAssignConversation({
        organizationId: account.organization_id,
        conversationId: conversation.id,
      });
    } catch (err: any) {
      wlog.error('whatsapp.auto_assign.hook_error', {
        error: err?.message,
        conversation_id: conversation?.id,
      });
    }
  }
```

(b) `src/lib/ai/cloud-runner.ts` — dentro do bloco `if (result.was_transferred) {` (linha ~313), após o `update` que seta `ai_enabled:false`:

```ts
    // P2 — tenta atribuir um humano imediatamente após a transferência da IA.
    try {
      const { maybeAutoAssignConversation } = await import('@/lib/whatsapp/auto-assign');
      await maybeAutoAssignConversation({
        organizationId,
        conversationId: conversation.id,
      });
    } catch { /* best-effort */ }
```

(Verificar o nome da variável de org em escopo nesse trecho do runner — há `organizationId` no insert de trace logo acima, linha ~291.)

(c) `close/route.ts` — descomentar/ativar o bloco `releaseConversationAssignment` da Task 5.

- [ ] **Step 6: Typecheck + suite + commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/whatsapp/`
Expected: PASS.

```bash
git add supabase/migrations/20260615_whatsapp_p2_auto_assign.sql src/lib/whatsapp/auto-assign.ts src/lib/whatsapp/auto-assign.test.ts src/lib/whatsapp/webhook-processor.ts src/lib/ai/cloud-runner.ts "src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts"
git commit -m "feat(whatsapp): auto-assign atomico de conversas (RPC SKIP LOCKED, toggle por org, release no close)"
```

---

### Task 7: Ação WhatsApp REAL na engine de automação legada

**Files:**
- Create: `src/lib/whatsapp/automation-sender.ts`
- Test: `src/lib/whatsapp/automation-sender.test.ts`
- Modify: `src/lib/automation/actions/index.ts:448-501` (`executeSendWhatsApp`)

- [ ] **Step 1: Testes dos guards (mocks no padrão `opt-out-guard.test.ts`) — escrever e ver falhar**

```ts
// src/lib/whatsapp/automation-sender.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: any = { account: null, conversation: null, template: null, optAllowed: true }

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        insert: () => Promise.resolve({ error: null }),
        update: () => chain,
        maybeSingle: () => {
          if (table === 'whatsapp_business_accounts') return Promise.resolve({ data: state.account })
          if (table === 'whatsapp_cloud_conversations') return Promise.resolve({ data: state.conversation })
          if (table === 'whatsapp_templates') return Promise.resolve({ data: state.template })
          return Promise.resolve({ data: null })
        },
      }
      return chain
    }),
  },
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./opt-out-guard', () => ({
  requireOptIn: vi.fn(async () => state.optAllowed ? { allowed: true } : { allowed: false, reason: 'OPTED_OUT' }),
}))
vi.mock('./account-loader', () => ({ getAccessToken: () => 'token' }))
const mockSendText = vi.fn(async () => ({ messages: [{ id: 'wamid.1' }] }))
const mockSendTemplate = vi.fn(async () => ({ messages: [{ id: 'wamid.2' }] }))
vi.mock('./cloud-api', () => ({
  createWhatsAppCloudClient: () => ({ sendText: mockSendText, sendTemplate: mockSendTemplate }),
  normalizePhone: (p: string) => p.replace(/\D/g, ''),
}))

import { sendAutomationWhatsApp } from './automation-sender'

const ORG = 'org-1'

describe('sendAutomationWhatsApp', () => {
  beforeEach(() => {
    state.account = { id: 'a1', organization_id: ORG, phone_number_id: 'pn', phone_number: '55119', status: 'active' }
    state.conversation = null
    state.template = null
    state.optAllowed = true
    mockSendText.mockClear(); mockSendTemplate.mockClear()
  })

  it('falha explícita quando a org não tem conta WhatsApp ativa', async () => {
    state.account = null
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', message: 'oi' })
    expect(r.sent).toBe(false)
    expect(r.error).toMatch(/conta/i)
  })

  it('bloqueia opted_out (sem override em automação)', async () => {
    state.optAllowed = false
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', message: 'oi' })
    expect(r.sent).toBe(false)
    expect(r.skipped).toBe('OPTED_OUT')
    expect(mockSendText).not.toHaveBeenCalled()
  })

  it('texto livre SEM janela 24h aberta => erro pedindo template', async () => {
    state.conversation = { id: 'c1', is_window_open: false, window_expires_at: null }
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', message: 'oi' })
    expect(r.sent).toBe(false)
    expect(r.error).toMatch(/template/i)
  })

  it('texto livre COM janela aberta => envia sendText', async () => {
    state.conversation = {
      id: 'c1', organization_id: ORG, is_window_open: true,
      window_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    }
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', message: 'oi' })
    expect(r.sent).toBe(true)
    expect(mockSendText).toHaveBeenCalled()
  })

  it('template não-APPROVED => erro explícito', async () => {
    state.template = { name: 'promo', status: 'PENDING', category: 'MARKETING', language: 'pt_BR' }
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', templateName: 'promo' })
    expect(r.sent).toBe(false)
    expect(r.error).toMatch(/APPROVED/i)
  })

  it('template APPROVED => envia sendTemplate mesmo sem janela', async () => {
    state.template = { name: 'promo', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' }
    const r = await sendAutomationWhatsApp({ organizationId: ORG, phone: '5511999999999', templateName: 'promo' })
    expect(r.sent).toBe(true)
    expect(mockSendTemplate).toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/lib/whatsapp/automation-sender.test.ts` → Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar `src/lib/whatsapp/automation-sender.ts`**

```ts
// =============================================
// P2 — Sender canônico para a engine de automação LEGADA
// (src/lib/automation/actions/index.ts, consumida por /api/webhooks/process-queue).
// Substitui o fake-success "Would send WhatsApp to ...".
//
// Regras de compliance (mesmas dos demais senders):
//  - requireOptIn (automação NUNCA tem override; MARKETING opted_out bloqueia)
//  - Janela 24h: texto livre só com janela aberta; fora dela exige template
//    APPROVED (validado em whatsapp_templates)
//  - Persiste em whatsapp_cloud_messages quando há conversa cloud (inbox vê)
//
// A engine NOVA do flow-builder (node-executors.ts action_whatsapp) já era
// real e NÃO usa este módulo.
// =============================================
import { supabaseAdmin } from '@/lib/supabase-admin'
import { wlog } from '@/lib/observability/whatsapp-logger'
import { requireOptIn, type TemplateCategory } from './opt-out-guard'
import { createWhatsAppCloudClient, normalizePhone } from './cloud-api'
import { getAccessToken } from './account-loader'

export interface AutomationSendParams {
  organizationId: string
  phone: string
  message?: string
  templateName?: string
  templateParams?: any[]
  language?: string
}

export interface AutomationSendResult {
  sent: boolean
  messageId?: string
  skipped?: 'OPTED_OUT'
  error?: string
}

export async function sendAutomationWhatsApp(p: AutomationSendParams): Promise<AutomationSendResult> {
  const phone = normalizePhone(p.phone)

  // 1) Conta ativa da org
  const { data: account } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('*')
    .eq('organization_id', p.organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!account) return { sent: false, error: 'Nenhuma conta WhatsApp Cloud ativa na organização' }

  // 2) Categoria do template (para o guard)
  let template: any = null
  let category: TemplateCategory | undefined
  if (p.templateName) {
    const { data: tpl } = await supabaseAdmin
      .from('whatsapp_templates')
      .select('name, status, category, language')
      .eq('organization_id', p.organizationId)
      .eq('name', p.templateName)
      .maybeSingle()
    template = tpl
    const upper = (tpl?.category as string | undefined)?.toUpperCase()
    if (upper === 'MARKETING' || upper === 'UTILITY' || upper === 'AUTHENTICATION') category = upper
    if (!tpl) return { sent: false, error: `Template "${p.templateName}" não encontrado` }
    if (tpl.status !== 'APPROVED') {
      return { sent: false, error: `Template "${p.templateName}" não está APPROVED (status: ${tpl.status})` }
    }
  }

  // 3) Opt-out (automação não tem override)
  const opt = await requireOptIn(p.organizationId, phone, category, { sender: 'automation.actions.send_whatsapp' })
  if (!opt.allowed) {
    wlog.info('whatsapp.automation.skip_opted_out', { organization_id: p.organizationId })
    return { sent: false, skipped: 'OPTED_OUT' }
  }

  // 4) Conversa cloud (para janela 24h + persistência no inbox)
  const { data: conversation } = await supabaseAdmin
    .from('whatsapp_cloud_conversations')
    .select('*')
    .eq('waba_id', account.id)
    .eq('wa_id', phone)
    .maybeSingle()

  const windowOpen =
    !!conversation &&
    conversation.is_window_open !== false &&
    conversation.window_expires_at &&
    new Date(conversation.window_expires_at).getTime() > Date.now()

  if (!p.templateName && !windowOpen) {
    return {
      sent: false,
      error: 'Janela de 24h fechada — texto livre não permitido; configure um template APPROVED na ação',
    }
  }

  // 5) Envio
  const client = createWhatsAppCloudClient({
    phoneNumberId: account.phone_number_id,
    accessToken: getAccessToken(account),
  })
  let result: any
  let textBody: string
  try {
    if (p.templateName) {
      result = await client.sendTemplate(phone, p.templateName, p.language || template?.language || 'pt_BR', p.templateParams)
      textBody = `[template:${p.templateName}]`
    } else {
      textBody = (p.message || '').trim()
      if (!textBody) return { sent: false, error: 'Mensagem vazia' }
      result = await client.sendText(phone, textBody)
    }
  } catch (err: any) {
    return { sent: false, error: err?.message || 'Falha no envio' }
  }
  const messageId = result?.messages?.[0]?.id

  // 6) Persistência (só quando existe conversa cloud — sem conversa não há
  // thread no inbox; o registro de envio fica no output da automação)
  if (conversation) {
    await supabaseAdmin.from('whatsapp_cloud_messages').insert({
      organization_id: p.organizationId,
      store_id: conversation.store_id || account.store_id || null,
      waba_id: account.id,
      conversation_id: conversation.id,
      message_id: messageId,
      direction: 'outbound',
      from_number: account.phone_number,
      to_number: phone,
      message_type: p.templateName ? 'template' : 'text',
      content: { text: { body: textBody } },
      text_body: textBody,
      status: 'sent',
      sent_by_bot: true,
      sender: 'automation',
      timestamp: new Date().toISOString(),
    })
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: textBody.substring(0, 100),
        last_message_direction: 'outbound',
      })
      .eq('id', conversation.id)
  }

  return { sent: true, messageId }
}
```

(Na implementação, conferir a assinatura exata de `sendTemplate` em `cloud-api.ts:307` e ajustar a chamada — o teste mocka o client, então o contrato fica documentado aqui.)

- [ ] **Step 3: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/automation-sender.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 4: Plugar em `executeSendWhatsApp` (actions/index.ts:448-501)**

Substituir o corpo da função por:

```ts
async function executeSendWhatsApp(
  config: any,
  context: ActionContext,
  organizationId: string
): Promise<ActionResult> {
  const contact = context.contact;
  if (!contact?.phone) {
    throw new Error('Telefone do contato não encontrado');
  }

  const message = resolveVariable(config.message || config.body || '', context);
  const templateName = config.templateId || config.template;

  // P2: envio REAL via sender canônico (opt-out + janela 24h + template APPROVED).
  const { sendAutomationWhatsApp } = await import('@/lib/whatsapp/automation-sender');
  const result = await sendAutomationWhatsApp({
    organizationId,
    phone: contact.phone,
    message: templateName ? undefined : message,
    templateName,
    templateParams: config.templateParams,
    language: config.language,
  });

  if (result.skipped === 'OPTED_OUT') {
    return {
      success: true,
      output: { action: 'send_whatsapp', to: contact.phone, skipped: true, reason: 'OPTED_OUT' },
    };
  }
  if (!result.sent) {
    return {
      success: false,
      output: { action: 'send_whatsapp', to: contact.phone, error: result.error },
      error: result.error,
    };
  }
  return {
    success: true,
    output: {
      action: 'send_whatsapp',
      to: contact.phone,
      template_id: templateName,
      message_preview: (message || '').substring(0, 100),
      external_message_id: result.messageId,
      sent: true,
    },
  };
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/whatsapp/automation-sender.test.ts`
Expected: PASS.

```bash
git add src/lib/whatsapp/automation-sender.ts src/lib/whatsapp/automation-sender.test.ts src/lib/automation/actions/index.ts
git commit -m "feat(automation): acao WhatsApp real na engine legada via sender canonico (opt-out, janela 24h, template APPROVED)"
```

---

### Task 8: Klaviyo/Twilio — erro explícito em vez de sucesso fake + UI

**Files:**
- Modify: `src/lib/automation/actions/index.ts` (`executeSendEmail` ~375-442, `executeSendSMS` ~507-558)
- Modify: `src/components/automation/index.tsx:87-89`

- [ ] **Step 1: Trocar fake success por erro explícito**

Em `executeSendSMS`, substituir TODO o corpo após a validação de telefone por:

```ts
  // P2 (YAGNI): integração Twilio NÃO está implementada nesta engine.
  // Sucesso fake é pior que indisponível — flows que dependiam disso achavam
  // que enviaram SMS. A engine NOVA do flow-builder (node-executors.action_sms)
  // tem caminho Twilio real; use-a.
  return {
    success: false,
    output: { action: 'send_sms', to: contact.phone, available: false },
    error: 'Integração de SMS (Twilio) não disponível nas automações legadas',
  };
```

Em `executeSendEmail`, substituir o branch `if (integration) { ... }` (Klaviyo, linhas ~398-426) por:

```ts
  if (integration) {
    // P2 (YAGNI): envio via Klaviyo NÃO está implementado — antes retornava
    // sucesso fake ("Would send Klaviyo..."). Erro explícito até existir
    // integração real.
    return {
      success: false,
      output: { action: 'send_email', provider: 'klaviyo', to: contact.email, available: false },
      error: 'Envio de email via Klaviyo não disponível nas automações legadas',
    };
  }
```

E o branch final "sem integração" (~431-441) passa de `success: true` + warning para:

```ts
  return {
    success: false,
    output: { action: 'send_email', provider: 'none', to: contact.email },
    error: 'Integração de email não configurada',
  };
```

- [ ] **Step 2: Esconder a ação SMS na paleta da UI legada**

Em `src/components/automation/index.tsx`, remover a linha 89:

```ts
    { type: 'action_sms', label: 'Enviar SMS', icon: Send, color: 'blue' },
```

(Manter `action_email` e `action_whatsapp` — agora honestos. NÃO tocar em `src/components/flow-builder/Sidebar.tsx`: lá `action_sms` roda na engine nova com Twilio real.)

- [ ] **Step 3: Typecheck (atenção a import `Send` órfão) + commit**

Run: `npx tsc --noEmit` → Expected: sem erros (remover `Send` do import de ícones se ficar sem uso e o lint reclamar).

```bash
git add src/lib/automation/actions/index.ts src/components/automation/index.tsx
git commit -m "fix(automation): stubs Klaviyo/Twilio retornam erro explicito em vez de sucesso fake; remove SMS da paleta legada"
```

---

### Task 9: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Suite completa**

Run: `npx vitest run`
Expected: todas as suites PASS (incl. as preexistentes `opt-out-guard.test.ts`, `cloud-api-signature.test.ts`, etc. — nenhuma regressão).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 3: Greps de sanidade**

Run: `grep -rn "RUNNING" src/app/api/whatsapp/phonebooks/` → Expected: nenhuma ocorrência.
Run: `grep -n "Would send" src/lib/automation/actions/index.ts` → Expected: nenhuma ocorrência.
Run: `grep -c "P2" src/lib/whatsapp/webhook-processor.ts` → Expected: >= 3 (três hooks, arquivo continua ~860 linhas, lógica toda nos módulos).

- [ ] **Step 4: Checklist de deploy (manual, fora do código)**

1. Aplicar as 3 migrations `20260615_*` no Supabase (ordem alfabética já correta).
2. Rollout: habilitar por org piloto — `UPDATE organizations SET feature_flags = feature_flags || '{"whatsapp_auto_assign": true, "whatsapp_csat": {"enabled": true}}' WHERE id = '<org>'`.
3. Smoke: fechar conversa cloud no inbox → pesquisa chega no WhatsApp; responder "5" → linha em `whatsapp_csat_ratings` com `source='customer'`; mensagem fora do horário com bot desligado → 1 auto-reply (e só 1 nas próximas 24h).

- [ ] **Step 5: Commit final (se houve ajustes)**

```bash
git add -A
git commit -m "chore(whatsapp): ajustes finais P2 — ghost features plugadas"
```

---

### Critical Files for Implementation

- D:\worder1-fwrle\src\lib\whatsapp\webhook-processor.ts (arquivo de 800 linhas onde entram os 3 hooks cirúrgicos — CSAT, out-of-hours, auto-assign)
- D:\worder1-fwrle\src\app\api\whatsapp\inbox\conversations\[id]\close\route.ts (hoje quebra para conversas cloud; vira cloud-aware + dispara CSAT + release de assign)
- D:\worder1-fwrle\src\lib\automation\actions\index.ts (stubs fake nas linhas 405/474/532 — WhatsApp real, Klaviyo/Twilio erro explícito)
- D:\worder1-fwrle\src\lib\whatsapp\opt-out-guard.ts (guard de compliance reusado por todos os envios novos; padrão de teste em opt-out-guard.test.ts)
- D:\worder1-fwrle\supabase\migrations\20260607_whatsapp_conversation_counters_rpc.sql (padrão de RPC atômico a replicar nos RPCs de auto-assign)