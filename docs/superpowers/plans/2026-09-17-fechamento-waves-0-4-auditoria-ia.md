# Fechamento das Waves 0–4 — Auditoria do Motor de IA

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar
> superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para implementar task a task. Os passos usam
> checkbox (`- [ ]`) para rastreio.

**Goal:** fechar os itens que sobraram das Waves 0 a 4 do programa SDD da
Auditoria do Motor de IA, de modo que cada onda atinja sua condição de saída,
sem promoção nem publicação.

**Architecture:** o trabalho é uma varredura de lacunas confirmadas no código,
não uma reabertura das ondas. São seis correções independentes — uma no app
Next.js, quatro no runtime Python/Postgres, uma de produto — mais uma task de
reconciliação documental e gate. Cada correção nasce de um teste vermelho,
entra num commit próprio e não altera configuração, lockfile ou fronteira de
confiança de imagens.

**Tech Stack:** Next.js 14 (App Router) com Vitest; Python 3 em `runtime/`
com pytest, Ruff e Import Linter; Postgres via Supabase CLI e o executor de
banco descartável (`scripts/test-disposable-db.ps1`); pnpm 11.

**Spec:**
- `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`
  (ondas e condições de saída)
- `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-2-state-queues-cutover.md`
  (texto original das Tasks 2, 3 e 5, aqui reexecutadas)
- `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-3-contracts-limits.md`
  (texto original da Task 6)
- `docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md`
  (W3-GD-05, W3-GD-06, W3-GD-07)
- `docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`
  (W4-TC-02)
- `docs/CATALOGO-PENDENCIAS-AUDITORIA-IA-2026-09-08.md` (item 80)

## Estado que este plano assume

Verificado no código em `72441a7d` (worktree
`.worktrees/sync-remote-ai-2026-09-08`, branch `fix/ai-engine-schema-baseline`):

| Onda | Situação | O que este plano faz |
|---|---|---|
| 0 | Fechada localmente: executor descartável, baseline canônico e gates de banco no CI existem | Nada; a Task 8 só registra a evidência |
| 1 | Fechada exceto o item 80: `send-batch` ainda autoriza por cabeçalho `X-Internal: true` | Task 1 |
| 2 | T2a, T2b e T4 nunca implementadas — as migrations `…020200`, `…020300` e `…020600` não existem | Tasks 2, 3, 4 |
| 3 | Fechada exceto a Task 6, que o gate de saída declarou bloqueada por W2-T5 — hoje implementada | Tasks 5, 6 |
| 4 | Fechada exceto W4-TC-02, registrada como "aprovado; alteração de produto pendente" | Task 7 |

## Global Constraints

- Trabalhar na worktree `.worktrees/sync-remote-ai-2026-09-08`, branch
  `fix/ai-engine-schema-baseline`. Nenhum `push`, `merge`, `deploy`, migration
  remota ou chamada paga a provedor.
- Migrations são forward-only. A última aplicada é
  `20260916170000_isolate_ambiguous_legacy_outbox.sql`; toda migration nova
  deste plano usa o prefixo `20260917hhmmss` indicado na sua task. Nunca
  editar migration já aplicada.
- TDD sem exceção: escrever o teste, executá-lo, ver o vermelho esperado e só
  então implementar. Teste que passa de primeira não é evidência.
- Um commit por task, com `git add` restrito aos arquivos daquela task.
  Mensagens em inglês, no formato Conventional Commits já usado na branch.
- `pnpm lint` (`next lint --max-warnings=0`) tem de continuar com 0 erros e
  0 avisos: o gate de qualidade fechou em `72441a7d`, e regressão de lint
  bloqueia a task.
- Proibido alterar `pnpm-lock.yaml`, `package.json`, `next.config.js`,
  `.eslintrc.json`, `supabase/schema-drift-allowlist.json` e a lista de hosts
  confiáveis de imagem.
- Decisão M2, registrada pelo dono em 2026-09-17: **opção A**, confirmação de
  entrega escopada por tenant. O predicado de organização é obrigatório e não
  pode ser removido para obter verde.
- Decisão de cupom, registrada pelo dono em 2026-09-17: a migration **falha
  alto** se encontrar duplicatas. Nenhuma linha financeira é reescrita
  automaticamente; a reconciliação de produção fica para a Wave 7.
- Prova de banco usa o executor descartável, nunca um banco compartilhado:

```powershell
$nonce = [guid]::NewGuid().ToString('N')
$run = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$nonce"
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $run
if ($LASTEXITCODE -ne 0) { throw "Prepare failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $run
if ($LASTEXITCODE -ne 0) { throw "Replay failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $run -TestTargets @('tests/db/<alvo>.py')
if ($LASTEXITCODE -ne 0) { throw "Test failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $run
if ($LASTEXITCODE -ne 0) { throw "Stop failed with exit code $LASTEXITCODE" }
```

  Cada tentativa usa um nonce novo; nonce que falhou não se reaproveita.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `src/app/api/email/campaigns/send-batch/route.ts` | adota `isInternalAuthorized` no lugar do cabeçalho puro | 1 |
| `src/app/api/email/product-feeds/resolve/route.ts` | idem, no ramo interno que escolhe organização pelo corpo | 1 |
| `src/app/api/shopify/trigger-sync/route.ts` | idem, removendo o `isInternal` que dispensa segredo | 1 |
| `src/app/api/cron/email-queue-worker/route.ts`, `src/app/api/cron/resolve-ab-winners/route.ts` | chamadores passam `Authorization: Bearer` | 1 |
| `src/app/api/email/campaigns/send-batch/route.test.ts` | prova de negação e de aceitação da rota | 1 |
| `supabase/migrations/20260917010000_human_outbound_transcript.sql` | trigger que espelha a fala humana no transcript canônico | 2 |
| `runtime/tests/db/test_human_outbound_transcript.py` | prova de escrita única, ordem e isolamento | 2 |
| `supabase/migrations/20260917020000_confirm_sender_delivery.sql` | `internal.confirm_sender_delivery`, escopada por organização | 3 |
| `runtime/src/agents_runtime/repository/engine.py` | wrapper Python da confirmação | 3 |
| `runtime/src/agents_runtime/queueing/sender.py` | chama a confirmação e deixa de hospedar o housekeeping | 3 |
| `runtime/src/agents_runtime/app.py` | housekeeping em task própria, com conexão própria | 3 |
| `supabase/migrations/20260917030000_unique_coupon_codes.sql` | preflight de duplicatas e índice único de cupom | 4 |
| `runtime/src/agents_runtime/commerce/offer_engine.py` | código de cupom deixa de truncar o UUID | 4 |
| `runtime/src/agents_runtime/repository/incentives.py` | conflito de cupom vira alerta, não retentativa infinita | 4 |
| `supabase/migrations/20260917040000_guard_state_contract.sql` | knobs `p_count_bot`/`p_check_human` e laterais separadas | 5 |
| `runtime/src/agents_runtime/repository/agent.py` | wrapper aceita os knobs; espelho ausente vira `None` | 5, 6 |
| `runtime/src/agents_runtime/agent_core/responder.py`, `toucher.py` | produtores passam knobs, abrem alerta e tratam espelho ausente | 5, 6 |
| `supabase/migrations/20260917050000_single_active_agent.sql` | um agente ativo por organização | 6 |
| `src/app/api/ai/test/route.ts` e leitores confirmados | deixam de apresentar totais congelados como atividade | 7 |
| `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md` e planos das ondas | reconciliação do estado real | 8 |

---

### Task 1: Autenticação interna real nas rotas que confiam em cabeçalho

