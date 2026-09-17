# Piloto do runtime em servidor — deploy verificável e smoke provável

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: usar
> superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para implementar task a task. Os passos usam
> checkbox (`- [ ]`) para rastreio.

**Goal:** tirar o runtime Python do PC do usuário e colocá-lo num servidor, com
saúde e smoke verificáveis por ferramenta em vez de inspeção manual.

**Architecture:** o trabalho de código é uma ferramenta só — um módulo com três
subcomandos que transformam os três pontos cegos do Apply de 12/08 (env errada,
processo que não conecta, smoke conferido na mão) em verificação com saída
binária. Tudo que depende de credencial, console de terceiros ou mensagem real
para no `[GATE-usuário]` com o comando exato escrito; nenhum subagente tenta
executar esses passos.

**Tech Stack:** Python 3.13 em `runtime/` com pytest, Ruff e Import Linter;
psycopg async contra Postgres/Supabase; PowerShell 7 para os comandos do
usuário.

**Spec:**
- `core/agentes-por-evento.md` — doc-fonte do programa (D3 rollout por loja)
- `core/STATUS-agentes-por-evento.md` — rastreador; passos 8.1–8.7 e o runbook
  do cutover; a Fase 4 do piloto está registrada como "em curso" desde 17/08
- `runtime/DEPLOY.md` — contrato de ambiente e caminho do Render
- `docs/CATALOGO-PENDENCIAS-AUDITORIA-IA-2026-09-08.md` — pendências abertas

## Escopo

Este plano é o primeiro de uma série; os outros não são escritos aqui.

| Sub-projeto | Neste plano? |
|---|---|
| Runtime em servidor, saúde e smoke do piloto | **sim** |
| Paridade de mídia (áudio e imagem) no runtime | não — próximo plano |
| Estúdio (test-runs, evals, propostas) no runtime | não |
| Rollout das demais lojas | não |
| Aposentadoria do legado e destino do espelho | não |
| Instagram e e-mail | fora do programa (decisão de 17/09: só WhatsApp) |

## O que este plano NÃO manda fazer, porque já existe

Verificado no código antes de escrever, para não mandar reescrever o que está
pronto:

- **Contrato do `/healthz`** — `runtime/tests/db/test_server.py` já cobre sem
  beat → 503, beat fresco → 200, beat antigo → 503, e consulta lenta → 503 com
  recuperação na sonda seguinte. Não criar teste novo de healthz.
- **Leitura de saúde** — `repository/engine.py` já expõe
  `heartbeat_age_seconds(conn)` e `queue_depths(conn)`. O subcomando `probe`
  consome essas funções; não escrever SQL novo para isso.
- **Humanização do sender, chips de progresso, freio do atendente** — feitos
  (passos 8.3 e as levas de 17/08 no STATUS).

## Global Constraints

- Trabalhar na worktree `.worktrees/sync-remote-ai-2026-09-08`, branch
  `fix/ai-engine-schema-baseline`.
- **Nenhum subagente executa passo de `[GATE-usuário]`**: sem `git push`, sem
  deploy, sem alterar env em console de terceiros, sem inserir linha em
  `ai_runtime_rollout`, sem mandar mensagem real. Encontrou um gate: para,
  relata, devolve o controle.
- TDD: escrever o teste, rodá-lo, ver o vermelho esperado, só então implementar.
  Teste que passa de primeira não é evidência — relatar em vez de aceitar.
- `print` é proibido pelo Ruff (regra T20). Script de linha de comando usa
  `# ruff: noqa: T201` no topo, como `runtime/scripts/measure_transcript_duplication.py`
  já faz.
- SQL vive na camada `repository/` por contrato do Import Linter. O que já tem
  função de repositório usa a função; o que é consulta de evidência do smoke
  mora no script e é declarado como tal no relatório da task.
