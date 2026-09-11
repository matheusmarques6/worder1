# Auditoria IA — Onda 2: estado, filas e cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar cutover reversível, histórico humano, idempotência de negócio, filas e seleção da conta WhatsApp correta.

**Architecture:** Reusar RPCs, outbox e factories atuais. Migrations compensatórias versionam cada transição; a prova corre em banco descartável com duas organizações, concorrência real e replay; mudanças de produto ainda não escolhidas têm gates explícitos antes de DDL.

**Tech Stack:** Next.js 14, TypeScript, Vitest, pnpm 10, Python >=3.13, psycopg 3, pytest, Supabase CLI 2.111.0, PostgreSQL 17, PowerShell 7 e Docker.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- idempotência de negócio antes do dreno da DLQ;
- detecção e reconciliação de cupons duplicados antes do `UNIQUE`;
- multi-WABA antes de promover organização com várias contas;
- item 92 aberto até existir janela real de pelo menos oito dias.
- Push, merge, migration remota e deploy são etapas separadas e exigem autorização explícita do usuário depois do relatório final.

---

Controlador: `gpt-6-astra/high`. Cada implementador/revisor/verificador é fresco, `fork_turns: "none"`, modelo/esforço explícitos e sem filhos. Luna = `gpt-5.6-luna/medium`; Terra = `gpt-5.6-terra/high`; Sol = `gpt-5.6-sol/high`; Astra = `gpt-6-astra/high`. Revisão final: Astra `xhigh`. A matriz por tarefa prevalece sobre o default do SDD. Critical/Important bloqueia; revisão exige `Spec PASS` e `Quality APPROVED`. Registrar BASE, SHA, RED/GREEN e rulings no ledger da onda. Cada checkbox abaixo é uma ação de 2–5 minutos; comandos longos iniciam em um passo e têm resultado coletado no passo seguinte, com atualizações durante a espera. Nenhum comando deste documento foi executado durante o planejamento.

## Mapa, decisões e ordem de execução

| Pacote | Responsabilidade | Arquivos centrais |
|---|---|---|
| W2-T1 | freshness/claim/limpeza ai_pending | runtime-rollout.ts, cloud-runner.ts, rollout SQL |
| W2-T2a | humano no transcript | trigger de whatsapp_cloud_messages |
| W2-T2b | housekeeping/manual_review | app.py, sender.py, engine.py |
| W2-T3 | idempotência antes da DLQ | jobs.py, worker.py, engine_loop.py, emit_ai_mission_job |
| W2-T4 | cupom sem colisão | offer_engine.py, incentives.py, coupon.py |
| W2-T5 | identidade da conta em cinco RPCs | ingest, mirror, step, guard, handoff e consumidores |
| W2-T6 | opt-out equivalente e índice medido | sender_preflight, moment_template_preflight |
| W2-T7 | mídia e nó IA no-op | webhook-processor, inbox, node-executors |
| W2-T8 | item 70, SQL histórico perigoso | quatro scripts ai-agents e RPC grants |

Executar W0/W1 antes desta onda. T5 precede a liberação do trigger humano de T2a em org multi-WABA; a construção pode ser sequencial T1 → T5 → T2a → T2b → T3 → T4 → T6 → T7 → T8. T3 nunca liga dreno antes de emissão/consumo idempotentes. T4 não aplica UNIQUE sobre duplicatas. Prefixo de novas migrations: `2026091002`.

Ordenação de versão obrigatória: trigger W0 `20260910000000`, segurança W1 `20260910010000`, esta onda `20260910020000`–`20260910020800`, guard W3 `20260910030000`, W4 `20260910040000`/`20260910040001`. Gate exige dois projetos: replay-zero do stream completo e Upgrade sequencial da W0 para W1, W2, W3 e W4 com comparação de dados sintéticos antes/depois. Nenhuma migration W3/W4 pode sobrescrever corpo anterior às mudanças W2 de WABA/identidade. Test focal usa `-TestTargets string[]` do executor W0 e encerra o projeto; cada RED/GREEN tem nonce novo. Upgrade preserva a identidade e mantém o projeto ativo até Test final.

Decisões ainda ausentes da spec: tratamento de manual_review entregue (79), execução de housekeeping sem canal (78), reconciliação financeira de colisões existentes (82), e modelo de conversa compartilhada versus separada por conta em multi-WABA. Este plano propõe opções concretas nos respectivos pacotes; nenhum texto abaixo presume aceite de produto. O controlador registra a resposta/ruling autorizado antes da implementação dependente; tarefas independentes continuam.

### Task 1: W2-T1 — ai_pending, freshness e claim atômico

**Papéis:** implementador Sol; revisor Astra; verificador Terra + guardião DB Astra.

**Files:**
- Modify: `src/lib/ai/runtime-rollout.ts::getRuntimeMode`, `src/lib/ai/cloud-runner.ts::claimAiPendingResponse`, `src/lib/ai/cloud-runner.ts::releaseAiPendingClaim`
- Test: `src/lib/ai/__tests__/runtime-rollout.test.ts`, `src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts`, `runtime/tests/db/test_legacy_pending_cutover.py` (novo)
- Create: `supabase/migrations/20260910020000_legacy_pending_cutover.sql`
- Read: `src/app/api/workers/whatsapp-ai-respond/route.ts`, `src/lib/whatsapp/webhook-processor.ts`, `20260828000004_coalesce_separate_rollout_budgets.sql`

**Interfaces:**
- Consumes: `ai_runtime_rollout(organization_id,mode)`, `whatsapp_cloud_conversations(id,organization_id,ai_pending,ai_debounce_until)`.
- Produces: `getRuntimeMode(supabase,organizationId): Promise<RuntimeMode>` consulta a cada decisão; erro não inventa modo/cache stale.
- Produces: `public.claim_legacy_ai_pending(p_conversation_id uuid) RETURNS boolean`; `public.release_legacy_ai_pending(p_conversation_id uuid) RETURNS void`, só service_role.
- Preserva `claimAiPendingResponse(conversationId:string):Promise<boolean>` e `releaseAiPendingClaim(conversationId:string):Promise<void>` para dois chamadores.

- [ ] **Step 1: RED de flip dentro da janela antiga**

No arquivo existente, reusar `supabaseReturning`:
```ts
it('observa o flip na próxima decisão sem esperar TTL', async () => {
  const first = supabaseReturning({ data: { mode: 'runtime' }, error: null })
  const second = supabaseReturning({ data: { mode: 'legacy' }, error: null })
  expect(await getRuntimeMode(first.client, ORG)).toBe('runtime')
  expect(await getRuntimeMode(second.client, ORG)).toBe('legacy')
})
```

- [ ] **Step 2: Executar RED**

Run: `pnpm exec vitest run src/lib/ai/__tests__/runtime-rollout.test.ts`.
Expected: FAIL, segunda decisão recebe runtime cacheado.

- [ ] **Step 3: Remover TTL/fallback stale no seam de decisão**

```ts
export async function getRuntimeMode(
  supabase: MinimalSupabase, organizationId: string,
): Promise<RuntimeMode> {
  const { data, error } = await supabase.from('ai_runtime_rollout')
    .select('mode').eq('organization_id', organizationId).maybeSingle()
  if (error) throw error
  return data?.mode === 'runtime' ? 'runtime' : 'legacy'
}
```
Remover cache/clearRuntimeModeCache e terceiro argumento dos testes; pesquisar todos os importadores antes de apagar exports. Erro de leitura no webhook deve propagar até o retry do envelope, preservando mensagem já gravada; ajustar o teste de reentrega para provar que persistência deduplicada não impede novo agendamento. Se o consumidor atual engole esse erro, corrigir ali antes de declarar GREEN.

- [ ] **Step 4: RED de claim concorrente e flip**

Criar em DB teste com duas conexões independentes a mesma conversa pendente; `ThreadPoolExecutor(max_workers=2)` dispara `select public.claim_legacy_ai_pending(%s)` e confirma `sorted(results)==[False,True]`. Antes de implementar, Run focal pelo executor W0; Expected: UndefinedFunction.
Teste sequencial adicional: marcar pending=true; virar rollout para runtime; claim deve false e pending/debounce devem ser limpos.

- [ ] **Step 5: Implementar claim como UPDATE condicional**

```sql
create or replace function public.claim_legacy_ai_pending(p_conversation_id uuid)
returns boolean language sql security definer
set search_path = pg_catalog, public
as $$
  with claimed as (
    update public.whatsapp_cloud_conversations c
       set ai_pending=false
     where c.id=p_conversation_id and c.ai_pending
       and not exists (
         select 1 from public.ai_runtime_rollout r
          where r.organization_id=c.organization_id and r.mode='runtime'
       )
    returning 1
  )
  select exists(select 1 from claimed)
$$;
revoke all on function public.claim_legacy_ai_pending(uuid) from public, anon, authenticated;
grant execute on function public.claim_legacy_ai_pending(uuid) to service_role;
```
Release usa a mesma condição de rollout ao repor pending. Trigger `AFTER INSERT OR UPDATE OF mode` de ai_runtime_rollout limpa `ai_pending=false, ai_debounce_until=null` nas conversas da org quando `NEW.mode='runtime'`. Backfill só orgs runtime. Wrapper TS:
```ts
const { data, error } = await supabaseAdmin.rpc('claim_legacy_ai_pending', {
  p_conversation_id: conversationId,
})
if (error) throw error
return data === true
```

- [ ] **Step 6: Provar corrida com rollout e preservar ingest**

Sincronizar duas transações: uma muda rollout enquanto outra claima; resultados permitidos: claim legacy anterior ao flip ou claim recusado após flip; nunca repor pending após flip. O UPDATE mostrado não serializa por si só a operação do LLM já em voo. Acrescentar revalidação de rollout antes do envio no cloud-runner se o gate atual não a alcançar, com teste que bloqueia LLM, vira modo e libera LLM: nenhuma saída legacy após flip. Provar o inverso runtime→legacy com o gate de `internal.claim_conversation` já introduzido em `20260905194328_require_runtime_for_inbound_turn.sql`.

- [ ] **Step 7: GREEN e commit**

