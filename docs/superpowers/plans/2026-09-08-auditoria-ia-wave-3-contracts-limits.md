# Auditoria IA — Wave 3: Contracts and Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a parcela sem banco do item 63 e comprovar paridade de guards, horários, cancelamento e limites de tempo sem escolher políticas de produto implicitamente.

**Architecture:** Preservar os consumidores atuais TS e Python, usando fixtures JSON comuns como contrato observável. Aplicar limites no worker e nas portas de conexão existentes; alterações no significado dos guards e nos valores dos prazos dependem das decisões registradas antes das tasks condicionais.

**Tech Stack:** Next.js, TypeScript, Vitest, Python >=3.13, pytest, asyncio, psycopg3, PostgreSQL/Supabase descartável, uv, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- Decisão de produto retorna ao usuário antes de implementação.
- Critical ou Important bloqueia a tarefa e a onda.
- Worktree exclusivo: `.worktrees/sync-remote-ai-2026-09-08`; branch `integration/sync-remote-ai-2026-09-08`.
- Ondas 0–2 precisam estar aceitas. Toda execução DB pertence ao guardião da Onda 0, sozinho, com identidade e sentinela do banco descartável novamente comprovadas.
- Não executar Docker, testes, migrations ou commits durante a escrita deste plano. Os comandos abaixo são para a execução autorizada posterior.

---

## Papéis, dependências e arquivos

Controlador `gpt-6-astra/high`; integração `gpt-5.6-terra/high`; dinheiro, filas e timeouts `gpt-5.6-sol/high`; revisor de tarefa `gpt-5.6-sol/high`, elevado a `gpt-6-astra/high` para DB/concorrência; verificador `gpt-5.6-terra/high`; guardião DB `gpt-6-astra/high`; revisão integral `gpt-6-astra/xhigh`. Cada dispatch usa `fork_turns: "none"`, modelo/esforço explícitos e brief de uma tarefa; implementadores não delegam.

Antes de executar, ler este plano e a spec; usar o workspace/ledger individual criado por `scripts/sdd-workspace` da skill SDD. Registrar BASE, tabela de interfaces compartilhadas, comandos, resultados, commits, decisões e review packages. Cada task termina com Spec PASS e Quality APPROVED; o verificador repete os gates no commit. Rodadas 1–3 voltam ao implementador; 4–5 usam agente fresco superior; Critical/Important residual bloqueia conforme a spec.

| Pacote | Tasks | Arquivos responsáveis |
|---|---|---|
| W3-T1, item 63 | 1–2, 9–11 | Parser/transcript/BYO, loaders de missão/compras, fiação do juiz e contratos das tools |
| W3-T2, item 66 e achados de guards | 3–6 | `guards.ts`, `guards.py`, `conversation-ai-status.ts`, `cloud-runner.ts`; fixture comum; loader/RPC da Onda 2 |
| W3-T3, item 68 e timeouts DB | 7–8 | `config.py`, `queueing/worker.py`, quatro portas de conexão e testes de lease/health |

Testes DB do item 63 não são substituídos por mocks: Tasks 9–11 entregam a seleção de missão por `event_type`, o `last_order_at = max(coalesce(...))`, a fiação de `never_say_ai`, nome desconhecido/identidade de tool e conversa de outro tenant. Ondas 0–2 fornecem o banco seguro e a base de autorização; não são donas implícitas desses testes. O catálogo Python de tools apagado no item 59 não será recriado.

Namespace de migrations coordenado: W0 `20260910000000`; W1 `20260910010000`; W2 `20260910020000`–`20260910020800`; esta onda reserva `20260910030000_guard_state_contract.sql`; W4 começa em `20260910040000`. Toda migration desta onda precisa de duas provas no descartável: replay do zero do manifesto completo e upgrade sequencial de uma base com W0/W1/W2 já aplicadas. Comparar assinaturas/grants/resultados após as duas rotas; replay isolado da migration nova não basta.

### Task 1: Parser HTTP malformado e contagem do transcript (W3-T1)

**Files:**

- Modify: `runtime/src/agents_runtime/server.py::_read_request`.
- Create: `runtime/tests/unit/test_listener_request_contract.py`.
- Create: `runtime/tests/unit/test_transcript_occurrences.py`.
- Read: `runtime/src/agents_runtime/agent_core/responder.py::_as_chat`, `runtime/src/agents_runtime/agent_core/prompt_compiler.py::_conversation_block`, `runtime/scripts/measure_transcript_duplication.py`.

**Interfaces:**

- Consumes: `_read_request(reader: asyncio.StreamReader) -> tuple[str, str, dict, bytes]`; `_as_chat(messages: Sequence[PendingMessage]) -> list[Message]`.
- Produces: mesmas assinaturas; cabeçalho inválido é `ValueError`, corpo incompleto conserva `asyncio.IncompleteReadError`; nenhuma segunda cópia do transcript é introduzida no frame.

- [x] **Step 1 (3 min): Escrever o teste negativo do parser.**

```python
import asyncio
import pytest
from agents_runtime.server import _read_request

@pytest.mark.parametrize("header", [b"broken-header", b"Content-Length: -1",
    b"Content-Length: 1\r\nContent-Length: 2", b"Transfer-Encoding: chunked"])
async def test_rejects_ambiguous_http_framing(header):
    reader = asyncio.StreamReader()
    reader.feed_data(b"POST /internal/preview-prompt HTTP/1.1\r\n" + header + b"\r\n\r\n")
    reader.feed_eof()
    with pytest.raises(ValueError):
        await _read_request(reader)

async def test_accepts_the_preview_request_shape():
    reader = asyncio.StreamReader()
    reader.feed_data(b"POST /internal/preview-prompt HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}")
    reader.feed_eof()
    assert await _read_request(reader) == (
        "POST", "/internal/preview-prompt", {"content-length": "2"}, b"{}")
```

- [x] **Step 2 (2 min): RED.** `uv run --directory runtime pytest tests/unit/test_listener_request_contract.py -q`. Esperado: falha nos cabeçalhos sem dois-pontos/transfer-encoding e duplicidade; registrar a saída, sem transformar defeito em skip.
- [x] **Step 3 (4 min): Endurecer somente o enquadramento que o listener aceita.** Dentro do laço de headers, substituir a atribuição atual pelo fragmento; depois do `int(...)`, rejeitar comprimento negativo.

```python
name, separator, value = line.partition(":")
name = name.strip().lower()
if not separator or not name or name in headers:
    raise ValueError("cabeçalho inválido ou repetido")
if name == "transfer-encoding":
    raise ValueError("transfer-encoding não suportado")
headers[name] = value.strip()
```

```python
if length < 0 or length > MAX_BODY_BYTES:
    raise ValueError("tamanho de corpo inválido para um preview")
```

- [x] **Step 4 (4 min): Acrescentar a trava de contagem usando os dois produtores existentes.** Criar o segundo teste completo abaixo; o script de medição é referência de cenário, não módulo de fixtures.

```python
from agents_runtime.agent_core.responder import _as_chat
from agents_runtime.agent_core.think_gate import PendingMessage
from agents_runtime.agent_core.prompt_compiler import (
    ConversationBlock, _conversation_block,
)

def test_contact_text_occurs_only_in_chat():
    chat = _as_chat((PendingMessage(author="contact", text="sentinela-inbound-63"),))
    assert [m.content for m in chat].count("sentinela-inbound-63") == 1
    block = _conversation_block(ConversationBlock(
        conversation_id="c63", transcript=(("contact", "sentinela-inbound-63"),)), "turn")
    assert "sentinela-inbound-63" not in block.text
```