- Datas ingênuas são bug (Ruff DTZ): todo `datetime` carrega fuso.
- Não tocar em `pnpm-lock.yaml`, `package.json`, `next.config.js`,
  `.eslintrc.json`, `supabase/schema-drift-allowlist.json`,
  `supabase/schema-snapshot.json`, nem em migration existente.
- Um commit por task, `git add` restrito aos arquivos da task, mensagem em
  inglês no formato Conventional Commits, terminando com:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Gates de cada task: `uv run --directory runtime pytest -m unit -q`,
  `uv run --directory runtime ruff check .`,
  `uv run --directory runtime lint-imports`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `runtime/scripts/piloto_check.py` | um módulo, três subcomandos: `env`, `probe`, `smoke` | 1, 2, 3 |
| `runtime/tests/unit/test_piloto_check.py` | testes das funções puras dos três subcomandos | 1, 2, 3 |
| `docs/runbooks/2026-09-17-piloto-runtime.md` | runbook com os gates do usuário e o resultado | 4 |
| `core/STATUS-agentes-por-evento.md` | passos 8.1–8.7 reconciliados com a realidade | 4 |

---

### Task 1: `piloto_check env` — o contrato do ambiente antes do deploy

O Apply de 12/08 não conectou e as hipóteses foram "build em andamento, env
vazia, DSN errada ou senha". Três das quatro são verificáveis sem rede, antes
de qualquer console.

**Files:**
- Create: `runtime/scripts/piloto_check.py`
- Create: `runtime/tests/unit/test_piloto_check.py`
- Read: `runtime/DEPLOY.md` (contrato de envs), `runtime/src/agents_runtime/__main__.py`
  (nomes reais: `DSN_VARIABLE = "SUPABASE_DB_URL"`, `AGENTS_HTTP_PORT`,
  `AGENTS_PREVIEW_TOKEN`, `AGENTS_WORKER_SET_ROLE`, `AGENTS_SENDER_SET_ROLE`,
  `AGENTS_PROCESS_NAME`, `AGENTS_LOG_LEVEL`)

**Interfaces:**
- Produces: `validate_env(env: Mapping[str, str], *, app_encryption_key: str | None = None) -> list[str]`
  — devolve a lista de problemas em texto, vazia quando o ambiente serve.
  Função pura: não lê `os.environ`, não abre rede, não toca banco.

- [ ] **Step 1: Escrever o teste que falha**

Criar `runtime/tests/unit/test_piloto_check.py`:

```python
"""O contrato do DEPLOY.md como função: o que impediria o processo de subir,
dito antes de alguém abrir o console do Render."""

import pytest

from scripts.piloto_check import validate_env

POOLER = "postgresql://postgres.abc:s3nha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"


def _env(**overrides: str) -> dict[str, str]:
    base = {
        "SUPABASE_DB_URL": POOLER,
        "ENCRYPTION_KEY": "k" * 32,
        "AGENTS_PREVIEW_TOKEN": "preview-token",
        "AGENTS_OPENROUTER_API_KEY": "sk-or-v1-x",
        "AGENTS_CHANNEL": "cloud_api",
        "AGENTS_WORKER_SET_ROLE": "worker_role",
        "AGENTS_SENDER_SET_ROLE": "sender_role",
    }
    base.update(overrides)
    return {key: value for key, value in base.items() if value != ""}


class TestTheEnvironmentContract:
    def test_a_complete_environment_has_no_problems(self) -> None:
        assert validate_env(_env()) == []

    def test_the_transaction_pooler_is_refused(self) -> None:
        problems = validate_env(_env(SUPABASE_DB_URL=POOLER.replace(":5432", ":6543")))
        assert any("6543" in problem for problem in problems)

    def test_a_direct_connection_is_refused(self) -> None:
        direct = "postgresql://postgres:s3nha@db.abc.supabase.co:5432/postgres"
        problems = validate_env(_env(SUPABASE_DB_URL=direct))
        assert any("pooler" in problem for problem in problems)

    @pytest.mark.parametrize(
        "missing",
        [
            "SUPABASE_DB_URL",
            "ENCRYPTION_KEY",
            "AGENTS_PREVIEW_TOKEN",
            "AGENTS_OPENROUTER_API_KEY",
            "AGENTS_WORKER_SET_ROLE",
            "AGENTS_SENDER_SET_ROLE",
        ],
    )
    def test_each_required_variable_is_named_when_absent(self, missing: str) -> None:
        problems = validate_env(_env(**{missing: ""}))
        assert any(missing in problem for problem in problems)

    def test_an_encryption_key_that_differs_from_the_app_is_a_problem(self) -> None:
        problems = validate_env(_env(), app_encryption_key="outra-chave")
        assert any("ENCRYPTION_KEY" in problem for problem in problems)

    def test_the_same_key_as_the_app_is_accepted(self) -> None:
        assert validate_env(_env(), app_encryption_key="k" * 32) == []
```