Fecha o item 80. O catálogo nomeia só `send-batch`; a varredura por
`X-Internal` encontrou dois vizinhos com o mesmo defeito, e corrigir apenas o
nomeado deixaria a mesma porta aberta ao lado. Os três entram aqui.
`src/app/api/email/campaigns/send/route.ts` e
`src/app/api/shopify/install-extras/route.ts` já exigem bearer além do
cabeçalho e ficam intocados.

**Files:**
- Modify: `src/app/api/email/campaigns/send-batch/route.ts:58-66`
- Modify: `src/app/api/email/product-feeds/resolve/route.ts:13-20`
- Modify: `src/app/api/shopify/trigger-sync/route.ts:17-30`
- Modify: `src/app/api/cron/email-queue-worker/route.ts:50-56`
- Modify: `src/app/api/cron/resolve-ab-winners/route.ts:169-172`
- Create: `src/app/api/email/campaigns/send-batch/route.test.ts`
- Read: `src/lib/internal-auth.ts`, `src/lib/internal-auth.test.ts`

**Interfaces:**
- Consumes: `isInternalAuthorized(request: NextRequest): boolean` de
  `@/lib/internal-auth` — fail-closed, comparação em tempo constante, aceita
  `INTERNAL_API_SECRET` ou `CRON_SECRET`.
- Produces: nenhuma assinatura nova. As três rotas passam a responder 401 sem
  `Authorization: Bearer <segredo>` válido, mesmo com `X-Internal: true`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/email/campaigns/send-batch/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}))

function post(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/email/campaigns/send-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      campaign_id: 'c1',
      contact_ids: ['ct1'],
      batch_number: 1,
      total_batches: 1,
      organizationId: 'org-a',
    }),
  })
}

describe('POST /api/email/campaigns/send-batch', () => {
  beforeEach(() => {
    delete process.env.INTERNAL_API_SECRET
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllEnvs()
  })

  it('nega quem só envia X-Internal: true', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ 'X-Internal': 'true' }))
    expect(res.status).toBe(401)
  })

  it('nega bearer errado', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer errado' }))
    expect(res.status).toBe(401)
  })

  it('nega sem segredo configurado, mesmo com bearer', async () => {
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer qualquer' }))
    expect(res.status).toBe(401)
  })

  it('passa da autorização com bearer correto', async () => {
    process.env.INTERNAL_API_SECRET = 's3cret'
    const { POST } = await import('./route')
    const res = await POST(post({ authorization: 'Bearer s3cret' }))
    expect(res.status).not.toBe(401)
  })
})
```

- [ ] **Step 2: Executar e ver o vermelho**

Run: `pnpm exec vitest run src/app/api/email/campaigns/send-batch/route.test.ts`

Expected: o primeiro caso falha — hoje o cabeçalho puro autoriza, então o
status não é 401. O quarto caso também falha, com 401, porque a rota ignora o
bearer.

- [ ] **Step 3: Trocar o cabeçalho pelo helper fail-closed**

Em `src/app/api/email/campaigns/send-batch/route.ts`, importar no topo:

```ts
import { isInternalAuthorized } from '@/lib/internal-auth'
```

e substituir o bloco das linhas 60-65 por:

```ts
    // Item 80: `X-Internal` é um cabeçalho que qualquer cliente escreve.
    // Autorização real é bearer com segredo configurado, fail-closed.
    if (!isInternalAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
```

- [ ] **Step 4: Executar e ver o verde**

Run: `pnpm exec vitest run src/app/api/email/campaigns/send-batch/route.test.ts`

Expected: 4 passed.

- [ ] **Step 5: Atualizar os dois chamadores**

Em `src/app/api/cron/email-queue-worker/route.ts`, trocar o objeto de headers
do `fetch` da linha 50 por:

```ts
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
          },
```

Em `src/app/api/cron/resolve-ab-winners/route.ts`, aplicar a mesma troca no
`fetch` da linha 169. Remover `'X-Internal': 'true'` dos dois: o cabeçalho não
é mais lido, e mantê-lo sugere que autoriza.

- [ ] **Step 6: Fechar os dois vizinhos**

Em `src/app/api/email/product-feeds/resolve/route.ts`, com o mesmo import,
trocar

```ts
    const isInternal = request.headers.get('X-Internal') === 'true'
```

por

```ts
    const isInternal = isInternalAuthorized(request)