Esse teste prova contagem de composição, não SQL; a exclusão de pendentes pela query exige o gate DB da Task 2.
- [x] **Step 5 (3 min): Provar sensibilidade e GREEN.** Temporariamente incluir o transcript no texto do bloco por `apply_patch`, executar `uv run --directory runtime pytest tests/unit/test_transcript_occurrences.py -q` e observar a falha; desfazer só essa mutação com `apply_patch`. Executar `uv run --directory runtime pytest tests/unit/test_listener_request_contract.py tests/unit/test_transcript_occurrences.py -q` e `uv run --directory runtime ruff check .`. Esperado: PASS, sem alteração no compilador no diff final.
- [x] **Step 6 (2 min): Commit e revisão.** `git add runtime/src/agents_runtime/server.py runtime/tests/unit/test_listener_request_contract.py runtime/tests/unit/test_transcript_occurrences.py`; `git commit -m "fix: reject ambiguous preview request framing"`. Terra implementa, Sol revisa; rollback por revert deste commit, preservando a evidência de contagem no relatório.

Evidência de 2026-09-14: `fb416860`; RED inicial `5 failed, 2 passed`, RED adicional da revisão `5 failed` para valores ambíguos e `1 failed` para whitespace antes de `:`, GREEN focal `14 passed`, suíte unitária `1717 passed`, Ruff e `git diff --check` verdes. O teste de composição já existente em `test_prompt_compiler_blocks.py` foi fortalecido em vez de criar `test_transcript_occurrences.py`; a mutação do ramo `turn` falhou na representação JSON real e o arquivo de produção foi restaurado pelo hash `d9634587…`. Revisões de especificação e qualidade: PASS/APPROVED.

### Task 2: Fechar a evidência restante do item 63 sem apagar lacunas DB (W3-T1)

**Files:**

- Modify: `runtime/tests/db/test_responder_agent_identity.py`, `runtime/tests/db/test_agent_loaders.py`, `runtime/tests/db/test_toucher.py`.
- Read: `runtime/tests/unit/test_provider_cascade.py`, `runtime/tests/unit/test_agent_llm_closes_after_the_turn.py`, `runtime/tests/db/test_purchase_history.py`, `runtime/tests/db/test_create_coupon_tool.py`, `runtime/src/agents_runtime/repository/missions.py`.
- Modify: `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`, somente subitens da caixa 63.

**Interfaces:**

- Consumes: `build_responder(dsn, *, llm, agent_llm_from_org_keys=True, set_role="worker_role")`; `build_toucher` aceita o mesmo opt-in; `resolve_agent_llm` retorna `ResolvedAgentLlm(port, built_here)`.
- Produces: evidência comportamental da cascata BYO no chamador real e da ausência de duplicação entre `load_recent_transcript(..., exclude_inbound_after_seq=n)` e `load_pending_messages(..., after_seq=n, target_seq=m)`.

- [x] **Step 1 (3 min): Coletar node IDs existentes e conectar aos novos.** `rg -n 'agent_llm_from_org_keys|never_say_ai|load_active_mission|load_mission_event_type|last_order_at|exclude_inbound_after_seq' runtime/tests`. No ledger, ligar BYO/transcript a esta task e os outros seis contratos às Tasks 9–11, com seus node IDs explícitos. Não declarar que `agent_llm_from_org_keys` é uma função: é um argumento dos builders; `resolve_agent_llm` isolado já tem teste.
- [x] **Step 2 (5 min): Acrescentar caso da cascata real no fixture de agente/conversa existente.** Usar `ScriptedLlm`, `create_agent_version`, `create_mission`, `create_message`, `InboundJob` dos testes DB. Configurar agente ativo, missão `whatsapp.received`, mensagem inbound, zero chaves de organização; construir responder com `agent_llm_from_org_keys=True`. Núcleo do teste:

```python
respond = build_responder(dsn, llm=llm, set_role="worker_role",
                          agent_llm_from_org_keys=True)
assert await respond(job) is None
assert llm.asked == []
row = admin.execute(
    "select count(*) from public.alerts where organization_id=%s and type=%s",
    (tenant, "no_org_llm_key"),
).fetchone()
assert row == (1,)
```

Neste arquivo, `job` é `InboundJob(conversation_id=thread.conversation_id, organization_id=tenant, generation=1, target_seq=1)`; `llm = ScriptedLlm()`; `tenant` já cria missão ativa, portanto não criar uma segunda. Criar somente versão ativa, thread e mensagem. Em `runtime/tests/db/test_toucher.py`, acrescentar o mesmo caso através de `_toucher(dsn, llm, agent_llm_from_org_keys=True)(_job(org, thread))`, com `create_mission(admin, org, event_type=FAMILY, status="active")`; o resultado é `TouchDraft`, portanto afirmar `draft.content is None`, `llm.asked == []` e um alerta para `org`.
- [x] **Step 3 (3 min): RED por mutação, operada somente no descartável.** Retirar temporariamente o argumento `agent_llm_from_org_keys=True` do builder do teste: a chamada não deve satisfazer as asserções de zero LLM/alerta. Guardião executa `uv run --directory runtime pytest tests/db/test_responder_agent_identity.py -q`. Restaurar o teste por `apply_patch`; este é endurecimento de cobertura de comportamento que já existe, não motivo para alterar produção.
- [x] **Step 4 (4 min): Acrescentar contagem real ao teste de loaders.** Criar duas inbound, seq 1/2, com textos `historia-63`/`pendente-63`. Dentro de `as_worker(dsn, tenant)`, ler transcript excluindo seq >1 e pending de 1 a 2; afirmar:

```python
assert [m.text for m in transcript + pending].count("pendente-63") == 1
assert [m.text for m in transcript + pending] == ["historia-63", "pendente-63"]
```

Mutar apenas `exclude_inbound_after_seq=1` para `None`; RED esperado: contagem 2. Restaurar o argumento.
- [x] **Step 5 (3 min): GREEN e contabilização honesta.** Guardião executa `uv run --directory runtime pytest tests/db/test_responder_agent_identity.py tests/db/test_agent_loaders.py tests/db/test_toucher.py -q`; verificador executa `uv run --directory runtime pytest tests/unit/test_provider_cascade.py tests/unit/test_agent_llm_closes_after_the_turn.py -q`. A caixa 63 só pode fechar depois das Tasks 9–11; ausência de uma prova mantém a caixa aberta com dono explícito.
- [x] **Step 6 (2 min): Commit.** `git add runtime/tests/db/test_responder_agent_identity.py runtime/tests/db/test_agent_loaders.py runtime/tests/db/test_toucher.py docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`; `git commit -m "test: cover runtime provider wiring and transcript overlap"`. Terra implementa, Sol revisa. Rollback: revert do commit; nenhuma alteração de dados fora da fixture.

Evidência de 2026-09-14: `e147c08e`; as mutações sem o opt-in BYO falharam separadamente no responder e toucher, e `exclude_inbound_after_seq=None` duplicou `pendente-63`. Gate oficial no descartável `6f2e1fbcb1f34204a6c936e2437edbb7`: `64 tests`, zero failures/errors/skips, estado `stopped`, zero contêineres e volumes. A caixa 63 permanece aberta com seis contratos e sete node IDs atribuídos às Tasks 9–11. Revisão independente: zero Critical/Important; duas âncoras documentais menores corrigidas.

### Task 3: Decidir semântica dos guards e seus alertas (W3-T2, decisão)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md`.
- Read: `src/lib/ai/guards.ts`, `src/lib/ai/cloud-runner.ts`, `src/lib/ai/cloud-sender.ts`, `src/lib/ai/conversation-ai-status.ts`, `runtime/src/agents_runtime/agent_core/guards.py`, `runtime/src/agents_runtime/repository/agent.py`.

**Interfaces:**

- Consumes: `GuardState`, `Silence`, `evaluate_inbound_guards`, `isWithinSchedule`, `resolveConversationAiStatus` e a ponte multi-WABA da Onda 2.
- Produces: decisão assinada sobre horário parcial, matching degenerado, alerta suprimido, espelho ausente e agente manual; Task 4 consome os resultados exatos, não preferências inferidas.