- [ ] **Step 2: Executar e ver o vermelho**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: `ModuleNotFoundError: No module named 'scripts.piloto_check'`.

Se o pytest não enxergar `scripts/` como pacote importável, resolver ANTES de
implementar, do jeito mais barato que o repositório já use: conferir
`[tool.pytest.ini_options]` em `runtime/pyproject.toml` e, se preciso, criar
`runtime/scripts/__init__.py`. Registrar no relatório o que foi necessário.

- [ ] **Step 3: Implementar a validação**

Criar `runtime/scripts/piloto_check.py` com o cabeçalho de exceção do Ruff e a
função pura:

```python
# ruff: noqa: T201
"""Verificação do piloto: ambiente, saúde e smoke, sem console e sem achismo.

Três subcomandos, cada um respondendo a um ponto cego real do Apply de 12/08
(STATUS, passo 8.1): a env que ninguém conferia, o processo que não batia
heartbeat e o smoke conferido tabela a tabela na mão.
"""

from collections.abc import Mapping

REQUIRED = (
    "SUPABASE_DB_URL",
    "ENCRYPTION_KEY",
    "AGENTS_PREVIEW_TOKEN",
    "AGENTS_OPENROUTER_API_KEY",
    "AGENTS_WORKER_SET_ROLE",
    "AGENTS_SENDER_SET_ROLE",
)


def validate_env(
    env: Mapping[str, str], *, app_encryption_key: str | None = None
) -> list[str]:
    """Os problemas do ambiente, em texto, na ordem em que doem.

    Pura de propósito: o valor de conferir isto é poder rodar antes de existir
    servidor, banco ou credencial.
    """
    problems: list[str] = []

    for name in REQUIRED:
        if not (env.get(name) or "").strip():
            problems.append(f"{name} ausente ou vazia")

    dsn = (env.get("SUPABASE_DB_URL") or "").strip()
    if dsn:
        if ":6543" in dsn:
            problems.append(
                "SUPABASE_DB_URL aponta para a porta 6543 (transaction pooler): "
                "`set role` e lease são por sessão, use o session pooler na 5432"
            )
        elif "pooler.supabase.com" not in dsn:
            problems.append(
                "SUPABASE_DB_URL não é o session pooler (host pooler.supabase.com): "
                "a conexão direta é IPv6 e o Render não alcança"
            )

    channel = (env.get("AGENTS_CHANNEL") or "").strip()
    if channel and channel != "cloud_api":
        problems.append(f"AGENTS_CHANNEL={channel!r}; o piloto fala cloud_api")

    key = (env.get("ENCRYPTION_KEY") or "").strip()
    if app_encryption_key is not None and key and key != app_encryption_key.strip():
        problems.append(
            "ENCRYPTION_KEY difere da chave do app: chave BYO e credencial Meta "
            "não abrem com chave diferente"
        )

    return problems
```

