# Agent Safety Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que as 4 travas de segurança do agente de IA configuráveis na UI (handoff keywords, cooldown pós-transferência, activate_on manual e tópicos bloqueados) sejam realmente aplicadas no caminho live do WhatsApp Cloud.

**Architecture:** As funções de decisão são extraídas puras para `src/lib/ai/guards.ts` (testáveis sem banco) e fiadas nos dois pontos do caminho live: `cloud-runner.ts` (guards de entrada, antes do engine) e `cloud-sender.ts` (moderação da resposta, antes do envio). O cooldown pós-transferência ganha uma coluna nova `ai_transferred_at` em `whatsapp_cloud_conversations` que sobrevive à reativação manual da IA; a configuração de segurança do agente mora em `ai_agents.settings.safety` (JSON, sem migração no agente).

**Tech Stack:** Next.js 14 (App Router), TypeScript 5, Supabase (Postgres + supabaseAdmin), Vitest 1.2, React 18 (UI do editor de agentes).

## Global Constraints

- Prosa/comentários em pt-BR; identificadores de código em inglês (convenção do repo).
- Testes com Vitest (`npm run test` = `vitest run`); testes de lib em `src/lib/ai/__tests__/`.
- NÃO tocar no código morto (`src/lib/services/whatsapp/ai-chatbot-service.ts`, `ai-chat-service.ts`, `src/lib/services/whatsapp/types.ts`) — fora de escopo.
- NÃO remover/alterar travas já ativas: anti-loop (cloud-runner.ts:121), cooldown fixo 5s (`COOLDOWN_MS`), `max_messages_per_conversation`, `stop_on_human_reply`, horário (engine.ts:305-346), budget, opt-out e janela 24h (cloud-sender.ts:128-166).
- YAGNI: moderação por match simples de substring, sem API externa de moderação.
- Guards nunca podem lançar exceção não tratada que quebre o webhook (o caminho já roda dentro de try/catch no worker; retornos usam o contrato `CloudRunnerResult.skipped`).
- Config de segurança fica em `ai_agents.settings.safety` — o campo `settings` já é whitelisted no PUT/PATCH de `/api/ai/agents/[id]/route.ts:151,219`, então nenhuma mudança de API é necessária.
- `ai_disabled_reason` novos (`handoff_keyword`, `blocked_topic`) ficam FORA da whitelist do bulk reactivate (`['no_valid_api_key','budget_exceeded','ai_permanent_error']` em `reactivate-ai/route.ts`) — reativação só manual, por construção.
- Migração SQL versionada em `supabase/migrations/` (padrão `YYYYMMDD_nome.sql`) e aplicada manualmente em produção (padrão do repo, commit `bdac86df`).

---

### Task 1: Funções de guarda puras (`guards.ts`)

**Files:**
- Create: `src/lib/ai/guards.ts`
- Test: `src/lib/ai/__tests__/guards.test.ts`

**Interfaces:**
- Consumes: nada (funções puras, zero imports de banco).
- Produces (usadas nas Tasks 3 e 4):
  - `normalizeForMatch(text: string): string`
  - `matchHandoffKeyword(text: string, keywords: readonly string[] | null | undefined): string | null` — retorna a keyword ORIGINAL que casou, ou `null`.
  - `findBlockedTopic(response: string, blockedTopics: readonly string[] | null | undefined): string | null`
  - `isTransferCooldownActive(params: { transferredAt: string | null | undefined; cooldownSeconds: number | null | undefined; now?: number }): boolean`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/ai/__tests__/guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  normalizeForMatch,
  matchHandoffKeyword,
  findBlockedTopic,
  isTransferCooldownActive,
} from '../guards'

describe('normalizeForMatch', () => {
  it('remove acentos, baixa caixa e trim', () => {
    expect(normalizeForMatch('  Atendênte HUMANO ')).toBe('atendente humano')
  })

  it('string vazia/nula vira vazia', () => {
    expect(normalizeForMatch('')).toBe('')
    expect(normalizeForMatch(undefined as any)).toBe('')
  })
})

describe('matchHandoffKeyword', () => {
  it('casa substring simples e retorna a keyword ORIGINAL', () => {
    expect(matchHandoffKeyword('quero falar com atendente', ['atendente'])).toBe('atendente')
  })

  it('case-insensitive', () => {
    expect(matchHandoffKeyword('FALAR COM HUMANO', ['humano'])).toBe('humano')
  })

  it('acento-insensitive nos DOIS lados', () => {
    // keyword com acento, texto sem
    expect(matchHandoffKeyword('quero transferencia agora', ['transferência'])).toBe('transferência')
    // texto com acento, keyword sem
    expect(matchHandoffKeyword('quero transferência agora', ['transferencia'])).toBe('transferencia')
  })

  it('retorna null sem match, sem keywords ou texto vazio', () => {
    expect(matchHandoffKeyword('oi, tudo bem?', ['atendente'])).toBeNull()
    expect(matchHandoffKeyword('oi', [])).toBeNull()
    expect(matchHandoffKeyword('oi', undefined)).toBeNull()
    expect(matchHandoffKeyword('', ['atendente'])).toBeNull()
  })

  it('ignora keywords vazias/whitespace na lista', () => {
    expect(matchHandoffKeyword('oi', ['', '  '])).toBeNull()
  })
})