- [x] **Step 1 (4 min): Montar a tabela de opções com exemplos concretos.** Horário `hours={start:"08:00"}`: A preserva TS e bloqueia, B completa a ponta ausente e altera os dois motores. `start:"8:00"`/`days:["MON"]`: A preserva comparação textual/case-sensitive do TS, B normaliza nos dois. `cooldown_after_transfer:true`: A rejeita configuração inválida no limite de entrada e ignora valor legado nos dois, B conserva coerção TS `true → 1s`. Keywords `[17,"humano"]`: ignorar elemento inválido sem crash nos dois é tratamento do trust boundary, não lista vazia inteira. Confirmação de handoff: A aplicar blocked_topics também à confirmação, B permitir exclusivamente o texto configurado nesse caminho e declarar a exceção.
- [x] **Step 2 (4 min): Escrever as decisões operacionais separadas.** Guard calado + missão ausente: A manter silêncio e fazer diagnóstico fora do turno, B emitir `no_active_mission` deduplicado sem gerar/chamar LLM. Espelho ausente: A distinguir conversa nova de falha de ponte e bloquear apenas falha, B permitir com alerta explícito; nunca tratar indisponibilidade DB como estado vazio. `activate_on:manual`: A manter e fazer cumprir um agente ativo por organização, B selecionar agente atribuído/canal explicitamente; B exige contrato de seleção revisado antes de alterar `load_active_version`.
- [x] **Step 3 (2 min): RED documental.** `rg -n '^\|.*\| (aprovado|rejeitado) \|' docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md`. Esperado: nenhuma linha aprovada enquanto não houver resposta do usuário. Registrar ausência como decisão pendente, sem código condicionado.
- [x] **Step 4 (3 min): Apresentar opções e coletar aceite.** O documento deve conter para cada linha: escolha, exemplo de entrada/saída, impacto no cliente, dono, resposta do usuário e data. Não inventar resposta. Task 5, que só garante tzdb, pode seguir enquanto Tasks 4/6 aguardam.
- [x] **Step 5 (2 min): GREEN documental e commit após resposta.** O controlador verifica que cada linha possui resposta inequívoca e resultado para entrada válida/inválida; `git add docs/superpowers/specs/2026-09-08-auditoria-ia-guard-decisions.md`; `git commit -m "docs: record guard behavior and alert decisions"`. Sem decisão, este deliverable é evidência de dependência externa, não aprovação da onda. Rollback: nenhuma mudança de produção; nova decisão substitui explicitamente a anterior.

Evidência de 2026-09-14: usuário aprovou o pacote recomendado e o registro versionado entrou em `8c3294ec`, com oito IDs, alternativas rejeitadas, exemplos, impactos, donos e critérios executáveis. Revisões de especificação e qualidade: PASS/APPROVED após retirar validação de horário no writer e explicitar que a Task 6 permanece bloqueada até W2-T5 multi-WABA e um sinal persistido autoritativo; nenhuma heurística por ausência, recência ou telefone foi autorizada.

### Task 4: Fixture compartilhada e paridade comportamental (W3-T2)

**Files:**

- Create: `fixtures/ai-guard-contract.json`.
- Create: `src/lib/ai/__tests__/guard-contract.test.ts`.
- Create: `runtime/tests/unit/test_guard_contract.py`.
- Modify: `src/lib/ai/guards.ts`, `runtime/src/agents_runtime/agent_core/guards.py`.
- Modify: `src/lib/ai/__tests__/cloud-runner-guards.test.ts`, `src/lib/ai/__tests__/conversation-ai-status.test.ts`.

**Interfaces:**

- Consumes: decisões da Task 3; `isWithinSchedule(schedule, now)` contra `is_within_schedule({"schedule": schedule}, now=now)`; fixture com `id`, `now`, `schedule`, `expected`.
- Produces: contrato versionado comum; alias declarado `outside_schedule` no badge = `outside_business_hours` no runtime. Cooldown curto de 5s continua omitido no badge por decisão existente.

- [ ] **Step 1 (4 min): Escrever fixture e dois leitores.** Os quatro casos abaixo já têm resultado definido; acrescentar entradas degeneradas somente com o resultado da decisão aprovada.

```json
[
  {"id":"sem-horario","now":"2026-09-08T12:00:00Z","schedule":null,"expected":true},
  {"id":"abre","now":"2026-09-08T11:00:00Z","schedule":{"hours":{"start":"08:00","end":"18:00"}},"expected":true},
  {"id":"fecha-inclusivo","now":"2026-09-08T21:00:00Z","schedule":{"hours":{"start":"08:00","end":"18:00"}},"expected":true},
  {"id":"apos-fecho","now":"2026-09-08T21:01:00Z","schedule":{"hours":{"start":"08:00","end":"18:00"}},"expected":false}
]
```

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isWithinSchedule } from '../guards'
const cases = JSON.parse(readFileSync('fixtures/ai-guard-contract.json', 'utf8'))
describe('contrato comum de horários', () => {
  for (const c of cases) it(c.id, () => {
    expect(isWithinSchedule(c.schedule, new Date(c.now))).toBe(c.expected)
  })
})
```

```python
import json
from datetime import datetime
from pathlib import Path
import pytest
from agents_runtime.agent_core.guards import is_within_schedule

CASES = json.loads((Path(__file__).resolve().parents[3] /
                   "fixtures/ai-guard-contract.json").read_text(encoding="utf-8"))
@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_shared_schedule(case):
    assert is_within_schedule({"schedule": case["schedule"]},
        now=datetime.fromisoformat(case["now"])) is case["expected"]
```

O índice `parents[3]` é intencional: para `runtime/tests/unit/test_guard_contract.py`, `[0]` é `unit`, `[1]` é `tests`, `[2]` é `runtime` e `[3]` é a raiz do worktree. Ambos os leitores abrem exatamente `fixtures/ai-guard-contract.json`; não criar cópia em `runtime/fixtures`.

- [ ] **Step 2 (3 min): RED nas entradas divergentes aprovadas.** `pnpm exec vitest run src/lib/ai/__tests__/guard-contract.test.ts`; `uv run --directory runtime pytest tests/unit/test_guard_contract.py -q`. Esperado: pelo menos um lado falha em ponta ausente, hora sem zero ou dia maiúsculo. Se o aceite preservou TS, é Python que deve falhar; se normalizou, TS deve falhar.
- [ ] **Step 3 (5 min): Aplicar o branch aprovado para horários.** Branch preservar TS: em Python, quando `hours` existe, exigir `start/end` strings e comparar com `local.strftime("%H:%M")`, sem normalizar dias. Branch normalizar: em TS, completar cada ponta separadamente, normalizar `H:MM` com `padStart(5,'0')`, e usar `.map(d => d.toLowerCase())`; manter limites inclusivos e a mesma reação aprovada a fuso inválido nos dois lados. Fragmento do branch preservar TS:

```python
hours = schedule.get("hours")
if isinstance(hours, Mapping):
    start, end = hours.get("start"), hours.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        return False
else:
    start, end = DEFAULT_SCHEDULE_START, DEFAULT_SCHEDULE_END
if not start <= local.strftime("%H:%M") <= end:
    return False