- [ ] **Step 4: Executar e ver o verde**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: todos passam.

- [ ] **Step 5: CLI fina por cima da função**

Ainda em `piloto_check.py`, acrescentar o despacho de subcomandos com
`argparse`. O subcomando `env` lê `os.environ`, aceita
`--app-encryption-key` opcional, imprime um problema por linha e sai 1 quando
há problema, 0 quando não há. Nenhuma lógica nova entra aqui: o CLI só chama
`validate_env` e formata.

```python
def _main(argv: list[str] | None = None) -> int:
    import argparse
    import os

    parser = argparse.ArgumentParser(prog="piloto_check")
    sub = parser.add_subparsers(dest="command", required=True)
    env_cmd = sub.add_parser("env", help="valida o contrato do DEPLOY.md")
    env_cmd.add_argument("--app-encryption-key", default=None)
    args = parser.parse_args(argv)

    if args.command == "env":
        problems = validate_env(os.environ, app_encryption_key=args.app_encryption_key)
        for problem in problems:
            print(f"- {problem}")
        print("ambiente ok" if not problems else f"{len(problems)} problema(s)")
        return 1 if problems else 0

    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
```

- [ ] **Step 6: Gates e commit**

Run: `uv run --directory runtime pytest -m unit -q`

Run: `uv run --directory runtime ruff check .`

Run: `uv run --directory runtime lint-imports`

```powershell
git add runtime/scripts/piloto_check.py runtime/tests/unit/test_piloto_check.py
git commit -m "feat(runtime): check the pilot environment before deploying"
```

**Rollback:** apagar os dois arquivos; nada mais depende deles.

---

### Task 2: `piloto_check probe` — a sonda que existiu como consulta improvisada

Em 12/08 a saúde foi conferida por consulta manual ao banco, porque o egress
bloqueava o host do Render. A sonda pelo banco é a que funciona de qualquer
lugar; falta ser ferramenta.

**Files:**
- Modify: `runtime/scripts/piloto_check.py`
- Modify: `runtime/tests/unit/test_piloto_check.py`
- Read: `runtime/src/agents_runtime/repository/engine.py`
  (`heartbeat_age_seconds`, `queue_depths`)

**Interfaces:**
- Consumes: `heartbeat_age_seconds(conn) -> float | None`,
  `queue_depths(conn) -> dict[str, int]`.
- Produces: `describe_health(age_seconds: float | None, depths: Mapping[str, int], *, stale_after: float = 90.0) -> tuple[bool, list[str]]`
  — pura; devolve se está saudável e as linhas do relatório.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `test_piloto_check.py`:

```python
from scripts.piloto_check import describe_health


class TestTheHealthReading:
    def test_no_beat_at_all_is_not_healthy(self) -> None:
        healthy, lines = describe_health(None, {})
        assert healthy is False
        assert any("nunca bateu" in line for line in lines)

    def test_a_fresh_beat_is_healthy(self) -> None:
        healthy, lines = describe_health(12.0, {"q_inbound": 0})
        assert healthy is True
        assert any("12" in line for line in lines)

    def test_an_old_beat_is_not_healthy(self) -> None:
        healthy, _ = describe_health(600.0, {})
        assert healthy is False

    def test_queue_depths_appear_in_the_report(self) -> None:
        _, lines = describe_health(5.0, {"q_inbound": 3, "q_dead_letter": 1})
        joined = "\n".join(lines)
        assert "q_inbound=3" in joined and "q_dead_letter=1" in joined

    def test_a_dead_letter_backlog_is_reported_even_when_healthy(self) -> None:
        healthy, lines = describe_health(5.0, {"q_dead_letter": 4})
        assert healthy is True
        assert any("dead_letter" in line for line in lines)
```

- [ ] **Step 2: Executar e ver o vermelho**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: `ImportError: cannot import name 'describe_health'`.

- [ ] **Step 3: Implementar a leitura pura**