Run: Vitest focal dos dois chamadores + rollout; pytest `test_legacy_pending_cutover.py`; typecheck; replay W0. Expected: claim 1/2, limpeza apenas org alvo, nenhuma resposta dupla em flip/reentrega.
```powershell
git add src/lib/ai/runtime-rollout.ts src/lib/ai/cloud-runner.ts src/lib/ai/__tests__/runtime-rollout.test.ts src/lib/whatsapp/__tests__/webhook-ai-sync-claim.test.ts runtime/tests/db/test_legacy_pending_cutover.py supabase/migrations/20260910020000_legacy_pending_cutover.sql
git commit -m "fix: synchronize legacy pending claims with runtime cutover"
```
**Gate:** testes de corrida podem exigir serialização adicional no ponto de envio; não declarar atomicidade ponta a ponta só com mocks. **Rollback:** reverter TS/RPC juntos; limpeza de flags é compensada por reagendamento dos eventos preservados, nunca por reenviar sem dedup.

### Task 2: W2-T2a — transcript preserva a fala humana

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra.

**Files:**
- Create: `supabase/migrations/20260910020200_human_outbound_transcript.sql`, `runtime/tests/db/test_human_outbound_transcript.py`
- Read: `src/app/api/whatsapp/cloud/messages/route.ts`, `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts`, `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts`, `runtime/src/agents_runtime/repository/agent.py`

**Interfaces:**
- Consumes: NEW de `whatsapp_cloud_messages`, conversa cloud com conta provada por W2-T5, canonical `public.messages`.
- Produces: trigger `internal.record_human_outbound_transcript() RETURNS trigger`, uma mensagem `author_type='human'` por provider_message_id; não agenda resposta da IA.

- [ ] **Step 1: RED de escrita real**

```python
def test_human_outbound_is_recorded_once(admin, two_tenants):
    from tests.db.factories import create_thread, create_cloud_mirror, contact_phone
    thread = create_thread(admin, two_tenants.a.id)
    cloud = create_cloud_mirror(
        admin, two_tenants.a.id, thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    admin.execute(
        """insert into public.whatsapp_cloud_messages
           (conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
           values (%s,'human-proof','outbound','text','Frete grátis','{}','human',false)""",
        (cloud.conversation_id,),
    )
    row = admin.execute(
        """select author_type,content->>'text' from public.messages
           where provider_message_id='human-proof'"""
    ).fetchone()
    assert row == ("human", "Frete grátis")
```
Usar provider id único por teste no código final para evitar colisões entre fixtures.

- [ ] **Step 2: Executar RED**

Run focal via W0. Expected: nenhuma linha em public.messages.

- [ ] **Step 3: Trigger na escrita compartilhada**

Guarda inicial:
```sql
if new.direction <> 'outbound'
   or new.sender is distinct from 'human'
   or coalesce(new.sent_by_bot,false) then
  return new;
end if;
```
Resolver org/contato/canonical pela conta+conversa de T5, fazer `SELECT ... FOR UPDATE` da canonical para reservar `seq`, inserir:
```sql
insert into public.messages
  (organization_id,conversation_id,direction,seq,channel,author_type,content,provider_message_id)
values
  (v_org,v_conversation,'outbound',v_seq,'whatsapp','human',
   case when nullif(new.text_body,'') is not null
     then jsonb_build_object('text',new.text_body)
     else new.content end,new.message_id)
on conflict (provider_message_id) where provider_message_id is not null do nothing;
```
O índice de provider_message_id precisa ser confirmado no baseline; usar seu alvo exato. Preservar inbound counters e `pending_response_at`; não incrementar contador de inbound para texto humano. A reserva de seq usa o mesmo contrato do escritor agent existente, não um `max(seq)+1` desprotegido.

- [ ] **Step 4: GREEN do takeover e idempotência**

Testar reentrega com mesmo message_id, duas falas humanas concorrentes, retomada IA lendo texto humano via loader real, bot não duplicado e conta B sem contaminar A. Run: focal + `tests/db/test_agent_loaders.py` + pipeline de responder. Expected: transcript único/ordenado; nenhum turno automático disparado por outbound.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260910020200_human_outbound_transcript.sql runtime/tests/db/test_human_outbound_transcript.py
git commit -m "fix: retain human replies in the runtime transcript"
```
**Gate:** T5 aprovado antes de multi-WABA. **Rollback:** desabilitar trigger por compensação, preservar mensagens já gravadas e seus ids; não apagar histórico humano.

### Task 3: W2-T2b — housekeeping sem canal e entrega tardia comprovada

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra.

**Files:**
- Modify: `runtime/src/agents_runtime/app.py::run`, `runtime/src/agents_runtime/queueing/sender.py::sender_pass`, `runtime/src/agents_runtime/repository/engine.py`
- Create: `supabase/migrations/20260910020300_confirm_sender_delivery.sql`, `runtime/tests/db/test_confirm_sender_delivery.py`, `runtime/tests/pipeline/test_housekeeping_without_channel.py`
- Modify/Test: `runtime/tests/unit/test_sender_records_the_outcome.py` (ordem transação/escopo/confirmação por organização conforme M2).

**Interfaces:**
- Consumes: `sweep_outbox_unknown(conn)->int`, `review_stale_unknown(conn,review_after)->int`, `expire_incentive_grants(conn)->int`.
- Produces proposta: housekeeping em task sempre ativa usando conexão sender_role própria; cadência `config.sender_poll` existente.
- Produces proposta condicionada a M2: `internal.confirm_sender_delivery(p_outbox_id uuid,p_claim_token uuid,p_provider_message_id text) RETURNS boolean`, apenas sender_role, atualiza entrega conhecida de `unknown/manual_review` com token original. Na opção A também exige `organization_id=public.current_app_organization_id()`; na B o token é autoridade global entre organizações. `correlate_outbox_status` de webhook continua sem reabrir manual_review.
- Produces na opção A: `engine.confirm_sender_delivery(conn: psycopg.AsyncConnection,outbox_id: UUID,token: UUID,provider_message_id: str)->bool`; não abre nem encerra transação. O caller `sender_pass.deliver` abre transação curta e chama `engine.scope_to_organization(conn,send.organization_id)` antes da confirmação.

**Decisão anterior ao RED — M2:** usuário deve aceitar housekeeping em bancada e escolher a autoridade do token original+wamid para encerrar revisão. A evidência atual em `test_outbox_claim.py` descreve o sender como global; portanto endurecer esta nova confirmação por tenant é recomendação, não decisão já aprovada.

| Opção | Contrato e efeito exigido |
|---|---|
| A — recomendada, confirmação tenant-scoped | Somente token original + wamid não vazio + estado permitido + organização da sessão correspondente. SQL e caller abaixo são condicionados a esta escolha. Organização B com id/token válidos de A retorna false e não modifica A; contexto ausente também recusa. |
| B — token como autoridade global | Retirar somente o predicado de organização do SQL abaixo, chamar o wrapper sem exigir escopo de tenant e documentar que qualquer sender_role portador do id/token pode confirmar A mesmo numa sessão de B. Substituir a expectativa de isolamento pelo teste explícito de alcance global descrito abaixo. Não apresentar esta alternativa como tenant-isolated. |

Sem escolha registrada, Task 3 fica dependente: não criar migration nem alterar caller/testes de confirmação; tarefas independentes continuam. M2 é separado da aceitação de housekeeping e não pode ser inferido do comportamento das funções antigas.

- [ ] **Step 1: RED da confirmação restrita**

Teste DB prepara outbox com `status='manual_review'`, `locked_by=token::text`, depois chama:
```sql
select internal.confirm_sender_delivery(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'wamid.proof'
);
```
UUIDs no exemplo SQL são substituídos pelos ids da factory e claim reais. Em ambas as opções: token alheio e wamid vazio retornam false; webhook comum não reabre revisão. Para A, criar o teste completo de isolamento abaixo; a sessão B recebe inclusive o token correto de A para provar que o token sozinho não autoriza a confirmação:

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
        "where id=%s", (str(token), outbox_id),
    )
    query = "select internal.confirm_sender_delivery(%s,%s,%s)"
    args = (outbox_id, token, "wamid.proof")
    with as_app_role(dsn, "sender_role", two_tenants.b.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is False
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s", (outbox_id,),
    ).fetchone() == ("manual_review", str(token), None)
    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is True
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s", (outbox_id,),
    ).fetchone() == ("sent", None, "wamid.proof")
```

Adicionar caso sem contexto em transação sender_role, usando `select set_config('app.organization_id','',true)`, com os mesmos id/token válidos: esperar false. Se M2=B for escolhida, renomear o teste acima para `test_original_token_has_global_confirmation_authority`, esperar true na chamada B, verificar imediatamente `('sent',None,'wamid.proof')`, e remover a chamada A subsequente. Nesse ramo, o caso sem contexto também espera true em linha nova: esta é a prova do alcance global, não uma regressão de isolamento.

- [ ] **Step 2: Executar RED**

Run: focal via W0. Expected: UndefinedFunction; teste pipeline sem canal espera grant expirado/ledger e hoje falha porque housekeeping não roda.

- [ ] **Step 3: Implementar confirmação sem reenvio conforme M2 registrada**

```sql
create function internal.confirm_sender_delivery(
 p_outbox_id uuid,p_claim_token uuid,p_provider_message_id text
) returns boolean language plpgsql security definer
set search_path=pg_catalog,internal as $$
begin
 if nullif(btrim(p_provider_message_id),'') is null then return false; end if;
 update internal.message_outbox
 set status='sent',provider_message_id=p_provider_message_id,
     sent_at=coalesce(sent_at,now()),locked_by=null,locked_until=null,last_error=null
 where id=p_outbox_id and locked_by=p_claim_token::text
   and organization_id=public.current_app_organization_id()
   and status in ('unknown','manual_review');
 return found;
end $$;
revoke all on function internal.confirm_sender_delivery(uuid,uuid,text) from public;
grant execute on function internal.confirm_sender_delivery(uuid,uuid,text) to sender_role;
```
O predicado de organização acima pertence exclusivamente a M2=A; não remover silenciosamente para obter GREEN. Se a linha de manual_review perdeu locked_by, a função recusa; não inferir posse. Chamar somente quando o sender recebeu sucesso do provedor e `mark_outbox_sent` retornou false. Nunca chamar novamente a API externa para obter prova.

