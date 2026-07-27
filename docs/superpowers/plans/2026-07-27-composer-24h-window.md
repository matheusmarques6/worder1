# Composer 24h Window Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear o composer do inbox (texto livre, anexos, áudio) quando a janela de 24h da Meta estiver fechada, exibindo banner com CTA que abre o picker de templates existente.

**Architecture:** Uma função pura em `src/lib/whatsapp/service-window.ts` vira a fonte única de verdade da janela, consumida por: (1) `formatConversation` no backend, que passa a calcular `can_send_template_only`; (2) um guard `WINDOW_EXPIRED` no POST de mensagens do inbox (defesa em profundidade — hoje a rota envia direto e só falha na Meta); (3) o hook `useServiceWindow` no frontend, que dá o `isWindowOpen` reativo (tick de 30s) usado pelo ChatPanel para desabilitar o composer e renderizar o banner, e refatora o `ServiceWindowBar` para a mesma derivação.

**Tech Stack:** Next.js 14.0.4 (App Router), React 18, TypeScript 5, Supabase (Postgres), Vitest 1.x (testes colocados `*.test.ts`), Tailwind CSS.

## Global Constraints

- Route files do App Router (`src/app/api/**/route.ts`) só podem exportar handlers (`GET`, `POST`, `dynamic`, ...) — helpers compartilhados vivem em `src/lib/`.
- Regra da janela (idêntica ao guard já existente em `src/app/api/whatsapp/cloud/messages/route.ts:198-223`): texto livre só quando `is_window_open === true` E `window_expires_at` está no futuro; qualquer outro caso = somente template.
- Colunas reais de `whatsapp_cloud_conversations` (ver `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql:220-230`): `is_window_open BOOLEAN NOT NULL DEFAULT FALSE`, `window_expires_at TIMESTAMPTZ`, `last_customer_message_at TIMESTAMPTZ`. A view `whatsapp_inbox_conversations` já expõe as três (lado legacy vem com `is_window_open = FALSE` e `window_expires_at = NULL`).
- Testes: Vitest, arquivos colocados junto do código (`src/lib/whatsapp/*.test.ts`), rodados com `npx vitest run <arquivo>`. Não há infra de teste de rotas nem de hooks React (sem @testing-library) — rotas e UI usam verificação manual explícita.
- Sem novas dependências.
- Prosa/copy de UI em português brasileiro; código, nomes e mensagens de commit em inglês (prefixos `feat:`/`fix:`/`refactor:` como no histórico do repo).
- Path alias `@/` = `src/`.

---

### Task 1: Pure service-window derivation lib

**Files:**
- Create: `src/lib/whatsapp/service-window.ts`
- Test: `src/lib/whatsapp/service-window.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependências).
- Produces (usado pelas Tasks 2, 3, 4 e 5):
  - `type ServiceWindowStatus = 'active' | 'expiring' | 'expired' | 'no-window'`
  - `const EXPIRING_THRESHOLD_MS: number` (2h em ms)
  - `getServiceWindowStatus(expiresAt: string | null | undefined, now?: number): ServiceWindowStatus`
  - `isServiceWindowOpen(expiresAt: string | null | undefined, now?: number): boolean`
  - `computeCanSendTemplateOnly(isWindowOpen: boolean | null | undefined, expiresAt: string | null | undefined, now?: number): boolean`

- [ ] **Step 1: Write the failing test**

Criar `src/lib/whatsapp/service-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  getServiceWindowStatus,
  isServiceWindowOpen,
  computeCanSendTemplateOnly,
} from './service-window'

const NOW = new Date('2026-07-27T12:00:00Z').getTime()
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

describe('getServiceWindowStatus', () => {
  it('returns no-window when expiresAt is missing', () => {
    expect(getServiceWindowStatus(null, NOW)).toBe('no-window')
    expect(getServiceWindowStatus(undefined, NOW)).toBe('no-window')
    expect(getServiceWindowStatus('', NOW)).toBe('no-window')
  })

  it('returns expired when expiresAt is in the past or exactly now', () => {
    expect(getServiceWindowStatus(hoursFromNow(-1), NOW)).toBe('expired')
    expect(getServiceWindowStatus(hoursFromNow(0), NOW)).toBe('expired')
  })

  it('returns expired for invalid date strings', () => {
    expect(getServiceWindowStatus('not-a-date', NOW)).toBe('expired')
  })

  it('returns expiring when less than 2h remain', () => {
    expect(getServiceWindowStatus(hoursFromNow(1), NOW)).toBe('expiring')
  })

  it('returns active when 2h or more remain', () => {
    expect(getServiceWindowStatus(hoursFromNow(2), NOW)).toBe('active')
    expect(getServiceWindowStatus(hoursFromNow(23), NOW)).toBe('active')
  })
})