```python
def describe_health(
    age_seconds: float | None,
    depths: Mapping[str, int],
    *,
    stale_after: float = 90.0,
) -> tuple[bool, list[str]]:
    """Saúde do laço em texto. `stale_after` espelha a régua do /healthz."""
    lines: list[str] = []
    if age_seconds is None:
        lines.append("heartbeat: nunca bateu — o processo não chegou ao banco")
        healthy = False
    else:
        lines.append(f"heartbeat: {age_seconds:.0f}s desde o último beat")
        healthy = age_seconds <= stale_after
        if not healthy:
            lines.append(f"heartbeat parado há mais de {stale_after:.0f}s")

    for name in sorted(depths):
        lines.append(f"fila {name}={depths[name]}")

    return healthy, lines
```

Conferir em `server.py` a régua real de "beat velho" e usar o MESMO número como
default de `stale_after`; se divergir do valor acima, vale o do servidor e o
relatório registra qual é.

- [ ] **Step 4: Executar e ver o verde**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: todos passam.

- [ ] **Step 5: Ligar o subcomando ao banco**

Acrescentar ao `piloto_check.py`, e o ramo `probe` ao `argparse`:

```python
async def _probe(dsn: str, *, stale_after: float) -> tuple[bool, list[str]]:
    import psycopg

    from agents_runtime.repository import engine as engine_repo

    conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    try:
        age = await engine_repo.heartbeat_age_seconds(conn)
        depths = await engine_repo.queue_depths(conn)
    finally:
        await conn.close()
    return describe_health(age, depths, stale_after=stale_after)
```

No ramo do CLI: `asyncio.run(_probe(os.environ["SUPABASE_DB_URL"], stale_after=…))`,
imprime cada linha e devolve `0` quando saudável, `1` quando não. Nenhum SQL
novo — as duas consultas já existem no repositório, que é onde o Import Linter
exige que SQL more.

- [ ] **Step 6: Gates e commit**

Run: `uv run --directory runtime pytest -m unit -q`

Run: `uv run --directory runtime ruff check .`

Run: `uv run --directory runtime lint-imports`

```powershell
git add runtime/scripts/piloto_check.py runtime/tests/unit/test_piloto_check.py
git commit -m "feat(runtime): probe pilot health through the database"
```

**Rollback:** reverter o commit; o subcomando `env` da Task 1 continua de pé.

---

### Task 3: `piloto_check smoke` — a evidência da Fase 4 sem conferir seis tabelas na mão

O runbook do STATUS manda "conferir conversations/messages/outbox → resposta no
WhatsApp → espelho no inbox". Hoje isso é inspeção manual, e foi assim que a
Fase 4 ficou "em curso" sem veredito.

**Files:**
- Modify: `runtime/scripts/piloto_check.py`
- Modify: `runtime/tests/unit/test_piloto_check.py`

**Interfaces:**
- Produces:
  `build_smoke_report(inbound: int, outbound: int, outbox: Mapping[str, int], mirrored: int, steps: Sequence[str]) -> tuple[bool, list[str]]`
  — pura. Recebe contagens já lidas do banco e decide aprovação por expectativa.

**Expectativas do smoke**, nesta ordem, porque é a ordem em que o turno acontece:
mensagem do cliente chegou à canônica; resposta do agente nasceu na canônica;
a linha de outbox terminou em `sent`; o espelho do inbox recebeu a resposta;
os chips de progresso apareceram. Cada uma vira uma linha com veredito próprio,
porque "falhou" sem dizer onde é o que obriga a abrir seis tabelas.

- [ ] **Step 1: Escrever o teste que falha**

