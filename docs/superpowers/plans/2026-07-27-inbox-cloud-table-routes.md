# Inbox Cloud Table Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as ações de conversa do inbox (status/arquivar, resolver, atribuir, marcar como lida) atualizarem a tabela correta (`whatsapp_cloud_conversations` OU `whatsapp_conversations`), retornando 404 quando a conversa não existe, e parar de engolir o erro do resolve no ChatPanel.

**Architecture:** Um helper compartilhado `resolveInboxConversation(supabase, id, orgId)` descobre em qual tabela base a conversa vive (cloud primeiro, fallback legacy — mesmo padrão do RPC `resolve_inbox_conversation` em `worder-cloud-api-fixes/05A-inbox-unification.sql:180-211` e da rota `bot/route.ts`). As 4 rotas de ação passam a usar o helper e a atualizar `resolved.table`, mapeando colunas por tabela (a cloud não tem `priority`, `internal_note`, `is_bot_active`, `resolved_at`/`resolved_by`; usa `ai_enabled`/`ai_disabled_*` e `assigned_to`). A view `whatsapp_inbox_conversations` é UNION ALL (não atualizável) e serve só para leitura; os ids são UUIDs únicos entre as duas tabelas, então não é preciso prefixo/`source` vindo do frontend.

**Tech Stack:** Next.js 14.0.4 (App Router, route handlers), Supabase JS v2 (`supabaseAdmin` service-role), TypeScript 5, Vitest 1.2 (environment `node`), React 18.

## Global Constraints

- Todo UPDATE/SELECT em tabela de conversa DEVE ter `.eq('organization_id', orgId)` (client é service-role; escopo de org é obrigatório).
- A view `whatsapp_inbox_conversations` é UNION ALL — **nunca** fazer UPDATE nela; sempre na tabela base resolvida.
- Colunas da `whatsapp_cloud_conversations` (01-migration-cloud-api-schema.sql:201-237 + bot/route.ts): `status`, `assigned_to`, `unread_count`, `contact_id`, `ai_enabled`, `ai_agent_id`, `ai_disabled_at`, `ai_disabled_reason`, `updated_at`. Ela NÃO tem `priority`, `internal_note`, `is_bot_active`, `bot_disabled_reason`, `assigned_agent_id`, `assigned_at`, `resolved_at`, `resolved_by`, `unified_contact_id`.
- Conversa não encontrada em nenhuma tabela → HTTP 404 `{ error: 'Conversation not found' }` (nunca 500).
- Testes: Vitest (`npm test` = `vitest run`), env `node`, alias `@` → `src/`. Testes de rota seguem a convenção de mock de `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.test.ts` (proxy chain thenable). Testes sob `[id]/` vão em `__tests__/` com nomes distintos (brackets atrapalham o filtro CLI do vitest).
- Prosa/comentários em PT-BR são aceitos (padrão do repo); identificadores de código em inglês.
- Sem novas dependências. Auth sempre via `requireOrgFromAuth(request)` que retorna `NextResponse` (erro) ou `{ orgId, userId }`.
- Fora do escopo (YAGNI): rota DELETE de `[id]/route.ts`, campo `source` no frontend, alterações na view/SQL.

---

### Task 1: Helper `resolveInboxConversation`

**Files:**
- Create: `src/lib/whatsapp/inbox-conversation-resolver.ts`
- Test: `src/lib/whatsapp/inbox-conversation-resolver.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` (de `@supabase/supabase-js`; em runtime as rotas passam `supabaseAdmin` de `@/lib/supabase-admin`).
- Produces (Tasks 2-5 dependem EXATAMENTE destas assinaturas):

```typescript
export type InboxConversationTable = 'whatsapp_cloud_conversations' | 'whatsapp_conversations'

export interface ResolvedInboxConversation {
  table: InboxConversationTable
  provider: 'cloud' | 'evolution'
  row: {
    id: string
    organization_id: string
    status: string | null
    contact_id: string | null
    /** Só presente quando table === 'whatsapp_conversations' */
    unified_contact_id?: string | null
  }
}

export async function resolveInboxConversation(
  supabase: SupabaseClient,
  conversationId: string,
  orgId: string
): Promise<ResolvedInboxConversation | null>
```

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/inbox-conversation-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveInboxConversation } from './inbox-conversation-resolver'