- [ ] **Step 3a: Acrescentar wrapper do repositório**

Em `repository/engine.py`, usar imports existentes `psycopg` e `UUID`:
```python
async def confirm_sender_delivery(
    conn: psycopg.AsyncConnection, outbox_id: UUID, token: UUID, provider_message_id: str
) -> bool:
    cursor = await conn.execute(
        "select internal.confirm_sender_delivery(%s, %s, %s)",
        (outbox_id, token, provider_message_id),
    )
    return bool((await cursor.fetchone())[0])
```

- [ ] **Step 3b: Conectar o caller dentro do escopo transacional aprovado**

Em `sender_pass.deliver`, imediatamente após o `mark_outbox_sent` existente, antes do tratamento de `if not recorded`, na opção A:
```python
if not recorded:
    async with conn.transaction():
        await engine.scope_to_organization(conn, send.organization_id)
        recorded = await engine.confirm_sender_delivery(
            conn, send.outbox_id, token, delivered[0][0]
        )
```

A chamada ao provedor continua fora desta transação; `SET LOCAL` não pode sobreviver ao commit nem contaminar a próxima organização. Para M2=B, o bloco interno contém somente a chamada `confirm_sender_delivery`, sem `scope_to_organization`; seu grant sender_role e token original são a autoridade global aprovada. Acrescentar em `runtime/tests/unit/test_sender_records_the_outcome.py` caso com duas entregas A/B que registra a ordem `transaction-enter → scope(A) → confirm(A) → transaction-exit → transaction-enter → scope(B) → confirm(B) → transaction-exit` na opção A; no ramo B, afirmar ausência de chamada ao scoping e a confirmação pelo token. O teste de DB acima permanece a prova de segurança, não o mock de ordem.

- [ ] **Step 4: Mover os três passos de housekeeping**

Em `app.run`, criar conexão sender_role fora de `if channel is not None`; loop próprio:
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
Remover as três chamadas de sender_pass, manter conexão separada da entrega para não intercalar transações. Encerramento usa o finally de conexões/tasks existente.

- [ ] **Step 5: GREEN e commit**

Run: testes focais + `tests/unit/test_sender_records_the_outcome.py`; Ruff; Import Linter; pipeline com canal None e com canal fake. Expected: housekeeping nos dois modos, envio só no canal presente, confirmação token/wamid sem duplicação.
```powershell
git add runtime/src/agents_runtime/app.py runtime/src/agents_runtime/queueing/sender.py runtime/src/agents_runtime/repository/engine.py supabase/migrations/20260910020300_confirm_sender_delivery.sql runtime/tests/db/test_confirm_sender_delivery.py runtime/tests/pipeline/test_housekeeping_without_channel.py runtime/tests/unit/test_sender_records_the_outcome.py
git commit -m "fix: maintain runtime state independently from message delivery"
```
**Gate:** M2=A ou M2=B registrada, SQL/caller/expectativas correspondem ao mesmo ramo, guardião Astra confere isolamento A/B ou alcance global explicitamente autorizado; nenhum webhook genérico reabre revisão. Sem decisão, Task 3 permanece dependente. **Rollback:** compensação retira chamada/func nova, preserva sent comprovados; retornar housekeeping ao sender em commit conjunto se necessário.

### Task 4: W2-T3 — idempotência de negócio antes de drenar DLQ

**Status 2026-09-11: concluída.** Identidade: `610db7d9`/`482a9254`, gate DB
58/58. DLQ: `52416592` (RED), `18af07bb`, `50bae3eb` (RED), `c1effe0e`,
`cfce3c11` (RED), `1aa21ed0` e `a487df1f`; gate integrado descartável 40/40,
seguido pela revisão de privacidade `119b257e` (RED)/`cb2ecc7b` e novo gate
integrado 40/40. Ruff e quatro contratos do Import Linter verdes, sem recursos
Docker residuais.

**Papéis:** implementador Astra; revisor Astra independente; guardião DB Astra independente.

**Files:**
- Modify: `src/lib/automation/node-executors.ts::action_ai_mission`, `runtime/src/agents_runtime/queueing/jobs.py::MissionTouchJob`, `runtime/src/agents_runtime/queueing/worker.py::_touch`, `runtime/src/agents_runtime/queueing/engine_loop.py::_dispatch`, `runtime/src/agents_runtime/repository/engine.py::reprocess_dead_letters`, `runtime/src/agents_runtime/app.py::run`
- Create: `supabase/migrations/20260910020400_mission_touch_identity.sql`, `supabase/migrations/20260910020500_bounded_dead_letter_replay.sql`, `runtime/tests/db/test_touch_business_identity.py`, `runtime/tests/db/test_dead_letter_replay.py`, `runtime/tests/pipeline/test_automatic_dead_letter_replay.py`
- Test: `src/lib/automation/__tests__/action-ai-mission.test.ts`, `runtime/tests/pipeline/test_scenarios_c.py`
- Modify/Test: `runtime/tests/db/test_emit_mission_job.py::emit` e seus testes de emissão/recusa/permissão, `runtime/tests/db/test_toucher.py::_job` e `TestRunTouch`, `runtime/tests/db/test_responder_guards.py::a_touch`, `runtime/tests/db/test_startup_rls_guard.py` (construtor de MissionTouchJob no teste que exige RlsNotEnforced).

**Interfaces:**
- Consumes: execução real de automação, node.id, org/contact; pgmq msg_id é transporte, não identidade.
- Produces: `MissionTouchJob.touch_id: UUID`, exigido para jobs novos; outbox key `touch-{conversation_id}-{touch_id}`.
- Produces: emissor `emit_ai_mission_job` ganha último parâmetro `p_run_id uuid default null`; a identidade de negócio é `(organization_id,run_id,node_ref)`, e o banco atribui um touch_id UUID persistido ao primeiro pedido. Repetir a mesma passagem retorna o mesmo touch_id/msg_id, nunca um nonce novo. Ausência de run_id ou node_ref retorna `missing_run_identity` sem emissão.
- Produces: DLQ payload `failure_kind: "transient"|"permanent"|"unknown"`, `replay_count:int`, preservando `touch_id`; reprocess_dead_letters só transitórias e apenas uma reemissão automática.

**Contrato confirmado por inspeção:** `node-executors.ts:1199` já resolve run persistido por `context.automation_run_id || context.runId || context.workflow.executionId || context.workflow.execution_id`, e os emissores de e-mail validam UUID antes de gravar automation_run_id. `execution-engine.ts` guarda resultados por node.id e percorre nós com visited; uma execução/nó é a unidade de passagem neste motor. Reusar essa origem em action_ai_mission, sem fallback `exec_<timestamp>`: execução transitória sem UUID retorna erro e não gera job. Duas execuções persistidas distintas do mesmo nó continuam dois toques. Não criar identidade a partir do msg_id pgmq.

- [x] **Step 1: RED do parser e replay com msg_id novo**

```python
def test_touch_identity_survives_transport_replay():
    from uuid import UUID
    from agents_runtime.queueing.jobs import MissionTouchJob
    payload = {
        "kind": "mission_touch",
        "organization_id": "11111111-1111-1111-1111-111111111111",
        "contact_id": "22222222-2222-2222-2222-222222222222",
        "conversation_id": "33333333-3333-3333-3333-333333333333",
        "touch_id": "44444444-4444-4444-4444-444444444444",
        "event_family": "cart.abandoned",
    }
    assert MissionTouchJob.from_payload(payload).touch_id == UUID(payload["touch_id"])
```
Teste DB entrega mesmo payload com msg_ids diferentes e assert um toque/LLM/outbox; duas touch_ids legítimas produzem dois toques.

- [x] **Step 1a: RED dos contratos existentes de emissão e chave de outbox**

Inventário somente leitura antes de editar código:
```powershell
rg -n 'emit_ai_mission_job' runtime src supabase
rg -n 'touch-.*(msg_id|message_id)|touch-.*-[0-9]+' runtime src
```
A inspeção encontrou dois chamadores executáveis do emissor: `src/lib/automation/node-executors.ts:2129` e o helper `runtime/tests/db/test_emit_mission_job.py:44`; o mock TS em `action-ai-mission.test.ts:77` verifica seus argumentos. A chave antiga aparece em `worker.py:229` e na igualdade literal de `test_toucher.py:271`. Comentários e migration histórica são evidência, não novos consumidores a migrar; a nova assinatura fica na migration compensatória desta tarefa.