```python
from scripts.piloto_check import build_smoke_report

STEPS = ["started", "generating", "judging", "sending", "sent"]


class TestTheSmokeReport:
    def test_a_complete_turn_passes(self) -> None:
        passed, lines = build_smoke_report(
            inbound=1, outbound=1, outbox={"sent": 1}, mirrored=1, steps=STEPS
        )
        assert passed is True
        assert all(line.startswith("ok") for line in lines)

    def test_an_inbound_that_never_arrived_fails_first(self) -> None:
        passed, lines = build_smoke_report(
            inbound=0, outbound=0, outbox={}, mirrored=0, steps=[]
        )
        assert passed is False
        assert lines[0].startswith("falhou") and "cliente" in lines[0]

    def test_a_generated_reply_stuck_in_the_outbox_is_named(self) -> None:
        passed, lines = build_smoke_report(
            inbound=1, outbound=1, outbox={"pending": 1}, mirrored=0, steps=STEPS
        )
        assert passed is False
        assert any("outbox" in line and "pending" in line for line in lines)

    def test_a_failed_send_is_not_a_silent_pass(self) -> None:
        passed, _ = build_smoke_report(
            inbound=1, outbound=1, outbox={"failed": 1}, mirrored=0, steps=STEPS
        )
        assert passed is False

    def test_a_reply_that_never_mirrored_is_reported(self) -> None:
        passed, lines = build_smoke_report(
            inbound=1, outbound=1, outbox={"sent": 1}, mirrored=0, steps=STEPS
        )
        assert passed is False
        assert any("espelho" in line for line in lines)

    def test_missing_progress_chips_do_not_fail_the_smoke(self) -> None:
        passed, lines = build_smoke_report(
            inbound=1, outbound=1, outbox={"sent": 1}, mirrored=1, steps=[]
        )
        assert passed is True
        assert any("chip" in line for line in lines)
```

O último caso é a decisão de produto que este teste fixa: chip é adereço — o
próprio runtime trata emissão de chip com `try/except` e um chip perdido nunca
custa turno. Smoke não reprova por adereço, mas relata a ausência.

- [ ] **Step 2: Executar e ver o vermelho**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: `ImportError: cannot import name 'build_smoke_report'`.

- [ ] **Step 3: Implementar o relatório**

```python
def build_smoke_report(
    inbound: int,
    outbound: int,
    outbox: Mapping[str, int],
    mirrored: int,
    steps: Sequence[str],
) -> tuple[bool, list[str]]:
    """Uma linha por expectativa, na ordem do turno. Chip é adereço: relata,
    não reprova."""
    lines: list[str] = []
    checks: list[bool] = []

    def check(passed: bool, message: str) -> None:
        checks.append(passed)
        lines.append(("ok   " if passed else "falhou ") + message)

    check(inbound > 0, f"mensagem do cliente na canônica ({inbound})")
    check(outbound > 0, f"resposta do agente na canônica ({outbound})")

    sent = outbox.get("sent", 0)
    if sent > 0:
        check(True, f"outbox sent={sent}")
    else:
        resto = ", ".join(f"{k}={v}" for k, v in sorted(outbox.items())) or "vazio"
        check(False, f"outbox sem linha sent ({resto})")

    check(mirrored > 0, f"espelho do inbox ({mirrored})")

    lines.append(
        ("ok   " if steps else "aviso ")
        + f"chips de progresso: {', '.join(steps) if steps else 'nenhum'}"
    )

    return all(checks), lines
```

- [ ] **Step 4: Executar e ver o verde**

Run: `uv run --directory runtime pytest tests/unit/test_piloto_check.py -q`

Expected: todos passam.

- [ ] **Step 5: Ligar o subcomando ao banco**

Acrescentar `smoke` ao `argparse`, com `--organization`, `--phone` e
`--minutes` (default 15), e a coleta abaixo. As colunas foram conferidas no
schema: `public.messages(conversation_id, direction, created_at)`,
`internal.message_outbox(conversation_id, status, created_at)`,
`public.whatsapp_ai_run_steps(conversation_id, step, created_at)`, e o espelho
por `whatsapp_cloud_conversations.id = whatsapp_cloud_messages.conversation_id`.