```

- [ ] **Step 4 (4 min): Travar matching degenerado e aplicar o branch.** Nos testes TS/Python, usar palavra `ATÊNDENTE`, lista `[17,"atendente"]`, cooldown booleano e uma confirmação que contenha tópico proibido. Em TS ignorar itens não-string antes de `normalizeForMatch`; no branch que conserva coerção, Python usa `float(value)` também para bool. No branch que rejeita booleano, TS deve executar `if (typeof params.cooldownSeconds === 'boolean') return false` antes de `Number`. Testar a confirmação através de `cloud-sender` e `resolve_handoff`/responder, não apenas o matcher puro.
- [ ] **Step 5 (5 min): Estender fixture para guards de estado e consumidores reais.** Casos obrigatórios: IA desligada; agente manual atribuído/outro/ausente; cooldown 299/300s; teto 2 com contagem 1/2; humano existente com knob ausente/false; conflito cooldown+teto (cooldown vence). Alimentar os mocks existentes do runner e badge com os mesmos valores e comparar `skipped`/`reason` com o Python. Acrescentar `expected_badge` explícito para o cooldown curto; não forçar paridade numa exceção já documentada. Cada caso usa o relógio fixo `2026-09-08T12:00:00Z`, sem relógio real.
- [ ] **Step 6 (3 min): GREEN, commit e revisão.** `pnpm exec vitest run src/lib/ai/__tests__`; `pnpm typecheck`; `uv run --directory runtime pytest tests/unit/test_guard_contract.py tests/unit/test_behavior_guards.py -q`; `uv run --directory runtime ruff check .`. Commit `test: enforce shared guard contracts across runtimes`, com `git add` restrito aos arquivos desta task. Terra implementa/Sol revisa. Rollback atômico de fixture + ambos os motores, nunca só um lado.

### Task 5: Declarar o banco de fusos como dependência (W3-T2)

**Files:**

- Modify: `runtime/pyproject.toml`, `runtime/uv.lock`.
- Create: `runtime/tests/unit/test_timezone_database.py`.

**Interfaces:**

- Consumes: `zoneinfo.ZoneInfo` da stdlib; `tzdata` fornece dados quando o sistema operacional não os tem.
- Produces: `ZoneInfo("America/Sao_Paulo")` disponível também sem tzdb do sistema; não altera política de timezone digitado errado.

- [x] **Step 1 (3 min): Escrever prova de fallback real.**

```python
from datetime import datetime
from zoneinfo import ZoneInfo, reset_tzpath

def test_packaged_tzdb_without_os_database():
    try:
        reset_tzpath(())
        ZoneInfo.clear_cache()
        zone = ZoneInfo("America/Sao_Paulo")
        assert datetime(2026, 9, 8, 12, tzinfo=zone).utcoffset().total_seconds() == -10800
    finally:
        reset_tzpath()
        ZoneInfo.clear_cache()
```

- [x] **Step 2 (2 min): RED em ambiente limpo.** `uv run --directory runtime pytest tests/unit/test_timezone_database.py -q`. Esperado: `ZoneInfoNotFoundError` se nenhuma dependência transitiva já trouxe tzdata. Se passar por transitiva, registrar `uv tree --directory runtime` e provar ausência em instalação de produção isolada antes da dependência direta, sem remover pacote do ambiente do usuário.
- [x] **Step 3 (2 min): Declarar dependência direta.** Adicionar `"tzdata",` a `project.dependencies` por `apply_patch`; `uv lock --directory runtime`. O lock resolve versão real; não inventar versão ou baixar assets manualmente.
- [x] **Step 4 (2 min): GREEN.** `uv run --directory runtime pytest tests/unit/test_timezone_database.py tests/unit/test_behavior_guards.py -q`; `uv run --directory runtime ruff check .`. Onda 6 repete na imagem e no Windows.
- [x] **Step 5 (2 min): Commit.** `git add runtime/pyproject.toml runtime/uv.lock runtime/tests/unit/test_timezone_database.py`; `git commit -m "fix: ship timezone data with the runtime"`. Luna medium implementa, Sol revisa. Rollback: revert dos três arquivos juntos; não apagar tzdb do SO.

Evidência de 2026-09-14: `1f7c7107`; no lock anterior `tzdata` vinha apenas por `psycopg` no Windows e a resolução Linux de produção o removia. Depois da dependência direta, exportação `--locked --no-dev` inclui `tzdata==2026.3`; `61 passed` no gate focal, `1719 passed` na suíte unitária e Ruff verde. Docker estava indisponível e não deixou recursos; a imagem será repetida no gate da Onda 6. Revisões de especificação e qualidade: PASS/APPROVED.

### Task 6: Guard state econômico, alerta e identidade (W3-T2, condicional)

**Files:**

- Modify: `runtime/src/agents_runtime/repository/agent.py::load_legacy_guard_state`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`.
- Create: `supabase/migrations/20260910030000_guard_state_contract.sql`, namespace reservado após W2; confirmar ausência de colisão no manifesto da Onda 0.
- Modify: `runtime/tests/db/test_legacy_guard_state.py`, `runtime/tests/db/test_responder_guards.py`.
- Read: última definição de `internal.legacy_conversation_guard_state` após a Onda 2; não restaurar a assinatura antiga e perder WABA.

**Interfaces:**

- Consumes: identidade de conta aprovada na Onda 2 e decisões da Task 3.
- Produces: parâmetros finais booleanos `p_count_bot boolean default true`, `p_check_human boolean default true` adicionados à assinatura vigente da RPC; wrapper Python aceita `count_bot: bool = True`, `check_human: bool = True`. Defaults preservam chamadores anteriores; os dois produtores passam flags do agente.

- [ ] **Step 1 (4 min): RED de contagem desligada com cooldown ativo.** No teste DB existente, montar conversa com uma resposta humana e duas do bot; fixar o timestamp do último bot em `2026-09-08T11:59:58Z`. Chamar a nova assinatura com `false,false`; esperar count=0, human=false e timestamp preservado. Com `true,true`, esperar 2/true e o mesmo timestamp. Construir `GuardState` da primeira resposta e afirmar:

```python
silence = evaluate_inbound_guards({}, state, agent_id=state.ai_agent_id,
    now=datetime(2026, 9, 8, 12, tzinfo=UTC))
assert state.bot_message_count == 0
assert state.last_bot_message_at == datetime(2026, 9, 8, 11, 59, 58, tzinfo=UTC)
assert silence is not None and silence.reason == "cooldown"
```

Importar `UTC, datetime` de `datetime` e `evaluate_inbound_guards` de guards. Comando guardião: `uv run --directory runtime pytest tests/db/test_legacy_guard_state.py -q`; RED inicial: assinatura ausente. RED contra implementação ingênua que condiciona a lateral antiga inteira: timestamp None e cooldown ausente. Ambos os resultados devem aparecer no report antes do GREEN.
- [ ] **Step 2a (5 min): Separar count e último timestamp em consultas diferentes.** A lateral atual projeta `count(*)` E `max(wcm."timestamp")`; colocar o knob nela apagaria o cooldown. Na nova definição baseada na última migration W2, substituir essa lateral pelas duas abaixo, mantendo a resolução WABA de W2 e a projeção `coalesce(bot.total,0)::integer, last_bot.last_at`:

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

O filtro de null preserva a semântica de `max(timestamp)`. A lateral humana conserva `limit 1` e ganha `and p_check_human`. Acrescentar parâmetros ao final da assinatura vigente e ajustar todos os grants/revokes; manter `SECURITY DEFINER`, `search_path` e organização.

- [ ] **Step 2b (3 min): Passar os knobs pelos dois produtores e wrapper.**

```python
from agents_runtime.agent_core.guards import _number, behavior_of

behavior = behavior_of(version.settings if version is not None else {})
count_bot = (_number(behavior.get("max_messages_per_conversation"), 0) or 0) > 0
check_human = behavior.get("stop_on_human_reply") is not False
```

