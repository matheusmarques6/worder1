# Inbox WhatsApp Realtime (Cloud API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mensagens e conversas novas do inbox WhatsApp (Cloud API) aparecem em tempo real via Supabase Realtime, com o polling de 5s rebaixado a fallback de 30s quando o canal está conectado.

**Architecture:** O Postgres Realtime não publica VIEWs (`whatsapp_inbox_messages`), então assinamos as tabelas base `whatsapp_cloud_conversations`/`whatsapp_cloud_messages` (adicionadas à publication `supabase_realtime` por migração) e mapeamos os payloads para os shapes que o `InboxContent` já espera. Como o app autentica via cookie httpOnly (`sb-access-token`) e o client Supabase do browser não tem sessão, um endpoint novo (`/api/auth/realtime-token`) devolve o JWT do próprio usuário para `supabaseClient.realtime.setAuth()` — sem isso o RLS org-scoped das tabelas cloud (policy via `profiles`) bloqueia todos os eventos. Um hook novo `useCloudInboxRealtime` monta os canais e é conectado aos callbacks já existentes do `InboxContent`; o polling vira adaptativo (30s conectado / 5s caído).

**Tech Stack:** Next.js 14 (App Router), React 18, `@supabase/supabase-js` 2.39 (Realtime postgres_changes), TypeScript 5, Vitest 1.2 (environment `node`), Supabase Postgres (RLS multi-tenant).

## Global Constraints

- Vitest roda com `environment: 'node'` e sem `@testing-library/react` — NÃO escrever testes de hooks/componentes React; testar módulos puros e route handlers (padrão de mock de `src/app/api/whatsapp/inbox/conversations/reactivate-ai/route.test.ts`).
- RLS multi-tenant é inegociável: nunca criar policy permissiva para `anon` nas tabelas `whatsapp_cloud_*`; realtime autentica com o JWT do usuário.
- Migrações SQL idempotentes (padrão `DO $$ ... IF NOT EXISTS`/`EXCEPTION WHEN duplicate_object` do repo), salvas em `supabase/migrations/YYYYMMDD_nome.sql`.
- Prosa/comentários em pt-BR, código em inglês; imports com alias `@/` → `src/`.
- Os hooks legados `src/hooks/useInboxRealtime.ts` e `src/hooks/useWhatsAppRealtime.ts` (tabelas `whatsapp_conversations`/`whatsapp_messages`) NÃO são tocados — permanecem como estão para não afetar telas legadas.
- Conversas legadas (provider `evolution`) continuam dependendo do polling — o realtime desta feature cobre só o Cloud API (onde chegam os writes inbound de produção).
- Callbacks do realtime nunca podem gerar writes na API (risco de loop UPDATE→PUT→UPDATE).

---

### Task 1: Migração SQL — publicar tabelas cloud no `supabase_realtime`

**Files:**
- Create: `supabase/migrations/20260727_enable_cloud_inbox_realtime.sql`

**Interfaces:**
- Consumes: publication `supabase_realtime` (já existe no projeto Supabase); tabelas `whatsapp_cloud_conversations` e `whatsapp_cloud_messages` (criadas em `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql`, com RLS org-scoped via subquery em `profiles` — seção 11 daquele arquivo).
- Produces: eventos `postgres_changes` (INSERT/UPDATE) para as duas tabelas, entregues apenas a clients cujo JWT passa na policy `*_org_select` (`organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())`). O RLS existente já serve para realtime — nenhuma policy nova é necessária (Task 2 resolve o lado do client).

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260727_enable_cloud_inbox_realtime.sql`:

```sql
-- =============================================
-- Migration: Enable Realtime for WhatsApp Cloud API inbox
-- Postgres Realtime NAO publica VIEWs (whatsapp_inbox_messages),
-- entao publicamos as tabelas BASE do Cloud API.
--
-- RLS: as policies *_org_select (via profiles) ja existem
-- (01-migration-cloud-api-schema.sql, secao 11) e sao exatamente
-- o que o Realtime usa para autorizar entrega de eventos.
-- O client precisa de JWT autenticado (realtime.setAuth) — ver
-- endpoint /api/auth/realtime-token.
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_cloud_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_cloud_conversations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'whatsapp_cloud_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_cloud_messages;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: sem isso, eventos UPDATE carregam apenas a PK
-- em `old` e o Realtime pode falhar o check de RLS/filtro em updates
-- parciais (ex.: status de mensagem delivered -> read).
ALTER TABLE whatsapp_cloud_conversations REPLICA IDENTITY FULL;
ALTER TABLE whatsapp_cloud_messages       REPLICA IDENTITY FULL;