```

O ramo interno continua lendo `body.organization_id`, mas só depois de bearer
válido.

Em `src/app/api/shopify/trigger-sync/route.ts`, substituir as linhas 20-27 por:

```ts
    if (!isInternalAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
```

`isInternalAuthorized` já aceita `CRON_SECRET`, então o caminho do cron
continua funcionando sem cláusula própria.

- [ ] **Step 7: Provar que nada mais quebrou**

Run: `pnpm exec vitest run src/app/api src/lib/internal-auth.test.ts`

Expected: suítes verdes, incluindo
`src/app/api/cron/send-scheduled-campaigns/__tests__/send-scheduled.route.test.ts`.
Esse teste afirma `X-Internal` num chamador da rota `send`, que esta task não
altera e que já exige bearer; deixá-lo como está.

Run: `pnpm typecheck`

Run: `pnpm lint`

Expected: ambos exit 0, lint sem avisos.

- [ ] **Step 8: Commit**

```powershell
git add src/app/api/email/campaigns/send-batch/route.ts src/app/api/email/campaigns/send-batch/route.test.ts src/app/api/email/product-feeds/resolve/route.ts src/app/api/shopify/trigger-sync/route.ts src/app/api/cron/email-queue-worker/route.ts src/app/api/cron/resolve-ab-winners/route.ts
git commit -m "fix: require real internal authentication on header-trusting routes"
```

**Rollback:** reverter o commit. O helper já existia e não muda de
comportamento; nenhuma env nova é introduzida — `INTERNAL_API_SECRET` e
`CRON_SECRET` já estão no `.env.example`.

---

### Task 2: W2-T2a — a fala humana entra no transcript

Quando um atendente humano responde pelo inbox, a mensagem é gravada em
`public.whatsapp_cloud_messages` mas não chega a `public.messages`. A IA que
retoma a conversa não enxerga o que o humano disse.

**Files:**
- Create: `supabase/migrations/20260917010000_human_outbound_transcript.sql`
- Create: `runtime/tests/db/test_human_outbound_transcript.py`
- Read: `runtime/src/agents_runtime/repository/agent.py` (contrato de reserva
  de `seq` do escritor existente);
  `supabase/migrations/20260915010000_account_scoped_conversation_bridge.sql`
  (resolução de conta/conversa aprovada na W2-T5);
  `runtime/tests/db/factories.py`

**Interfaces:**
- Consumes: `NEW` de `public.whatsapp_cloud_messages`; ponte conta/conversa da
  W2-T5.
- Produces: `internal.record_human_outbound_transcript() RETURNS trigger` e o
  trigger `AFTER INSERT` correspondente. Uma linha `author_type='human'` por
  `provider_message_id`; nenhum turno de IA é agendado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `runtime/tests/db/test_human_outbound_transcript.py`:

```python
import uuid

import pytest

from tests.db.factories import contact_phone, create_cloud_mirror, create_thread


@pytest.mark.db
def test_human_outbound_is_recorded_once(admin, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    cloud = create_cloud_mirror(
        admin,
        two_tenants.a.id,
        thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    provider_id = f"human-{uuid.uuid4().hex}"
    insert = """insert into public.whatsapp_cloud_messages
        (conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
        values (%s,%s,'outbound','text','Frete grátis','{}','human',false)"""
    admin.execute(insert, (cloud.conversation_id, provider_id))
    admin.execute(insert, (cloud.conversation_id, provider_id))

    rows = admin.execute(
        """select author_type, content->>'text' from public.messages
           where provider_message_id=%s""",
        (provider_id,),
    ).fetchall()
    assert rows == [("human", "Frete grátis")]


@pytest.mark.db
def test_bot_outbound_is_not_duplicated(admin, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    cloud = create_cloud_mirror(
        admin,
        two_tenants.a.id,
        thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    provider_id = f"bot-{uuid.uuid4().hex}"
    admin.execute(
        """insert into public.whatsapp_cloud_messages
           (conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
           values (%s,%s,'outbound','text','resposta do bot','{}','bot',true)""",
        (cloud.conversation_id, provider_id),
    )
    assert admin.execute(
        "select count(*) from public.messages where provider_message_id=%s",
        (provider_id,),
    ).fetchone() == (0,)
```

Conferir em `runtime/tests/db/factories.py` os nomes reais de
`create_cloud_mirror`, `create_thread` e `contact_phone` antes de rodar; usar
as fábricas existentes, sem criar novas.

- [ ] **Step 2: Executar e ver o vermelho**

Run: protocolo descartável dos Global Constraints com
`-TestTargets @('tests/db/test_human_outbound_transcript.py')`.

Expected: `test_human_outbound_is_recorded_once` falha comparando `[]` com a
linha esperada — nada chega a `public.messages`. O segundo caso passa desde já
e serve de controle: o trigger não pode transformá-lo em vermelho.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260917010000_human_outbound_transcript.sql`:

```sql
-- W2-T2a: a resposta do atendente humano precisa existir no transcript
-- canônico, senão a IA retoma a conversa sem saber o que foi dito.
create or replace function internal.record_human_outbound_transcript()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, internal, public
as $$
declare
  v_org uuid;
  v_waba uuid;
  v_wa_id text;
  v_phone text;
  v_contact uuid;
  v_conversation uuid;
  v_seq integer;
begin
  if new.direction <> 'outbound'
     or new.sender is distinct from 'human'
     or coalesce(new.sent_by_bot, false) then
    return new;
  end if;

  select wcc.organization_id, wcc.waba_id, wcc.wa_id, wcc.contact_phone
    into v_org, v_waba, v_wa_id, v_phone
    from public.whatsapp_cloud_conversations wcc
   where wcc.id = new.conversation_id;

  if v_org is null then
    return new;
  end if;

  -- Mesma resolução de `public.ingest_inbound_message`: identidade de canal
  -- primeiro, contato por telefone depois. Diferença deliberada: um outbound
  -- NÃO cria contato nem conversa; sem destino canônico, o trigger sai.
  select ci.contact_id into v_contact
    from public.channel_identities ci
   where ci.organization_id = v_org
     and ci.channel = 'whatsapp'
     and ci.external_id in (v_wa_id, v_phone);

  if v_contact is null then
    select c.id into v_contact
      from public.contacts c
     where c.organization_id = v_org
       and (c.whatsapp in (v_wa_id, v_phone) or c.phone in (v_wa_id, v_phone))
     order by c.created_at
     limit 1;
  end if;

  if v_contact is null then
    return new;
  end if;

  select c.id into v_conversation
    from public.conversations c
   where c.organization_id = v_org and c.contact_id = v_contact;

  if v_conversation is null then
    return new;
  end if;

  v_seq := internal.next_message_seq(v_conversation, 'outbound');

  insert into public.messages
    (organization_id, conversation_id, direction, seq, channel,
     author_type, content, provider_message_id, created_at, channel_account_id)
  values
    (v_org, v_conversation, 'outbound', v_seq, 'whatsapp', 'human',
     case when nullif(new.text_body, '') is not null
          then jsonb_build_object('text', new.text_body)
          else new.content end,
     new.message_id, coalesce(new."timestamp", now()), v_waba)
  on conflict do nothing;

  return new;
end
$$;

drop trigger if exists record_human_outbound_transcript
  on public.whatsapp_cloud_messages;
create trigger record_human_outbound_transcript
after insert on public.whatsapp_cloud_messages
for each row execute function internal.record_human_outbound_transcript();

revoke all on function internal.record_human_outbound_transcript() from public;
```

A resolução acima e a reserva de `seq` por `internal.next_message_seq` copiam
o contrato de `public.ingest_inbound_message`, definido em
`20260915010000_account_scoped_conversation_bridge.sql:119-172` — dois
escritores concorrentes não podem calcular `seq` de formas diferentes.
Preservar contadores de inbound e `pending_response_at`: texto humano é
outbound e não incrementa contador de inbound.

- [ ] **Step 4: Executar e ver o verde**

Run: mesmo comando do Step 2, com nonce novo.

Expected: 2 passed.

Run: protocolo descartável com
`-TestTargets @('tests/db/test_human_outbound_transcript.py','tests/db/test_agent_loaders.py')`.

Expected: o loader de transcript enxerga a fala humana, a ordem por `seq` se
mantém e nenhum turno automático foi disparado por um outbound.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260917010000_human_outbound_transcript.sql runtime/tests/db/test_human_outbound_transcript.py
git commit -m "fix: retain human replies in the runtime transcript"
```

**Rollback:** migration de compensação com `drop trigger`. As mensagens já
gravadas e seus ids são preservados; nunca apagar histórico humano.

---

### Task 3: W2-T2b — confirmação de entrega por tenant e housekeeping independente

Duas falhas na mesma área. O housekeeping (`sweep_outbox_unknown`,
`review_stale_unknown`, `expire_incentive_grants`) só roda dentro de
`sender_pass`, então uma instância sem canal nunca limpa estado. E quando o
provedor confirmou o envio mas `mark_outbox_sent` devolveu `false`, não existe
caminho para encerrar a linha sem reenviar.

Decisão M2 = **A**: a confirmação exige token original **e** organização da
sessão.

**Files:**
- Create: `supabase/migrations/20260917020000_confirm_sender_delivery.sql`
- Create: `runtime/tests/db/test_confirm_sender_delivery.py`
- Create: `runtime/tests/pipeline/test_housekeeping_without_channel.py`
- Modify: `runtime/src/agents_runtime/repository/engine.py` (wrapper novo, logo
  após `mark_outbox_sent`, linha 389)
- Modify: `runtime/src/agents_runtime/queueing/sender.py:219-221` (remover
  housekeeping) e `:520` (chamar a confirmação)
- Modify: `runtime/src/agents_runtime/app.py` (task de housekeeping)
- Modify: `runtime/tests/unit/test_sender_records_the_outcome.py`
- Read: `runtime/src/agents_runtime/repository/scope.py:120`
  (`scope_to_organization`)

**Interfaces:**
- Consumes:
  `engine.mark_outbox_sent(conn, outbox_id, token, provider_message_id) -> bool`;
  `scope_to_organization(conn, organization_id) -> None`;
  `config.sender_poll`; `config.unknown_review_after`.
- Produces:
  `internal.confirm_sender_delivery(p_outbox_id uuid, p_claim_token uuid, p_provider_message_id text) RETURNS boolean`,
  executável apenas por `sender_role`; e
  `engine.confirm_sender_delivery(conn: psycopg.AsyncConnection, outbox_id: UUID, token: UUID, provider_message_id: str) -> bool`,
  que não abre nem encerra transação.

- [ ] **Step 1: Escrever o teste de isolamento que falha**

Criar `runtime/tests/db/test_confirm_sender_delivery.py`:

```python
import uuid

import pytest

from tests.db.conftest import as_app_role
from tests.db.factories import create_outbox_item, create_thread


@pytest.mark.db
def test_confirmation_requires_matching_tenant(admin, dsn, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    outbox_id = create_outbox_item(admin, two_tenants.a.id, thread)
    token = uuid.uuid4()
    admin.execute(
        "update internal.message_outbox set status='manual_review', locked_by=%s "
        "where id=%s",
        (str(token), outbox_id),
    )
    query = "select internal.confirm_sender_delivery(%s,%s,%s)"
    args = (outbox_id, token, "wamid.proof")

    with as_app_role(dsn, "sender_role", two_tenants.b.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is False
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s",
        (outbox_id,),
    ).fetchone() == ("manual_review", str(token), None)

    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is True
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s",
        (outbox_id,),
    ).fetchone() == ("sent", None, "wamid.proof")


@pytest.mark.db
def test_confirmation_refuses_without_context_or_evidence(admin, dsn, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    outbox_id = create_outbox_item(admin, two_tenants.a.id, thread)
    token = uuid.uuid4()
    admin.execute(
        "update internal.message_outbox set status='manual_review', locked_by=%s "
        "where id=%s",
        (str(token), outbox_id),
    )
    query = "select internal.confirm_sender_delivery(%s,%s,%s)"

    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        conn.execute("select set_config('app.organization_id','',true)")
        assert conn.execute(query, (outbox_id, token, "wamid.proof")).fetchone()[0] is False
    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        assert conn.execute(query, (outbox_id, token, "  ")).fetchone()[0] is False
        assert conn.execute(query, (outbox_id, uuid.uuid4(), "wamid.x")).fetchone()[0] is False
```

- [ ] **Step 2: Escrever o teste de housekeeping sem canal**

Criar `runtime/tests/pipeline/test_housekeeping_without_channel.py` no mesmo
formato de `tests/pipeline/test_composition.py` — que já sobe `run(...)` sem
canal e observa o outbox com `eventually`:

```python
import asyncio

import psycopg
import pytest

from agents_runtime.app import run
from agents_runtime.config import QueueingConfig
from tests.db.factories import create_outbox_item, create_tenant, create_thread, set_runtime_mode


@pytest.fixture
def world(sync_admin: psycopg.Connection):
    organization_id = create_tenant(sync_admin)
    set_runtime_mode(sync_admin, organization_id, "runtime")
    thread = create_thread(sync_admin, organization_id)
    return organization_id, thread


async def test_housekeeping_runs_without_a_channel(
    dsn: str, admin: psycopg.AsyncConnection, sync_admin, world, tiny_config: QueueingConfig
) -> None:
    """W2-T2b: uma instância sem canal não entrega nada — mas continua
    obrigada a varrer lease vencido e expirar grant."""
    organization_id, thread = world
    outbox_id = create_outbox_item(sync_admin, organization_id, thread)
    sync_admin.execute(
        "update internal.message_outbox"
        "   set status='sending', locked_by='dead-worker',"
        "       locked_until = now() - interval '1 hour'"
        " where id=%s",
        (outbox_id,),
    )

    stop = asyncio.Event()
    running = asyncio.create_task(
        run(
            dsn,
            stop=stop,
            config=tiny_config,
            worker_set_role="worker_role",
            sender_set_role="sender_role",
        )
    )
    try:

        async def swept():
            cursor = await admin.execute(
                "select status from internal.message_outbox where id = %s", (outbox_id,)
            )
            row = await cursor.fetchone()
            return row if row and row[0] == "unknown" else None

        assert (await eventually(swept, note="lease vencido varrido sem canal"))[0] == "unknown"
    finally:
        stop.set()
        await running
```

Importar `eventually` do mesmo lugar que `test_composition.py` importa.
Acrescentar no mesmo arquivo o caso do grant vencido, usando a fábrica de grant
e afirmando a expiração pelo mesmo padrão `eventually`. Hoje os dois falham,
porque as três chamadas de housekeeping moram em `sender_pass` e uma instância
sem canal nunca as executa. Não criar harness novo.

- [ ] **Step 3: Executar e ver o vermelho**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_confirm_sender_delivery.py')`.

Expected: `UndefinedFunction: function internal.confirm_sender_delivery(...) does not exist`.

Run: `uv run --directory runtime pytest tests/pipeline/test_housekeeping_without_channel.py -q`

Expected: falha — o grant continua válido e a linha continua `sending`.

- [ ] **Step 4: Criar a função com o predicado de organização**

Criar `supabase/migrations/20260917020000_confirm_sender_delivery.sql`:

```sql
-- W2-T2b / M2=A: encerra uma entrega que o provedor já confirmou, sem
-- reenviar. Token original E organização da sessão: o token sozinho não
-- autoriza atravessar tenant.
create function internal.confirm_sender_delivery(
  p_outbox_id uuid, p_claim_token uuid, p_provider_message_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, internal
as $$
begin
  if nullif(btrim(p_provider_message_id), '') is null then
    return false;
  end if;
  update internal.message_outbox
     set status = 'sent',
         provider_message_id = p_provider_message_id,
         sent_at = coalesce(sent_at, now()),
         locked_by = null,
         locked_until = null,
         last_error = null
   where id = p_outbox_id
     and locked_by = p_claim_token::text
     and organization_id = public.current_app_organization_id()
     and status in ('unknown', 'manual_review');
  return found;
end
$$;

revoke all on function internal.confirm_sender_delivery(uuid,uuid,text) from public;
grant execute on function internal.confirm_sender_delivery(uuid,uuid,text) to sender_role;
```

Se a linha em `manual_review` perdeu o `locked_by`, a função recusa; não
inferir posse por outro caminho.

- [ ] **Step 5: Wrapper no repositório**

Em `runtime/src/agents_runtime/repository/engine.py`, logo após
`mark_outbox_sent`, com os imports `psycopg` e `UUID` já existentes:

```python
async def confirm_sender_delivery(
    conn: psycopg.AsyncConnection, outbox_id: UUID, token: UUID, provider_message_id: str
) -> bool:
    """Encerra uma linha cujo envio o provedor já confirmou (M2=A).

    Não abre transação: quem chama escopa a organização e commita.
    """
    cursor = await conn.execute(
        "select internal.confirm_sender_delivery(%s, %s, %s)",
        (outbox_id, token, provider_message_id),
    )
    return bool((await cursor.fetchone())[0])
```

- [ ] **Step 6: Ligar o caller dentro do escopo transacional**

Em `runtime/src/agents_runtime/queueing/sender.py`, na linha 520, logo após o
`mark_outbox_sent` existente e antes do bloco `if not recorded:` atual:

```python
        recorded = await engine.mark_outbox_sent(conn, send.outbox_id, token, delivered[0][0])
        if not recorded:
            async with conn.transaction():
                await scope_to_organization(conn, send.organization_id)
                recorded = await engine.confirm_sender_delivery(
                    conn, send.outbox_id, token, delivered[0][0]
                )
```

Importar `scope_to_organization` de `agents_runtime.repository.scope` no topo
do arquivo, seguindo o estilo de import já usado ali. O comentário longo do
item 47 que hoje segue o `if not recorded:` continua válido para o caso em que
a confirmação também devolve `false`: preservá-lo. A chamada ao provedor
permanece fora da transação — `SET LOCAL` não pode sobreviver ao commit nem
vazar para a próxima organização. Chamar a confirmação somente quando o
provedor respondeu sucesso; nunca chamar a API externa de novo para obter
prova.

Em `runtime/tests/unit/test_sender_records_the_outcome.py`, acrescentar um caso
com duas entregas A/B que registre a ordem
`transaction-enter → scope(A) → confirm(A) → transaction-exit → transaction-enter → scope(B) → confirm(B) → transaction-exit`.
Esse teste prova ordem, não segurança; a prova de segurança é o teste DB do
Step 1.

- [ ] **Step 7: Mover o housekeeping para task própria**

Remover as três chamadas de `sender_pass` (`sender.py:219-221`). Em
`runtime/src/agents_runtime/app.py`, criar a conexão `sender_role` fora do
`if channel is not None` e registrar o loop:

```python
    async def housekeeping():
        while not stop.is_set():
            await engine.sweep_outbox_unknown(housekeeping_conn)
            await engine.review_stale_unknown(
                housekeeping_conn, review_after=config.unknown_review_after
            )
            await engine.expire_incentive_grants(housekeeping_conn)
            await _sleep_or_stop(clock, stop, config.sender_poll.total_seconds())

    tasks.append(asyncio.create_task(housekeeping(), name="housekeeping"))
```

Conexão separada da entrega, para não intercalar transações. O encerramento
usa o `finally` de conexões e tasks já existente.

- [ ] **Step 8: Executar e ver o verde**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_confirm_sender_delivery.py','tests/db/test_outbox_claim.py')`.

Expected: todos passam. `test_outbox_claim.py` continua verde — a função nova
não altera o claim.

Run: `uv run --directory runtime pytest tests/pipeline/test_housekeeping_without_channel.py tests/unit/test_sender_records_the_outcome.py -q`

Run: `uv run --directory runtime ruff check .`

Run: `uv run --directory runtime lint-imports`

Expected: verdes.

- [ ] **Step 9: Commit**

```powershell
git add runtime/src/agents_runtime/app.py runtime/src/agents_runtime/queueing/sender.py runtime/src/agents_runtime/repository/engine.py supabase/migrations/20260917020000_confirm_sender_delivery.sql runtime/tests/db/test_confirm_sender_delivery.py runtime/tests/pipeline/test_housekeeping_without_channel.py runtime/tests/unit/test_sender_records_the_outcome.py
git commit -m "fix: maintain runtime state independently from message delivery"
```

**Rollback:** compensação remove a função nova, e o caller volta ao estado
anterior; linhas já marcadas `sent` são preservadas. Se necessário, o
housekeeping volta ao sender no mesmo commit de reversão.

---

### Task 4: W2-T4 — cupom único sem reescrever histórico

`coupon_code_for` usa os 8 primeiros hex do UUID do grant
(`offer_engine.py:217`): dois grants com o mesmo prefixo geram o mesmo código,
e o segundo cliente recebe o desconto do primeiro. Nenhum índice impede isso no
banco.

**Files:**
- Modify: `runtime/src/agents_runtime/commerce/offer_engine.py:214-217`
- Modify: `runtime/src/agents_runtime/repository/incentives.py:198`
  (`record_coupon_code`)
- Create: `supabase/migrations/20260917030000_unique_coupon_codes.sql`
- Modify: `runtime/tests/unit/test_offer_engine.py`
- Modify: `runtime/tests/db/test_create_coupon_tool.py`
- Read: `runtime/src/agents_runtime/tools/coupon.py`,
  `runtime/src/agents_runtime/repository/alerts.py:34` (`open_alert`)

**Interfaces:**
- Consumes: `Grant.id: UUID`; ledger append-only;
  `open_alert(conn, *, organization_id, type, severity, title, payload=None, dedup_key=None)`.
- Produces: códigos `WD-<UUID completo em hex maiúsculo>`; índice único
  `incentive_grants_org_coupon_unique` sobre
  `(organization_id, upper(coupon_code))` onde `coupon_code is not null`.
  Códigos já persistidos continuam como estão.

- [ ] **Step 1: Escrever o teste de colisão que falha**

Em `runtime/tests/unit/test_offer_engine.py`, na classe existente que já usa o
helper `self._grant`:

```python
    def test_shared_uuid_prefix_does_not_collide(self):
        first = self._grant(uuid.UUID("12345678-0000-0000-0000-000000000001"))
        second = self._grant(uuid.UUID("12345678-0000-0000-0000-000000000002"))
        assert coupon_code_for(first) != coupon_code_for(second)
```

- [ ] **Step 2: Executar e ver o vermelho**

Run: `uv run --directory runtime pytest tests/unit/test_offer_engine.py -q`

Expected: falha — os dois códigos são `WD-12345678`.

- [ ] **Step 3: Usar o UUID completo**

Em `runtime/src/agents_runtime/commerce/offer_engine.py`:

```python
def coupon_code_for(grant: Grant) -> str:
    """Determinístico a partir do grant: o retry do provedor recria o MESMO
    código, e código duplicado no provedor vira sucesso idempotente. O UUID
    inteiro, não o prefixo: oito hex colidem entre grants distintos."""
    return f"WD-{grant.id.hex.upper()}"
```

Run: `uv run --directory runtime pytest tests/unit/test_offer_engine.py -q`

Expected: verde.

- [ ] **Step 4: Preservar o código legado de grants em voo**

Em `runtime/tests/db/test_create_coupon_tool.py`, acrescentar um caso com
`coupon_code` legado de 8 hex já persistido: o retry tem de reconciliar esse
código no provedor, nunca criar um segundo desconto. Se o teste ficar vermelho,
a correção é ler o código persistido antes de gerar um novo — não alterar
códigos de grants em voo.

- [ ] **Step 5: Escrever o teste de unicidade que falha**

Em `runtime/tests/db/test_create_coupon_tool.py`, usando a fábrica de grant já
existente no arquivo:

```python
@pytest.mark.db
def test_same_code_twice_in_one_org_is_rejected(admin, two_tenants):
    import psycopg

    code = f"WD-{uuid.uuid4().hex.upper()}"
    first = create_grant(admin, two_tenants.a.id)
    second = create_grant(admin, two_tenants.a.id)
    other_org = create_grant(admin, two_tenants.b.id)
    admin.execute(
        "update public.incentive_grants set coupon_code=%s where id=%s", (code, first)
    )
    with pytest.raises(psycopg.errors.UniqueViolation):
        admin.execute(
            "update public.incentive_grants set coupon_code=%s where id=%s",
            (code.lower(), second),
        )
    admin.execute(
        "update public.incentive_grants set coupon_code=%s where id=%s", (code, other_org)
    )
```

O caso da organização B prova que a unicidade é por tenant; `NULL` continua
permitido.

- [ ] **Step 6: Executar e ver o vermelho**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_create_coupon_tool.py')`.

Expected: `DID NOT RAISE UniqueViolation` — hoje a caixa diferente é aceita.

- [ ] **Step 7: Migration que recusa duplicata em vez de reconciliar às escuras**

Criar `supabase/migrations/20260917030000_unique_coupon_codes.sql`:

```sql
-- W2-T4: dois grants não podem compartilhar código na mesma organização.
-- Se o banco de destino já tiver duplicatas, a migration PARA: reconciliar
-- linha financeira é decisão humana, não efeito colateral de deploy.
do $$
begin
  if exists (
    select 1 from public.incentive_grants
     where coupon_code is not null
     group by organization_id, upper(coupon_code)
    having count(*) > 1
  ) then
    raise exception 'coupon duplicates require approved ledger reconciliation';
  end if;
end $$;

create unique index if not exists incentive_grants_org_coupon_unique
on public.incentive_grants (organization_id, upper(coupon_code))
where coupon_code is not null;
```

Um mecanismo só: índice, sem constraint equivalente ao lado.

- [ ] **Step 8: Conflito vira alerta, não retentativa infinita**

Em `runtime/src/agents_runtime/repository/incentives.py::record_coupon_code`,
envolver a escrita num savepoint e capturar `psycopg.errors.UniqueViolation`:
abrir alerta pelo `open_alert` existente, com `type="coupon_code_conflict"`,
`severity="error"` e `dedup_key=f"coupon-conflict:{grant_id}"`, suspender a
tentativa desse grant e devolver o conflito a quem chamou. Nunca devolver
sucesso com o cupom de outro contato; nunca chamar a Shopify em laço.

No teste de provider fake, contar chamadas: um conflito permanente produz no
máximo uma chamada ao provedor.

- [ ] **Step 9: Executar e ver o verde**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_create_coupon_tool.py')`.

Run: `uv run --directory runtime pytest tests/unit/test_offer_engine.py -q`

Run: `uv run --directory runtime ruff check .`

Expected: verdes. O replay completo do descartável passa porque o banco novo
não tem duplicatas.

- [ ] **Step 10: Commit**

```powershell
git add runtime/src/agents_runtime/commerce/offer_engine.py runtime/src/agents_runtime/repository/incentives.py runtime/src/agents_runtime/tools/coupon.py runtime/tests/unit/test_offer_engine.py runtime/tests/db/test_create_coupon_tool.py supabase/migrations/20260917030000_unique_coupon_codes.sql
git commit -m "fix: prevent coupon collisions without rewriting grant history"
```

**Rollback:** preservar os códigos emitidos e o índice; reverter a lógica por
compensação que continua lendo os códigos persistidos. Nunca excluir desconto
remoto automaticamente. Se a migration abortar em produção, a reconciliação é
tarefa da Wave 7 e exige aprovação do dono.

---

### Task 5: W3-T6a — guard state econômico

`internal.legacy_conversation_guard_state` sempre varre as mensagens do bot,
mesmo quando o agente não usa teto por conversa nem parada por resposta
humana. A lateral atual projeta `count(*)` e `max(timestamp)` juntos: pôr o
knob nela apagaria o cooldown junto com a contagem.

Esta task entrega os knobs; a Task 6 entrega alerta, espelho e identidade.

**Files:**
- Create: `supabase/migrations/20260917040000_guard_state_contract.sql`
- Modify: `runtime/src/agents_runtime/repository/agent.py:333`
  (`load_legacy_guard_state`)
- Modify: `runtime/src/agents_runtime/agent_core/responder.py`,
  `runtime/src/agents_runtime/agent_core/toucher.py`
- Modify: `runtime/tests/db/test_legacy_guard_state.py`
- Read: `supabase/migrations/20260915010000_account_scoped_conversation_bridge.sql`
  (última definição da RPC, com resolução de WABA),
  `runtime/src/agents_runtime/agent_core/guards.py` (`_number`, `behavior_of`,
  `evaluate_inbound_guards`)

**Interfaces:**
- Consumes: identidade de conta aprovada na W2-T5; decisões W3-GD-01 a
  W3-GD-03 já implementadas.
- Produces: parâmetros finais `p_count_bot boolean default true` e
  `p_check_human boolean default true` na assinatura vigente da RPC; wrapper
  Python `load_legacy_guard_state(conn, *, organization_id, conversation_id, channel_account_id=None, count_bot: bool = True, check_human: bool = True)`.
  Os defaults preservam chamadores anteriores.

- [ ] **Step 1: Escrever o teste que falha**

Em `runtime/tests/db/test_legacy_guard_state.py`, montar uma conversa com uma
resposta humana e duas do bot, fixando o timestamp do último bot em
`2026-09-08T11:59:58Z`, e chamar a nova assinatura com `count_bot=False,
check_human=False`:

```python
from datetime import UTC, datetime

from agents_runtime.agent_core.guards import evaluate_inbound_guards

silence = evaluate_inbound_guards(
    {}, state, agent_id=state.ai_agent_id, now=datetime(2026, 9, 8, 12, tzinfo=UTC)
)
assert state.bot_message_count == 0
assert state.last_bot_message_at == datetime(2026, 9, 8, 11, 59, 58, tzinfo=UTC)
assert silence is not None and silence.reason == "cooldown"
```

Acrescentar o caso simétrico com `count_bot=True, check_human=True`, esperando
`bot_message_count == 2`, `human_replied is True` e o mesmo timestamp.

- [ ] **Step 2: Executar e ver os dois vermelhos exigidos**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_legacy_guard_state.py')`.

Expected, primeiro vermelho: a assinatura com os knobs não existe.

Depois de criar a migration, antes do GREEN, provar o segundo vermelho contra
a implementação ingênua: condicionar a lateral antiga inteira ao knob produz
`last_bot_message_at is None` e nenhum cooldown. Os dois resultados aparecem no
relatório da task antes do verde.

- [ ] **Step 3: Separar contagem e último timestamp**

Criar `supabase/migrations/20260917040000_guard_state_contract.sql`, partindo
da última definição aprovada da RPC (com a resolução de WABA da W2-T5),
acrescentando os dois parâmetros ao final da assinatura e trocando a lateral
única por duas:

```sql
left join lateral (
    select count(*) as total
      from public.whatsapp_cloud_messages wcm
     where wcm.organization_id = p_organization_id
       and wcm.conversation_id = wcc.id
       and wcm.sent_by_bot
       and p_count_bot
) bot on true
left join lateral (
    select wcm."timestamp" as last_at
      from public.whatsapp_cloud_messages wcm
     where wcm.organization_id = p_organization_id
       and wcm.conversation_id = wcc.id
       and wcm.sent_by_bot
       and wcm."timestamp" is not null
     order by wcm."timestamp" desc
     limit 1
) last_bot on true
```

Manter a projeção `coalesce(bot.total,0)::integer, last_bot.last_at`. O filtro
de `null` preserva a semântica de `max(timestamp)`. A lateral humana conserva
`limit 1` e ganha `and p_check_human`. Manter `SECURITY DEFINER`,
`search_path` e o escopo de organização; ajustar todos os `grant`/`revoke` da
nova assinatura.

- [ ] **Step 4: Passar os knobs pelos dois produtores**

Em `responder.py` e `toucher.py`, antes da chamada ao loader:

```python
from agents_runtime.agent_core.guards import _number, behavior_of

behavior = behavior_of(version.settings if version is not None else {})
count_bot = (_number(behavior.get("max_messages_per_conversation"), 0) or 0) > 0
check_human = behavior.get("stop_on_human_reply") is not False
```

`_number` já existe em `guards` e mantém a semântica aprovada na W3-GD-03,
inclusive para jsonb inválido. O fallback para versão ausente preserva o
caminho que em seguida levanta `NoActiveVersion`, sem criar `AttributeError`
antes dele.

- [ ] **Step 5: GREEN e prova de plano**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_legacy_guard_state.py','tests/db/test_responder_guards.py')`.

Expected: verdes, incluindo os casos positivos e negativos de tenant e WABA da
Onda 2.

Rodar dentro do mesmo descartável `EXPLAIN (ANALYZE, BUFFERS)` da consulta
interna com `false,false` e com `true,true`. Expected: com os knobs
desligados, a lateral de contagem não varre mensagens, enquanto a consulta
separada do último bot continua devolvendo o timestamp. Chamar apenas a função
PL/pgSQL no `EXPLAIN` não mostra o plano das laterais — explicar a consulta
interna.

Repetir a prova depois de um replay do zero e de um upgrade sequencial,
registrando assinaturas e grants.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20260917040000_guard_state_contract.sql runtime/src/agents_runtime/repository/agent.py runtime/src/agents_runtime/agent_core/responder.py runtime/src/agents_runtime/agent_core/toucher.py runtime/tests/db/test_legacy_guard_state.py
git commit -m "fix: apply guard policy without redundant message scans"
```

**Rollback:** reverter o código; compensação SQL restaura assinatura e corpo
anteriores preservando a resolução de WABA, e remove o overload novo somente
depois de provar zero chamadores. Não editar migration já aplicada nem apagar
dados de mensagens.

---

### Task 6: W3-T6b — missão ausente, espelho ausente e um agente ativo por organização

Fecha as três decisões de guard que o gate de saída da Onda 3 deixou abertas
porque dependiam da W2-T5, hoje implementada: W3-GD-05 (silêncio com alerta
deduplicado), W3-GD-06 (conversa nova distinguida de ponte quebrada) e
W3-GD-07 (no máximo um agente ativo por organização).

**Files:**
- Modify: `runtime/src/agents_runtime/repository/agent.py:333`
  (`load_legacy_guard_state` passa a devolver `GuardState | None`)
- Modify: `runtime/src/agents_runtime/agent_core/responder.py`,
  `runtime/src/agents_runtime/agent_core/toucher.py`
- Create: `supabase/migrations/20260917050000_single_active_agent.sql`
- Modify: `runtime/tests/db/test_responder_guards.py`
- Read: `runtime/src/agents_runtime/repository/alerts.py:21`
  (`NO_ACTIVE_MISSION`) e `:34` (`open_alert`);
  `docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md`

**Interfaces:**
- Consumes: `open_alert(conn, *, organization_id, type, severity, title, payload=None, dedup_key=None)`;
  `NO_ACTIVE_MISSION`; os knobs entregues na Task 5.
- Produces: `load_legacy_guard_state(...) -> GuardState | None`, onde `None`
  significa espelho ausente; alerta `no_active_mission` deduplicado por
  conversa; índice único que impede dois agentes ativos na mesma organização.

- [ ] **Step 1: Escrever o teste de alerta deduplicado**

O caso simples já existe e passa:
`test_an_inbound_without_any_active_mission_alerts_and_stays_silent`
(`tests/db/test_responder_guards.py:185`) prova um alerta quando falta missão.
O que W3-GD-05 exige e ninguém provou é o caso em que **outro guard já calou o
turno**: o diagnóstico tem de sair mesmo assim, uma vez só, sem LLM e sem
outbox. Acrescentar ao mesmo arquivo, reaproveitando os imports que ele já tem
(`create_agent_version`, `create_thread`, `create_message`, `responder`,
`a_job`, `ScriptedLlm`):

```python
async def test_missing_mission_alerts_once_even_when_another_guard_silences(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    """W3-GD-05: guard que cala o turno não pode engolir o diagnóstico de
    missão ausente, e duas execuções abrem um alerta só."""
    create_agent_version(
        admin, tenant, status="active", settings={"behavior": {"ai_enabled": False}}
    )
    thread = create_thread(admin, tenant)
    create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")

    for _ in range(2):
        assert (await responder(dsn)(a_job(tenant, thread.conversation_id))).content is None

    with admin.cursor() as cur:
        cur.execute(
            "select count(*) from public.alerts"
            " where organization_id = %s and type = 'no_active_mission'"
            "   and dedup_key = %s",
            (tenant, f"no-active-mission:{thread.conversation_id}"),
        )
        (alerts,) = cur.fetchone()
        cur.execute(
            "select count(*) from internal.message_outbox where conversation_id = %s",
            (thread.conversation_id,),
        )
        (outbox,) = cur.fetchone()
    assert (alerts, outbox) == (1, 0)
```

Conferir em `create_agent_version` o nome real do knob que desliga a IA e usar
esse nome; o objetivo é um guard que cale o turno antes da avaliação de missão,
qualquer que seja ele. Afirmar também que o `ScriptedLlm` não recebeu chamada,
com a mesma asserção que os testes vizinhos já usam.

- [ ] **Step 2: Escrever o teste de espelho ausente**

No mesmo arquivo, dois casos: conversa nova comprovada por sinal persistido,
com organização e conta válidas e sem espelho ainda, deve **prosseguir** aos
demais guards; vínculo esperado e quebrado, ou conta/conversa incompatíveis,
deve **bloquear**, com zero LLM e zero outbox. Erro de banco continua erro
observável, nunca `GuardState()` permissivo.

- [ ] **Step 3: Escrever o teste de um agente ativo por organização**

A fábrica `create_agent(conn, organization_id, *, model=None, base_prompt=...)`
não recebe estado de ativação; a ativação é um `update` explícito, e é
justamente ele que o índice tem de recusar:

```python
@pytest.mark.db
def test_one_active_agent_per_organization(admin, two_tenants):
    import psycopg

    from tests.db.factories import create_agent

    activate = "update public.ai_agents set is_active=true where id=%s"
    first = create_agent(admin, two_tenants.a.id)
    second = create_agent(admin, two_tenants.a.id)
    other_org = create_agent(admin, two_tenants.b.id)

    admin.execute(activate, (first,))
    with pytest.raises(psycopg.errors.UniqueViolation):
        admin.execute(activate, (second,))
    admin.execute(activate, (other_org,))

    admin.execute("update public.ai_agents set is_active=false where id=%s", (first,))
    admin.execute(activate, (second,))
```

A coluna é `public.ai_agents.is_active`, confirmada no
`supabase/schema-snapshot.json`. Se o `create_agent` já nascer com
`is_active` verdadeiro por default da tabela, ajustar o teste para desativar
todos antes do primeiro `activate` — o comportamento do default é parte do
vermelho a observar, não algo a assumir.

- [ ] **Step 4: Executar e ver o vermelho**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_responder_guards.py')`.

Expected: alerta ausente (`count(*) == 0`), espelho ausente hoje tratado como
estado vazio permissivo, e nenhum `UniqueViolation` ao ativar o segundo agente.

- [ ] **Step 5: Abrir o alerta antes do retorno silencioso**

Nos dois produtores, quando as missões já carregadas estão ausentes, chamar
`open_alert` em transação escopada antes do `return` silencioso, com
`type=NO_ACTIVE_MISSION`, `severity="warning"` e
`dedup_key=f"no-active-mission:{job.conversation_id}"`. Não mover LLM ou RAG
para antes dos guards.

- [ ] **Step 6: Distinguir conversa nova de ponte quebrada**

`row is None` no wrapper passa a devolver `None`, com tipo
`GuardState | None`. Tratar explicitamente nos dois produtores: conversa nova
comprovada segue para os demais guards; vínculo quebrado bloqueia e abre o
alerta aprovado. Não escrever fallback de "agente mais recente".

- [ ] **Step 7: Fazer cumprir um agente ativo por organização**

Criar `supabase/migrations/20260917050000_single_active_agent.sql`:

```sql
-- W3-GD-07: ativação manual precisa de identidade única. Duas linhas ativas
-- na mesma organização fazem o guard escolher arbitrariamente.
do $$
begin
  if exists (
    select 1 from public.ai_agents where is_active
     group by organization_id having count(*) > 1
  ) then
    raise exception 'multiple active agents require an explicit owner decision';
  end if;
end $$;

create unique index if not exists ai_agents_single_active_per_org
on public.ai_agents (organization_id) where is_active;
```

Ausência de agente ativo continua permitida. O preflight segue a mesma regra
do cupom: duplicata existente para a migration em vez de escolher em silêncio
qual agente sobrevive.

- [ ] **Step 8: Executar e ver o verde**

Run: protocolo descartável com
`-TestTargets @('tests/db/test_responder_guards.py','tests/db/test_legacy_guard_state.py')`.

Run: `uv run --directory runtime pytest -m unit -q`

Run: `uv run --directory runtime ruff check .`

Expected: verdes, sem regressão nos guards entregues na Onda 3.

- [ ] **Step 9: Commit**

```powershell
git add supabase/migrations/20260917050000_single_active_agent.sql runtime/src/agents_runtime/repository/agent.py runtime/src/agents_runtime/agent_core/responder.py runtime/src/agents_runtime/agent_core/toucher.py runtime/tests/db/test_responder_guards.py
git commit -m "fix: diagnose missing missions and enforce single active agent"
```

**Rollback:** reverter o código; compensação remove o índice depois de provar
que nenhuma organização depende dele. Alertas já abertos são preservados.

---

### Task 7: W4-TC-02 — parar de apresentar total congelado como atividade

A decisão W4-TC-02 foi aprovada em 2026-09-15 com estado "aprovado; alteração
de produto pendente": os campos `total_messages`, `total_tokens_used`,
`avg_response_time_ms` e `total_conversations` de `ai_agents` não são
alimentados por evento atribuído, e o produto não pode sugerir atividade atual
a partir deles. Colunas e dados são preservados; nenhum agregado novo é criado.

**Files:**
- Modify: `src/app/api/ai/test/route.ts:212` (deixa de selecionar os campos
  congelados)
- Modify: os leitores que a varredura do Step 1 confirmar
- Modify: `docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`
  (estado de W4-TC-02)
- Read: `src/lib/ai/engine.ts:373`,
  `src/lib/services/whatsapp/ai-chatbot-service.ts:150` (escritores legados que
  continuam existindo)

**Interfaces:**
- Consumes: nada novo.
- Produces: nenhuma superfície do produto apresenta esses quatro campos como
  atividade atual. Os escritores legados continuam gravando; a decisão proíbe
  exibir, não gravar.

- [ ] **Step 1: Inventariar leitores confirmados**

Run:

```bash
grep -rn "total_messages\b\|total_tokens_used\|avg_response_time_ms" src --include=*.tsx --include=*.ts \
  | grep -v "total_messages_sent\|total_messages_received\|\.test\." 
```

Registrar no relatório da task cada ocorrência classificada em: (a) leitura de
`ai_agents` exibida ao usuário; (b) escrita legada; (c) campo homônimo de outra
entidade, como `contacts` ou chaves de API. Só (a) é alvo.

- [ ] **Step 2: Escrever o teste que falha, se houver superfície**

Para cada superfície (a), escrever o teste que afirma a ausência do rótulo — por
exemplo, renderizando o componente e esperando que o texto do total congelado
não apareça, ou afirmando que a resposta da rota não traz o campo. Executar e
ver o vermelho.

Se o Step 1 não encontrar nenhuma superfície (a), não inventar teste: pular ao
Step 4 e registrar a retirada documental, que é exatamente o que a decisão
previu ao dizer "nenhuma superfície ativa dos totais legados confirmada".

- [ ] **Step 3: Remover a exposição**

Em `src/app/api/ai/test/route.ts:212`, retirar `total_messages` e
`total_tokens_used` da lista do `select`, mantendo os demais campos. Remover os
rótulos das superfícies (a) encontradas. Não apagar colunas, não criar
estatística derivada, não mexer nos escritores legados.

Run: `pnpm exec vitest run <arquivos dos testes escritos no Step 2>`

Expected: verde.

- [ ] **Step 4: Registrar a mudança de estado da decisão**

Em `docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md`,
mudar o estado de W4-TC-02 de "aprovado; alteração de produto pendente" para
"aprovado; alteração de produto aplicada em 2026-09-17", citando o commit desta
task e listando as superfícies alteradas ou a ausência delas.

- [ ] **Step 5: Gates e commit**

Run: `pnpm typecheck`

Run: `pnpm lint`

Expected: exit 0, sem avisos.

```powershell
git add src/app/api/ai/test/route.ts docs/superpowers/specs/2026-09-08-auditoria-ia-trace-counter-decisions.md
git commit -m "fix: stop presenting frozen agent totals as live activity"
```

Acrescentar ao `git add` os arquivos das superfícies (a) efetivamente
alteradas e seus testes.

**Rollback:** reverter o commit; nenhum dado foi tocado.

---

### Task 8: Reconciliação e gate de saída das Waves 0–4

As sete tasks anteriores fecham código. Esta fecha o registro: o checklist da
auditoria, os planos das ondas e a evidência de gate no mesmo SHA.

**Files:**
- Modify: `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`
- Modify: `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-2-state-queues-cutover.md`
  (Tasks 2, 3, 5: marcar os passos e registrar a evidência)
- Modify: `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-3-contracts-limits.md`
  (Task 6 e a nota do gate de saída, que hoje declara os itens bloqueados)
- Modify: `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-0-baseline.md`
  (registrar que W0-T2/T3/T4 foram entregues pelos planos filhos)
- Create: `docs/audits/2026-09-17-fechamento-waves-0-4.md`

**Interfaces:**
- Consumes: os commits das Tasks 1–7 e as saídas dos gates abaixo.
- Produces: um documento de evidência com o SHA final, os comandos, os códigos
  de saída e o estado de cada onda de 0 a 4.

- [ ] **Step 1: Rodar a bateria completa no SHA final**

Run, registrando o `ExitCode` literal de cada um:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
uv run --directory runtime pytest -m unit -q
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
git diff --check
```

Expected: todos exit 0. `pnpm lint` sem avisos; `pnpm build` com 148 páginas.

- [ ] **Step 2: Replay integral e upgrade no descartável**

Executar o protocolo FULL de replay (`Prepare`/`Replay`/`Test` com
`TestTargets` vazio) e o protocolo de upgrade (`PrepareUpgrade`/`Upgrade`/
`Test`), cada um com nonce novo, conforme
`docs/migrations/2026-09-09-app-schema-baseline-upgrade.md`.

Expected: zero failures, errors e skips nas suítes DB, RLS e pipeline;
`state=stopped`, `failure=null`, zero contêineres e volumes rotulados
remanescentes. O manifesto tem de incluir as cinco migrations novas deste
plano, em ordem.

- [ ] **Step 3: Atualizar o snapshot de schema se houver drift**

Se as suítes acusarem divergência de schema, rodar `pnpm run schema:snapshot` e
commitar `supabase/schema-snapshot.json` junto. Não editar
`supabase/schema-drift-allowlist.json`.

- [ ] **Step 4: Reconciliar o checklist e os planos**

No checklist da auditoria, marcar item 80 e os itens de W2-T2a, W2-T2b, W2-T4,
W3-T6 e W4-TC-02, citando commit e evidência de cada um. Nos planos das ondas,
marcar os passos executados e substituir a nota do gate da Onda 3 que declara
os itens bloqueados por W2-T5, já que a dependência foi satisfeita pela
migration `20260915010000_account_scoped_conversation_bridge.sql`.

- [ ] **Step 5: Escrever o documento de fechamento**

Criar `docs/audits/2026-09-17-fechamento-waves-0-4.md` com: o SHA final; a
tabela onda a onda (0 a 4) com condição de saída e evidência; a lista de
commits das Tasks 1–7; as saídas de gate do Step 1 com códigos de saída; os
nonces e resultados do Step 2; e a lista explícita do que **não** foi fechado —
Waves 5, 6 e 7, a reconciliação de cupons em produção e o item 92, que depende
de uma janela real de oito dias.

- [ ] **Step 6: Commit**

```powershell
git add docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md docs/superpowers/plans/2026-09-08-auditoria-ia-wave-0-baseline.md docs/superpowers/plans/2026-09-08-auditoria-ia-wave-2-state-queues-cutover.md docs/superpowers/plans/2026-09-08-auditoria-ia-wave-3-contracts-limits.md docs/audits/2026-09-17-fechamento-waves-0-4.md
git commit -m "docs: close waves 0-4 of the AI engine audit"
```

**Rollback:** reverter o commit documental não altera código nem banco.

---

## Gate de saída deste plano

- [ ] Tasks 1–7 commitadas, cada uma com vermelho registrado antes do verde.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pytest -m unit`,
      Ruff, Import Linter e `git diff --check` verdes no mesmo SHA.
- [ ] Replay FULL e lane de upgrade verdes no descartável, com limpeza
      comprovada e manifesto contendo as cinco migrations novas.
- [ ] Revisão independente por task e revisão integral do intervalo, com zero
      Critical e zero Important.
- [ ] Nenhuma alteração em lockfile, `package.json`, `next.config.js`,
      `.eslintrc.json` ou lista de hosts confiáveis.
- [ ] Nenhum `push`, `merge` ou `deploy`. A promoção continua sendo escopo da
      Wave 7.