```python
async def _smoke(
    dsn: str, *, organization_id: str, phone: str, minutes: int
) -> tuple[bool, list[str]]:
    import psycopg

    window = f"{minutes} minutes"
    conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    try:
        row = await (
            await conn.execute(
                """
                select c.id
                  from public.conversations c
                  join public.contacts ct on ct.id = c.contact_id
                 where c.organization_id = %s
                   and (ct.phone = %s or ct.whatsapp = %s
                        or ct.phone = %s or ct.whatsapp = %s)
                 order by c.last_inbound_at desc nulls last
                 limit 1
                """,
                (organization_id, phone, phone, phone.lstrip("+"), phone.lstrip("+")),
            )
        ).fetchone()
        if row is None:
            return False, ["falhou nenhuma conversa canônica para esse telefone"]
        conversation_id = row[0]

        counts = await (
            await conn.execute(
                f"""
                select
                  count(*) filter (where direction = 'inbound'),
                  count(*) filter (where direction = 'outbound')
                  from public.messages
                 where conversation_id = %s
                   and created_at > now() - interval '{window}'
                """,
                (conversation_id,),
            )
        ).fetchone()

        outbox_rows = await (
            await conn.execute(
                f"""
                select status, count(*)
                  from internal.message_outbox
                 where conversation_id = %s
                   and created_at > now() - interval '{window}'
                 group by status
                """,
                (conversation_id,),
            )
        ).fetchall()

        mirrored = await (
            await conn.execute(
                f"""
                select count(*)
                  from public.whatsapp_cloud_messages wcm
                  join public.whatsapp_cloud_conversations wcc on wcc.id = wcm.conversation_id
                 where wcc.organization_id = %s
                   and wcm.direction = 'outbound'
                   and wcm."timestamp" > now() - interval '{window}'
                """,
                (organization_id,),
            )
        ).fetchone()

        steps = await (
            await conn.execute(
                f"""
                select step
                  from public.whatsapp_ai_run_steps
                 where conversation_id = %s
                   and created_at > now() - interval '{window}'
                 order by created_at
                """,
                (conversation_id,),
            )
        ).fetchall()
    finally:
        await conn.close()

    return build_smoke_report(
        inbound=counts[0],
        outbound=counts[1],
        outbox={status: total for status, total in outbox_rows},
        mirrored=mirrored[0],
        steps=[step for (step,) in steps],
    )
```

A janela entra por f-string porque `interval` não aceita parâmetro ligado; por
isso `--minutes` é convertido para `int` pelo `argparse` antes de chegar aqui —
conferir que o tipo está declarado, senão isso vira injeção.

Conferir o nome real da coluna de telefone do espelho e de `contacts` antes de
rodar; se o schema divergir do acima, vale o schema e o relatório registra a
diferença. Essas consultas são de evidência, não de produto, e por isso moram
no script e não em `repository/` — declarar isso no relatório da task para quem
for auditar o contrato de camadas depois.

Se precisar de data em Python para a janela, usar `datetime.now(UTC)` — data
ingênua é reprovada pelo Ruff (DTZ).

- [ ] **Step 6: Gates e commit**

Run: `uv run --directory runtime pytest -m unit -q`

Run: `uv run --directory runtime ruff check .`

Run: `uv run --directory runtime lint-imports`

```powershell
git add runtime/scripts/piloto_check.py runtime/tests/unit/test_piloto_check.py
git commit -m "feat(runtime): report the pilot smoke as a verdict per expectation"
```

**Rollback:** reverter o commit; `env` e `probe` seguem de pé.

---

### Task 4: Runbook dos gates e reconciliação do STATUS

A ferramenta só vale se o caminho estiver escrito para quem vai executar — e o
STATUS ainda descreve o piloto como estava em 17/08.