-- Verificacao
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('whatsapp_cloud_conversations', 'whatsapp_cloud_messages');
```

- [ ] **Step 2: Aplicar e verificar no Supabase (verificação manual — não há teste automatizado de banco no repo)**

Rodar o conteúdo do arquivo no SQL Editor do projeto Supabase (mesmo fluxo usado por `supabase/migrations/20260114_enable_inbox_realtime.sql`).

Esperado: o `SELECT` final retorna **2 linhas** (`whatsapp_cloud_conversations`, `whatsapp_cloud_messages`).

Conferir replica identity:

```sql
SELECT relname, relreplident FROM pg_class
WHERE relname IN ('whatsapp_cloud_conversations', 'whatsapp_cloud_messages');
```

Esperado: `relreplident = 'f'` (FULL) nas duas linhas.

- [ ] **Step 3: Rodar de novo a migração inteira no SQL Editor**

Esperado: executa sem erro (idempotência — os `DO` blocks pulam o `ADD TABLE`, `REPLICA IDENTITY FULL` é naturalmente re-aplicável).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260727_enable_cloud_inbox_realtime.sql
git commit -m "chore(db): publicar whatsapp_cloud_* no supabase_realtime (+ replica identity full)"
```

---

### Task 2: Endpoint `GET /api/auth/realtime-token`

O login é server-side (`/api/auth` grava `sb-access-token` como cookie httpOnly) e nenhuma sessão é persistida no client (`src/lib/supabase-client.ts` cria client anon sem auth). Com RLS org-scoped, um client anon recebe **zero** eventos de realtime. Este endpoint devolve o access token do próprio usuário autenticado (mesma origem, mesmo dono) para o JS chamar `supabaseClient.realtime.setAuth(token)`.

**Files:**
- Create: `src/app/api/auth/realtime-token/route.ts`
- Test: `src/app/api/auth/realtime-token/route.test.ts`

**Interfaces:**
- Consumes: `requireOrgFromAuth(request: NextRequest): Promise<AuthContext | NextResponse>` de `@/lib/auth/require-org` (valida o JWT do cookie/header e resolve org); cookie `sb-access-token`.
- Produces: `GET` → `200 { token: string }` com `Cache-Control: no-store, max-age=0`; `401` sem cookie válido. Consumido pela Task 4 via `authedFetch('/api/auth/realtime-token')`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/auth/realtime-token/route.test.ts` (mesmo padrão de mock do `reactivate-ai/route.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

import { GET } from './route'

function req(cookieToken?: string): any {
  return {
    cookies: {
      get: (name: string) =>
        name === 'sb-access-token' && cookieToken ? { value: cookieToken } : undefined,
    },
    headers: new Headers(),
  }
}