describe('findBlockedTopic', () => {
  it('acha topico bloqueado na resposta (case/acento-insensitive)', () => {
    expect(findBlockedTopic('Sobre Política, eu acho que...', ['politica'])).toBe('politica')
  })

  it('null quando resposta limpa ou lista vazia', () => {
    expect(findBlockedTopic('Seu pedido foi enviado!', ['politica'])).toBeNull()
    expect(findBlockedTopic('qualquer coisa', undefined)).toBeNull()
  })
})

describe('isTransferCooldownActive', () => {
  const now = Date.parse('2026-07-27T12:00:00Z')

  it('true quando a transferencia foi ha menos de cooldownSeconds', () => {
    const transferredAt = new Date(now - 100_000).toISOString() // 100s atras
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 300, now })).toBe(true)
  })

  it('false quando o cooldown ja expirou', () => {
    const transferredAt = new Date(now - 400_000).toISOString() // 400s atras
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 300, now })).toBe(false)
  })

  it('false sem transferredAt (nunca transferiu)', () => {
    expect(isTransferCooldownActive({ transferredAt: null, cooldownSeconds: 300, now })).toBe(false)
    expect(isTransferCooldownActive({ transferredAt: undefined, cooldownSeconds: 300, now })).toBe(false)
  })

  it('cooldownSeconds null/undefined usa default 300', () => {
    const transferredAt = new Date(now - 100_000).toISOString()
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: undefined, now })).toBe(true)
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: null, now })).toBe(true)
  })

  it('cooldown 0 ou negativo desliga a trava', () => {
    const transferredAt = new Date(now - 1_000).toISOString()
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 0, now })).toBe(false)
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: -10, now })).toBe(false)
  })

  it('data invalida => false (fail-open, nao trava a IA por lixo no banco)', () => {
    expect(isTransferCooldownActive({ transferredAt: 'not-a-date', cooldownSeconds: 300, now })).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/guards.test.ts`
Expected: FAIL — `Cannot find module '../guards'` (ou equivalente de resolução).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/ai/guards.ts`:

```ts
/**
 * Guardas puras de segurança do agente de IA — caminho live Cloud.
 *
 * Extraídas como funções puras (zero I/O) para serem testáveis sem mocks de
 * banco. A fiação acontece em cloud-runner.ts (inbound: handoff keywords,
 * activate_on manual, cooldown pós-transferência) e cloud-sender.ts
 * (outbound: blocked_topics sobre a resposta do LLM).
 */

/** Normaliza para matching case/acento-insensitive (NFD remove diacríticos). */
export function normalizeForMatch(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Retorna a keyword de handoff (na forma ORIGINAL configurada) que casa com o
 * texto inbound, ou null. Matching por substring, case/acento-insensitive —
 * paridade com o comportamento do código legado (ai-chatbot-service.ts:62),
 * que só normalizava caixa; aqui normalizamos acentos também (pt-BR).
 */
export function matchHandoffKeyword(
  text: string,
  keywords: readonly string[] | null | undefined,
): string | null {
  if (!keywords || keywords.length === 0) return null;
  const haystack = normalizeForMatch(text);
  if (!haystack) return null;
  for (const kw of keywords) {
    const needle = normalizeForMatch(kw);
    if (needle && haystack.includes(needle)) return kw;
  }
  return null;
}

/**
 * Moderação mínima (YAGNI: sem API externa): retorna o tópico bloqueado
 * presente na RESPOSTA do LLM, ou null. Mesma semântica de matching do
 * handoff — reuso direto (DRY).
 */
export function findBlockedTopic(
  response: string,
  blockedTopics: readonly string[] | null | undefined,
): string | null {
  return matchHandoffKeyword(response, blockedTopics);
}

export interface TransferCooldownParams {
  /** whatsapp_cloud_conversations.ai_transferred_at (ISO) — null se nunca transferiu. */
  transferredAt: string | null | undefined;
  /** behavior.cooldown_after_transfer em SEGUNDOS (default 300; <=0 desliga). */
  cooldownSeconds: number | null | undefined;
  /** Date.now() injetável para teste. */
  now?: number;
}

/** True se ainda estamos dentro do cooldown pós-transferência. */
export function isTransferCooldownActive(params: TransferCooldownParams): boolean {
  const { transferredAt, now = Date.now() } = params;
  if (!transferredAt) return false;
  const seconds = Number(params.cooldownSeconds ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const transferredMs = new Date(transferredAt).getTime();
  if (!Number.isFinite(transferredMs)) return false;
  return now - transferredMs < seconds * 1000;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/guards.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/guards.ts src/lib/ai/__tests__/guards.test.ts
git commit -m "feat(ai): funcoes puras de guarda de seguranca (handoff/blocked-topic/cooldown)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos (`settings.safety`) + migração `ai_transferred_at`

**Files:**
- Modify: `src/lib/ai/types.ts:39-61` (interface `AgentSettings`) e `:388-403` (`DEFAULT_SETTINGS`)
- Create: `supabase/migrations/20260727_ai_transfer_cooldown.sql`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `AgentSettings.safety?: { handoff_keywords: string[]; handoff_confirmation_message?: string; blocked_topics: string[] }` — lido nas Tasks 3, 4 e 5.
  - Coluna `whatsapp_cloud_conversations.ai_transferred_at TIMESTAMPTZ NULL` — escrita nas Tasks 3 e 4, lida na Task 3.

- [ ] **Step 1: Adicionar `safety` na interface `AgentSettings`**

Em `src/lib/ai/types.ts`, dentro de `AgentSettings` (após o bloco `behavior`, antes do `}` da linha 61):

```ts
  /**
   * Travas de segurança aplicadas no caminho live (cloud-runner/cloud-sender).
   * Opcional: agentes antigos no banco não têm este bloco — runtime trata
   * undefined como listas vazias.
   */
  safety?: {
    /** Palavras do CLIENTE que forçam transferência p/ humano (case/acento-insensitive). */
    handoff_keywords: string[]
    /** Mensagem opcional enviada ao cliente quando a transferência por keyword acontece. */
    handoff_confirmation_message?: string
    /** Tópicos que a RESPOSTA da IA não pode mencionar — violação bloqueia o envio e transfere. */
    blocked_topics: string[]
  }
```

- [ ] **Step 2: Adicionar default em `DEFAULT_SETTINGS`**

Em `src/lib/ai/types.ts`, dentro de `DEFAULT_SETTINGS` (após o bloco `behavior: {...},` na linha 397-402):

```ts
  safety: {
    handoff_keywords: [],
    handoff_confirmation_message: '',
    blocked_topics: [],
  },
```

- [ ] **Step 3: Verificar que o TypeScript compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos (erros pré-existentes, se houver, devem ser idênticos aos de antes da mudança — comparar rodando em `git stash` na dúvida).

- [ ] **Step 4: Criar a migração**

Criar `supabase/migrations/20260727_ai_transfer_cooldown.sql`:

```sql
-- Cooldown pós-transferência (settings.behavior.cooldown_after_transfer):
-- carimbo da última transferência IA->humano na conversa. NÃO é limpo quando
-- a IA é religada manualmente (bot/route.ts e conversations/[id]/ai/route.ts
-- limpam apenas ai_disabled_at/ai_disabled_reason) — é isso que faz o
-- cooldown valer mesmo após reativação (guard transfer_cooldown no
-- cloud-runner.ts).
ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_transferred_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_cloud_conversations.ai_transferred_at IS
  'Ultima transferencia IA->humano (action transfer, handoff keyword ou blocked topic). Lido pelo guard transfer_cooldown do cloud-runner.';
```

- [ ] **Step 5: Aplicar a migração no Supabase (verificação manual)**

Aplicar o SQL acima no projeto Supabase (SQL Editor ou `supabase db push`, conforme o fluxo do time — padrão do repo é versionar e aplicar manualmente em produção).
Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_cloud_conversations' AND column_name = 'ai_transferred_at';` retorna 1 linha.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/types.ts supabase/migrations/20260727_ai_transfer_cooldown.sql
git commit -m "feat(ai): tipo settings.safety + coluna ai_transferred_at (cooldown pos-transferencia)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Fiação no cloud-runner (activate_on manual, cooldown pós-transferência, handoff keywords)

**Files:**
- Modify: `src/lib/ai/cloud-runner.ts:24-32` (imports), `:162` (após `const behavior = ...`, inserir os 3 guards) e `:432-453` (bloco de transferência — adicionar `ai_transferred_at`)
- Test: `src/lib/ai/__tests__/cloud-runner-guards.test.ts` (novo)

**Interfaces:**
- Consumes (Task 1): `matchHandoffKeyword(text, keywords): string | null`, `isTransferCooldownActive({ transferredAt, cooldownSeconds, now? }): boolean`.
- Consumes (Task 2): `conversation.ai_transferred_at` (o worker carrega a conversa com `select('*')` em `whatsapp-ai-respond/route.ts:83-88`, então a coluna nova chega sozinha) e `agent.settings.safety`.
- Produces: novos valores de `CloudRunnerResult.skipped`: `'manual_activation_required'`, `'transfer_cooldown'`, `'handoff_keyword'` (todos terminais — sem `failure`, o worker não agenda retry). Novos `ai_disabled_reason`: `'handoff_keyword'`.

Semântica definida (após leitura do código):
- **activate_on='manual'**: o mecanismo de ativação manual por conversa JÁ existe — `POST /api/whatsapp/inbox/conversations/[id]/bot` com `ai_agent_id` grava `whatsapp_cloud_conversations.ai_agent_id` (bot/route.ts:97-102). Logo: agente manual só roda quando `conversation.ai_agent_id === agentId`.
- **cooldown_after_transfer**: qualquer transferência (action/tool do engine, handoff keyword, blocked topic) grava `ai_transferred_at`. Se um humano religar a IA dentro da janela, o guard silencia a IA até `ai_transferred_at + cooldown_after_transfer` segundos (a coluna não é limpa na reativação).
- **handoff_keywords**: checadas sobre o texto inbound ANTES do engine; em match a conversa é desabilitada (`ai_disabled_reason='handoff_keyword'`), logada, e a mensagem de confirmação configurável (`safety.handoff_confirmation_message`) é enviada se não-vazia.

- [ ] **Step 1: Escrever os testes de fiação que falham**

Criar `src/lib/ai/__tests__/cloud-runner-guards.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mock supabaseAdmin: resultados enfileirados POR TABELA ----
const mockRpc = vi.fn()
type Call = { table: string; method: string; args: any[] }
const calls: Call[] = []
const tableResults: Record<string, any[]> = {}

function queueResult(table: string, result: any) {
  tableResults[table] = tableResults[table] || []
  tableResults[table].push(result)
}
function nextResult(table: string) {
  const q = tableResults[table]
  return q && q.length > 0 ? q.shift() : { data: null, error: null }
}
function makeBuilder(table: string) {
  const builder: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: any) => resolve(nextResult(table))
        }
        return (...args: any[]) => {
          calls.push({ table, method: prop, args })
          if (prop === 'maybeSingle' || prop === 'single') {
            return Promise.resolve(nextResult(table))
          }
          return builder
        }
      },
    },
  )
  return builder
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (table: string) => {
      calls.push({ table, method: 'from', args: [table] })
      return makeBuilder(table)
    },
  },
}))

const mockCreateAgentEngine = vi.fn()
vi.mock('../engine', () => ({
  createAgentEngine: (...args: any[]) => mockCreateAgentEngine(...args),
}))

const mockSendHumanizedReply = vi.fn()
vi.mock('../cloud-sender', () => ({
  sendHumanizedReply: (...args: any[]) => mockSendHumanizedReply(...args),
}))

vi.mock('@/lib/whatsapp/alerts', () => ({
  sendAlert: vi.fn(async () => {}),
}))
vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { maybeRunAgentForCloudConversation } from '../cloud-runner'

const account = {
  id: 'waba-1',
  organization_id: 'org-1',
  phone_number: '5511999990000',
}

function conv(overrides: Record<string, any> = {}) {
  return {
    id: 'conv-1',
    organization_id: 'org-1',
    contact_phone: '5511888880000',
    wa_id: '5511888880000',
    ai_enabled: true,
    ai_agent_id: null,
    ai_transferred_at: null,
    ...overrides,
  }
}

function agentRow(overrides: Record<string, any> = {}) {
  const { settings, ...rest } = overrides
  return {
    id: 'agent-1',
    organization_id: 'org-1',
    provider: 'openai',
    model: 'gpt-4o-mini',
    is_active: true,
    settings: {
      behavior: {
        activate_on: 'new_message',
        stop_on_human_reply: true,
        cooldown_after_transfer: 300,
        max_messages_per_conversation: 0,
      },
      safety: { handoff_keywords: [], handoff_confirmation_message: '', blocked_topics: [] },
      ...(settings || {}),
    },
    ...rest,
  }
}

function findUpdate(table: string) {
  return calls.find((c) => c.table === table && c.method === 'update')
}

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(tableResults)) delete tableResults[k]
  mockRpc.mockReset()
  mockCreateAgentEngine.mockReset()
  mockSendHumanizedReply.mockReset()
  mockRpc.mockResolvedValue({ data: [{ agent_id: 'agent-1' }], error: null })
})

describe('cloud-runner guards — activate_on manual', () => {
  it('agente manual NAO dispara sem atribuicao explicita na conversa', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          behavior: {
            activate_on: 'manual',
            stop_on_human_reply: true,
            cooldown_after_transfer: 300,
            max_messages_per_conversation: 0,
          },
        },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'oi',
    })

    expect(r.skipped).toBe('manual_activation_required')
    expect(r.transferred).toBe(false)
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it('agente manual RODA quando conversation.ai_agent_id === agentId', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          behavior: {
            activate_on: 'manual',
            stop_on_human_reply: true,
            cooldown_after_transfer: 300,
            max_messages_per_conversation: 0,
          },
        },
      }),
    })
    // Sem chave de provider na org => segue ate o gate BYO-key, provando que
    // o guard de activate_on deixou passar.
    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({ ai_agent_id: 'agent-1' }),
      text: 'oi',
    })

    expect(r.skipped).not.toBe('manual_activation_required')
    expect(r.error).toBe('no_valid_api_key')
  })
})

describe('cloud-runner guards — cooldown pos-transferencia', () => {
  it('IA silencia dentro do cooldown configurado', async () => {
    queueResult('ai_agents', { data: agentRow() })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({
        ai_transferred_at: new Date(Date.now() - 100_000).toISOString(), // 100s atras
      }),
      text: 'oi',
    })

    expect(r.skipped).toBe('transfer_cooldown')
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
  })

  it('IA volta a responder depois do cooldown (300s default)', async () => {
    queueResult('ai_agents', { data: agentRow() })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv({
        ai_transferred_at: new Date(Date.now() - 400_000).toISOString(), // 400s atras
      }),
      text: 'oi',
    })

    expect(r.skipped).not.toBe('transfer_cooldown')
    expect(r.error).toBe('no_valid_api_key') // seguiu ate o gate BYO-key
  })
})

describe('cloud-runner guards — handoff keywords', () => {
  it('keyword desativa a IA, marca transferencia e NAO chama o engine', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['atendente'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'Quero falar com um ATENDENTE agora',
    })

    expect(r.transferred).toBe(true)
    expect(r.skipped).toBe('handoff_keyword')
    expect(mockCreateAgentEngine).not.toHaveBeenCalled()
    expect(mockSendHumanizedReply).not.toHaveBeenCalled() // sem confirmation configurada

    const upd = findUpdate('whatsapp_cloud_conversations')
    expect(upd).toBeDefined()
    expect(upd!.args[0].ai_enabled).toBe(false)
    expect(upd!.args[0].ai_disabled_reason).toBe('handoff_keyword')
    expect(upd!.args[0].ai_transferred_at).toBeDefined()
  })

  it('match acento-insensitive (keyword com acento, inbound sem)', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['transferência'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'preciso de transferencia',
    })

    expect(r.skipped).toBe('handoff_keyword')
  })

  it('envia a mensagem de confirmacao configurada', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: {
          safety: {
            handoff_keywords: ['humano'],
            handoff_confirmation_message: 'Certo! Vou te passar para um atendente humano.',
            blocked_topics: [],
          },
        },
      }),
    })
    mockSendHumanizedReply.mockResolvedValue({ sent: true, messageId: 'wamid.1' })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'quero um humano',
    })

    expect(r.transferred).toBe(true)
    expect(mockSendHumanizedReply).toHaveBeenCalledTimes(1)
    expect(mockSendHumanizedReply.mock.calls[0][0].text).toBe(
      'Certo! Vou te passar para um atendente humano.',
    )
  })

  it('sem match segue o fluxo normal', async () => {
    queueResult('ai_agents', {
      data: agentRow({
        settings: { safety: { handoff_keywords: ['atendente'], handoff_confirmation_message: '', blocked_topics: [] } },
      }),
    })

    const r = await maybeRunAgentForCloudConversation({
      account,
      conversation: conv(),
      text: 'qual o preco do produto?',
    })

    expect(r.skipped).not.toBe('handoff_keyword')
    expect(r.error).toBe('no_valid_api_key') // seguiu ate o gate BYO-key
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/__tests__/cloud-runner-guards.test.ts`
Expected: FAIL — os testes de `manual_activation_required` / `transfer_cooldown` / `handoff_keyword` recebem `skipped: undefined` ou `error: 'no_valid_api_key'` (guards ainda não existem no runner).

- [ ] **Step 3: Implementar os guards no cloud-runner**

Em `src/lib/ai/cloud-runner.ts`, adicionar o import (junto aos imports existentes, após a linha 28 `import { sendHumanizedReply } from './cloud-sender';`):

```ts
import { matchHandoffKeyword, isTransferCooldownActive } from './guards';
```

Logo APÓS a linha 162 (`const behavior = agent.settings?.behavior || {};`), inserir:

```ts
  const safety = agent.settings?.safety || {};

  // ---------- activate_on: 'manual' NUNCA dispara automaticamente ----------
  // Mecanismo de ativação manual JÁ existe: POST /api/whatsapp/inbox/
  // conversations/[id]/bot com ai_agent_id grava conversation.ai_agent_id.
  // Agente manual só roda quando foi explicitamente atribuído a ESTA conversa.
  if (behavior.activate_on === 'manual' && conversation.ai_agent_id !== agentId) {
    return {
      replied: false,
      transferred: false,
      agentId,
      skipped: 'manual_activation_required',
    };
  }

  // ---------- Cooldown pós-transferência (behavior.cooldown_after_transfer) ----------
  // ai_transferred_at NÃO é limpo na reativação manual da IA — o cooldown
  // configurado (default 300s) vale mesmo se um humano religar a IA cedo.
  if (
    isTransferCooldownActive({
      transferredAt: conversation.ai_transferred_at,
      cooldownSeconds: behavior.cooldown_after_transfer,
    })
  ) {
    return { replied: false, transferred: false, agentId, skipped: 'transfer_cooldown' };
  }

  // ---------- Handoff keywords (settings.safety.handoff_keywords) ----------
  // Checa o texto INBOUND antes do engine (case/acento-insensitive). Match =>
  // desativa a IA na conversa, marca a transferência e (opcional) confirma.
  const matchedKeyword = matchHandoffKeyword(text, safety.handoff_keywords);
  if (matchedKeyword) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: nowIso,
        ai_disabled_reason: 'handoff_keyword',
        ai_transferred_at: nowIso,
      })
      .eq('id', conversation.id);

    wlog.info('whatsapp.ai.handoff_keyword', {
      organization_id: organizationId,
      conversation_id: conversation.id,
      agent_id: agentId,
      keyword: matchedKeyword,
    });

    const confirmation = String(safety.handoff_confirmation_message || '').trim();
    if (confirmation && !skipSend) {
      // Best-effort: falha no envio da confirmação não desfaz a transferência.
      await sendHumanizedReply({
        account,
        conversation,
        text: confirmation,
        agent: { id: agentId, ...agent },
        inboundMessageId: params.inboundMessageId,
        skipDelays,
      });
    }

    return { replied: false, transferred: true, agentId, skipped: 'handoff_keyword' };
  }
```

- [ ] **Step 4: Gravar `ai_transferred_at` na transferência do engine**

Ainda em `src/lib/ai/cloud-runner.ts`, no bloco `if (result.was_transferred)` (linhas 433-441), trocar o update:

```ts
  if (result.was_transferred) {
    const transferIso = new Date().toISOString();
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: transferIso,
        ai_disabled_reason: 'transferred_to_human',
        ai_transferred_at: transferIso,
      })
      .eq('id', conversation.id);
```

(o restante do bloco — `console.log` e `return` — permanece igual).

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/__tests__/cloud-runner-guards.test.ts`
Expected: PASS (8 testes).

Run: `npm run test`
Expected: suíte inteira verde (nenhuma regressão — em especial `guards.test.ts` e `cloud-sender.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/cloud-runner.ts src/lib/ai/__tests__/cloud-runner-guards.test.ts
git commit -m "feat(ai): aplicar handoff_keywords, cooldown_after_transfer e activate_on=manual no caminho live

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Moderação de tópicos bloqueados no cloud-sender

**Files:**
- Modify: `src/lib/ai/cloud-sender.ts:28-32` (imports) e `:122-126` (após o check de `trimmed`, inserir a moderação)
- Modify: `src/lib/ai/cloud-runner.ts:494-503` (tratar `reason === 'blocked_topic'` como terminal, junto ao branch de `opted_out`)
- Test: `src/lib/ai/cloud-sender.test.ts` (novo describe + captura do payload de update no mock)

**Interfaces:**
- Consumes (Task 1): `findBlockedTopic(response, blockedTopics): string | null`.
- Consumes (Task 2): `agent.settings.safety.blocked_topics` (o runner já passa o agente completo: `agent: { id: agentId, ...agent }` em cloud-runner.ts:487).
- Produces: `SendHumanizedReplyResult.reason === 'blocked_topic'` (novo valor); `ai_disabled_reason === 'blocked_topic'`; `CloudRunnerResult.skipped === 'blocked_topic'` com `transferred: true`.

- [ ] **Step 1: Ajustar o mock e escrever os testes que falham**

Em `src/lib/ai/cloud-sender.test.ts`, trocar o mock do supabase (linhas 26-33) para capturar o payload do `update`:

```ts
const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: mockUpsert,
      update: mockUpdate,
    })),
  },
}))
```

(declarar `const mockUpdate` junto dos outros mocks hoisted, antes do `vi.mock`). Adicionar ao final do arquivo:

```ts
describe('sendHumanizedReply — moderacao blocked_topics', () => {
  beforeEach(() => {
    mockRequireOptIn.mockReset()
    mockSendText.mockReset()
    mockCreateClient.mockClear()
    mockUpsert.mockClear()
    mockUpdate.mockClear()
    mockUpdateEq.mockClear()
  })

  it('NAO envia quando a resposta contem topico bloqueado; desabilita e transfere', async () => {
    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'Sobre Política, eu acho que o candidato...',
      agent: { id: 'agent-1', settings: { safety: { blocked_topics: ['politica'] } } },
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('blocked_topic')
    // Nada foi pra Meta
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockSendText).not.toHaveBeenCalled()
    // Conversa desabilitada + transferida
    const payload = mockUpdate.mock.calls[0][0]
    expect(payload.ai_enabled).toBe(false)
    expect(payload.ai_disabled_reason).toBe('blocked_topic')
    expect(payload.ai_transferred_at).toBeDefined()
  })

  it('envia normalmente quando nenhum topico bloqueado aparece', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.9' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'Seu pedido saiu para entrega!',
      agent: { id: 'agent-1', settings: { safety: { blocked_topics: ['politica'] } } },
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
    expect(mockSendText).toHaveBeenCalledTimes(1)
  })

  it('agente sem settings.safety segue funcionando (retrocompatibilidade)', async () => {
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.10' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent: { id: 'agent-1' },
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/cloud-sender.test.ts`
Expected: FAIL — o primeiro teste novo recebe `sent: true`/`reason` errado (moderação ainda não existe); os testes antigos continuam PASS.

- [ ] **Step 3: Implementar a moderação no cloud-sender**

Em `src/lib/ai/cloud-sender.ts`, adicionar o import (junto aos imports, após a linha 32):

```ts
import { findBlockedTopic } from './guards';
```

Logo APÓS o check de texto vazio (linhas 122-125, `if (!trimmed) { return { sent: false, reason: 'empty_text' }; }`), inserir:

```ts
  // --- Moderação mínima: tópicos bloqueados (settings.safety.blocked_topics) ---
  // Checa a RESPOSTA do LLM antes de QUALQUER envio (inclusive antes da janela
  // 24h/opt-out, para sempre registrar a violação). Match simples,
  // case/acento-insensitive; sem API de moderação externa (YAGNI).
  // Violação => não envia, loga, desabilita a IA e transfere para humano.
  const blockedTopic = findBlockedTopic(
    trimmed,
    agent?.settings?.safety?.blocked_topics,
  );
  if (blockedTopic) {
    const nowIso = new Date().toISOString();
    wlog.warn('whatsapp.ai.blocked_topic', {
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      agent_id: agent.id,
      topic: blockedTopic,
    });
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: nowIso,
        ai_disabled_reason: 'blocked_topic',
        ai_transferred_at: nowIso,
      })
      .eq('id', conversation.id);
    return { sent: false, reason: 'blocked_topic' };
  }
```

- [ ] **Step 4: Tratar `blocked_topic` como terminal no cloud-runner**

Em `src/lib/ai/cloud-runner.ts`, logo APÓS o branch de `opted_out` (linhas 494-503, `if (!sendResult.sent && sendResult.reason === 'opted_out') { ... }`), inserir:

```ts
  // blocked_topic (moderação, Task 4): o sender já desabilitou a conversa e
  // marcou a transferência — retry nunca vai destravar, então é terminal
  // (sem failure) e reportamos transferred=true pro chamador/simulador.
  if (!sendResult.sent && sendResult.reason === 'blocked_topic') {
    return {
      replied: false,
      transferred: true,
      response,
      traceId,
      agentId,
      skipped: 'blocked_topic',
    };
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/cloud-sender.test.ts src/lib/ai/__tests__/cloud-runner-guards.test.ts`
Expected: PASS (novos e antigos).

Run: `npm run test`
Expected: suíte inteira verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/cloud-sender.ts src/lib/ai/cloud-sender.test.ts src/lib/ai/cloud-runner.ts
git commit -m "feat(ai): moderacao de topicos bloqueados na resposta do LLM antes do envio

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: UI — seção "Segurança" no SettingsTab (handoff keywords + blocked_topics)

**Files:**
- Modify: `src/components/agents/tabs/SettingsTab.tsx:4-13` (imports lucide), `:73-88` (default de `settings`), `:124-128` (helpers) e após a AccordionItem "Comportamento" (linha 640) — nova AccordionItem "Segurança".

**Interfaces:**
- Consumes (Task 2): `AgentSettings.safety` (via `agent.settings`); `updateSettings(updates: Partial<AgentSettings>)` já existente (persiste via `onUpdate` → PUT `/api/ai/agents/[id]`, campo `settings` whitelisted).
- Produces: edição de `settings.safety.handoff_keywords: string[]`, `settings.safety.handoff_confirmation_message: string` e `settings.safety.blocked_topics: string[]` (mesmos nomes lidos nas Tasks 3 e 4).

- [ ] **Step 1: Imports e defaults**

Em `src/components/agents/tabs/SettingsTab.tsx`, adicionar `Shield` ao import do lucide (linha 4-13):

```ts
import {
  Settings,
  Phone,
  GitBranch,
  Clock,
  Cog,
  Info,
  Loader2,
  Brain,
  Shield,
} from 'lucide-react'
```

No objeto default de `settings` (linhas 73-88), adicionar após o bloco `behavior`:

```ts
    safety: {
      handoff_keywords: [],
      handoff_confirmation_message: '',
      blocked_topics: [],
    },
```

- [ ] **Step 2: Helpers de acesso e parsing**

Logo após `const updateSettings = ...` (linhas 124-128), adicionar:

```ts
  const safety = settings.safety || {
    handoff_keywords: [],
    handoff_confirmation_message: '',
    blocked_topics: [],
  }

  // Lista separada por vírgula -> string[] limpa.
  const parseKeywordList = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
```

- [ ] **Step 3: Nova seção "Segurança"**

Inserir a nova `AccordionItem` imediatamente APÓS o fechamento da AccordionItem "Comportamento" (`</AccordionItem>` da linha 640), antes de `</>`:

```tsx
          {/* Safety Section */}
          <AccordionItem
            open={expandedSection === 'safety'}
            onToggle={() => toggleSection('safety')}
            title={
              <div className="flex items-center gap-3">
                <div className="act-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <span style={{ color: 'var(--text)' }}>Segurança</span>
                  <p className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                    Transferência por palavra-chave e tópicos bloqueados
                  </p>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Handoff keywords */}
              <div className="rule-card">
                <label className="label">Palavras-chave de transferência</label>
                <input
                  type="text"
                  className="field"
                  placeholder="atendente, humano, falar com alguém"
                  defaultValue={(safety.handoff_keywords || []).join(', ')}
                  onBlur={(e) => updateSettings({
                    safety: { ...safety, handoff_keywords: parseKeywordList(e.target.value) },
                  })}
                />
                <p className="hint">
                  Se a mensagem do cliente contiver uma destas palavras, a IA transfere a
                  conversa para um humano (não diferencia maiúsculas nem acentos).
                  Separe por vírgula.
                </p>
              </div>

              {/* Handoff confirmation message */}
              <div className="rule-card">
                <label className="label">Mensagem de confirmação da transferência (opcional)</label>
                <input
                  type="text"
                  className="field"
                  placeholder="Certo! Vou te passar para um atendente humano."
                  defaultValue={safety.handoff_confirmation_message || ''}
                  onBlur={(e) => updateSettings({
                    safety: { ...safety, handoff_confirmation_message: e.target.value },
                  })}
                />
                <p className="hint">
                  Enviada ao cliente quando a transferência por palavra-chave acontece.
                  Deixe vazio para não enviar nada.
                </p>
              </div>

              {/* Blocked topics */}
              <div className="rule-card">
                <label className="label">Tópicos bloqueados</label>
                <input
                  type="text"
                  className="field"
                  placeholder="política, religião, concorrente"
                  defaultValue={(safety.blocked_topics || []).join(', ')}
                  onBlur={(e) => updateSettings({
                    safety: { ...safety, blocked_topics: parseKeywordList(e.target.value) },
                  })}
                />
                <p className="hint">
                  Se a resposta da IA mencionar um destes tópicos, ela NÃO é enviada e a
                  conversa é transferida para um humano. Separe por vírgula.
                </p>
              </div>
            </div>
          </AccordionItem>
```

- [ ] **Step 4: Verificação (typecheck + lint)**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

Run: `npm run lint`
Expected: sem erros novos em `SettingsTab.tsx`.

- [ ] **Step 5: Verificação manual da UI**

1. `npm run dev` e abrir o editor de um agente em `/whatsapp/ai-agents` → aba Configurações.
2. Abrir a seção "Segurança": preencher "Palavras-chave de transferência" com `atendente, humano`, confirmação com `Certo! Vou te transferir.` e "Tópicos bloqueados" com `política`.
3. Sair do campo (blur), salvar o agente, recarregar a página → os três valores persistem.
4. Conferir no banco: `SELECT settings->'safety' FROM ai_agents WHERE id = '<agent_id>';` retorna `{"handoff_keywords":["atendente","humano"],"handoff_confirmation_message":"Certo! Vou te transferir.","blocked_topics":["política"]}`.

- [ ] **Step 6: Commit**

```bash
git add src/components/agents/tabs/SettingsTab.tsx
git commit -m "feat(agents-ui): secao Seguranca no SettingsTab (handoff keywords, confirmacao e blocked_topics)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verificação manual E2E (simulador + inbox)

**Files:**
- Nenhum arquivo novo — usa o simulador existente `POST /api/ai/test/cloud-webhook` (que chama `maybeRunAgentForCloudConversation` com `skipSend`/`skipDelays`) e o inbox.

**Interfaces:**
- Consumes: tudo das Tasks 1-5 já mergeado; migração da Task 2 aplicada no ambiente.
- Produces: checklist de aceite preenchido.

- [ ] **Step 1: Pré-condições**

Ambiente com: migração `20260727_ai_transfer_cooldown.sql` aplicada, um agente ativo com chave de provider válida em `organization_api_keys`, e a config da Task 5 preenchida (`handoff_keywords: ['atendente']`, confirmação, `blocked_topics: ['política']`, `cooldown_after_transfer: 300`).

- [ ] **Step 2: Handoff keyword no caminho live**

Enviar (de um WhatsApp real ou via simulador) a mensagem `quero falar com um ATENDENTE`.
Expected:
- IA não responde com LLM; se a confirmação está configurada, o cliente recebe exatamente `Certo! Vou te transferir.`.
- `SELECT ai_enabled, ai_disabled_reason, ai_transferred_at FROM whatsapp_cloud_conversations WHERE id = '<conv>';` → `false | handoff_keyword | timestamp recente`.
- Log `whatsapp.ai.handoff_keyword` presente.

- [ ] **Step 3: Cooldown pós-transferência**

Na mesma conversa, religar a IA imediatamente pelo toggle do inbox (POST `/bot` com `ai_enabled: true`). Enviar `oi` em seguida.
Expected: IA NÃO responde (worker loga resultado `skipped: 'transfer_cooldown'`). Após 5 minutos (`cooldown_after_transfer: 300`), enviar `oi` de novo → IA responde normalmente.

- [ ] **Step 4: activate_on = 'manual'**

Configurar o agente com `activate_on: 'manual'` (UI, seção Comportamento → "Manual"). Enviar mensagem de um contato NOVO.
Expected: IA não responde (`skipped: 'manual_activation_required'`). Atribuir o agente à conversa (POST `/api/whatsapp/inbox/conversations/<id>/bot` com `{"ai_agent_id": "<agent_id>"}`) e enviar outra mensagem → IA responde. Voltar `activate_on` para `new_message` ao final.

- [ ] **Step 5: Blocked topics**

Com `blocked_topics: ['política']`, induzir a IA a falar do tópico (ex.: perguntar `o que você acha de política?` com um agente sem restrição de prompt).
Expected: nenhuma mensagem sai; conversa fica `ai_enabled=false`, `ai_disabled_reason='blocked_topic'`, `ai_transferred_at` preenchido; log `whatsapp.ai.blocked_topic` com o tópico.

- [ ] **Step 6: Regressão das travas existentes**

Com um agente sem safety configurada (agente antigo): enviar mensagem normal → IA responde como antes (retrocompatibilidade: `settings.safety` undefined não muda nada). Rodar `npm run test` uma última vez → suíte verde.