describe('isServiceWindowOpen', () => {
  it('is open for active and expiring windows', () => {
    expect(isServiceWindowOpen(hoursFromNow(23), NOW)).toBe(true)
    expect(isServiceWindowOpen(hoursFromNow(1), NOW)).toBe(true)
  })

  it('is closed for expired and missing windows', () => {
    expect(isServiceWindowOpen(hoursFromNow(-1), NOW)).toBe(false)
    expect(isServiceWindowOpen(null, NOW)).toBe(false)
  })
})

describe('computeCanSendTemplateOnly', () => {
  it('allows free text when the DB flag is true and expiry is in the future', () => {
    expect(computeCanSendTemplateOnly(true, hoursFromNow(5), NOW)).toBe(false)
  })

  it('forces template when the DB flag is false even with future expiry', () => {
    expect(computeCanSendTemplateOnly(false, hoursFromNow(5), NOW)).toBe(true)
  })

  it('forces template when the window already expired', () => {
    expect(computeCanSendTemplateOnly(true, hoursFromNow(-1), NOW)).toBe(true)
  })

  it('forces template when there is no window at all (legacy or never messaged)', () => {
    expect(computeCanSendTemplateOnly(null, null, NOW)).toBe(true)
    expect(computeCanSendTemplateOnly(undefined, undefined, NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/whatsapp/service-window.test.ts`
Expected: FAIL — "Failed to resolve import ./service-window" (arquivo não existe).

- [ ] **Step 3: Write minimal implementation**

Criar `src/lib/whatsapp/service-window.ts`:

```ts
// Janela de atendimento de 24h da WhatsApp Cloud API (Meta).
// Fonte unica de verdade para backend (formatConversation do inbox, guard de
// envio) e frontend (ServiceWindowBar, composer do ChatPanel).

export type ServiceWindowStatus = 'active' | 'expiring' | 'expired' | 'no-window'

/** Janela e considerada "expirando" quando faltam menos de 2h. */
export const EXPIRING_THRESHOLD_MS = 2 * 3_600_000

export function getServiceWindowStatus(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): ServiceWindowStatus {
  if (!expiresAt) return 'no-window'
  const diff = new Date(expiresAt).getTime() - now
  if (Number.isNaN(diff) || diff <= 0) return 'expired'
  return diff < EXPIRING_THRESHOLD_MS ? 'expiring' : 'active'
}

export function isServiceWindowOpen(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const status = getServiceWindowStatus(expiresAt, now)
  return status === 'active' || status === 'expiring'
}

/**
 * Regra do backend: texto livre so quando o flag do BD esta ligado E o
 * timestamp de expiracao esta no futuro — mesma regra do guard em
 * /api/whatsapp/cloud/messages (WINDOW_EXPIRED).
 */
export function computeCanSendTemplateOnly(
  isWindowOpen: boolean | null | undefined,
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return !(isWindowOpen === true && isServiceWindowOpen(expiresAt, now))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/whatsapp/service-window.test.ts`
Expected: PASS — 12 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/service-window.ts src/lib/whatsapp/service-window.test.ts
git commit -m "feat(whatsapp): pure 24h service-window derivation lib"
```

---

### Task 2: Backend — formatConversation returns can_send_template_only

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/route.ts:1-10` (imports) e `:86-127` (`formatConversation`)

**Interfaces:**
- Consumes: `computeCanSendTemplateOnly(isWindowOpen, expiresAt, now?)` da Task 1.
- Produces: objeto de conversa retornado por `GET /api/whatsapp/inbox/conversations` passa a incluir `can_send_template_only: boolean` e `is_window_open: boolean` normalizado (falso se o timestamp já passou, mesmo com flag do BD ligado). `window_expires_at` e `last_customer_message_at` já eram retornados (linhas 111-112) e continuam iguais. O frontend (Task 5) consome `can_send_template_only` e `window_expires_at`.

Nota: o arquivo é um route file do App Router — `formatConversation` não pode ser exportada; por isso a lógica testável mora na lib da Task 1 e aqui só há wiring (verificação manual).

- [ ] **Step 1: Add import**

No topo de `src/app/api/whatsapp/inbox/conversations/route.ts`, junto dos imports existentes (após a linha 7):

```ts
import { computeCanSendTemplateOnly } from '@/lib/whatsapp/service-window'
```

- [ ] **Step 2: Compute the flag in formatConversation**

Em `formatConversation` (linha 86), logo após `const aiEnabled = ai?.ai_enabled ?? true`:

```ts
  // Janela de 24h (Meta). A view ja traz is_window_open/window_expires_at;
  // aqui normalizamos: flag do BD pode ficar stale (true com timestamp
  // vencido), entao o horario de expiracao manda.
  const canSendTemplateOnly = computeCanSendTemplateOnly(
    conv.is_window_open,
    conv.window_expires_at,
  )
```

E substituir, no objeto retornado, a linha `is_window_open: conv.is_window_open ?? false,` (linha 110) por:

```ts
    is_window_open: !canSendTemplateOnly,
    can_send_template_only: canSendTemplateOnly,
```

(mantendo `window_expires_at` e `last_customer_message_at` como estão nas linhas 111-112).

- [ ] **Step 3: Verify manually**

1. Run: `npm run dev`
2. Logar no app, abrir o inbox do WhatsApp e, no DevTools > Network, inspecionar a resposta de `GET /api/whatsapp/inbox/conversations`.
3. Expected: toda conversa tem `can_send_template_only` booleano; conversa cloud com cliente que respondeu há menos de 24h vem `can_send_template_only: false`; conversa legacy/expirada vem `true`.

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test`
Expected: PASS (suite inteira verde, nenhuma regressão).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/inbox/conversations/route.ts
git commit -m "feat(inbox): return can_send_template_only computed from 24h window"
```

---

### Task 3: Backend — WINDOW_EXPIRED guard on inbox message POST

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:1-11` (imports) e `:107-122` (POST, bloco da conversa cloud)

**Interfaces:**
- Consumes: `computeCanSendTemplateOnly(isWindowOpen, expiresAt, now?)` da Task 1; `cloudConv` já carrega `is_window_open` e `window_expires_at` porque o select é `'*, account:whatsapp_business_accounts(*)'` (linha 102).
- Produces: `POST /api/whatsapp/inbox/conversations/[id]/messages` responde `400 { error, code: 'WINDOW_EXPIRED' }` quando a janela está fechada, em vez de chamar a Meta e falhar lá. Mesmo shape do guard já existente em `src/app/api/whatsapp/cloud/messages/route.ts:210-215`.

- [ ] **Step 1: Add import**

No topo de `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts`, após o bloco de imports existente (linha 11):

```ts
import { computeCanSendTemplateOnly } from '@/lib/whatsapp/service-window'
```

- [ ] **Step 2: Add the guard before sending**

Dentro de `if (cloudConv && cloudConv.account) {`, logo após o bloco do opt-out guard (após a linha 120, antes de `const client = createWhatsAppCloudClient(...)`):

```ts
      // Janela de 24h (Meta): fora da janela so template aprovado. Sem este
      // guard a mensagem ia ate a Meta e falhava la (erro 131047).
      if (computeCanSendTemplateOnly(cloudConv.is_window_open, cloudConv.window_expires_at)) {
        return NextResponse.json(
          {
            error: 'Janela de 24h expirada. Envie um template aprovado para reabrir a conversa.',
            code: 'WINDOW_EXPIRED',
          },
          { status: 400, headers: NO_CACHE_HEADERS },
        )
      }
```

- [ ] **Step 3: Verify manually (expired window returns 400 before hitting Meta)**

1. Run: `npm run dev`
2. No SQL editor do Supabase, forçar expiração de uma conversa de teste:

```sql
update whatsapp_cloud_conversations
set is_window_open = false,
    window_expires_at = now() - interval '1 hour'
where id = '<CONVERSATION_ID_DE_TESTE>';
```

3. No inbox, abrir essa conversa e tentar enviar um texto (o frontend ainda não bloqueia — Task 5).
4. Expected: DevTools > Network mostra `POST .../messages` respondendo `400` com body `{ "error": "Janela de 24h expirada...", "code": "WINDOW_EXPIRED" }` e nenhuma chamada à Graph API nos logs do server.
5. Reverter o SQL de teste (`is_window_open = true, window_expires_at = now() + interval '23 hours'`) e confirmar que o envio de texto volta a funcionar.

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts"
git commit -m "fix(inbox): reject free text with WINDOW_EXPIRED before calling Meta"
```

---

### Task 4: Frontend — useServiceWindow hook + ServiceWindowBar on shared derivation

**Files:**
- Create: `src/components/whatsapp/inbox/useServiceWindow.ts`
- Modify: `src/components/whatsapp/inbox/ServiceWindowBar.tsx:1-57` (arquivo inteiro — trocar derivação inline pela lib, manter JSX)

**Interfaces:**
- Consumes: `getServiceWindowStatus`, `isServiceWindowOpen`, `ServiceWindowStatus` da Task 1.
- Produces (usado pela Task 5):
  - `useServiceWindow(expiresAt: string | null | undefined, canSendTemplateOnly?: boolean): { status: ServiceWindowStatus; isOpen: boolean }`
  - `ServiceWindowBar` mantém a mesma prop `expiresAt?: string | null` (nenhuma mudança de contrato para o ChatPanel).

A lógica temporal já está 100% testada na Task 1; o hook é casca reativa (sem infra de teste de hooks no repo) — verificação manual.

- [ ] **Step 1: Create the hook**

Criar `src/components/whatsapp/inbox/useServiceWindow.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import {
  getServiceWindowStatus,
  isServiceWindowOpen,
  type ServiceWindowStatus,
} from '@/lib/whatsapp/service-window'

export interface ServiceWindowState {
  status: ServiceWindowStatus
  isOpen: boolean
}

/**
 * Estado reativo da janela de 24h: re-deriva a cada 30s (mesmo padrao de tick
 * do ServiceWindowBar), entao o composer bloqueia sozinho quando a janela
 * expira com a tela aberta — sem reload.
 */
export function useServiceWindow(
  expiresAt: string | null | undefined,
  canSendTemplateOnly?: boolean,
): ServiceWindowState {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Troca de conversa (ou janela reaberta pelo webhook) re-sincroniza na hora.
  useEffect(() => {
    setNow(Date.now())
  }, [expiresAt])

  const status = getServiceWindowStatus(expiresAt, now)
  const isOpen = canSendTemplateOnly !== true && isServiceWindowOpen(expiresAt, now)

  return { status, isOpen }
}
```

- [ ] **Step 2: Refactor ServiceWindowBar to the shared derivation**

Substituir o conteúdo de `src/components/whatsapp/inbox/ServiceWindowBar.tsx` por:

```tsx
'use client'

import { AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getServiceWindowStatus } from '@/lib/whatsapp/service-window'

interface ServiceWindowBarProps {
  expiresAt?: string | null
}

export function ServiceWindowBar({ expiresAt }: ServiceWindowBarProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const status = getServiceWindowStatus(expiresAt, now)

  if (status === 'no-window') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200 text-xs text-gray-600">
        <Clock className="w-3.5 h-3.5" />
        <span>Sem conversa ativa. Somente templates podem ser enviados.</span>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
        <AlertCircle className="w-3.5 h-3.5" />
        <span className="font-medium">Janela expirada</span>
        <span className="text-red-600">- Somente templates aprovados podem ser enviados.</span>
      </div>
    )
  }

  const diff = new Date(expiresAt as string).getTime() - now
  const hoursLeft = Math.floor(diff / 3_600_000)
  const minutesLeft = Math.floor((diff % 3_600_000) / 60_000)
  const isLow = status === 'expiring'

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs ${
      isLow ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-700'
    }`}>
      <CheckCircle className="w-3.5 h-3.5" />
      <span className="font-medium">Janela de servico ativa</span>
      <span>
        - expira em {hoursLeft > 0 && `${hoursLeft}h `}
        {minutesLeft}min
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

1. Run: `npx vitest run src/lib/whatsapp/service-window.test.ts` — Expected: PASS (lib intacta).
2. Run: `npm run dev`, abrir o inbox e conferir a barra nos três estados (usando o SQL da Task 3 Step 3 para alternar): conversa ativa = barra verde com countdown; expirada = barra vermelha "Janela expirada"; conversa legacy (sem `window_expires_at`) = barra cinza "Sem conversa ativa".

- [ ] **Step 4: Commit**

```bash
git add src/components/whatsapp/inbox/useServiceWindow.ts src/components/whatsapp/inbox/ServiceWindowBar.tsx
git commit -m "refactor(inbox): shared service-window derivation + reactive useServiceWindow hook"
```

---

### Task 5: Frontend — ChatPanel composer lock + working banner CTA

**Files:**
- Modify: `src/components/whatsapp/inbox/ChatPanel.tsx:11-21` (imports), `:308-344` (estado + `handleSend`), `:736-742` (banner), `:750-754` (botão de anexo), `:820-823` (textarea), `:834-848` (botões enviar/áudio)

**Interfaces:**
- Consumes: `useServiceWindow(expiresAt, canSendTemplateOnly)` da Task 4; campos `conversation.window_expires_at` e `conversation.can_send_template_only` retornados pela Task 2 (`InboxConversation` em `src/types/inbox.ts:135-136` já declara ambos); estado `showTemplatePicker`/`setShowTemplatePicker` já existente (linha 320) que abre o `TemplatePickerModal` (mesmo handler do botão "📋 Templates", linhas 861-867).
- Produces: composer bloqueado fora da janela; banner com CTA funcional. Nenhuma mudança de props — nada a ajustar nos consumidores do `ChatPanel`.

- [ ] **Step 1: Import and derive isWindowOpen**

Adicionar o import junto dos demais (após a linha 12, `import { ServiceWindowBar } ...`):

```ts
import { useServiceWindow } from './useServiceWindow'
```

Dentro do componente `ChatPanel`, logo após o bloco de `useState` (após a linha 321, `const [isSendingTemplate, ...]`):

```ts
  // Fonte unica derivada da janela de 24h — controla composer e banner.
  const { isOpen: isWindowOpen } = useServiceWindow(
    conversation.window_expires_at,
    conversation.can_send_template_only,
  )
```

- [ ] **Step 2: Guard handleSend**

Trocar a primeira linha de `handleSend` (linha 339):

```ts
    if (!input.trim() || isSending || !isWindowOpen) return
```

- [ ] **Step 3: Render the banner with a working CTA**

Substituir o bloco morto das linhas 736-742 (`{conversation.can_send_template_only && (...)}`)  por:

```tsx
        {!isWindowOpen && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-warning-500/10 border border-warning-500/20 rounded-xl">
            <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
            <span className="text-sm text-warning-400">
              Janela de 24h expirada. Envie um template aprovado para reabrir a conversa.
            </span>
            <button
              type="button"
              onClick={() => setShowTemplatePicker(true)}
              className="ml-auto text-sm text-brand-600 font-medium hover:underline whitespace-nowrap"
            >
              Enviar Template
            </button>
          </div>
        )}
```

- [ ] **Step 4: Disable textarea, attach, send and audio when closed**

Textarea (linhas 820-823) — trocar `placeholder` e `disabled`:

```tsx
                <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                  placeholder={isWindowOpen ? 'Digite uma mensagem ou /atalho...' : 'Janela de 24h expirada — use um template'}
                  disabled={isSending || !isWindowOpen} rows={1}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 resize-none disabled:opacity-50"
                  style={{ maxHeight: '120px' }} />
```

Botão de anexo (linhas 751-754) — adicionar `disabled`:

```tsx
            <button onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={!isWindowOpen}
              className={`p-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed ${showAttachMenu ? 'bg-brand-100 text-brand-600' : 'hover:bg-gray-100 text-gray-500 hover:text-brand-600'}`}>
              <Paperclip className="w-5 h-5" />
            </button>
```

Botão de enviar (linhas 835-838) — incluir a janela no `disabled`:

```tsx
                <button onClick={handleSend} disabled={!input.trim() || isSending || !isWindowOpen}
                  className="p-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
```

Botão de áudio (linhas 840-847) — incluir a janela no `disabled`:

```tsx
                <button
                  onClick={() => setRecordingMode(true)}
                  disabled={isSending || isUploading || !isWindowOpen}
                  title="Gravar audio"
                  className="p-3 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-primary-600 disabled:opacity-50"
                >
                  <Mic className="w-5 h-5" />
                </button>
```

O botão "📋 Templates" (linhas 861-867) permanece habilitado — template é justamente o único envio permitido fora da janela.

- [ ] **Step 5: Verify manually (end to end)**

1. Run: `npm run dev`
2. Expirar uma conversa de teste (SQL da Task 3 Step 3: `is_window_open = false, window_expires_at = now() - interval '1 hour'`).
3. Abrir a conversa no inbox. Expected:
   - `ServiceWindowBar` vermelha "Janela expirada";
   - banner amarelo "Janela de 24h expirada..." acima do composer;
   - textarea desabilitada com placeholder "Janela de 24h expirada — use um template";
   - botões de anexo e áudio desabilitados (opacos, sem ação);
   - clicar em "Enviar Template" no banner abre o `TemplatePickerModal` (mesmo modal do botão "📋 Templates") e o envio de template funciona (mensagem aparece no chat).
4. Teste do countdown ao vivo: setar `is_window_open = true, window_expires_at = now() + interval '2 minutes'`, recarregar a conversa (composer ativo, barra verde) e deixar a tela aberta ~2,5 min. Expected: sem reload, o composer bloqueia e o banner aparece (tick de 30s do hook).
5. Conversa dentro da janela (`window_expires_at` futuro): composer 100% normal, sem banner.

- [ ] **Step 6: Confirm the test suite is still green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/inbox/ChatPanel.tsx
git commit -m "feat(inbox): lock composer outside the 24h window with template CTA banner"
```