describe('GET /api/auth/realtime-token', () => {
  beforeEach(() => {
    mockAuth.mockReset()
  })

  it('retorna o token do cookie quando autenticado, sem cache', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req('jwt-abc'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.token).toBe('jwt-abc')
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })

  it('propaga a NextResponse de erro do requireOrgFromAuth', async () => {
    mockAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    )
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('retorna 401 se autenticado por Authorization header mas sem cookie', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req(undefined))
    expect(res.status).toBe(401)
  })

  it('retorna 401 para o token dev-access-token (dev bypass nao vale no realtime)', async () => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    const res = await GET(req('dev-access-token'))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/app/api/auth/realtime-token/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (arquivo ainda não existe).

- [ ] **Step 3: Implementar o route handler**

Criar `src/app/api/auth/realtime-token/route.ts`:

```typescript
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

/**
 * Devolve o access token do PROPRIO usuario autenticado.
 *
 * Por que existe: o login grava `sb-access-token` como cookie httpOnly
 * (JS nao le), e o client Supabase do browser (`supabase-client.ts`) e
 * anon sem sessao. Realtime postgres_changes respeita RLS: sem JWT,
 * as policies *_org_select das tabelas whatsapp_cloud_* negam tudo e
 * nenhum evento chega. O hook useCloudInboxRealtime chama este endpoint
 * e repassa o token para supabaseClient.realtime.setAuth().
 *
 * Seguranca: same-origin + autenticado (requireOrgFromAuth valida o JWT
 * antes de devolver). So expoe o token ao seu proprio dono.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth

  const token = request.cookies.get('sb-access-token')?.value
  if (!token || token === 'dev-access-token') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS },
    )
  }

  return NextResponse.json({ token }, { headers: NO_CACHE_HEADERS })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/app/api/auth/realtime-token/route.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/realtime-token/route.ts src/app/api/auth/realtime-token/route.test.ts
git commit -m "feat(auth): endpoint realtime-token para autenticar canais Supabase Realtime (RLS)"
```

---

### Task 3: Mappers puros — linha cloud → shape do inbox

Os callbacks do `InboxContent` esperam os shapes produzidos pelas rotas de API: mensagens no formato do `GET /api/whatsapp/inbox/conversations/[id]/messages` (`content` como **string** extraída do JSONB, `meta_message_id` = `message_id`) e conversas com `store_id`/`id`. Payload cru do realtime traz a linha da tabela — o mapper faz a tradução e é o único ponto testável por unidade (Vitest node).

**Files:**
- Create: `src/lib/whatsapp/inbox-realtime-mappers.ts`
- Test: `src/lib/whatsapp/inbox-realtime-mappers.test.ts`

**Interfaces:**
- Consumes: `extractMessageText(content: any, fallbackTextBody?: string | null): string` de `@/lib/whatsapp/message-content` (puro, sem deps de server); tipo `InboxMessage` de `@/types/inbox`.
- Produces (usados pela Task 4):
  - `mapCloudMessageRow(row: CloudMessageRow): InboxMessage`
  - `mapCloudConversationRow(row: CloudConversationRow): RealtimeConversationEvent`
  - `type CloudMessageRow = Record<string, any>` / `type CloudConversationRow = Record<string, any>`
  - `interface RealtimeConversationEvent { id: string; organization_id: string; store_id: string | null; contact_id?: string; phone_number: string; contact_name: string; status: string; unread_count: number; last_message_at?: string; last_message_preview?: string; last_message_direction?: 'inbound' | 'outbound'; window_expires_at?: string; updated_at?: string }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/inbox-realtime-mappers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  mapCloudMessageRow,
  mapCloudConversationRow,
} from './inbox-realtime-mappers'

describe('mapCloudMessageRow', () => {
  it('mapeia linha de texto para o mesmo shape do GET /messages', () => {
    const row = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      message_id: 'wamid.ABC',
      direction: 'inbound',
      message_type: 'text',
      content: { text: { body: 'oi' } },
      text_body: 'oi',
      status: 'delivered',
      sent_by_bot: false,
      timestamp: '2026-07-27T12:00:00Z',
      created_at: '2026-07-27T12:00:01Z',
    }
    expect(mapCloudMessageRow(row)).toEqual({
      id: 'msg-1',
      conversation_id: 'conv-1',
      meta_message_id: 'wamid.ABC',
      direction: 'inbound',
      message_type: 'text',
      content: 'oi',
      status: 'delivered',
      sent_by_bot: false,
      is_deleted: false,
      created_at: '2026-07-27T12:00:01Z',
      error_code: undefined,
      error_message: undefined,
    })
  })

  it('aplica os mesmos defaults do GET: status sent, created_at cai pro timestamp, caption de midia', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-2',
      conversation_id: 'conv-1',
      message_id: 'wamid.DEF',
      direction: 'outbound',
      message_type: 'image',
      content: { image: { id: 'media-1', caption: 'foto' } },
      text_body: null,
      status: null,
      sent_by_bot: null,
      created_at: null,
      timestamp: '2026-07-27T13:00:00Z',
    })
    expect(msg.status).toBe('sent')
    expect(msg.created_at).toBe('2026-07-27T13:00:00Z')
    expect(msg.content).toBe('foto')
    expect(msg.sent_by_bot).toBe(false)
  })

  it('propaga erro de envio (status failed + error_code/error_message)', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-3',
      conversation_id: 'conv-1',
      message_id: 'wamid.GHI',
      direction: 'outbound',
      message_type: 'text',
      content: { text: { body: 'x' } },
      status: 'failed',
      error_code: '131047',
      error_message: 'Re-engagement message',
      timestamp: '2026-07-27T14:00:00Z',
    })
    expect(msg.status).toBe('failed')
    expect(msg.error_code).toBe('131047')
    expect(msg.error_message).toBe('Re-engagement message')
  })
})

describe('mapCloudConversationRow', () => {
  it('mapeia os campos que os callbacks do InboxContent usam', () => {
    const conv = mapCloudConversationRow({
      id: 'conv-1',
      organization_id: 'org-1',
      store_id: 'store-1',
      contact_id: 'ct-1',
      contact_name: 'Maria',
      contact_phone: '+5511999999999',
      wa_id: '5511999999999',
      status: 'open',
      unread_count: 2,
      last_message_at: '2026-07-27T12:00:00Z',
      last_message_preview: 'oi',
      last_message_direction: 'inbound',
    })
    expect(conv.id).toBe('conv-1')
    expect(conv.store_id).toBe('store-1')
    expect(conv.phone_number).toBe('+5511999999999')
    expect(conv.contact_name).toBe('Maria')
    expect(conv.unread_count).toBe(2)
    expect(conv.last_message_direction).toBe('inbound')
  })

  it('store_id ausente vira null (conversa "org" — visivel em toda loja, padrao store-or-org da API)', () => {
    const conv = mapCloudConversationRow({ id: 'conv-2', organization_id: 'org-1' })
    expect(conv.store_id).toBeNull()
    expect(conv.status).toBe('open')
    expect(conv.unread_count).toBe(0)
  })

  it('phone_number cai para wa_id quando contact_phone falta', () => {
    const conv = mapCloudConversationRow({
      id: 'conv-3',
      organization_id: 'org-1',
      wa_id: '5511888888888',
    })
    expect(conv.phone_number).toBe('5511888888888')
    expect(conv.contact_name).toBe('5511888888888')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/inbox-realtime-mappers.test.ts`
Expected: FAIL — `Cannot find module './inbox-realtime-mappers'`.

- [ ] **Step 3: Implementar os mappers**

Criar `src/lib/whatsapp/inbox-realtime-mappers.ts`:

```typescript
// =============================================
// Mappers: payload cru do Supabase Realtime (linha das tabelas
// whatsapp_cloud_*) -> shapes que o InboxContent ja consome.
//
// MANTER EM SINCRONIA com o `formatted` do
// GET /api/whatsapp/inbox/conversations/[id]/messages (mensagens) e o
// `formatConversation` do GET /api/whatsapp/inbox/conversations
// (conversas). Se aquelas rotas mudarem o shape, mudar aqui junto.
// =============================================

import type { InboxMessage } from '@/types/inbox'
import { extractMessageText } from '@/lib/whatsapp/message-content'

/** Linha crua de whatsapp_cloud_messages (payload.new do realtime). */
export type CloudMessageRow = Record<string, any>

/** Linha crua de whatsapp_cloud_conversations (payload.new do realtime). */
export type CloudConversationRow = Record<string, any>

/**
 * Shape minimo de conversa que os callbacks do InboxContent leem
 * (store_id para o filtro de loja, resto para exibicao/refresh).
 */
export interface RealtimeConversationEvent {
  id: string
  organization_id: string
  store_id: string | null
  contact_id?: string
  phone_number: string
  contact_name: string
  status: string
  unread_count: number
  last_message_at?: string
  last_message_preview?: string
  last_message_direction?: 'inbound' | 'outbound'
  window_expires_at?: string
  updated_at?: string
}

export function mapCloudMessageRow(row: CloudMessageRow): InboxMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    meta_message_id: row.message_id,
    direction: row.direction,
    message_type: row.message_type || 'text',
    content: extractMessageText(row.content, row.text_body),
    status: row.status || 'sent',
    sent_by_bot: row.sent_by_bot || false,
    is_deleted: false,
    created_at: row.created_at || row.timestamp,
    error_code: row.error_code ?? undefined,
    error_message: row.error_message ?? undefined,
  }
}

export function mapCloudConversationRow(
  row: CloudConversationRow,
): RealtimeConversationEvent {
  const phoneNumber = row.contact_phone || row.wa_id || ''
  return {
    id: row.id,
    organization_id: row.organization_id,
    store_id: row.store_id ?? null,
    contact_id: row.contact_id,
    phone_number: phoneNumber,
    contact_name: row.contact_name || phoneNumber,
    status: row.status || 'open',
    unread_count: row.unread_count ?? 0,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    last_message_direction: row.last_message_direction,
    window_expires_at: row.window_expires_at,
    updated_at: row.updated_at,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/inbox-realtime-mappers.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbox-realtime-mappers.ts src/lib/whatsapp/inbox-realtime-mappers.test.ts
git commit -m "feat(inbox): mappers de payload realtime cloud para o shape do inbox"
```

---

### Task 4: Hook `useCloudInboxRealtime`

Novo hook (não refit do legado — Global Constraints) que: busca o token do endpoint da Task 2 e chama `realtime.setAuth`, assina `whatsapp_cloud_conversations` filtrado por `organization_id` e `whatsapp_cloud_messages` filtrado por `conversation_id` (conversa selecionada), mapeia payloads com os mappers da Task 3 e faz cleanup de canal no unmount/troca de conversa. Callbacks ficam num ref para NÃO derrubar/recriar canal a cada render (o bug de deps do hook legado `useInboxRealtime.ts:121,197`).

**Files:**
- Create: `src/hooks/useCloudInboxRealtime.ts`

**Interfaces:**
- Consumes: `supabaseClient` de `@/lib/supabase-client` (proxy lazy do client anon; `.realtime.setAuth`, `.channel`, `.removeChannel`); `authedFetch` de `@/lib/api/authed-fetch`; `GET /api/auth/realtime-token` → `{ token: string }` (Task 2); `mapCloudMessageRow`, `mapCloudConversationRow`, `RealtimeConversationEvent` de `@/lib/whatsapp/inbox-realtime-mappers` (Task 3).
- Produces (usado pela Task 5):
  ```typescript
  function useCloudInboxRealtime(options: {
    organizationId: string | null
    conversationId?: string | null
    onNewConversation?: (conversation: RealtimeConversationEvent) => void
    onConversationUpdate?: (conversation: RealtimeConversationEvent) => void
    onNewMessage?: (message: InboxMessage) => void
    onMessageUpdate?: (message: InboxMessage) => void
    enabled?: boolean
  }): { isConnected: boolean; hasError: boolean }
  ```

- [ ] **Step 1: Implementar o hook**

Sem teste automatizado possível (Global Constraints: vitest node, sem renderer de hooks) — a verificação é o typecheck no Step 2 e a verificação manual integrada na Task 5. Criar `src/hooks/useCloudInboxRealtime.ts`:

```typescript
'use client'

// =============================================
// CLOUD INBOX REALTIME HOOK
//
// Assina as tabelas BASE do Cloud API (whatsapp_cloud_conversations /
// whatsapp_cloud_messages). Postgres Realtime nao publica VIEWs, entao
// a view whatsapp_inbox_messages NAO pode ser assinada — assinamos as
// tabelas e mapeamos o payload pro shape que o InboxContent espera.
//
// Auth: o client do browser e anon (login via cookie httpOnly), e as
// tabelas cloud tem RLS org-scoped. Sem realtime.setAuth(jwt) o servidor
// de realtime nao entrega NENHUM evento. O token vem do endpoint
// /api/auth/realtime-token e e renovado antes do JWT (1h) expirar.
// =============================================

import { useEffect, useRef, useState } from 'react'
import { supabaseClient } from '@/lib/supabase-client'
import { authedFetch } from '@/lib/api/authed-fetch'
import {
  mapCloudConversationRow,
  mapCloudMessageRow,
  type RealtimeConversationEvent,
} from '@/lib/whatsapp/inbox-realtime-mappers'
import type { InboxMessage } from '@/types/inbox'

const TOKEN_REFRESH_MS = 45 * 60 * 1000 // JWT do Supabase expira em 1h

type ChannelState = 'idle' | 'connected' | 'error'

interface UseCloudInboxRealtimeOptions {
  organizationId: string | null
  conversationId?: string | null
  onNewConversation?: (conversation: RealtimeConversationEvent) => void
  onConversationUpdate?: (conversation: RealtimeConversationEvent) => void
  onNewMessage?: (message: InboxMessage) => void
  onMessageUpdate?: (message: InboxMessage) => void
  enabled?: boolean
}

interface UseCloudInboxRealtimeReturn {
  isConnected: boolean
  hasError: boolean
}

export function useCloudInboxRealtime(
  options: UseCloudInboxRealtimeOptions,
): UseCloudInboxRealtimeReturn {
  const { organizationId, conversationId, enabled = true } = options

  const [authReady, setAuthReady] = useState(false)
  const [conversationsState, setConversationsState] = useState<ChannelState>('idle')
  const [messagesState, setMessagesState] = useState<ChannelState>('idle')

  // Callbacks em ref: a identidade deles muda a cada render do
  // InboxContent e NAO pode derrubar/recriar canal (bug do hook legado
  // que tinha callbacks nas deps do useEffect).
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  // ---- Auth do Realtime ----
  useEffect(() => {
    if (!enabled || !organizationId) return
    let cancelled = false

    const applyToken = async () => {
      try {
        const res = await authedFetch('/api/auth/realtime-token')
        if (!res.ok) {
          console.warn('[CloudRealtime] realtime-token failed:', res.status)
          return
        }
        const data = await res.json()
        if (!cancelled && data.token) {
          // setAuth propaga o token para canais ja conectados tambem
          supabaseClient.realtime.setAuth(data.token)
          setAuthReady(true)
        }
      } catch (err) {
        console.warn('[CloudRealtime] Failed to fetch realtime token:', err)
      }
    }

    applyToken()
    const interval = setInterval(applyToken, TOKEN_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, organizationId])

  // ---- Canal de conversas (org inteira) ----
  useEffect(() => {
    if (!enabled || !organizationId || !authReady) return

    const channelName = `cloud-inbox-conv-${organizationId}`
    console.log('[CloudRealtime] Subscribing:', channelName)

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_cloud_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          callbacksRef.current.onNewConversation?.(
            mapCloudConversationRow(payload.new as Record<string, any>),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_cloud_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          callbacksRef.current.onConversationUpdate?.(
            mapCloudConversationRow(payload.new as Record<string, any>),
          )
        },
      )
      .subscribe((status, err) => {
        console.log('[CloudRealtime] conversations status:', status, err?.message || '')
        if (status === 'SUBSCRIBED') {
          setConversationsState('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConversationsState('error')
        } else if (status === 'CLOSED') {
          setConversationsState('idle')
        }
      })

    return () => {
      console.log('[CloudRealtime] Unsubscribing:', channelName)
      supabaseClient.removeChannel(channel)
      setConversationsState('idle')
    }
  }, [enabled, organizationId, authReady])

  // ---- Canal de mensagens (conversa selecionada) ----
  useEffect(() => {
    if (!enabled || !conversationId || !authReady) return

    const channelName = `cloud-inbox-msg-${conversationId}`
    console.log('[CloudRealtime] Subscribing:', channelName)

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_cloud_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = mapCloudMessageRow(payload.new as Record<string, any>)
          callbacksRef.current.onNewMessage?.(message)
          if (message.direction === 'inbound') {
            playNotificationSound()
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_cloud_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          callbacksRef.current.onMessageUpdate?.(
            mapCloudMessageRow(payload.new as Record<string, any>),
          )
        },
      )
      .subscribe((status, err) => {
        console.log('[CloudRealtime] messages status:', status, err?.message || '')
        if (status === 'SUBSCRIBED') {
          setMessagesState('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setMessagesState('error')
        } else if (status === 'CLOSED') {
          setMessagesState('idle')
        }
      })

    return () => {
      console.log('[CloudRealtime] Unsubscribing:', channelName)
      supabaseClient.removeChannel(channel)
      setMessagesState('idle')
    }
  }, [enabled, conversationId, authReady])

  return {
    // O canal de conversas e o "coracao" do inbox: e ele que dita se o
    // polling pode relaxar para 30s (Task 5).
    isConnected: conversationsState === 'connected',
    hasError: conversationsState === 'error' || messagesState === 'error',
  }
}

// Mesmo beep do hook legado (useInboxRealtime) — o legado nao exporta a
// funcao e sera aposentado, entao a copia vive aqui.
function playNotificationSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return

    const audioContext = new AudioContextCtor()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  } catch (e) {
    console.log('[CloudRealtime] Notification sound error:', e)
  }
}

export default useCloudInboxRealtime
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos (comparar com o baseline rodando o mesmo comando antes da mudança, se houver erros pré-existentes no repo).

- [ ] **Step 3: Rodar a suíte para garantir que nada quebrou**

Run: `npm test`
Expected: PASS em todos os testes (incluindo os das Tasks 2 e 3).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCloudInboxRealtime.ts
git commit -m "feat(inbox): hook useCloudInboxRealtime assinando tabelas cloud com auth de RLS"
```

---

### Task 5: Montar o realtime no `InboxContent` + polling adaptativo

Conecta o hook aos callbacks existentes e rebaixa o polling para 30s quando o canal está `SUBSCRIBED` (volta a 5s em erro/desconexão). Dois ajustes obrigatórios nos callbacks:

1. **`handleConversationUpdate` (linha 142-149) fazia echo-write:** chamava `updateConversation(conv.id, conv)`, que faz **PUT** na API — ligar isso num evento de realtime criaria loop UPDATE→PUT→UPDATE. Vira um refresh silencioso.
2. **Filtro de loja "store-or-org":** conversas cloud com `store_id` NULL são visíveis em qualquer loja na API (`applyStoreFilter` 'store-or-org'); o check `conv.store_id !== storeId` descartaria essas. O check passa a ignorar apenas `store_id` preenchido e diferente.

Dedup contra o poll já está garantido pelos consumidores: `addMessage` em `useInboxMessages.ts:365-375` ignora `id` repetido, e `refetchLatest` (`:162`) confere `id`/`meta_message_id` — o mapper da Task 3 preenche ambos.

**Files:**
- Modify: `src/components/whatsapp/inbox/InboxContent.tsx:28-37` (imports + constantes), `:132-164` (callbacks), `:202-222` (polling)

**Interfaces:**
- Consumes: `useCloudInboxRealtime(options): { isConnected, hasError }` (Task 4); `RealtimeConversationEvent` (Task 3, implícito via callbacks tipados `any` existentes); callbacks/hooks já presentes no componente (`refreshConversations`, `addMessage`, `updateMessageStatus`, `refetchLatest`).
- Produces: UI do inbox com realtime ativo; nenhuma interface nova exportada.

- [ ] **Step 1: Trocar a constante de polling (linha 37)**

Substituir:

```typescript
const POLLING_INTERVAL = 5000
```

por:

```typescript
// Polling e FALLBACK: 5s quando o realtime esta caido, 30s quando o
// canal esta SUBSCRIBED (so pra pegar o que o realtime nao cobre, ex.
// conversas legacy provider=evolution).
const POLLING_INTERVAL_FALLBACK = 5000
const POLLING_INTERVAL_REALTIME = 30000
```

- [ ] **Step 2: Importar o hook (junto aos outros hooks, após a linha 32)**

```typescript
import { useCloudInboxRealtime } from '@/hooks/useCloudInboxRealtime'
```

- [ ] **Step 3: Ajustar os callbacks (linhas 132-149)**

Substituir `handleConversationInsert` e `handleConversationUpdate` por:

```typescript
  const handleConversationInsert = useCallback((conv: any) => {
    // ✅ Filtro de loja no padrao "store-or-org" da API: descarta apenas
    // conversa de OUTRA loja; store_id NULL (orfa/legacy) e visivel.
    if (storeId && conv.store_id && conv.store_id !== storeId) {
      console.log('📥 [InboxContent] Ignoring conversation from different store')
      return
    }
    console.log('📥 [InboxContent] New conversation:', conv.id)
    refreshConversations()
  }, [refreshConversations, storeId])

  const handleConversationUpdate = useCallback((conv: any) => {
    if (storeId && conv.store_id && conv.store_id !== storeId) {
      return
    }
    console.log('📝 [InboxContent] Conversation update:', conv.id)
    // ⚠️ NAO usar updateConversation aqui: ela faz PUT na API — ecoar um
    // evento de realtime como write criaria loop UPDATE→PUT→UPDATE.
    // Refresh silencioso (isRefreshing, sem loader) traz o estado novo.
    refreshConversations()
  }, [refreshConversations, storeId])
```

(`handleNewMessage` e `handleStatusUpdate` das linhas 151-164 ficam como estão — `addMessage` já deduplica por `id` e `updateMessageStatus` casa por `id`/`meta_message_id`.)

- [ ] **Step 4: Montar o hook (logo após `handleStatusUpdate`, antes de `// EFFECTS`)**

```typescript
  // =============================================
  // REALTIME (Cloud API) — poll de 5s vira fallback
  // =============================================
  const { isConnected: realtimeConnected } = useCloudInboxRealtime({
    organizationId,
    conversationId: selectedConversation?.id ?? null,
    onNewConversation: handleConversationInsert,
    onConversationUpdate: handleConversationUpdate,
    onNewMessage: handleNewMessage,
    onMessageUpdate: handleStatusUpdate,
    enabled: Boolean(organizationId && storeId),
  })
```

- [ ] **Step 5: Polling adaptativo (substituir o useEffect das linhas 205-222)**

```typescript
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    // Realtime conectado => poll relaxa pra 30s (fallback + legacy).
    // Canal caido/erro => volta pros 5s originais.
    const interval = realtimeConnected
      ? POLLING_INTERVAL_REALTIME
      : POLLING_INTERVAL_FALLBACK

    pollingRef.current = setInterval(() => {
      if (selectedConversation) {
        refetchLatest()
      }
      refreshConversations()
    }, interval)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [selectedConversation?.id, refetchLatest, refreshConversations, realtimeConnected])
```

- [ ] **Step 6: Typecheck + suíte**

Run: `npx tsc --noEmit` e depois `npm test`
Expected: sem erros novos de tipo; todos os testes PASS.

- [ ] **Step 7: Verificação manual — duas janelas (critério de aceite da feature)**

Pré-requisito: migração da Task 1 aplicada no projeto Supabase apontado por `NEXT_PUBLIC_SUPABASE_URL`.

1. `npm run dev`, logar em **duas janelas** do browser (mesma conta), abrir o inbox nas duas e selecionar a mesma conversa Cloud.
2. No console das janelas, confirmar: `[CloudRealtime] conversations status: SUBSCRIBED` e `[CloudRealtime] messages status: SUBSCRIBED` (se aparecer `CHANNEL_ERROR`, conferir Task 1 aplicada e a resposta de `/api/auth/realtime-token` na aba Network).
3. Enviar uma mensagem **de fora** (do celular do contato de teste para o número Cloud, ou via API Graph). Esperado: a mensagem aparece nas duas janelas em <2s (sem esperar poll), com beep de notificação, e o preview/contador da lista de conversas atualiza.
4. Enviar mensagem pela janela A. Esperado: aparece na janela B via realtime; na janela A **não duplica** (dedup por `id` no `addMessage`).
5. Observar a aba Network por ~1 min: com realtime conectado, o `GET /api/whatsapp/inbox/conversations` do poll ocorre a cada ~30s (não mais 5s).
6. DevTools → Network → "Offline" por 10s → "Online": esperado o canal cair (status no console), o poll voltar a 5s e depois o canal reconectar.
7. Trocar de conversa e sair da página do inbox: esperado ver `[CloudRealtime] Unsubscribing: cloud-inbox-msg-...` no console (sem canais órfãos acumulando em `supabaseClient.getChannels()` — conferir no console do browser: `window` não expõe, então validar apenas pelos logs de subscribe/unsubscribe pareados).

- [ ] **Step 8: Commit**

```bash
git add src/components/whatsapp/inbox/InboxContent.tsx
git commit -m "feat(inbox): realtime no InboxContent com polling adaptativo (30s conectado / 5s fallback)"
```

---

## Autocheck (executado na escrita do plano)

- **Cobertura do spec:** migração SQL + REPLICA IDENTITY + RLS (Task 1); hook novo assinando tabelas cloud filtrado por `organization_id`, mapeando para os shapes reais (Tasks 3-4); montagem nos callbacks `:132-164` com polling 30s/5s adaptativo (Task 5); cleanup de canais no unmount/troca de conversa (Task 4, cleanups dos dois `useEffect`); dedup contra poll (mapper preenche `id`+`meta_message_id`; `addMessage`/`refetchLatest` já deduplicam — Task 5, contexto); verificação manual com duas janelas e mensagem externa (Task 5, Step 7). Item extra descoberto na auditoria de código: auth do realtime via `/api/auth/realtime-token` (Task 2) — sem ele o RLS silenciaria todos os eventos.
- **Placeholders:** nenhum — todo step tem código completo ou comando + resultado esperado.
- **Consistência de nomes/tipos:** `mapCloudMessageRow`/`mapCloudConversationRow`/`RealtimeConversationEvent` idênticos entre Tasks 3, 4; `useCloudInboxRealtime` retorna `{ isConnected, hasError }` e a Task 5 consome `isConnected`; `POLLING_INTERVAL_REALTIME`/`POLLING_INTERVAL_FALLBACK` definidos e usados apenas na Task 5.