// Mock por tabela: from(table) -> chain com select/eq/maybeSingle
function makeSupabaseMock(results: Record<string, { data: any; error: any }>) {
  const queried: string[] = []
  const client = {
    from: (table: string) => {
      queried.push(table)
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => results[table] ?? { data: null, error: null },
      }
      return chain
    },
  } as any
  return { client, queried }
}

describe('resolveInboxConversation', () => {
  const cloudRow = { id: 'c1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' }
  const legacyRow = { id: 'c1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: 'uc-1' }

  it('encontra na cloud primeiro e nem consulta a legacy', async () => {
    const { client, queried } = makeSupabaseMock({
      whatsapp_cloud_conversations: { data: cloudRow, error: null },
    })
    const resolved = await resolveInboxConversation(client, 'c1', 'org-1')
    expect(resolved).toEqual({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: cloudRow,
    })
    expect(queried).toEqual(['whatsapp_cloud_conversations'])
  })

  it('faz fallback para a legacy quando nao esta na cloud', async () => {
    const { client, queried } = makeSupabaseMock({
      whatsapp_conversations: { data: legacyRow, error: null },
    })
    const resolved = await resolveInboxConversation(client, 'c1', 'org-1')
    expect(resolved).toEqual({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: legacyRow,
    })
    expect(queried).toEqual(['whatsapp_cloud_conversations', 'whatsapp_conversations'])
  })

  it('retorna null quando nao existe em nenhuma tabela', async () => {
    const { client } = makeSupabaseMock({})
    const resolved = await resolveInboxConversation(client, 'missing', 'org-1')
    expect(resolved).toBeNull()
  })

  it('propaga erro de banco da consulta cloud', async () => {
    const { client } = makeSupabaseMock({
      whatsapp_cloud_conversations: { data: null, error: { message: 'boom' } },
    })
    await expect(resolveInboxConversation(client, 'c1', 'org-1')).rejects.toBeTruthy()
  })

  it('propaga erro de banco da consulta legacy', async () => {
    const { client } = makeSupabaseMock({
      whatsapp_conversations: { data: null, error: { message: 'boom' } },
    })
    await expect(resolveInboxConversation(client, 'c1', 'org-1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run inbox-conversation-resolver`
Expected: FAIL — `Cannot find module './inbox-conversation-resolver'` (ou equivalente de resolução de import).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/inbox-conversation-resolver.ts`:

```typescript
// src/lib/whatsapp/inbox-conversation-resolver.ts
// Resolve em qual tabela base uma conversa do inbox unificado vive.
//
// O inbox lista conversas pela view whatsapp_inbox_conversations (UNION ALL
// de whatsapp_cloud_conversations + whatsapp_conversations). A view nao e
// atualizavel, entao toda acao (status, resolve, assign, read) precisa
// descobrir a tabela base antes do UPDATE. Estrategia: cloud primeiro,
// fallback legacy — mesmo padrao do RPC resolve_inbox_conversation
// (worder-cloud-api-fixes/05A-inbox-unification.sql). Ids sao UUIDs
// (gen_random_uuid) unicos entre as tabelas, sem risco de colisao pratica.
import type { SupabaseClient } from '@supabase/supabase-js'

export type InboxConversationTable =
  | 'whatsapp_cloud_conversations'
  | 'whatsapp_conversations'

export interface ResolvedInboxConversation {
  table: InboxConversationTable
  provider: 'cloud' | 'evolution'
  row: {
    id: string
    organization_id: string
    status: string | null
    contact_id: string | null
    /** So presente quando table === 'whatsapp_conversations' */
    unified_contact_id?: string | null
  }
}

export async function resolveInboxConversation(
  supabase: SupabaseClient,
  conversationId: string,
  orgId: string
): Promise<ResolvedInboxConversation | null> {
  const { data: cloud, error: cloudError } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('id, organization_id, status, contact_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (cloudError) throw cloudError
  if (cloud) {
    return { table: 'whatsapp_cloud_conversations', provider: 'cloud', row: cloud }
  }

  const { data: legacy, error: legacyError } = await supabase
    .from('whatsapp_conversations')
    .select('id, organization_id, status, contact_id, unified_contact_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (legacyError) throw legacyError
  if (legacy) {
    return { table: 'whatsapp_conversations', provider: 'evolution', row: legacy }
  }

  return null
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run inbox-conversation-resolver`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbox-conversation-resolver.ts src/lib/whatsapp/inbox-conversation-resolver.test.ts
git commit -m "feat(inbox): helper resolveInboxConversation (cloud-first com fallback legacy, escopado por org)"
```

---

### Task 2: Migrar PUT `[id]/route.ts` para o helper

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/route.ts:86-146` (handler `PUT`; `GET` e `DELETE` ficam intactos)
- Test: `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/id-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInboxConversation(supabase, id, orgId): Promise<ResolvedInboxConversation | null>` de `@/lib/whatsapp/inbox-conversation-resolver` (Task 1); `requireOrgFromAuth` de `@/lib/auth/require-org`; `supabaseAdmin as supabase` de `@/lib/supabase-admin`.
- Produces: `PUT /api/whatsapp/inbox/conversations/[id]` — body `{ status?, priority?, assignedAgentId?, isBotActive?, botDisabledReason?, internalNote? }`; resposta 200 `{ conversation }`, 404 `{ error: 'Conversation not found' }`, 500 `{ error: 'Failed to update conversation' }`. Consumido por `ChatPanel.tsx` (Marcar como pendente/Arquivar) e `useInboxConversations.updateConversation`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/id-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

// Chain thenable (convencao de reactivate-ai/route.test.ts)
let chainResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(chainResult)
      }
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: any[]) => (track('from', args), chain) },
}))

import { PUT } from '../route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

const cloudResolved = {
  table: 'whatsapp_cloud_conversations',
  provider: 'cloud',
  row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
}
const legacyResolved = {
  table: 'whatsapp_conversations',
  provider: 'evolution',
  row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
}

describe('PUT /api/whatsapp/inbox/conversations/[id]', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 (nao 500) quando a conversa nao existe em nenhuma tabela', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await PUT(req({ status: 'archived' }), ctx)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Conversation not found')
    expect(calls['update']).toBeUndefined()
  })

  it('atualiza whatsapp_cloud_conversations quando a conversa e cloud', async () => {
    mockResolve.mockResolvedValue(cloudResolved)
    chainResult = { data: { id: 'conv-1', status: 'archived' }, error: null }
    const res = await PUT(req({ status: 'archived' }), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0].status).toBe('archived')
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
  })

  it('nao envia colunas legadas para a tabela cloud e mapeia bot -> ai_enabled', async () => {
    mockResolve.mockResolvedValue(cloudResolved)
    chainResult = { data: { id: 'conv-1' }, error: null }
    await PUT(
      req({ status: 'pending', priority: 'high', internalNote: 'x', assignedAgentId: 'agent-1', isBotActive: false, botDisabledReason: 'transferred_to_human' }),
      ctx,
    )
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.priority).toBeUndefined()
    expect(updateArg.internal_note).toBeUndefined()
    expect(updateArg.is_bot_active).toBeUndefined()
    expect(updateArg.assigned_to).toBe('agent-1')
    expect(updateArg.ai_enabled).toBe(false)
    expect(updateArg.ai_disabled_reason).toBe('transferred_to_human')
    expect(updateArg.ai_disabled_at).toBeTruthy()
  })

  it('mantem o comportamento legado para conversas evolution', async () => {
    mockResolve.mockResolvedValue(legacyResolved)
    chainResult = { data: { id: 'conv-1' }, error: null }
    await PUT(req({ priority: 'high', assignedAgentId: 'agent-1', isBotActive: true, internalNote: 'nota' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.priority).toBe('high')
    expect(updateArg.assigned_agent_id).toBe('agent-1')
    expect(updateArg.is_bot_active).toBe(true)
    expect(updateArg.ai_enabled).toBe(true)
    expect(updateArg.internal_note).toBe('nota')
    expect(updateArg.bot_disabled_reason).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run id-route`
Expected: FAIL — teste do 404 recebe status 500 (handler atual faz UPDATE direto em `whatsapp_conversations` com `.single()` que erra com 0 linhas) e teste cloud faz `from('whatsapp_conversations')` em vez de `from('whatsapp_cloud_conversations')`.

- [ ] **Step 3: Implementação mínima**

Em `src/app/api/whatsapp/inbox/conversations/[id]/route.ts`, adicionar o import no topo (após a linha 3):

```typescript
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver'
```

Substituir o handler `PUT` inteiro (linhas 86-146 atuais) por:

```typescript
// PUT /api/whatsapp/inbox/conversations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { id } = params
    const body = await request.json()
    const {
      status,
      priority,
      assignedAgentId,
      isBotActive,
      botDisabledReason,
      internalNote
    } = body

    // Conversas do inbox unificado podem viver em whatsapp_cloud_conversations
    // OU whatsapp_conversations — resolver a tabela base antes do UPDATE.
    const resolved = await resolveInboxConversation(supabase, id, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (status !== undefined) updates.status = status

    if (resolved.table === 'whatsapp_cloud_conversations') {
      // Cloud: sem priority/internal_note/is_bot_active; usa assigned_to + ai_*
      if (assignedAgentId !== undefined) updates.assigned_to = assignedAgentId
      if (isBotActive !== undefined) {
        updates.ai_enabled = isBotActive
        if (!isBotActive) {
          updates.ai_disabled_at = new Date().toISOString()
          updates.ai_disabled_reason = botDisabledReason || 'manual'
        } else {
          updates.ai_disabled_at = null
          updates.ai_disabled_reason = null
        }
      }
    } else {
      if (priority !== undefined) updates.priority = priority
      if (assignedAgentId !== undefined) {
        updates.assigned_agent_id = assignedAgentId
        updates.assigned_at = new Date().toISOString()
      }
      if (isBotActive !== undefined) {
        // CORREÇÃO: Atualizar AMBOS os campos para compatibilidade
        updates.is_bot_active = isBotActive
        updates.ai_enabled = isBotActive  // <- AI Process verifica este campo!
        if (!isBotActive) {
          updates.bot_disabled_reason = botDisabledReason || null
        } else {
          updates.bot_disabled_reason = null
          updates.bot_disabled_by = null
        }
      }
      if (internalNote !== undefined) updates.internal_note = internalNote
    }

    const { data, error } = await supabase
      .from(resolved.table)
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error updating conversation:', error)
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run id-route`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/__tests__/id-route.test.ts"
git commit -m "fix(inbox): PUT de conversa atualiza a tabela base correta (cloud ou legacy) e retorna 404"
```

---

### Task 3: Migrar `close/route.ts` para o helper

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts` (arquivo inteiro, 55 linhas)
- Test: `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/close-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInboxConversation` (Task 1) — usa `resolved.table` e `resolved.row.contact_id`.
- Produces: `POST /api/whatsapp/inbox/conversations/[id]/close` — body `{ resolution?, rating? }`; 200 `{ conversation }`, 404 `{ error: 'Conversation not found' }`, 500 `{ error: 'Failed to close conversation' }`. Consumido por `ChatPanel.handleCSATSubmit` (Task 6).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/close-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

let chainResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(chainResult)
      }
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: any[]) => (track('from', args), chain) },
}))

import { POST } from '../close/route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/close', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req({ resolution: 'ok' }), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('fecha conversa cloud na tabela cloud sem colunas resolved_* (nao existem la)', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    const res = await POST(req({ resolution: 'resolvido' }), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.status).toBe('closed')
    expect(updateArg.resolved_at).toBeUndefined()
    expect(updateArg.resolved_by).toBeUndefined()
    // atividade registrada com contact_id do resolver e org do auth
    const insertArg = calls['insert']?.[0]?.[0]
    expect(insertArg.activity_type).toBe('conversation_closed')
    expect(insertArg.contact_id).toBe('ct-1')
    expect(insertArg.organization_id).toBe('org-1')
  })

  it('fecha conversa legacy com resolved_at/resolved_by', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    await POST(req({ resolution: 'resolvido' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.status).toBe('closed')
    expect(updateArg.resolved_by).toBe('user-1')
    expect(updateArg.resolved_at).toBeTruthy()
  })

  it('nao registra atividade quando a conversa nao tem contato', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: null },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(200)
    expect(calls['insert']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run close-route`
Expected: FAIL — 404 vira 500 (UPDATE em `whatsapp_conversations` + `.single()` com 0 linhas) e caso cloud usa a tabela errada.

- [ ] **Step 3: Implementação mínima**

Substituir o conteúdo de `src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver';
export const dynamic = 'force-dynamic';

// POST /api/whatsapp/inbox/conversations/[id]/close
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

    // Resolver a tabela base (cloud ou legacy) antes do UPDATE.
    const resolved = await resolveInboxConversation(supabase, id, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    // whatsapp_cloud_conversations nao tem resolved_at/resolved_by.
    const closeUpdates =
      resolved.table === 'whatsapp_cloud_conversations'
        ? { status: 'closed', updated_at: now }
        : { status: 'closed', resolved_at: now, resolved_by: authUserId, updated_at: now }

    const { data, error } = await supabase
      .from(resolved.table)
      .update(closeUpdates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select('*')
      .single()

    if (error) throw error

    // Registra atividade
    if (resolved.row.contact_id) {
      await supabase.from('contact_activities').insert({
        organization_id: orgId,
        contact_id: resolved.row.contact_id,
        conversation_id: id,
        activity_type: 'conversation_closed',
        title: 'Conversa fechada',
        description: resolution || null,
        created_by: authUserId
      })
    }

    return NextResponse.json({ conversation: data })

  } catch (error) {
    console.error('Error closing conversation:', error)
    return NextResponse.json({ error: 'Failed to close conversation' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run close-route`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/__tests__/close-route.test.ts"
git commit -m "fix(inbox): close resolve a tabela base (cloud/legacy) e retorna 404 quando nao existe"
```

---

### Task 4: Migrar `assign/route.ts` para o helper

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts` (arquivo inteiro, 95 linhas)
- Test: `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/assign-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInboxConversation` (Task 1) — usa `resolved.table`, `resolved.row.contact_id`, `resolved.row.unified_contact_id`.
- Produces: `POST /api/whatsapp/inbox/conversations/[id]/assign` — body `{ userId: string | null }`; 200 `{ success: true, conversation: { id, assigned_to, status, assigned_agent_id } }`, 404, 500. Consumido por `useInboxContact.assignConversation` (`src/hooks/useInboxContact.ts:312-323`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/assign-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

let chainResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(chainResult)
      }
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: any[]) => (track('from', args), chain) },
}))

import { POST } from '../assign/route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/assign', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req({ userId: 'agent-1' }), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('atribui conversa cloud na tabela cloud (assigned_to) escopado por org', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: 'agent-1', status: 'open' }, error: null }
    const res = await POST(req({ userId: 'agent-1' }), ctx)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0].assigned_to).toBe('agent-1')
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
    expect(data.conversation.assigned_agent_id).toBe('agent-1')
    // atividade usa contact_id do resolver + org do auth
    const insertArg = calls['insert']?.[0]?.[0]
    expect(insertArg.activity_type).toBe('conversation_assigned')
    expect(insertArg.contact_id).toBe('ct-1')
    expect(insertArg.organization_id).toBe('org-1')
  })

  it('legacy: prefere unified_contact_id na atividade e atualiza a tabela legacy', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: 'uc-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: 'agent-1', status: 'open' }, error: null }
    await POST(req({ userId: 'agent-1' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    expect(calls['insert']?.[0]?.[0].contact_id).toBe('uc-1')
  })

  it('remove atribuicao (userId null) sem registrar atividade', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: null, status: 'open' }, error: null }
    const res = await POST(req({ userId: null }), ctx)
    expect(res.status).toBe(200)
    expect(calls['update']?.[0]?.[0].assigned_to).toBeNull()
    expect(calls['insert']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run assign-route`
Expected: FAIL — 404 vira 500 e caso cloud usa `whatsapp_conversations`.

- [ ] **Step 3: Implementação mínima**

Substituir o conteúdo de `src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts` por:

```typescript
// src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
// Atribui na tabela base correta (cloud ou legacy) — ambas tem assigned_to.
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver'
export const dynamic = 'force-dynamic';

// POST - Atribuir ou remover atribuição de conversa
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id
    const body = await request.json()
    const { userId } = body // null para remover atribuição

    const resolved = await resolveInboxConversation(supabase, conversationId, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const updateData: Record<string, any> = {
      assigned_to: userId || null,
      updated_at: new Date().toISOString()
    }

    const { data: updatedConversation, error: updateError } = await supabase
      .from(resolved.table)
      .update(updateData)
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .select('id, assigned_to, status')
      .single()

    if (updateError) {
      console.error('Error updating conversation:', updateError)
      throw updateError
    }

    // Registrar atividade
    if (userId) {
      const { data: agent } = await supabase
        .from('profiles')
        .select('full_name, first_name')
        .eq('id', userId)
        .single()

      const agentName = agent?.full_name || agent?.first_name || 'Agente'
      const contactId = resolved.row.unified_contact_id || resolved.row.contact_id

      if (contactId) {
        await supabase
          .from('contact_activities')
          .insert({
            organization_id: orgId,
            contact_id: contactId,
            conversation_id: conversationId,
            activity_type: 'conversation_assigned',
            title: 'Conversa atribuída',
            description: `Conversa atribuída para ${agentName}`,
          })
      }
    }

    return NextResponse.json({
      success: true,
      conversation: {
        ...updatedConversation,
        assigned_agent_id: updatedConversation.assigned_to // compatibilidade
      }
    })
  } catch (error: any) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to assign conversation' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run assign-route`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/__tests__/assign-route.test.ts"
git commit -m "fix(inbox): assign resolve a tabela base (cloud/legacy) e retorna 404 quando nao existe"
```

---

### Task 5: Migrar `read/route.ts` para o helper

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/read/route.ts` (arquivo inteiro, 30 linhas)
- Test: `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/read-route.test.ts` (create)

**Interfaces:**
- Consumes: `resolveInboxConversation` (Task 1).
- Produces: `POST /api/whatsapp/inbox/conversations/[id]/read` — 200 `{ success: true }`, 404, 500. Consumido por `useInboxConversations.markAsRead` (que já engole erro com `console.error` — o 404 não quebra a UI).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/app/api/whatsapp/inbox/conversations/[id]/__tests__/read-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

let chainResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(chainResult)
      }
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: any[]) => (track('from', args), chain) },
}))

import { POST } from '../read/route'

function req(): any {
  return { json: async () => ({}), headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/read', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe (antes era no-op silencioso)', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('zera unread_count na tabela cloud para conversa cloud', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { error: null }
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0]).toEqual({ unread_count: 0 })
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
  })

  it('zera unread_count na tabela legacy para conversa evolution', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
    })
    chainResult = { error: null }
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run read-route`
Expected: FAIL — caso "não existe" retorna 200 (no-op silencioso atual) e caso cloud usa `whatsapp_conversations`.

- [ ] **Step 3: Implementação mínima**

Substituir o conteúdo de `src/app/api/whatsapp/inbox/conversations/[id]/read/route.ts` por:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveInboxConversation } from '@/lib/whatsapp/inbox-conversation-resolver';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id

    const resolved = await resolveInboxConversation(supabase, conversationId, orgId)
    if (!resolved) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from(resolved.table)
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .eq('organization_id', orgId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error marking as read:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run read-route`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte completa (regressão)**

Run: `npm test`
Expected: PASS — todos os testes do repo, incluindo os novos de Tasks 1-5 (nenhum teste pré-existente quebrado).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/read/route.ts" "src/app/api/whatsapp/inbox/conversations/[id]/__tests__/read-route.test.ts"
git commit -m "fix(inbox): read zera unread_count na tabela base correta e retorna 404 quando nao existe"
```

---

### Task 6: ChatPanel não engole erro do resolve (CSAT)

**Files:**
- Modify: `src/components/whatsapp/inbox/ChatPanel.tsx:403-422` (função `handleCSATSubmit`)
- Modify: `src/components/whatsapp/inbox/modals/CSATModal.tsx:13-31,84-90` (estado de erro + exibição)
- Test: verificação manual (não há infra de teste de componente — vitest roda em env `node`, sem jsdom/testing-library em `package.json`)

**Interfaces:**
- Consumes: `POST /api/whatsapp/inbox/conversations/[id]/close` (Task 3 — agora persiste de fato e retorna 404/500 com `{ error }`); `authedFetch` de `@/lib/api/authed-fetch` (retorna `Response`; não lança em status não-2xx).
- Produces: `handleCSATSubmit(rating: number, comment: string): Promise<void>` que LANÇA `Error` quando o close falha (o `catch` interno do `CSATModal.handleSubmit` mantém o modal aberto) e só chama `onResolved()` em sucesso; `CSATModal` ganha estado local `error: string | null` renderizado como `<p role="alert">`.

- [ ] **Step 1: Corrigir `handleCSATSubmit` no ChatPanel**

Em `src/components/whatsapp/inbox/ChatPanel.tsx`, substituir a função `handleCSATSubmit` (linhas 403-422 atuais) por:

```typescript
  async function handleCSATSubmit(rating: number, comment: string) {
    if (!organizationId) return
    try {
      // Save CSAT rating (opcional — nao bloqueia o resolve)
      await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/csat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
    } catch { /* */ }

    // Mark as resolved via close endpoint. NAO engolir erro: se a API
    // falhar, lancamos para o CSATModal manter o modal aberto e exibir o
    // erro — e onResolved() NAO e chamado (a conversa nao fechou no DB).
    const res = await authedFetch(`/api/whatsapp/inbox/conversations/${conversation.id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution: comment, rating }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({} as any))
      throw new Error(data.error || 'Falha ao resolver a conversa')
    }
    if (onResolved) onResolved()
  }
```

- [ ] **Step 2: Exibir o erro no CSATModal**

Em `src/components/whatsapp/inbox/modals/CSATModal.tsx`, trocar o bloco de estado + `handleSubmit` (linhas 13-31 atuais) por:

```typescript
export function CSATModal({ isOpen, onClose, onSubmit, contactName }: CSATModalProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleSubmit() {
    if (rating === 0) return
    setLoading(true)
    setError(null)
    try {
      await onSubmit(rating, comment)
      onClose()
      setRating(0)
      setComment('')
    } catch (e: any) {
      setError(e?.message || 'Erro ao resolver a conversa. Tente novamente.')
    }
    setLoading(false)
  }
```

E, logo após o `<textarea ... />` (linhas 84-89 atuais), adicionar:

```tsx
          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
          )}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `ChatPanel.tsx` / `CSATModal.tsx` (erros pré-existentes em outros arquivos, se houver, não contam).

- [ ] **Step 4: Verificação manual do caminho de erro**

1. Rodar `npm run dev` e abrir o inbox (`/whatsapp/inbox` ou rota equivalente da app) logado.
2. Abrir DevTools → Network. Selecionar uma conversa qualquer, clicar em "Resolver", dar nota e "Enviar avaliacao".
3. Simular falha: em DevTools → Network, aplicar "Block request URL" no padrão `*/close` (ou ativar Offline após enviar o CSAT) e submeter de novo.
4. Confirmar: o modal PERMANECE aberto, aparece a mensagem vermelha de erro (`role="alert"`), e a conversa NÃO some da lista (onResolved não foi chamado).

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp/inbox/ChatPanel.tsx src/components/whatsapp/inbox/modals/CSATModal.tsx
git commit -m "fix(inbox): CSAT/resolver exibe erro e nao fecha a UI quando o close falha"
```

---

### Task 7: Verificação manual end-to-end (conversa cloud persiste após poll)

**Files:**
- Test: verificação manual em ambiente de dev com uma conversa cloud real (provider `cloud` na view `whatsapp_inbox_conversations`); nenhum arquivo modificado.

**Interfaces:**
- Consumes: as 4 rotas migradas (Tasks 2-5) + UI corrigida (Task 6). O poll do inbox recarrega a lista a cada ~5s via `useInboxConversations.fetchConversations` lendo a view unificada.
- Produces: confirmação de que status/assign/read persistem em `whatsapp_cloud_conversations` (antes: UPDATE em 0 linhas → 500 ou no-op, e a conversa "voltava" no poll).

- [ ] **Step 1: Identificar uma conversa cloud**

No SQL editor do Supabase (projeto de dev):

```sql
SELECT id, provider, status, assigned_to, unread_count
FROM whatsapp_inbox_conversations
WHERE provider = 'cloud'
ORDER BY last_message_at DESC NULLS LAST
LIMIT 5;
```

Anotar um `id` (chamá-lo de `<CLOUD_ID>`). Se não houver nenhuma, enviar uma mensagem para o número Cloud API de teste para criar uma.

- [ ] **Step 2: Arquivar/pendente (PUT) persiste**

1. `npm run dev`, abrir o inbox, selecionar a conversa `<CLOUD_ID>`.
2. Menu "⋮" → "Marcar como pendente". Na aba Network, confirmar `PUT /api/whatsapp/inbox/conversations/<CLOUD_ID>` respondeu **200** (antes: 500).
3. Aguardar >5s (um ciclo de poll) e confirmar que o status pendente NÃO reverteu na lista.
4. Conferir no SQL: `SELECT status FROM whatsapp_cloud_conversations WHERE id = '<CLOUD_ID>';` → `pending`. Repetir com "Arquivar" → `archived`.

- [ ] **Step 3: Resolver (close) persiste**

1. Voltar o status (menu "Marcar como pendente" ou SQL `UPDATE whatsapp_cloud_conversations SET status='open' WHERE id='<CLOUD_ID>';`).
2. Clicar "Resolver", dar nota, enviar. Network: `POST .../close` → **200**.
3. Aguardar >5s: a conversa não volta para a lista de abertas. SQL: `status = 'closed'`.

- [ ] **Step 4: Atribuir (assign) persiste**

1. No painel de contato (ContactPanel), atribuir a conversa a um agente. Network: `POST .../assign` → **200**.
2. SQL: `SELECT assigned_to FROM whatsapp_cloud_conversations WHERE id = '<CLOUD_ID>';` → UUID do agente. Aguardar >5s e confirmar que a atribuição permanece na UI.

- [ ] **Step 5: Marcar como lida (read) persiste**

1. Garantir `unread_count > 0` (enviar mensagem inbound de teste ou SQL `UPDATE whatsapp_cloud_conversations SET unread_count = 3 WHERE id='<CLOUD_ID>';`).
2. Selecionar a conversa no inbox (dispara `markAsRead`). Network: `POST .../read` → **200**.
3. SQL: `unread_count = 0`. Aguardar >5s: o badge de não lidas não volta.

- [ ] **Step 6: Regressão legacy (evolution)**

Repetir o Step 2 (pendente/arquivar) com uma conversa `provider = 'evolution'` da mesma query do Step 1 e confirmar que continua funcionando (200 + persistência em `whatsapp_conversations`).

- [ ] **Step 7: Commit final (se houve ajustes durante a verificação)**

```bash
git status
git add -A -- src docs/superpowers/plans/2026-07-27-inbox-cloud-table-routes.md
git commit -m "chore(inbox): plano e verificacao manual das acoes de conversa cloud"
```

---

## Autocheck (executado na escrita do plano)

- **Cobertura:** helper com testes (Task 1); 4 rotas migradas com testes e 404 (Tasks 2-5); swallow do ChatPanel corrigido com exibição de erro e sem `onResolved` em falha (Task 6); verificação manual resolver/atribuir/arquivar/ler + poll de 5s (Task 7). DELETE e frontend `source` explicitamente fora do escopo.
- **Placeholders:** nenhum — todo step tem código real, comando real e resultado esperado.
- **Consistência:** `resolveInboxConversation(supabase, conversationId, orgId)` e `ResolvedInboxConversation { table, provider, row }` usados com a mesma assinatura nas Tasks 2-5; mocks de teste espelham a convenção existente de `reactivate-ai/route.test.ts`; mapeamento de colunas cloud confere com `01-migration-cloud-api-schema.sql:201-237` e `bot/route.ts`.