O parser `_number` já existe em guards e mantém a semântica aprovada na Task 3, incluindo jsonb inválido. O fallback para versão ausente preserva o caminho que em seguida levanta `NoActiveVersion`, sem criar AttributeError antes dele.
- [ ] **Step 3 (5 min): Executar somente o branch aprovado para alertas.** Se escolhido diagnóstico de missão apesar do silêncio, usar `alerts_repo.open_alert` antes do return silencioso, quando as missões já carregadas são ausentes, em transação escopada; `type=NO_ACTIVE_MISSION`, `severity="warning"`, `dedup_key=f"no-active-mission:{job.conversation_id}"`. Não mover LLM/RAG antes dos guards. Se escolhido diagnóstico fora do turno, registrar no documento o consumidor efetivamente confirmado; não criar worker sem consumidor. O teste deve invocar duas vezes o mesmo cenário e afirmar `count(*)=1`, zero LLM e zero outbox.
- [ ] **Step 4 (5 min): Executar somente o branch aprovado para espelho ausente/manual.** Se a decisão distinguir ponte quebrada, `row is None` do wrapper passa a retornar `None`, tipo `GuardState | None`; tratar isso explicitamente nos dois produtores com o alerta/ação aprovados. Nova conversa deve ter caso positivo distinto de conta/conversa incompatíveis. Se manual exige seleção por canal/agente, inserir primeiro no documento o contrato com a assinatura real definida na Onda 2; sem esse contrato não escrever fallback de “agente mais recente”. Para opção de um agente por org, provar e fazer cumprir a restrição já aprovada, sem inventar índice sobre uma tabela/coluna diferente da versão ativa real.
- [ ] **Step 5 (3 min): GREEN e prova de plano SQL.** Guardião executa `uv run --directory runtime pytest tests/db/test_legacy_guard_state.py tests/db/test_responder_guards.py -q` e `EXPLAIN (ANALYZE, BUFFERS)` da consulta interna com `false,false` versus `true,true`, dentro do descartável: count/human desligados não varrem mensagens, enquanto a consulta separada do último bot continua retornando timestamp. Repetir casos positivos/negativos de tenant e WABA da Onda 2. Registrar esses resultados após replay do zero e após upgrade sequencial W0→W1→W2→W3, incluindo assinaturas/grants; chamar só a função PL/pgSQL no EXPLAIN não mostra o plano das laterais.
- [ ] **Step 6 (2 min): Commit e compensação.** Commit `fix: apply guard policy without redundant message scans`, arquivos desta task somente. Sol implementa/Astra revisa. Rollback em código por revert; compensação SQL restaura assinatura/corpo anteriores preservando WABA e remove apenas overload novo após provar zero chamadores. Nada de editar migrations já aplicadas ou apagar dados de mensagens/alertas.

### Task 7: Decidir prazos e consequência de cancelamento (W3-T3, decisão)

**Files:**

- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-timeout-decisions.md`.
- Read: `runtime/src/agents_runtime/config.py`, `runtime/src/agents_runtime/queueing/worker.py`, `runtime/src/agents_runtime/server.py::HealthConnection`, `runtime/DEPLOY.md`, `render.yaml`.

**Interfaces:**

- Consumes: VT 60s, heartbeat 45s, lease 120s e limite de 16 chamadas existente; limites por chamada não são limites por turno.
- Produces: valores aprovados `turn_timeout_seconds`, `connect_timeout_seconds`, `statement_timeout_ms`, prazo do probe e prazo de cleanup; política de retry/alerta pós-timeout. Esses nomes são os campos do registro de decisão, não configuração pública já existente.

- [x] **Step 1 (3 min): Coletar evidência autorizada.** Ler cadência/timeout do probe do Render e latências existentes, sem valores de env/DSN no relatório. Se indisponível, registrar dependência externa, não fabricar medição.
- [x] **Step 2 (4 min): Comparar opções.** Turno: A teto único para responder e toque, B tetos por tipo de job; conexão: A valor na composição comum, B valor no DSN documentado; statement: A `SET statement_timeout` por conexão após `SET ROLE`, B `ALTER ROLE` com prova de que `SET ROLE` realmente aplica o parâmetro (não presumir que aplique). Preferência técnica é A/A/A por cobertura dos quatro conectores, sem substituir escolha de valores. Ao cancelar: retry transitório com lease liberada versus arquivamento com alerta; usuário escolhe a consequência.
- [x] **Step 3 (2 min): RED documental.** Antes do aceite, afirmar no ledger que não existem valores aprovados; `rg -n 'aprovado|probe|cleanup' docs/superpowers/specs/2026-09-08-auditoria-ia-timeout-decisions.md` deve expor a ausência, não um default silencioso.
- [x] **Step 4 (3 min): Registrar resposta e critério GREEN.** Critério: unidade e faixa de cada valor, teto de cleanup, ordem connect/statement/probe e comportamento pós-timeout inequívocos, com responsável/data. Só depois liberar Task 8.
- [x] **Step 5 (2 min): Commit.** `git add docs/superpowers/specs/2026-09-08-auditoria-ia-timeout-decisions.md`; `git commit -m "docs: record runtime timeout budgets"`. Controlador Astra conduz; revisor Astra independente. Rollback é nova decisão versionada, sem efeito externo.

Evidência de 2026-09-14: usuário aprovou teto único de turno 90s, conexão 3s nas quatro portas, statement 15000ms por sessão após `SET ROLE`, probe 4s, cleanup independente 10s e retry transitório com lease liberada. Registro `3cc07e4d`; documentação oficial do Render confirma resposta de health em até 5s e shutdown padrão de 30s, enquanto p95/p99 de produção permanecem não medidos. Revisões Spec/Quality: PASS/APPROVED após corrigir 5/3/2 como retentativas (6/4/3 execuções) e incluir preflight, HealthConnection e cenário pipeline C no escopo modificável da Task 8.

### Task 8: Envelopar os dois turnos e todas as conexões (W3-T3)

**Files:**

- Modify: `runtime/src/agents_runtime/config.py`, `runtime/src/agents_runtime/queueing/worker.py`, `runtime/src/agents_runtime/app.py::_connect`, `runtime/src/agents_runtime/server.py::_connection`, `runtime/src/agents_runtime/__main__.py`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`.
- Create: `runtime/tests/unit/test_turn_time_limit.py`.
- Modify: `runtime/tests/unit/test_healthz_reuses_one_connection.py`, `runtime/tests/unit/test_listener_connects_in_one_guarded_place.py`, `runtime/tests/db/test_server.py`.
- Modify: `runtime/tests/db/test_startup_rls_guard.py`.
- Modify: `runtime/tests/pipeline/test_scenarios_c.py`.
- Create: `runtime/tests/db/test_database_time_limits.py`.
- Read: `runtime/tests/unit/test_agent_llm_closes_after_the_turn.py`, `runtime/tests/pipeline`.

**Interfaces:**

- Consumes: valores da Task 7; configuração injetável `QueueingConfig` e factories reais; `_turn`, `_touch` fazem cleanup antes de propagar exceção.
- Produces: `QueueingConfig.turn_timeout: timedelta`, lido por `config_from_env` via `AGENTS_TURN_TIMEOUT_MS`; mesmos retornos `TurnResult`. `TimeoutError` segue apenas a consequência aprovada; `CancelledError` externo nunca vira sucesso.

- [ ] **Step 1 (5 min): Escrever teste de cancelamento determinístico.** No novo teste unit, usar `AsyncMock` para engine e um contexto transacional assíncrono vazio, `SimpleNamespace` para claim com `version=1,last_processed_seq=0`, e `asyncio.Event` no responder. Parametrizar `_turn` e `_touch`. Config de teste `turn_timeout=timedelta(milliseconds=10)`; a rotina responde apenas quando cancelada e marca `closed.set()` no `finally`. Asserções centrais:

```python
with pytest.raises(TimeoutError):
    await run_turn(conn, job, stuck, config=config, clock=clock)
assert closed.is_set()
engine.release_lease.assert_awaited_once()
engine.conclude_turn.assert_not_awaited()
```