Em `test_emit_mission_job.py`, preparar identidades persistidas antes de chamar o helper. Acrescentar o helper local abaixo, usando a conexão admin inclusive para os casos de recusa e worker_role. W0 deve ter aprovado/materializado as colunas usadas: `automations(organization_id,name,trigger_type)` e `automation_runs(automation_id,organization_id,contact_id,trigger_type,trigger_node_id,status)`; conferir esse contrato no baseline W0 aprovado antes do RED, sem executar os scripts históricos como bootstrap.
```python
def create_run(admin: psycopg.Connection, org: uuid.UUID, contact: uuid.UUID) -> uuid.UUID:
    automation_id = admin.execute(
        "insert into public.automations (organization_id,name,trigger_type)"
        " values (%s,'mission-touch-contract','trigger_abandon') returning id",
        (org,),
    ).fetchone()[0]
    return admin.execute(
        "insert into public.automation_runs"
        " (automation_id,organization_id,contact_id,trigger_type,trigger_node_id,status)"
        " values (%s,%s,%s,'trigger_abandon','trigger-1','running') returning id",
        (automation_id,org,contact),
    ).fetchone()[0]
```
No helper `emit`, manter o retorno de três colunas e os argumentos existentes; acrescentar o nono placeholder e o parâmetro no dicionário:
```python
        select * from public.emit_ai_mission_job(
            %(org)s, %(contact)s, %(family)s, %(node_ref)s, %(delta)s,
            %(concession)s, %(channel)s, %(otel)s, %(run_id)s
        )
```
```python
            "run_id": kwargs.get("run_id"),
```
Atualizar cada chamada existente: o teste queued passa `run_id=create_run(admin,org,contact)` junto com delta/concession; o de segunda emissão cria dois runs distintos, um para cada chamada, mantendo a prova da mesma conversa canônica. Os testes `test_an_org_off_the_rollout_gets_no_job` e `test_no_active_mission_refuses_and_alerts` também passam `run_id=create_run(admin,org,contact)`, preservando seus statuses originais. Para contato alheio, criar o run com contato pertencente à org emissora e passar o estranho somente ao RPC:
```python
        run_id = create_run(admin,org,create_contact(admin,org))
        status, _, _ = emit(admin,org,stranger_contact,run_id=run_id)
        assert status == "contact_not_found"
```
No teste da porta worker, preparar o run antes de entrar no papel restrito:
```python
        run_id = create_run(admin,org,contact)
        with as_app_role(dsn,"worker_role",org) as worker:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                emit(worker,org,contact,run_id=run_id)
```
No teste queued, além das assertions atuais sobre o payload, provar que sua identidade vem do recibo da mesma emissão:
```python
        touch_id = admin.execute(
            "select touch_id from internal.mission_touch_emissions"
            " where organization_id=%s and msg_id=%s",
            (org,msg_id),
        ).fetchone()[0]
        assert job.touch_id == touch_id == uuid.UUID(payload["touch_id"])
```
Acrescentar testes de retry do mesmo run e ausência explícita de identidade:
```python
def test_same_run_and_node_reuses_the_emission(admin,org):
    contact = create_contact(admin,org)
    create_mission(admin,org,event_type="cart.abandoned",status="active")
    run_id = create_run(admin,org,contact)
    first = emit(admin,org,contact,run_id=run_id)
    second = emit(admin,org,contact,run_id=run_id)
    assert first == second
    assert first[0] == "queued"
    mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
    assert len(mine) == 1
    assert uuid.UUID(mine[0]["touch_id"]) is not None

def test_missing_run_identity_emits_nothing(admin,org):
    contact = create_contact(admin,org)
    create_mission(admin,org,event_type="cart.abandoned",status="active")
    assert emit(admin,org,contact,run_id=None) == ("missing_run_identity",None,None)
    assert not [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
```
Em `test_toucher.py::TestRunTouch.test_the_touch_concludes_as_funnel_touch_and_crowns_the_mission`, substituir a igualdade antiga que termina em `-101`, mantendo `message_id=101` como transporte:
```python
        assert row[2] == f"touch-{thread.conversation_id}-{job.touch_id}"
```
Em `test_a_redelivery_finds_the_outbox_and_archives`, manter `message_id=7` na primeira chamada e usar `message_id=8` na segunda, com o mesmo `job`; preservar as assertions `(DONE,STALE)`, nenhuma nova chamada LLM e `count == 1`. Isso prova a mudança de identidade na suíte existente.

Em `action-ai-mission.test.ts`, declarar `const RUN_ID = '55555555-5555-4555-8555-555555555555'`, trocar `executionId: 'run-1'` por `executionId: RUN_ID` em baseContext e acrescentar `expect(args.p_run_id).toBe(RUN_ID)` no teste queued. Assim os testes existentes continuam cobrindo RPC, recusas e delta após a validação de UUID.

- [x] **Step 2: Executar RED**

Run: `pnpm exec vitest run src/lib/automation/__tests__/action-ai-mission.test.ts`; parser focal e ciclo DB via W0 com `-TestTargets @('tests/db/test_emit_mission_job.py','tests/db/test_toucher.py','tests/db/test_touch_business_identity.py')`. Expected: p_run_id ausente no mock TS; assinatura SQL de nove argumentos ainda inexistente; atributo touch_id ausente e replay com novo msg_id expõe duas chaves/outboxes. Registrar cada falha de contrato antes do patch; não aceitar falha de seed/baseline como RED do emissor.

- [x] **Step 3: Implementar identidade no produtor/consumidor**

```python
# MissionTouchJob: campo obrigatório antes dos defaults
touch_id: UUID
# from_payload:
touch_id=UUID(payload["touch_id"]),
# worker._touch:
idempotency_key = f"touch-{job.conversation_id}-{job.touch_id}"
```

- [x] **Step 3a: Atualizar todos os construtores diretos existentes**

Busca estática `rg -n 'MissionTouchJob\(' runtime src` encontrou exatamente três locais: `runtime/tests/db/test_toucher.py:46`, `runtime/tests/db/test_responder_guards.py:86` e `runtime/tests/db/test_startup_rls_guard.py:111`. Todos entram no mesmo commit do campo obrigatório; não tornar touch_id opcional para poupar fixtures.

Em `_job` de test_toucher.py, manter kwargs e fixar a identidade da emissão sintética pela conversa/nó; repetir o helper representa retry da mesma emissão, e uma emissão legítima distinta pode fornecer touch_id diferente explicitamente:
```python
def _job(org: uuid.UUID, thread, **kwargs) -> MissionTouchJob:
    node_ref = kwargs.get('node_ref','flow-1:node-2')
    return MissionTouchJob(
        organization_id=org,
        contact_id=thread.contact_id,
        conversation_id=thread.conversation_id,
        touch_id=kwargs.get('touch_id',uuid.uuid5(thread.conversation_id,f'test-toucher:{node_ref}')),
        event_family=FAMILY,
        node_ref=node_ref,
        delta=kwargs.get('delta'),
        concession_request=kwargs.get('concession_request'),
    )
```
Em `a_touch` de test_responder_guards.py, preservar as chamadas atuais e oferecer override explícito para teste de duas emissões:
```python
def a_touch(organization_id: uuid.UUID,thread,*,touch_id: uuid.UUID | None = None) -> MissionTouchJob:
    return MissionTouchJob(
        organization_id=organization_id,
        contact_id=thread.contact_id,
        conversation_id=thread.conversation_id,
        touch_id=touch_id if touch_id is not None else uuid.uuid5(
            thread.conversation_id,'test-responder-guards:flow-1:node-2'
        ),
        event_family=FAMILY,
        node_ref='flow-1:node-2',
        delta=None,
        concession_request=None,
    )
```
No construtor inline de test_startup_rls_guard.py, acrescentar `touch_id=uuid.UUID('00000000-0000-4000-8000-000000000095')`. O teste não emite mensagem: o UUID constante deixa o job válido para alcançar a guarda e continuar falhando com RlsNotEnforced, nunca TypeError por argumento ausente. Os três arquivos já importam uuid. UUIDs determinísticos desses helpers representam recibos sintéticos já atribuídos; produção continua usando UUID persistido de mission_touch_emissions, nunca uuid5 de conversation/node. Nenhum helper deriva touch_id do msg_id da fila.

- [x] **Step 3b: Persistir o recibo no emissor SQL e atualizar o produtor TS**

Adicionar tabela interna sem grants de browser:
```sql
create table if not exists internal.mission_touch_emissions (
  touch_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  node_ref text not null check (btrim(node_ref) <> ''),
  conversation_id uuid references public.conversations(id) on delete cascade,
  msg_id bigint,
  unique(organization_id,run_id,node_ref)
);
revoke all on internal.mission_touch_emissions from public,anon,authenticated;
```
Definir assinatura nova `public.emit_ai_mission_job(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,uuid)` com p_run_id ao final; remover overload anterior de oito argumentos para não haver resolução ambígua, reemitir REVOKE PUBLIC/anon/authenticated e GRANT service_role. No corpo, antes de efeitos:
```sql
if p_run_id is null or nullif(btrim(p_node_ref),'') is null then
  return query select 'missing_run_identity'::text,null::uuid,null::bigint;
  return;
end if;
if not exists(select 1 from public.automation_runs
              where id=p_run_id and organization_id=p_organization_id) then
  return query select 'run_not_found'::text,null::uuid,null::bigint;
  return;
end if;
```
Depois das validações atuais de rollout/contato/missão, reservar recibo; declarar `v_touch_id uuid` e reutilizar `v_conversation_id`, `v_msg_id` existentes:
```sql
insert into internal.mission_touch_emissions(organization_id,run_id,node_ref)
values(p_organization_id,p_run_id,p_node_ref)
on conflict(organization_id,run_id,node_ref)
do update set node_ref=excluded.node_ref
returning touch_id,conversation_id,msg_id into v_touch_id,v_conversation_id,v_msg_id;
if v_msg_id is not null then
  return query select 'queued'::text,v_conversation_id,v_msg_id;
  return;
end if;
```
O upsert bloqueia o recibo durante a transação. Depois criar/resolver conversa com o SQL atual e acrescentar `'touch_id',v_touch_id` ao jsonb_build_object do pgmq.send. Após send:
```sql
update internal.mission_touch_emissions
set conversation_id=v_conversation_id,msg_id=v_msg_id
where touch_id=v_touch_id;
```
Todas essas operações estão na mesma chamada/transação; crash desfaz recibo+fila juntos. No TS:
```ts
const workflow = (context as any).workflow || {}
const runId = (context as any).automation_run_id || (context as any).runId ||
  workflow.executionId || workflow.execution_id
if (typeof runId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
  return { status: 'error', output: null, error: 'Persisted automation run identity is required' }
}
```
Enviar `p_run_id:runId` ao RPC existente; p_node_ref continua workflow.id:node.id. Jobs legados sem touch_id ficam em revisão/quarentena identificada; não inventar id em consumo. Aplicar o contrato preparado no Step 1a em `test_emit_mission_job.py` junto com a assinatura SQL: todas as emissões normais e recusas legadas enviam run persistido; somente o teste missing_run_identity omite a identidade. A igualdade de outbox e o replay de `test_toucher.py` também migram para touch_id no mesmo patch. O SQL valida run/org e contato/org antes de reservar recibo, impedindo replay cross-tenant.

- [x] **Step 4: GREEN da idempotência e primeiro commit**