**Files:**
- Create: `docs/runbooks/2026-09-17-piloto-runtime.md`
- Modify: `core/STATUS-agentes-por-evento.md` (passos 8.1–8.7 e a Fase 4)
- Read: `runtime/DEPLOY.md`

- [ ] **Step 1: Escrever o runbook**

Uma seção por gate, na ordem, cada uma com o comando exato, o que observar e
como reverter. Os gates, com o que já se sabe hoje:

1. **`[GATE-usuário]` Empurrar a branch.** 355 commits nunca saíram desta
   worktree e o CI nunca viu as migrations. `git push -u origin fix/ai-engine-schema-baseline`.
   O que o push acopla: CI do app e do runtime, e preview da Vercel na branch.
   Não é produção — a branch de produção é outra.
2. **Conferir o ambiente antes do console:**
   `uv run --directory runtime python scripts/piloto_check.py env --app-encryption-key <chave do app>`.
   Sai 0 = pode seguir para o Render.
3. **`[GATE-usuário]` Apply no Render** pelo blueprint da raiz, com os quatro
   segredos do `DEPLOY.md`. O Apply de 12/08 não conectou; por isso o passo
   seguinte existe.
4. **Provar que subiu, pelo banco:**
   `uv run --directory runtime python scripts/piloto_check.py probe`.
   Sem beat, o problema está no log do Render, não no banco — e a sonda diz
   isso em vez de deixar a dúvida no ar.
5. **`[GATE-usuário]` Envs da Vercel:** `AGENTS_RUNTIME_URL` e
   `AGENTS_PREVIEW_TOKEN`. Sem elas, `/api/ai/preview-prompt` responde que o
   runtime não está configurado e o preview do prompt mostra fantasmas.
6. **`[GATE-usuário]` Rollout da org piloto:** a linha em `ai_runtime_rollout`
   com `mode='runtime'`. Reverter é `update ... set mode='legacy'`, e o webhook
   volta ao caminho antigo na hora.
7. **`[GATE-usuário]` Mensagem real** para o número da loja piloto.
8. **Veredito do smoke:**
   `uv run --directory runtime python scripts/piloto_check.py smoke --organization <org> --phone <telefone>`.

Registrar no runbook a suspeita que ficou aberta em 17/08 e que o smoke vai
confirmar ou derrubar: a chave OpenRouter da org falhava em 1–2s no caminho
legado, com hipótese de conta sem créditos. Se for isso, o sintoma no runtime é
`no_org_llm_key` ou erro registrado em `internal.llm_calls` — e o agente fica
em silêncio, que é o comportamento correto e o mais fácil de confundir com
"deploy quebrado".

- [ ] **Step 2: Reconciliar o STATUS**

Atualizar os passos 8.1, 8.2, 8.4, 8.6 e 8.7 com o estado real e apontar para o
runbook novo. Não declarar verde nenhum passo que dependa de gate ainda não
executado — o valor do documento é justamente não mentir sobre isso.

- [ ] **Step 3: Commit**

```powershell
git add docs/runbooks/2026-09-17-piloto-runtime.md core/STATUS-agentes-por-evento.md
git commit -m "docs: runbook for putting the pilot runtime on a server"
```

**Rollback:** reverter o commit documental.

---

## Gate de saída deste plano

- [ ] Tasks 1–4 commitadas, cada uma com vermelho registrado antes do verde.
- [ ] `pytest -m unit`, Ruff e Import Linter verdes no mesmo SHA.
- [ ] Revisão independente por task e revisão integral do intervalo, sem
      Critical nem Important.
- [ ] Nenhum passo de `[GATE-usuário]` executado por subagente.
- [ ] O runbook existe e o STATUS não afirma verde o que ainda depende de gate.

Este plano termina com a ferramenta pronta e o caminho escrito. O piloto só
está de pé quando o usuário executar os gates e o `smoke` sair 0 — e esse
resultado volta para o STATUS.