Configurar explicitamente mocks de `runtime_rollout_is_enabled=True`, `claim_conversation`, `scope_to_organization`, `renew_lease`, `release_lease`; para toque também `outbox_key_exists=False` e `turn_pointers=(1,1)`. `conn.transaction()` fornece o contexto async sem SQL; usar `SystemClock` de `agents_runtime.clock` para o sleep do keepalive ceder o event loop. Não usar `FrozenClock.sleep` aqui: ele retorna imediatamente e, com mocks também imediatos, faria o laço girar sem permitir timeout. Acrescentar sucesso antes do prazo e cancelamento externo, verificando nenhuma task de keepalive pendente criada pelo caso.
- [ ] **Step 2 (2 min): RED.** `uv run --directory runtime pytest tests/unit/test_turn_time_limit.py -q`. Esperado inicial: `QueueingConfig` rejeita `turn_timeout`; depois do campo, a prova deve falhar por não cancelar. O teste possui deadline externo apenas para terminar com falha, nunca para produzir o timeout afirmado.
- [ ] **Step 3 (4 min): Implementar o envelope stdlib nos dois produtores.** Copiar o valor aprovado da Task 7 para o default da configuração; validar override positivo/finito. Dentro do `try/finally` que já mata o keepalive:

```python
async with asyncio.timeout(config.turn_timeout.total_seconds()):
    content = await respond(job)
```

```python
async with asyncio.timeout(config.turn_timeout.total_seconds()):
    draft = await toucher(job)
```

Não envolver a liberação de lease no mesmo deadline já vencido. Cleanup tem o teto independente aprovado e erro de cleanup preserva a causa original em log/exceção encadeada.
- [ ] **Step 4 (5 min): RED de statement e conexão.** Teste de conexão inspeciona kwargs passados a `psycopg.AsyncConnection.connect` nos quatro lugares, após monkeypatch, e exige o connect timeout aprovado. Teste DB executa `select pg_sleep(0.1)` numa conexão de teste configurada com `statement_timeout=20` ms; deve levantar `psycopg.errors.QueryCanceled` e uma transação seguinte deve retornar `select 1 = 1`. Esses 20ms são exclusivamente do teste, não a decisão de produção. Aguardar resposta de health após timeout deve produzir 503 e permitir reconnect no probe seguinte.
- [ ] **Step 5 (5 min): Aplicar a estratégia aprovada em todas as portas.** Branch A de conexão passa `connect_timeout` positivo como kwarg nas quatro chamadas existentes. Branch A de statement usa após `SET ROLE`:

```python
await conn.execute("select set_config('statement_timeout', %s, false)",
                   (str(statement_timeout_ms),))
```

`statement_timeout_ms` vem da configuração aprovada lida na composição; se criar helper de configuração, nomeá-lo no brief e usar o mesmo em todas as portas, sem mover SQL para fora do repository contra o Import Linter. Branch B conserva DSN real fora dos artefatos e exige prova por `SHOW statement_timeout` depois da troca de papel; se essa prova falhar, não declarar cobertura e devolver a estratégia ao controlador. Não promover env em ambiente externo nesta task.
- [ ] **Step 6 (3 min): GREEN.** `uv run --directory runtime pytest tests/unit/test_turn_time_limit.py tests/unit/test_agent_llm_closes_after_the_turn.py -q`; `uv run --directory runtime ruff check .`; `uv run --directory runtime lint-imports`. Guardião executa `uv run --directory runtime pytest tests/db/test_startup_rls_guard.py tests/db/test_database_time_limits.py -q` e os cenários pipeline de lease, retry e cancelamento da Onda 2. Nenhuma exceção escondida ou repetição até passar.
- [ ] **Step 7 (2 min): Commit e rollback.** `git add` apenas arquivos efetivamente alterados acima; `git commit -m "fix: bound runtime turns and database waits"`. Sol implementa, Astra revisa. Reverter código/configuração juntos; para eventual `ALTER ROLE` aprovado, compensar somente os dois roles exatos para o valor anterior registrado. Timeout unitário verde não substitui cancelamento DB real.

### Task 9: Missão por evento e data da última compra (W3-T1, item 63)

**Files:**

- Create: `runtime/tests/db/test_mission_event_selection.py`.
- Modify: `runtime/tests/db/test_purchase_history.py`.
- Read/mutação temporária: `runtime/src/agents_runtime/repository/missions.py::load_active_mission`, `load_mission_event_type`; `runtime/src/agents_runtime/repository/orders.py::load_purchase_history`.

**Interfaces:**

- Consumes: `load_active_mission(conn, *, event_type: str) -> MissionVersion | None`, `load_mission_event_type(conn, *, mission_version_id: UUID) -> str | None`, `load_purchase_history(conn, *, organization_id: UUID, contact_id: UUID) -> PurchaseHistory | None`.
- Produces: provas DB dos predicados vivos; `last_order_at` é o máximo de `coalesce(shopify_created_at,created_at)`, não só qualquer data não-nula.

- [x] **Step 1 (5 min): Escrever teste de duas famílias ativas e uma ausente.** O novo arquivo importa `uuid`, `pytest`, `create_tenant/create_mission`, `as_worker` e `missions_repo`; fixture `tenant` cria organização e a remove no teardown, pelo padrão de `test_agent_loaders.py`. Corpo:

```python
async def test_mission_is_selected_by_event_family(dsn, admin, tenant):
    discovery = create_mission(admin, tenant, event_type="whatsapp.received",
                               status="active", objective="descobrir")
    cart = create_mission(admin, tenant, event_type="cart.abandoned",
                         status="active", objective="recuperar")
    draft = create_mission(admin, tenant, event_type="cart.abandoned", status="draft")
    async with as_worker(dsn, tenant) as conn:
        selected = await missions_repo.load_active_mission(conn, event_type="cart.abandoned")
        assert selected.id == str(cart) and selected.objective == "recuperar"
        assert (await missions_repo.load_active_mission(
            conn, event_type="whatsapp.received")).id == str(discovery)
        assert await missions_repo.load_active_mission(conn, event_type="order.cancelled") is None
        assert await missions_repo.load_mission_event_type(conn, mission_version_id=draft) == "cart.abandoned"
        assert await missions_repo.load_mission_event_type(conn, mission_version_id=uuid.uuid4()) is None
```

Adicionar org B com missão ativa da mesma família e chamar os dois loaders sob A: resultado ativo continua `cart`, lookup do UUID B retorna None. Teardown de B em `finally`, sem apagar outras organizações.
- [x] **Step 2 (3 min): RED por mutação da seleção, sem reescrever implementação correta.** Temporariamente substituir `where event_type = %s` por `where (%s::text is not null)` em `missions.py`, preservando aridade de parâmetros. Guardião roda `uv run --directory runtime pytest tests/db/test_mission_event_selection.py -q`; a família ausente deixa de retornar None ou a ativa errada é selecionada. Restaurar com `apply_patch`. Mutar `load_mission_event_type` para retornar constante `whatsapp.received`; a asserção do draft cart deve falhar; restaurar.
- [x] **Step 3 (5 min): Escrever teste do máximo com datas fixas e fallback.** Em `test_purchase_history.py`, aproveitar fixture `tenant`, `_load` e fábricas; importar `UTC,datetime`:

```python
async def test_last_order_is_max_of_shopify_time_or_local_time(dsn, admin, tenant):
    store = create_store(admin, tenant)
    contact = create_contact(admin, tenant)
    old = create_order(admin, tenant, store, contact_id=contact, name="#old")
    latest = create_order(admin, tenant, store, contact_id=contact, name="#fallback")
    admin.execute("update public.shopify_orders set shopify_created_at=%s, created_at=%s where id=%s",
        (datetime(2026, 8, 1, tzinfo=UTC), datetime(2026, 9, 8, tzinfo=UTC), old))
    admin.execute("update public.shopify_orders set shopify_created_at=null, created_at=%s where id=%s",
        (datetime(2026, 9, 2, tzinfo=UTC), latest))
    history = await _load(dsn, tenant, contact)
    assert history.last_order_at == datetime(2026, 9, 2, tzinfo=UTC)
    assert [row.label for row in history.recent] == ["#fallback", "#old"]
```