Run: teste focal TS, parser, DB de emissor/worker e pipeline retry. Rodar também ciclo focal W0 com `-TestTargets @('tests/db/test_emit_mission_job.py','tests/db/test_toucher.py','tests/db/test_responder_guards.py','tests/db/test_startup_rls_guard.py')`; Test encerra esse projeto. Expected: mesmo touch_id idempotente após archive/re-enqueue, concorrência e crash após outbox; emissor preserva queued/not_rolled_out/contact_not_found/no_active_mission e InsufficientPrivilege, além de provar missing_run_identity e retry do mesmo run; a chave da outbox usa job.touch_id mesmo com msg_ids 7/8. Os três construtores continuam exercitando seus comportamentos originais, sem TypeError e sem perda da prova RlsNotEnforced. Repetir a busca por MissionTouchJob( e exigir touch_id explícito em todo construtor existente/novo antes do commit. Repetir também os dois rg do Step 1a: ambos os chamadores do emissor passam run_id e nenhuma chave/assertion executável permanece baseada em msg_id/message_id ou no literal -101.
```powershell
git add src/lib/automation/node-executors.ts src/lib/automation/__tests__/action-ai-mission.test.ts runtime/src/agents_runtime/queueing/jobs.py runtime/src/agents_runtime/queueing/worker.py supabase/migrations/20260910020400_mission_touch_identity.sql runtime/tests/db/test_touch_business_identity.py runtime/tests/db/test_emit_mission_job.py runtime/tests/db/test_toucher.py runtime/tests/db/test_responder_guards.py runtime/tests/db/test_startup_rls_guard.py
git commit -m "fix: identify mission touches independently from queue messages"
```

- [x] **Step 5: RED de DLQ seletiva e limitada**

Casos: transient/replay_count=0 pode reemitir; permanent/unknown sem decisão explícita fica; failure_kind ausente ou JSON null fica; transient/replay_count=1 fica; replay_count ausente/null/string `"zero"`/string `"0"`/boolean/negativo/decimal/inteiro maior que 1 fica sem lançar erro; mission_touch sem touch_id fica; queue par inválido recusa. Adicionar a matriz antes do SQL:
```python
import pytest
from psycopg.types.json import Jsonb

@pytest.mark.parametrize('patch', [
    {}, {'replay_count':None}, {'replay_count':'zero'}, {'replay_count':'0'},
    {'replay_count':True}, {'replay_count':-1}, {'replay_count':0.5},
    {'replay_count':2147483648}, {'replay_count':1},
])
def test_malformed_or_exhausted_replay_stays_in_dlq(admin, patch):
    payload = {'kind':'fixture','failure_kind':'transient',**patch}
    admin.execute('select pgmq.send(%s,%s)',('q_inbound_dlq',Jsonb(payload)))
    assert admin.execute(
        "select internal.reprocess_dead_letters('q_inbound_dlq','q_inbound',50)"
    ).fetchone()[0] == 0

@pytest.mark.parametrize('failure_kind',[None,'permanent','unknown'])
def test_unproven_failure_kind_is_not_replayed(admin,failure_kind):
    payload = {'kind':'fixture','replay_count':0,'failure_kind':failure_kind}
    admin.execute('select pgmq.send(%s,%s)',('q_inbound_dlq',Jsonb(payload)))
    assert admin.execute(
        "select internal.reprocess_dead_letters('q_inbound_dlq','q_inbound',50)"
    ).fetchone()[0] == 0
```
Adicionar caso separado omitindo failure_kind por completo; registrar e limpar somente msg_ids criados pelos testes DB (não purgar filas fora da suíte pipeline descartável). Assert fila origem sem esses payloads e DLQ com ids originais não arquivados.
```sql
select internal.reprocess_dead_letters('q_domain_events_dlq','q_inbound',50);
```
Expected RED: função atual aceita par errado e drena sem filtro. Teste deve verificar original arquivado apenas se reemissão comitou, payload mantém touch_id, mensagem reenfileirada tem replay_count=1.

- [x] **Step 6: Implementar classificação e limite persistente**

No _dispatch:
```python
failure = classify(error)
payload = {
    **message.payload,
    "error_class": type(error).__name__,
    "failure_kind": failure.value,
    "replay_count": message.payload.get("replay_count", 0),
    "last_error": str(error)[:500],
}
```
Usar `failure` também em `decide`. Ausência no job original significa primeira falha e ganha zero; um valor malformado recebido é preservado para quarentena, nunca convertido silenciosamente para zero. Substituir integralmente a função reprocess por:
```sql
create or replace function internal.reprocess_dead_letters(
 p_dead_letter_queue text,p_origin_queue text,p_limit integer default 50
) returns integer language plpgsql security definer
set search_path=pg_catalog,internal as $$
declare
 v_message record;
 v_count integer := 0;
begin
 if p_origin_queue is null or p_origin_queue not in
      ('q_inbound','q_domain_events','q_scheduled','q_evals')
    or p_dead_letter_queue is distinct from p_origin_queue||'_dlq'
    or p_limit is null or p_limit < 1 or p_limit > 50 then
   raise exception 'invalid dead-letter replay request';
 end if;
 for v_message in select msg_id,message from pgmq.read(p_dead_letter_queue,60,p_limit)
 loop
   if v_message.message->>'failure_kind' is distinct from 'transient' then continue; end if;
   if jsonb_typeof(v_message.message->'replay_count') is distinct from 'number' then continue; end if;
   if (v_message.message->>'replay_count') !~ '^[01]$' then continue; end if;
   if (v_message.message->>'replay_count')::integer <> 0 then continue; end if;
   if v_message.message->>'kind'='mission_touch'
      and nullif(v_message.message->>'touch_id','') is null then continue; end if;
   perform pgmq.send(p_origin_queue,
      jsonb_set(v_message.message - 'error_class' - 'last_error',
                '{replay_count}','1'::jsonb,true));
   perform pgmq.archive(p_dead_letter_queue,v_message.msg_id);
   v_count := v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function internal.reprocess_dead_letters(text,text,integer) from public,anon,authenticated;
grant execute on function internal.reprocess_dead_letters(text,text,integer) to worker_role;
```
Tipo e faixa são validados em IFs separados antes do cast; não depender da ordem de avaliação de OR no PostgreSQL. `IS DISTINCT FROM` cobre NULL SQL e JSON null. O filtro textual aceita apenas inteiro canônico 0/1; números fracionários e enormes são recusados sem cast. Archive e send compartilham transação; mensagens inválidas permanecem para operador e podem ficar temporariamente invisíveis pelos 60s do read, mas não são removidas nem reenviadas.

- [x] **Step 7: RED do chamador automático na composição**

Criar `runtime/tests/pipeline/test_automatic_dead_letter_replay.py` com a fixture clean_slate já protegida pelo executor W0:
```python
import asyncio
import time
import uuid
from psycopg.types.json import Jsonb
from agents_runtime.app import run

async def test_app_replays_only_live_queues_without_channel(sync_admin,tiny_config,dsn,queue_length):
    marker = str(uuid.uuid4())
    for name in ('q_inbound','q_domain_events','q_scheduled','q_evals'):
        sync_admin.execute('select pgmq.send(%s,%s)',(
            name+'_dlq',Jsonb({'kind':'fixture','marker':marker,
                              'failure_kind':'transient','replay_count':0}),
        ))
    stop = asyncio.Event()
    task = asyncio.create_task(run(
        dsn,stop=stop,config=tiny_config,workers=0,channel=None,
        worker_set_role='worker_role',sender_set_role='sender_role',
    ))
    try:
        deadline = time.monotonic()+3
        while await queue_length('q_inbound') != 1 or await queue_length('q_domain_events') != 1:
            if time.monotonic() >= deadline:
                raise AssertionError('app did not replay eligible dead letters')
            await asyncio.sleep(0.01)
        assert await queue_length('q_scheduled') == 0
        assert await queue_length('q_evals') == 0
        row = sync_admin.execute(
            "select message->>'replay_count' from pgmq.q_q_inbound where message->>'marker'=%s",
            (marker,),
        ).fetchone()
        assert row == ('1',)
    finally:
        stop.set()
        await asyncio.wait_for(task,2)
```
Run em ciclo focal novo W0 com TestTargets=`tests/pipeline/test_automatic_dead_letter_replay.py`; Expected RED: deadline sem reenfileiramento porque app.run não chama reprocess_dead_letters. workers=0 mantém jobs visíveis para assert; não substitui o teste de idempotência com workers reais já descrito no Step 4.

Nomes PGMQ: `q_inbound` é o nome lógico passado a send/read/archive/metrics; a tabela física é `pgmq.q_q_inbound` e o arquivo é `pgmq.a_q_inbound`. A DLQ lógica `q_inbound_dlq` corresponde a `pgmq.q_q_inbound_dlq` e `pgmq.a_q_inbound_dlq`. Preservar nomes lógicos nos argumentos das funções; acrescentar o prefixo físico somente em consultas diretas a tabelas, conforme `20260812000002_runtime_roles_and_internal.sql`.

- [x] **Step 7a: Criar task de dreno com conexão e cadência próprias**

Em app.run, depois de coalescer/heartbeat e antes do laço de workers, fora de `if channel is not None`:
```python
replay_conn = await _connect(dsn,worker_set_role,WORKER_ROLE)
connections.append(replay_conn)

async def replay_dead_letters():
    while not stop.is_set():
        for origin in (INBOUND,DOMAIN_EVENTS):
            await engine.reprocess_dead_letters(replay_conn,f"{origin}_dlq",origin)
        await _sleep_or_stop(clock,stop,config.process_heartbeat_every.total_seconds())

tasks.append(asyncio.create_task(replay_dead_letters(),name="dead-letter-replay"))
```
Cadência existente `process_heartbeat_every` = 30 segundos em produção e 100ms via TINY_INTERVALS; limite SQL 50 por fila/passe; nenhuma nova env. Conexão autocommit worker_role exclusiva do dreno, nunca pulse nem housekeeping sender_role. As duas chamadas usam o wrapper existente `engine.reprocess_dead_letters(conn,dead_letter_queue,origin_queue)->int`. A transação de cada função contém send+archive; q_scheduled/q_evals não são drenadas porque não têm handlers normais. Cleanup de app.run cancela task e deve aguardar cancelamento antes de fechar conexões:
```python
for task in tasks:
    if not task.done():
        task.cancel()
await asyncio.gather(*tasks,return_exceptions=True)
for conn in connections:
    await conn.close()
```
Inserir gather no finally existente, substituindo seu fechamento prematuro; teste stop deve finalizar antes do deadline e não registrar conexão usada após close.

- [x] **Step 7b: Alerta persistente do job que chegou à DLQ**

Usar `repository.alerts.open_alert(conn,organization_id,type,severity,title,payload,dedup_key)` existente, em transação curta escopada por organization_id UUID validado do payload. Tipo já aceito pelo CHECK: `mission_touch_failed` para toque, `send_failed` para inbound; severity=`warning` (valor aceito pelo CHECK existente), title=`Falha no processamento de IA`. Dedup_key=`dlq:<origin>:<touch_id>` ou `dlq:<origin>:<conversation_id>:<generation>`. Payload contém somente fila, error_class e identidade; não texto de cliente. Importar `open_alert` e `scope_to_organization` dos repositories; não escrever SQL em queueing.
```python
async with queue.connection.transaction():
    await engine.scope_to_organization(queue.connection,organization_id)
    await open_alert(
        queue.connection,organization_id=organization_id,
        type='mission_touch_failed' if message.payload.get('kind') == 'mission_touch' else 'send_failed',
        severity='warning',title='Falha no processamento de IA',
        payload={'queue':queue_name,'error_class':type(error).__name__},
        dedup_key=dedup_key,
    )
```
Validar UUID de organization_id antes desta transação; payload malformado sem org confiável permanece na DLQ e só gera log operacional sem tenant inventado. Abrir alerta não substitui send+archive: erro de alerta não apaga a evidência da DLQ, e retry do envelope continua protegido por idempotência. Teste pipeline com falha permanente de toque verifica um alerta aberto após duas entregas do mesmo touch_id e nenhuma chamada de serviço externo de mensagens.

- [x] **Step 8: GREEN, segundo commit e gate**

Run: DB focal + `tests/pipeline/test_automatic_dead_letter_replay.py` + pipeline cenários C + Ruff + Import Linter. Expected: app reemite automaticamente só as duas filas com handlers, funciona sem canal, encerra task/conexão sem fuga, preserva contagem e a mesma ação não custa segundo LLM nem duplica outbox. Acrescentar ao teste pipeline JSON malformados da matriz Step 5 e verificar que o processo continua vivo enquanto esses registros permanecem na DLQ.
```powershell
git add runtime/src/agents_runtime/app.py runtime/src/agents_runtime/queueing/engine_loop.py runtime/src/agents_runtime/repository/engine.py supabase/migrations/20260910020500_bounded_dead_letter_replay.sql runtime/tests/db/test_dead_letter_replay.py runtime/tests/pipeline/test_automatic_dead_letter_replay.py
git commit -m "fix: replay eligible dead letters once without duplicate touches"
```
**Gate:** commit de idempotência aprovado antes do dreno. **Rollback:** desligar dreno primeiro; manter touch_id e unique; nunca converter identidade de volta para msg_id com mensagens reemitidas em voo.

### Task 5: W2-T4 — detectar colisões e tornar código de cupom único

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra.

**Files:**
- Modify: `runtime/src/agents_runtime/commerce/offer_engine.py::coupon_code_for`, `runtime/src/agents_runtime/repository/incentives.py::record_coupon_code`, `runtime/src/agents_runtime/tools/coupon.py`
- Create: `supabase/migrations/20260910020600_unique_coupon_codes.sql`
- Test: `runtime/tests/unit/test_offer_engine.py`, `runtime/tests/db/test_create_coupon_tool.py`

**Interfaces:**
- Consumes: `Grant.id: UUID`, coupon_code persistido; ledger append-only.
- Produces: códigos novos `WD-<UUID completo em hexadecimal maiúsculo>`; código já gravado continua original.
- Produces: índice único `(organization_id,upper(coupon_code)) WHERE coupon_code IS NOT NULL`; conflito não dispara emissão eterna no provedor.
- Decisão obrigatória: se preflight achar duplicatas, interromper DDL e apresentar IDs/grants/ledger ao dono para reconciliação; nenhuma linha financeira é apagada/reescrita automaticamente.

- [ ] **Step 1: RED da colisão de prefixo**

Na classe existente `TestTheCode`, construir dois Grants usando `self._grant` com ids que compartilham oito primeiros hex:
```python
def test_shared_uuid_prefix_does_not_collide(self):
    first = self._grant(uuid.UUID("12345678-0000-0000-0000-000000000001"))
    second = self._grant(uuid.UUID("12345678-0000-0000-0000-000000000002"))
    assert coupon_code_for(first) != coupon_code_for(second)
```

- [ ] **Step 2: Executar RED**

Run: `uv run --directory runtime pytest tests/unit/test_offer_engine.py -q`.
Expected: dois códigos WD-12345678 iguais.

- [ ] **Step 3: Usar UUID completo**

```python
def coupon_code_for(grant: Grant) -> str:
    return f"WD-{grant.id.hex.upper()}"
```
Antes de ativar em grants emitidos sem coupon_code, identificar códigos antigos já criados no provedor: retry precisa reconciliar o código legado determinístico primeiro para não criar segundo desconto. Essa política de migração deve entrar no teste de provider fake; não alterar simplesmente códigos de grants em voo sem prova.

- [ ] **Step 4: RED de uniqueness e preflight de dados**

```sql
select organization_id,upper(coupon_code),count(*),array_agg(id order by created_at)
from public.incentive_grants
where coupon_code is not null
group by 1,2 having count(*)>1;
```
No DB descartável, inserir mesmo code com caixa diferente na mesma org: teste espera UniqueViolation e atualmente aceita. Mesmo código em org B continua permitido; NULLs permitidos.

- [ ] **Step 5: Migration recusa duplicata, não reconcilia em segredo**

```sql
do $$
begin
 if exists (
   select 1 from public.incentive_grants where coupon_code is not null
   group by organization_id,upper(coupon_code) having count(*)>1
 ) then
   raise exception 'coupon duplicates require approved ledger reconciliation';
 end if;
end $$;
create unique index if not exists incentive_grants_org_coupon_unique
on public.incentive_grants(organization_id,upper(coupon_code))
where coupon_code is not null;
```
Não duplicar índice e constraint. Na camada repository/coupon capturar UniqueViolation usando savepoint, registrar conflito permanente no alerta existente e suspender a tentativa desse grant até reconciliação, preservando histórico. Não devolver sucesso para cupom de outro contato.

- [ ] **Step 6: GREEN e commit**

Run: unit, DB coupon e replay W0. Expected: código novo sem colisão por prefixo, retry reutiliza desconto anterior, conflito não chama Shopify indefinidamente e duplicatas bloqueiam DDL.
```powershell
git add runtime/src/agents_runtime/commerce/offer_engine.py runtime/src/agents_runtime/repository/incentives.py runtime/src/agents_runtime/tools/coupon.py runtime/tests/unit/test_offer_engine.py runtime/tests/db/test_create_coupon_tool.py supabase/migrations/20260910020600_unique_coupon_codes.sql
git commit -m "fix: prevent coupon collisions without rewriting grant history"
```
**Gate:** reconciliação de dados existentes é externa; contador de chamadas do fake provider prova retry limitado. **Rollback:** preservar códigos emitidos e UNIQUE; reverter lógica por compensação que continua lendo códigos persistidos. Não excluir desconto remoto automaticamente.

### Task 6: W2-T5 — multi-WABA é identidade de conta, não recência

**Papéis:** implementador Sol; revisor Astra; verificador Terra + DB Astra.

**Files:**
- Create: `supabase/migrations/20260910020100_account_scoped_conversation_bridge.sql`, `runtime/tests/db/test_multi_waba_bridge.py`
- Modify: `src/lib/whatsapp/webhook-processor.ts`, `runtime/src/agents_runtime/repository/engine.py`, `runtime/src/agents_runtime/repository/agent.py`, `runtime/src/agents_runtime/repository/outbox.py`, `runtime/src/agents_runtime/queueing/sender.py`, `runtime/src/agents_runtime/channels/cloud_api.py`
- Read: `supabase/migrations/20260817000004_ingest_prefers_plain_text.sql`, `supabase/migrations/20260813000003_sender_preflight.sql`, `supabase/migrations/20260817000002_ai_run_steps_runtime.sql`, `supabase/migrations/20260901000003_guard_state_ai_enabled.sql`, `supabase/migrations/20260905230148_claim_outbox_wamid_channel.sql`

**Interfaces:**
- `p_waba_id uuid` significa `whatsapp_business_accounts.id`, nunca `whatsapp_business_accounts.waba_id text`.
- Produces parâmetro de conta nos cinco caminhos `ingest_inbound_message`, `mirror_outbound_to_inbox`, `emit_ai_run_step`, `legacy_conversation_guard_state`, `mark_ai_handoff`; outbox.channel_account_id já existe e deve ser preenchido.
- Produces `ClaimedSend.channel_account_id: UUID | None`; token da API é da mesma conta que channel_external_id e espelho; nenhum fallback por “primeira conta ativa” quando há múltiplas.

**Decisão M1 anterior ao DDL:** canonical conversations atualmente é unique(organization_id,contact_id). Alternativa A (menor mudança): manter história por contato, anexando identidade imutável da conta ao evento, turno e outbox; a conta do último inbound incluído em target_seq recebe a resposta daquela janela. Isso implica que dois números da mesma org compartilham histórico, e exige aceite explícito. Alternativa B: uma conversa canônica por conta/contato; exige plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-multi-waba-conversations.md` para backfill de mensagens, chaves únicas, jobs em voo e compensação antes de W2-T5. Não há escolha implícita. O contrato dos cinco RPCs abaixo é necessário nas duas alternativas e pode ser preparado/revisado sem inventar decisão de produto; execução do DDL dependente aguarda M1.

Assinaturas completas finais (p_waba_id sempre último, com default null para transição de caller legado):
```text
public.ingest_inbound_message(p_organization_id uuid,p_channel text,p_external_id text,p_contact_name text,p_content jsonb,p_provider_message_id text,p_debounce_seconds integer default 8,p_waba_id uuid default null) -> table(conversation_id uuid,contact_id uuid,seq integer,deduplicated boolean)
internal.mirror_outbound_to_inbox(p_organization_id uuid,p_to_phone text,p_wamid text,p_text text,p_waba_id uuid default null) -> boolean
internal.emit_ai_run_step(p_organization_id uuid,p_run_id uuid,p_step text,p_detail text default null,p_agent_id uuid default null,p_metadata jsonb default null,p_conversation_id uuid default null,p_phone text default null,p_waba_id uuid default null) -> boolean
internal.legacy_conversation_guard_state(p_organization_id uuid,p_conversation_id uuid,p_waba_id uuid default null) -> table(ai_enabled boolean,ai_agent_id uuid,ai_transferred_at timestamptz,bot_message_count integer,last_bot_message_at timestamptz,has_human_reply boolean)
internal.mark_ai_handoff(p_organization_id uuid,p_conversation_id uuid,p_reason text,p_waba_id uuid default null) -> boolean
```
Nomes/tipos de retorno acima conferidos nas migrations atuais de ingest e guard; o teste de catálogo deve preservá-los. Remover os overloads antigos sem p_waba_id para não deixar ambiguidades com defaults; reemitir REVOKE PUBLIC/anon/authenticated em todos, GRANT service_role no ingest, worker_role/sender_role conforme os grants atuais de cada RPC interna. Erro de grant não se resolve expondo internal no PostgREST.

- [ ] **Step 1: RED de duas contas, mesmo telefone**

```python
from tests.db.factories import create_channel_account, create_cloud_mirror, unique_phone

def test_two_accounts_have_distinct_mirrors(admin,two_tenants):
    org = two_tenants.a.id
    a = create_channel_account(admin,org)
    b = create_channel_account(admin,org)
    phone = unique_phone()
    mirror_a = create_cloud_mirror(admin,org,a.id,phone)
    mirror_b = create_cloud_mirror(admin,org,b.id,phone)
    admin.execute(
        "update public.whatsapp_cloud_conversations set last_message_at=now() where id=%s",
        (mirror_b.conversation_id,),
    )
    assert admin.execute(
        "select internal.mirror_outbound_to_inbox(%s,%s,%s,%s,%s)",
        (org,phone,"wamid.a","Resposta A",a.id),
    ).fetchone()[0] is True
    assert admin.execute(
        "select conversation_id from public.whatsapp_cloud_messages where message_id='wamid.a'"
    ).fetchone()[0] == mirror_a.conversation_id
```

- [ ] **Step 2: Executar RED**

Run focal via W0. Expected: overload de cinco argumentos ausente; a função antiga escolhe B quando recência vence.

- [ ] **Step 3: Predicado único na ponte**

Nos corpos novos, preservar demais guards e substituir resolução por recência por:
```sql
select wcc.id into v_cloud_id
from public.whatsapp_cloud_conversations wcc
join public.whatsapp_business_accounts account on account.id=wcc.waba_id
where wcc.organization_id=p_organization_id
  and account.organization_id=p_organization_id
  and wcc.waba_id=p_waba_id
  and wcc.wa_id=ltrim(p_to_phone,'+');
```
Adicionar parâmetro uuid nos cinco wrappers e call sites; validar conta da org no ingress antes de escrever. Para dados antigos sem conta, permitir fallback somente quando exatamente uma conta ativa existe na org; zero ou múltiplas produzem estado explícito de revisão, nunca recência. Resolver o caso de conta ausente antes da query da ponte:
```sql
if p_waba_id is null then
  select case when count(*)=1 then (array_agg(id))[1] end
  into p_waba_id
  from public.whatsapp_business_accounts
  where organization_id=p_organization_id and status='active';
end if;
if p_waba_id is null or not exists(
  select 1 from public.whatsapp_business_accounts
  where id=p_waba_id and organization_id=p_organization_id
) then
  raise exception 'WhatsApp account identity is missing or outside organization';
end if;
```
Em RPC booleana acessória, a ausência pode retornar false; ingest/handoff/guard não podem interpretar identidade ambígua como “bot ativo sem guard”. Testes fixam recusa e ausência de mutação para essa ambiguidade.

Na alternativa A aprovada, persistir a identidade do inbound na linha imutável, não num campo “última conta” mutável de conversations:
```sql
alter table public.messages add column if not exists channel_account_id uuid
  references public.whatsapp_business_accounts(id);
```
Ingest grava p_waba_id nesse campo; para cada turno resolver a conta da mensagem inbound de maior seq menor/igual ao target_seq do job. Carregar esse UUID como `channel_account_id` no resultado do turno e no insert da outbox dentro de conclude_turn; nunca reler o “último inbound” após o LLM. Para toque, transportar a conta explícita no job emitido ou usar fallback apenas de org com uma conta. A alternativa B define a mesma coluna no plano filho, junto da chave de conversa por conta.

- [ ] **Step 4: Fixar credencial e envio no mesmo envelope**

O claim já devolve phone_number_id derivado de outbox.channel_account_id, mas CloudApiChannel.load_token atualmente recebe organização. Fixar o contrato `TokenLoader(conn,organization_id:UUID,channel_external_id:str)->Awaitable[str]`; send e mark_read/typing passam `send.channel_external_id`. Criar `repository.whatsapp_accounts.load_account_for_number(conn,*,organization_id:UUID,phone_number_id:str)` com as mesmas colunas/retorno do load_active_account atual e predicado `(organization_id,phone_number_id,status='active')`, mantendo scope/RLS. from_env usa esse loader e resolve_token existente. Esse contrato evita segunda heurística de escolha de conta no canal.
```python
token = await self._load_token(conn,send.organization_id,send.channel_external_id)
```
O sender não tem SELECT direto na tabela de credenciais; acrescentar à migration W2-T5 a porta restrita:
```sql
create function internal.whatsapp_business_account_for_number(p_organization_id uuid,p_phone_number_id text)
returns table(id uuid,phone_number_id text,access_token text,access_token_encrypted text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_organization_id is distinct from public.current_app_organization_id() then
   raise exception 'WhatsApp account organization does not match session';
 end if;
 return query select w.id,w.phone_number_id,w.access_token,w.access_token_encrypted
 from public.whatsapp_business_accounts w
 where w.organization_id=p_organization_id and w.phone_number_id=p_phone_number_id
   and w.status='active';
end $$;
revoke all on function internal.whatsapp_business_account_for_number(uuid,text) from public,anon,authenticated;
grant execute on function internal.whatsapp_business_account_for_number(uuid,text) to sender_role;
```
`load_account_for_number` abre `conn.transaction()`, chama `scope_to_organization`, seleciona as quatro colunas dessa função e constrói `WhatsAppAccountRow(id=row[0],phone_number_id=row[1],access_token=row[2],access_token_encrypted=row[3])`, retornando None se não houver linha; preserva resolve_token sem logar credencial.

Arquivos adicionais desta tarefa: Modify `runtime/src/agents_runtime/repository/whatsapp_accounts.py`, Test `runtime/tests/unit/test_cloud_api_channel.py` e `runtime/tests/db/test_cloud_api_channel_real_wiring.py`. Atualizar os cinco wrappers: mirror recebe último argumento `channel_account_id`; emit_ai_run_step acrescenta keyword `channel_account_id` e último parâmetro SQL; load_guard_state/mark_ai_handoff recebem a conta congelada do turno. Testar que duas contas com tokens fake distintos enviam/espelham no mesmo número e que conta de outro tenant é recusada. Não modificar só o espelho deixando sender no primeiro token da org.

- [ ] **Step 5: GREEN dos cinco caminhos**

Teste DB de ingest/backfill, mirror, run step, guard e handoff com A/B na mesma org e C em outra. Cada caso escolhe conta explícita mesmo quando outra thread é mais recente. Adicionar dois eventos intercalados enquanto LLM bloqueado: resposta A mantém A depois da chegada de B.
Run: focal, sender tests, webhook rollout tests, typecheck, Ruff, replay.

- [ ] **Step 6: Commit após decisão M1 e provas da arquitetura escolhida**

```powershell
git add supabase/migrations/20260910020100_account_scoped_conversation_bridge.sql runtime/tests/db/test_multi_waba_bridge.py src/lib/whatsapp/webhook-processor.ts runtime/src/agents_runtime/repository/engine.py runtime/src/agents_runtime/repository/agent.py runtime/src/agents_runtime/repository/outbox.py runtime/src/agents_runtime/repository/whatsapp_accounts.py runtime/src/agents_runtime/queueing/sender.py runtime/src/agents_runtime/channels/cloud_api.py runtime/tests/unit/test_cloud_api_channel.py runtime/tests/db/test_cloud_api_channel_real_wiring.py
git commit -m "fix: preserve WhatsApp account identity across runtime delivery"
```
**Gate:** diff só deste pacote; cinco assinaturas preservadas por teste de catálogo, decisão M1 documentada. **Rollback:** manter account_id preenchido; bloquear envio ambíguo e reverter wrappers/RPCs juntos, sem selecionar conta arbitrária.

### Task 7: W2-T6 — opt-out equivalente e índice justificado

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra.

**Files:**
- Create: `supabase/migrations/20260910020700_opt_out_normalized_lookup.sql`
- Test: `runtime/tests/db/test_sender_preflight.py`
- Read: `20260813000003_sender_preflight.sql::internal.sender_preflight`, `20260813000007_moment_template_preflight.sql::internal.moment_template_preflight`

**Interfaces:**
- Consumes: mesmo contrato preflight existente.
- Produces: único disjunto `ltrim(o.phone,'+')=ltrim(p_to_phone,'+')` em ambos os guards; índice funcional somente após EXPLAIN mostrar utilidade.

- [ ] **Step 1: Acrescentar prova negativa e D3**

Reusar imports/factories/preflight do teste existente:
```python
def test_opt_out_does_not_match_a_different_phone(admin,dsn,two_tenants):
    org = two_tenants.a.id
    create_opt_out(admin,org,"+5511999990001")
    with as_app_role(dsn,"sender_role",org) as sender:
        assert preflight(sender,org,"5511999990002")[0] != "opt_out"

def test_opt_out_matches_stored_plus_and_unprefixed_input(admin,dsn,two_tenants):
    org = two_tenants.a.id
    create_opt_out(admin,org,"+5511999990003")
    with as_app_role(dsn,"sender_role",org) as sender:
        assert preflight(sender,org,"5511999990003")[0] == "opt_out"
```

- [ ] **Step 2: Baseline e RED válido do índice**

Run focal via W0: os dois comportamentos devem passar antes da mudança, pois equivalência é o requisito. Não alegar falha inexistente. Se o EXPLAIN justificar índice, escrever teste de catálogo:
```python
def test_normalized_opt_out_index_exists(admin):
    assert admin.execute(
        "select to_regclass('public.idx_opt_out_normalized_lookup')"
    ).fetchone()[0] is not None
```
Expected RED: índice ausente. Se não houver ganho de plano, não criar esse teste/índice; usar mutation local temporária no predicado do teste (telefone diferente) para provar que o negativo detecta ampliação indevida e desfazer antes da implementação.

- [ ] **Step 3: Migration mínima**

Reproduzir os dois corpos atuais na migration nova trocando só os três ORs por:
```sql
and ltrim(o.phone,'+')=ltrim(p_to_phone,'+')
```
Se EXPLAIN aprovado:
```sql
create index if not exists idx_opt_out_normalized_lookup
on public.whatsapp_opt_status(organization_id,ltrim(phone,'+'),status);
```
Não aplicar a álgebra ao mirror, cujo predicado antigo não contém D3.

- [ ] **Step 4: GREEN, EXPLAIN e commit**

Run: sender_preflight focal, moment preflight tests, replay. Medir `EXPLAIN (ANALYZE,BUFFERS)` com fixtures sintéticas de escala controlada no DB descartável; comparar plano/linhas/blocos, sem usar custo estimado como prova de tempo real. Expected: D1/D2/D3 e negativo preservados nos dois guards.
```powershell
git add supabase/migrations/20260910020700_opt_out_normalized_lookup.sql runtime/tests/db/test_sender_preflight.py
git commit -m "perf: simplify equivalent opt-out lookup"
```
**Gate:** índice só se justificado; alteração de comportamento reprova. **Rollback:** drop apenas índice novo por migration compensatória; funções anteriores são equivalentes.

### Task 8: W2-T7 — mídia com consumidor humano e nó IA Responder honesto

**Papéis:** implementador Terra/Sol; revisor Astra; verificador Terra + DB.

**Files:**
- Modify: `src/lib/automation/node-executors.ts::action_whatsapp_ai`, `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`
- Test: `src/lib/automation/__tests__/flow-fixes.test.ts`, `src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts`
- Read: `src/lib/whatsapp/webhook-processor.ts:350`, `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:60`, `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts:300`

**Interfaces:**
- Consumes: executor `action_whatsapp_ai.execute({config,context,isTest})` e result.status success/error.
- Produces: resultado error quando update legado não atinge conversa própria; nó nunca informa `ai_activated:true` por UPDATE sem linha.
- Preserva: pipeline de mídia, porque inbox assina media_storage_path e humanos são consumidores confirmados.

- [ ] **Step 1: RED de UPDATE sem linha**

No harness dos executores, simular Supabase update em `whatsapp_conversations` com retorno `{data:null,error:null}`; executar action_whatsapp_ai com conversationId da Cloud e agentId válido. Assert:
```ts
expect(result.status).toBe('error')
expect(result.output?.ai_activated).not.toBe(true)
```
Expected RED: executor atual ignora contagem e retorna success.

- [ ] **Step 2: Executar RED**

Run: `pnpm exec vitest run src/lib/automation/__tests__/flow-fixes.test.ts`.
Expected: success recebido em vez de error.

- [ ] **Step 3: Checar posse e linha atualizada**

No executor, resolver org da execução confiável, e:
```ts
const { data, error } = await supabaseAdmin.from('whatsapp_conversations')
  .update({ bot_active: true, ai_agent_id: config.aiAgentId })
  .eq('id', conversationId).eq('organization_id', orgId)
  .select('id').maybeSingle()
if (error) throw error
if (!data) {
  return {
    status: 'error', output: null,
    error: 'Esta conversa não suporta o nó IA Responder legado. Use uma missão de IA.',
  }
}
```
Validar que aiAgentId pertence à org antes do update. Não ativar automaticamente missão para nó antigo, pois eventFamily não existe nesse contrato.

- [ ] **Step 4: Reclassificar mídia com prova existente**

Adicionar teste ao webhook runtime que verifica enqueue/processInboundMedia com mediaId, e ao caminho inbox existente que signed URL é retornada a atendente autorizado. Texto do checklist:
```markdown
Reavaliado na Onda 2: o runtime não consome bytes de mídia, mas o inbox humano consome media_storage_path e renova URLs assinadas. Manter download preserva atendimento humano após takeover; otimização de armazenamento depende de política de produto, não de desligar o pipeline por rollout.
```
Não afirmar economia de storage que não aconteceu.

- [ ] **Step 5: GREEN e commit**

Run: executores e webhook focais; typecheck. Expected: legacy válido ativa, Cloud/tenant alheio/agent alheio falham sem mutação; mídia segue acessível aos humanos.
```powershell
git add src/lib/automation/node-executors.ts src/lib/automation/__tests__/flow-fixes.test.ts src/lib/whatsapp/__tests__/webhook-rollout-fork.test.ts docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md
git commit -m "fix: report unsupported legacy AI nodes and retain inbox media"
```
**Gate:** prova de consumidor humano impede remoção equivocada. **Rollback:** reverter mensagem de erro não autoriza voltar a sucesso falso; mídia não recebe mudança destrutiva.

### Task 9: W2-T8 — item 70, RPCs históricas sem escopo

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra. Pacote adicional do inventário W2, não ausente da cobertura por não ter linha própria na matriz resumida.

**Files:**
- Modify: `sql/ai-agents-rpc-functions.sql`, `sql/ai-agents-functions.sql`, `sql/ai-agents-stored-procedures.sql`, `sql/ai-agents-complete-migration.sql`, `supabase/README.md`
- Create: `runtime/tests/db/test_legacy_rpc_privileges.py`, `supabase/migrations/20260910020800_restrict_legacy_agent_rpc_grants.sql`
- Read: `20260902000004_search_agent_knowledge_org_scoped.sql`, `20260903000002_get_active_agent_for_conversation_versioned.sql`

**Interfaces:**
- Consumes: RPCs canônicas já versionadas, assinaturas de pg_proc.
- Produces: scripts históricos não recriam overloads sem org nem grant authenticated de RPC sem consumidor. Não remove tabela ai_agent_actions nem dados.

- [ ] **Step 1: RED de privilégios proibidos**

```python
def test_authenticated_has_no_unscoped_knowledge_rpc(admin):
    rows = admin.execute(
        """select p.oid::regprocedure::text
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='search_agent_knowledge'
             and has_function_privilege('authenticated',p.oid,'execute')
             and pg_get_function_identity_arguments(p.oid) not like '%p_organization_id%'"""
    ).fetchall()
    assert rows == []
```
Para provar remediação, instalar dentro da transação do teste um overload legado restrito ao fixture, aplicar migration compensatória e verificar revogação. Não carregar script histórico inteiro.

- [ ] **Step 2: Executar RED no fixture contaminado**

Run focal via W0. Expected: overload concedido a authenticated aparece na lista antes da remediação.

- [ ] **Step 3: Retirar definições inseguras dos arquivos históricos**

Substituir cada corpo/grant legado de search_agent_knowledge e get_active_agent_for_conversation por comentário de referência explícita:
```sql
-- Definição canônica: supabase/migrations/20260902000004_search_agent_knowledge_org_scoped.sql
-- Este arquivo histórico não cria overload sem organização.
```
Para get_active_agent usar a migration `20260903000002_get_active_agent_for_conversation_versioned.sql`. Retirar grant authenticated de update_agent_stats e increment_action_trigger e suas definições sem consumidor após `rg` confirmar zero call sites. Preservar demais DDL/dados; não promover scripts inteiros.

- [ ] **Step 4: Compensação de grants de overloads existentes**

Na migration, iterar `pg_proc` por nomes fechados `increment_action_trigger,update_agent_stats` e revogar de PUBLIC/anon/authenticated via `format('%s',oid::regprocedure)`. search/get_active seguem migrations canônicas; testar que todos os overloads sem org estão ausentes ou sem execute público. `service_role` conserva somente RPC com consumidor comprovado.

- [ ] **Step 5: GREEN, replay e commit**

Run: teste de privileges com papéis reais e duas orgs; replay integral; `rg -n "search_agent_knowledge|get_active_agent_for_conversation|increment_action_trigger|update_agent_stats" sql src supabase/migrations`. Expected: canonical única no stream, nenhuma possibilidade de script histórico reabrir grants.
```powershell
git add sql/ai-agents-rpc-functions.sql sql/ai-agents-functions.sql sql/ai-agents-stored-procedures.sql sql/ai-agents-complete-migration.sql supabase/README.md runtime/tests/db/test_legacy_rpc_privileges.py supabase/migrations/20260910020800_restrict_legacy_agent_rpc_grants.sql
git commit -m "fix: retire unsafe historical agent RPC definitions"
```
**Gate:** estado vivo continua evidência externa W6, não declarado corrigido remotamente. **Rollback:** preservar grants restritos; restaurar definição canônica compatível, nunca overload público sem escopo.

## Gate da onda e autorrevisão

| Item / requisito | Tarefa |
|---|---|
| ai_pending limpeza/atomicidade/cache | T1 |
| Takeover humano amnésico | T2 |
| 78/79 housekeeping e manual_review | T3, decisão anterior à implementação |
| 81 idempotência/DLQ | T4, dois commits com gate entre eles |
| 82 cupons | T5, reconciliação antes de UNIQUE |
| Multi-WABA | T6, arquitetura anterior ao DDL |
| Opt-out predicado/índice/negativo | T7 |
| 90 e download de mídia | T8, consumidor humano preservado |
| 70 RPCs fora do stream | T9 |

Verificador roda `pnpm test`, `pnpm typecheck`, `uv run --directory runtime pytest -m unit`, Ruff, Import Linter, replay e DB/RLS/pipeline W0 no mesmo SHA. Fixtures de concorrência usam conexões distintas; nenhum teste inteiro é simulado por sequência de mocks. Revisão Astra xhigh cobre rollback, identidade de conta e idempotência.

Decisões ainda genuínas: M1 (histórico multi-WABA compartilhado versus separado), reconciliação de cupons já emitidos no provedor/ledger e autoridade de encerramento de manual_review. A identidade de toque já foi fixada em run persistido+nó, com recibo UUID transacional, e o dreno tem chamador/cadência/fechamento concretos. Baseline W0 depende de B0/B1 e plano filho. Não marcar a onda como executável integralmente enquanto os gates de produto/dados estiverem abertos.