Este par distingue `min`, `max(created_at)` e `max(shopify_created_at)`, além de exigir a ordem do `coalesce` correta.
- [x] **Step 4 (3 min): RED do agregado.** Guardião roda `uv run --directory runtime pytest tests/db/test_purchase_history.py -k last_order_is_max -q` com mutação temporária de `max(coalesce(o.shopify_created_at, o.created_at))` para `min(coalesce(o.shopify_created_at, o.created_at))`: esperado data 01/08 em vez de 02/09. Restaurar e repetir mutação para `max(o.created_at)`: esperado 08/09 incorreto; restaurar. Sem mudança permanente de produção se os testes originais já passam.
- [x] **Step 5 (3 min): GREEN.** `uv run --directory runtime pytest tests/db/test_mission_event_selection.py tests/db/test_purchase_history.py -q`, somente pelo guardião; `uv run --directory runtime ruff check .`. Report registra ambos REDs e diff sem mutações de produção.
- [x] **Step 6 (2 min): Commit/review/rollback.** `git add runtime/tests/db/test_mission_event_selection.py runtime/tests/db/test_purchase_history.py`; `git commit -m "test: prove mission selection and latest purchase aggregate"`. Terra implementa/Sol revisa; rollback por revert do commit de testes.

Evidência de 2026-09-14: `55600c15`; quatro mutações RED distinguiram família errada, event type constante, `min(coalesce(...))` e `max(created_at)`. Gate oficial no descartável `d7baff101d8943a9a44ad2050dedbbae`: `8 tests`, zero failures/errors/skips, estado `stopped`, zero contêineres e volumes. Diff de produção vazio; revisões de especificação e qualidade: PASS/APPROVED.

### Task 10: Fiação de never_say_ai e ferramenta desconhecida (W3-T1, item 63)

**Files:**

- Modify: `runtime/tests/db/test_responder_agent_identity.py`, `runtime/tests/db/test_toucher.py`, `runtime/tests/db/test_responder_tool_loop.py`.
- Read/mutação temporária: `runtime/src/agents_runtime/repository/agent.py::load_tenant_policy`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`.

**Interfaces:**

- Consumes: `TenantSettings.never_say_ai`, `JudgeContext(never_say_ai: bool=True)`, builders reais e `AgentConfig.enabled_tools` lido de `ai_agent_versions.settings`.
- Produces: prova dos dois call sites do juiz com valores true/false e do literal true do loader; nome inexistente não é oferecido/executado, preservando o comportamento vigente documentado no `FORK.md:264`. Transformar nome inválido em erro de produto exige decisão separada; o teste não ressuscita registry apagado nem presume essa decisão.

- [x] **Step 1 (5 min): Capturar o contexto criado pelo responder real.** Em `test_responder_agent_identity.py`, criar `async def test_responder_never_say_ai_reaches_judge(dsn,admin,tenant,monkeypatch,configured)` com `@pytest.mark.parametrize("configured", [True, False])`; importar `replace` de dataclasses, `responder as responder_module` de agent_core, `agent as agent_repo` de repository e `JudgeContext as RealJudgeContext` de judges.pre_send. A fixture tenant já tem missão ativa; criar agente ativo antes de chamar `_system_prompt`. Corpo central:

```python
real_load = agent_repo.load_tenant_policy
seen = []
async def load_policy(conn, *, organization_id):
    policy = await real_load(conn, organization_id=organization_id)
    assert policy.never_say_ai is True
    return replace(policy, never_say_ai=configured)
def capture_context(**kwargs):
    context = RealJudgeContext(**kwargs)
    seen.append(context.never_say_ai)
    return context
monkeypatch.setattr(agent_repo, "load_tenant_policy", load_policy)
monkeypatch.setattr(responder_module, "JudgeContext", capture_context)
create_agent_version(admin, tenant, status="active")
await _system_prompt(dsn, admin, tenant)
assert seen == [configured]
```

`load_policy` chama o loader real e afirma o literal; a troca controlada false testa o fio até o construtor que será entregue ao juiz, não um contexto criado só no teste.
- [x] **Step 2 (5 min): Repetir o fio no toucher real com cenário próprio.** Em `test_toucher.py`, criar `async def test_toucher_never_say_ai_reaches_judge(dsn,admin,org,monkeypatch,configured)` parametrizado true/false. Usar wrapper `load_policy` que chama o loader real, afirma seu literal true e retorna `replace(policy,never_say_ai=configured)`; `capture_context` constrói `RealJudgeContext(**kwargs)`, acrescenta `context.never_say_ai` a `seen` e retorna o objeto. Aplicar monkeypatch em `agent_repo.load_tenant_policy` e `toucher_module.JudgeContext`. A fixture `org` já cria versão ativa; montar `thread=create_thread(admin,org)` e `create_mission(admin,org,event_type=FAMILY,status="active")`. Invocar `await _toucher(dsn, ScriptedLlm())(_job(org,thread))` e `assert seen == [configured]`. Não criar segunda versão ativa na fixture org.
- [x] **Step 3 (3 min): RED dos dois fios e do literal.** Guardião executa `uv run --directory runtime pytest tests/db/test_responder_agent_identity.py tests/db/test_toucher.py -k never_say -q`. Para sensibilidade, remover temporariamente `never_say_ai=settings.never_say_ai` de cada call site por vez: o caso false deve falhar em cada arquivo. Mutar o literal SQL `true` de `load_tenant_policy` para `false`: ambos detectam a quebra. Restaurar somente as mutações por `apply_patch`; testes que eram verde de início são cobertura, não pretexto para mudar comportamento.
- [x] **Step 4 (5 min): Escrever teste do nome inexistente pelo fluxo vivo.** Em `test_responder_tool_loop.py`, adicionar ao fixture tenant já existente o nome em `ai_agent_versions.settings`, preservando `create_coupon`:

```python
async def test_unknown_enabled_tool_is_never_offered(dsn, admin, tenant):
    admin.execute("update public.ai_agent_versions set settings=%s where organization_id=%s",
        (psycopg.types.json.Jsonb({"tools":{"enabled":["create_coupon", "unknown_63"]}}), tenant))
    create_mission(admin, tenant, event_type="whatsapp.received", status="active",
                   enabled_tools=["create_coupon", "unknown_63"])
    thread = create_thread(admin, tenant)
    llm = ScriptedLlm(reply="Tudo certo")
    result = await _respond(dsn, admin, tenant, thread, llm)
    assert result["text"] == "Tudo certo"
    names = [tool.name for request in agent_calls(llm) for tool in request.tools]
    assert "create_coupon" in names
    assert "unknown_63" not in names
    assert admin.execute("select count(*) from internal.tool_calls where conversation_id=%s and tool_name=%s",
        (thread.conversation_id, "unknown_63")).fetchone() == (0,)
```

Complementar com LLM double que retorne `ToolCall(id="bad",name="unknown_63",arguments={})` mesmo sem oferta: o segundo request deve conter role=tool com `tool desconhecida: unknown_63`, sem tool_calls persistida para ela. Usar subclasse de `ScriptedLlm` apenas para a primeira chamada não-JUDGE_MODEL; chamadas de juiz delegam à implementação original.
- [x] **Step 5 (3 min): RED/GREEN do desconhecido.** Mutação temporária: acrescentar `ToolSpec(name="unknown_63",description="mutante",parameters={})` ao `tool_specs` do responder; comando `uv run --directory runtime pytest tests/db/test_responder_tool_loop.py -k unknown_enabled -q` deve falhar. Restaurar. Se usuário aprovar rejeitar desconhecido em configuração, registrar escolha e só então substituir expectativa por erro explícito no writer de configuração, com teste da rota; este plano não toma essa decisão.
- [x] **Step 6 (3 min): Gate e commit.** Guardião roda `uv run --directory runtime pytest tests/db/test_responder_agent_identity.py tests/db/test_toucher.py tests/db/test_responder_tool_loop.py -q`; Ruff. `git add` dos três arquivos e `git commit -m "test: cover judge policy wiring and unknown tools"`. Terra implementa/Sol revisa; rollback é revert dos testes, sem mudança em configuração real.

Evidência de 2026-09-14: `9e47145a`; quatro mutações RED detectaram a remoção de cada fio de `never_say_ai`, a troca do literal do loader e a oferta artificial da tool desconhecida. Gate oficial no descartável `f76cc8efd18f4ae089b4d7160f027635`: `26 tests`, zero failures/errors/skips, estado `stopped`, zero contêineres e volumes. Diff permanente limitado aos três arquivos de teste; revisões de especificação e qualidade: PASS/APPROVED.

### Task 11: Identidade da tool na trilha e conversa alheia fora do RAG (W3-T1, item 63)

**Files:**

- Modify: `runtime/tests/db/test_tools.py`, `runtime/tests/db/test_create_coupon_tool.py`.
- Read/mutação temporária: `runtime/src/agents_runtime/tools/base.py::run_tool`, `runtime/src/agents_runtime/tools/coupon.py::CreateCoupon.__call__`, `runtime/src/agents_runtime/repository/contacts.py::contact_id_of_conversation`.

**Interfaces:**

- Consumes: `run_tool(conn, tool, ToolContext, arguments, *, clock) -> ToolResult`, `ToolResult(tool,success,output,error)` e `CreateCoupon` real.
- Produces: o `tool_name` persistido corresponde à tool executada, não à chave do lookup; conversa B fornecida com contexto A não revela contato, cupom ou grant e não chama provedor.

- [x] **Step 1 (5 min): Escrever divergência real de alias/nome.** Em `test_tools.py`, usar o `_recorded` e fixtures existentes:

```python
async def test_trail_uses_tool_identity_not_lookup_alias(dsn, admin, tenant):
    class NamedTool:
        name = "canonical_63"
        async def __call__(self, conn, context, arguments):
            return tools.ToolResult(tool=self.name, success=True, output={"ok":True})
    thread = create_thread(admin, tenant)
    lookup = {"alias_63": NamedTool()}
    async with as_runtime_worker(dsn) as conn:
        result = await tools.run_tool(conn, lookup["alias_63"],
            _context(tenant, thread.conversation_id), {}, clock=FrozenClock(START))
    assert result.tool == "canonical_63"
    (row,) = await _recorded(admin, thread.conversation_id)
    assert row[0] == "canonical_63"
    assert row[0] != "alias_63"
```

O registry de produção não é recriado: o dicionário do teste torna a divergência explícita no ponto de execução que já recebe a instância de tool.
- [x] **Step 2 (3 min): RED de identidade e GREEN focal.** Mutar temporariamente `tool_name=result.tool` em `run_tool` para `tool_name="alias_63"`; guardião roda `uv run --directory runtime pytest tests/db/test_tools.py -k lookup_alias -q`, esperado falha canonical versus alias. Restaurar exatamente a linha; executar novamente e exigir PASS. Implementação mínima permanente é nenhuma se o contrato atual passar.
- [x] **Step 3 (5 min): Escrever negativo numa tool de dinheiro real sem emitir dinheiro.** Em `test_create_coupon_tool.py`, usar fixture org, `_mission`, `_tool`, `_shopify_transport` e `create_thread`:

```python
async def test_coupon_cannot_read_a_foreign_conversation(dsn, admin, org):
    foreign_org = create_tenant(admin)
    try:
        own = create_thread(admin, org)
        foreign = create_thread(admin, foreign_org)
        mission_id = create_mission(admin, org, status="active")
        transport, seen = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind":"none"}), transport)
        async with as_runtime_worker(dsn) as conn:
            rejected = await tool(conn,
                tools.ToolContext(organization_id=org, conversation_id=foreign.conversation_id), ARGS)
            accepted = await tool(conn,
                tools.ToolContext(organization_id=org, conversation_id=own.conversation_id), ARGS)
        assert rejected.success is False
        assert rejected.error == "conversa não encontrada para este tenant"
        assert rejected.output == {}
        assert accepted.success is True and accepted.output["decision"] == "denied"
        assert seen == []
        assert admin.execute("select count(*) from public.incentive_grants where contact_id=%s",
            (foreign.contact_id,)).fetchone() == (0,)
    finally:
        admin.execute("delete from public.organizations where id=%s", (foreign_org,))
```

Invocar a tool real diretamente evita gravar um `internal.tool_calls` de A com FK de conversa B só para testar a fronteira; a identidade da trilha já é objeto dos Steps 1–2. O positivo de negação comercial distingue “conversa própria sem concessão” de “conversa estrangeira inexistente”.
- [x] **Step 4 (3 min): RED da negativa, sem enfraquecer RLS.** Temporariamente substituir no teste `conversation_id=foreign.conversation_id` por `own.conversation_id`: guardião roda `uv run --directory runtime pytest tests/db/test_create_coupon_tool.py -k foreign_conversation -q` e exige falha na asserção `success is False` (a própria retorna negação comercial success=True). Restaurar o fixture. Também executar o teste sob policy propositalmente mutada somente no banco descartável pelo protocolo de mutações RLS da Onda 1: a tentativa de ler foreign deve ser detectada; restaurar por replay antes do GREEN. Nenhum role privilegiado ou bypass entra no teste definitivo.
- [x] **Step 5 (3 min): GREEN e revisão.** Guardião roda `uv run --directory runtime pytest tests/db/test_tools.py tests/db/test_create_coupon_tool.py -q`; verificar roles reais, duas organizações e zero HTTP. Ruff. Se o negativo revelar vazamento real, parar esta task e corrigir apenas o contrato responsável na Onda 1 com review Astra, sem registrar o comportamento inseguro como aprovado.
- [x] **Step 6 (2 min): Commit e fecho do item 63.** `git add runtime/tests/db/test_tools.py runtime/tests/db/test_create_coupon_tool.py`; `git commit -m "test: prove tool identity and foreign conversation isolation"`. Sol implementa/Astra revisa; rollback por revert dos testes. Controlador fecha item 63 só depois de registrar evidência das Tasks 1/2/9/10/11, incluindo o catálogo que deliberadamente não volta.

Evidência de 2026-09-14: `57d91304`; as mutações temporárias de identidade e conversa própria produziram `2 tests / 2 failures` no descartável `781d65f70d2644a6ae3c62b9f1a457d2`. A policy `conversations_worker_scoped` mutada para `using (true)` produziu `1 test / 1 failure` no descartável `820e3e617d974e89a735cca787cf75c2`. GREEN final no replay limpo `10a7ea4ae33b4b25a2fa08629be6300b`: `20 tests`, zero failures/errors/skips, estado `stopped`, zero contêineres e volumes. Ruff, diff check, revisão de especificação e revisão de qualidade: PASS/APPROVED; produção permaneceu sem diff.

## Gate de saída da onda

- [ ] Verificador Terra, a partir do commit final: `pnpm exec vitest run src/lib/ai/__tests__`; `pnpm typecheck`; `uv run --directory runtime pytest -m unit`; `uv run --directory runtime ruff check .`; `uv run --directory runtime lint-imports`.
- [ ] Guardião Astra: replay integral das migrations, suítes DB/RLS/pipeline conforme o protocolo já aprovado na Onda 0; registrar IDs coletados de RLS e o mesmo SHA do gate app/runtime.
- [x] Item 63: registrar também resultados de `tests/db/test_mission_event_selection.py`, `test_purchase_history.py`, `test_responder_agent_identity.py`, `test_toucher.py`, `test_responder_tool_loop.py`, `test_tools.py` e `test_create_coupon_tool.py`, incluindo provas de sensibilidade das Tasks 9–11; nenhuma lacuna fica apenas atribuída genericamente a outra onda.
- [ ] Revisor final Astra xhigh: pacote do diff BASE..HEAD, contratos Task 3/7, rollbacks, aliases do badge e evidência de cleanup. Zero Critical/Important.
- [ ] Controlador: registrar antes/depois de 63/66/68 e os oito achados adicionais; decisões sem resposta ou prova de ambiente ausente permanecem abertas, com dependência explícita. Não liberar promoção nesta onda.
