"""Fitness function — o listener HTTP abre conexão num lugar só, e guardado.

`server.py` é o único módulo do runtime que abre conexão FORA do `app._connect`:
o `/healthz` e o `/internal/preview-prompt` atendem requisições avulsas, sem
pool. Foi ali que a guarda de role vazou duas vezes.

Na primeira, `_healthz` e `_preview` tinham cada um o seu
`psycopg.AsyncConnection.connect` + `if set_role:` — dois lugares, o mesmo
padrão copiado, nenhum verificado. Sem a env, o preview chamava
`scope_to_organization` sobre uma conexão do dono do DSN, onde escopo por
organização não significa nada.

O conserto foi colapsar os dois no `_connection`, com `assert_rls_enforced`
dentro. Mas isso era garantia ESTRUTURAL, não afirmada: um terceiro handler
copiando o padrão antigo reabria o buraco sem quebrar teste nenhum — que é
exatamente como ele nasceu.

Item 48: o `/healthz` saiu do `_connection` e passou a ler por UMA conexão do
processo (`HealthConnection`), recebida já guardada do preflight de
`__main__._serve`. `_connection` **continua existindo** — o `/preview` segue
abrindo a sua por requisição —, então as duas primeiras asserções continuam
valendo palavra por palavra. O que elas deixaram de cobrir é o caminho novo: a
conexão do healthz não é aberta por `_connection`, e quando ela cai é
`HealthConnection._open` quem reabre. Uma reabertura escrita com
`psycopg.AsyncConnection.connect` nu devolveria ao listener o dono do DSN
(BYPASSRLS no Supabase) e o healthz seguiria verde — a MESMA falha das duas
vezes anteriores, num terceiro lugar. Daí a quarta asserção: quem reabre é
`app._connect`, que aplica o `set role` e cobra a guarda.

`_healthz` engole toda exceção em 503, então nem um teste de comportamento
pegaria a regressão por lá. Por isso a asserção é sobre a FORMA do módulo, no
mesmo espírito das outras fitness deste diretório: a detecção é por AST, então
um comentário citando `connect(` não é violação.

A terceira asserção (item 45) é a outra metade da mesma porta: provar o role
não basta se a LEITURA acontecer fora do escopo. `scope_to_organization` é
`SET LOCAL` e a conexão é `autocommit=True`, então um `load_*` escrito uma
linha abaixo do `async with conn.transaction()` roda com
`current_app_organization_id()` = NULL — e RLS com organização NULL não é
erro, são ZERO LINHAS. Nenhum teste de comportamento pega isso: a resposta
continua 200, o bloco só fica vazio. Por isso a garantia é estrutural aqui.
"""

import ast
import asyncio
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest

import agents_runtime
from agents_runtime import __main__ as runtime_main
from agents_runtime import app, server
from agents_runtime.agent_core import responder, toucher
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.repository.scope import WORKER_ROLE

_SERVER = Path(agents_runtime.__file__).parent / "server.py"


class _Initialized(Exception):
    pass


class _Connection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple | None]] = []
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        await self.close()

    async def execute(self, statement: str, params: tuple | None = None):
        self.executed.append((statement, params))

    async def close(self) -> None:
        self.closed = True


def _functions(tree: ast.Module) -> list[ast.AsyncFunctionDef | ast.FunctionDef]:
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef)
    ]


def _called_name(node: ast.AST) -> str | None:
    """O nome invocado por uma Call — atributo (`repo.load_x`) OU nome nu
    (`load_x`). As duas formas existem em `server.py` (`:40` importa
    `resolve_moments` por nome nu), então um detector que só olhe uma delas
    enxerga metade do arquivo que guarda."""
    if not isinstance(node, ast.Call):
        return None
    target = node.func
    if isinstance(target, ast.Attribute):
        return target.attr
    if isinstance(target, ast.Name):
        return target.id
    return None


def _calls(function: ast.AST, name: str) -> bool:
    """Se `name` é chamado em qualquer lugar do corpo — atributo ou nome nu."""
    return any(_called_name(node) == name for node in ast.walk(function))


class TestTheListenerHasOneDoorToTheDatabase:
    def test_only_one_function_opens_a_connection(self) -> None:
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
        openers = [fn.name for fn in _functions(tree) if _calls(fn, "connect")]

        assert openers == ["_connection"], (
            "server.py voltou a abrir conexão em mais de um lugar: "
            f"{openers}. Todo handler tem que passar por `_connection`, que é "
            "onde a guarda de role mora."
        )

    def test_that_one_function_proves_the_role(self) -> None:
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
        (connection,) = [fn for fn in _functions(tree) if fn.name == "_connection"]

        assert _calls(connection, "assert_rls_enforced"), (
            "`_connection` deixou de provar o role. Sem isso o listener volta a "
            "atender sobre uma conexão que a RLS não alcança — e o `_healthz` "
            "engole a exceção em 503, então nada mais denuncia."
        )

    def test_the_healthz_reads_by_the_long_lived_connection_and_reopens_guarded(self) -> None:
        """Item 48: o healthz não abre por probe, e quem reabre é a porta guardada.

        Duas metades da mesma garantia. A primeira é o item 48 em si: `_healthz`
        não pode voltar a chamar `_connection`, senão a conexão por probe volta
        e com ela o handshake por sonda. A segunda é o que torna a primeira
        segura: a conexão longeva CAI (idle timeout do pooler, restart do banco,
        deploy) e alguém tem que reabri-la. Se essa reabertura for escrita com
        `psycopg.AsyncConnection.connect` nu — o que a primeira asserção desta
        classe já impede — ou com qualquer coisa que não seja `app._connect`, o
        listener volta a atender como dono do DSN, com `set role` nenhum e
        guarda nenhuma, e o `/healthz` continua respondendo 200.
        """
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))

        (healthz,) = [fn for fn in _functions(tree) if fn.name == "_healthz"]
        assert not _calls(healthz, "_connection"), (
            "`_healthz` voltou a abrir conexão por requisição. Ela é a boca de "
            "maior frequência do processo (≥3 sondadores, independentes de "
            "tráfego) e cada probe passaria de novo a pagar handshake + set "
            "role + a query da guarda para ler uma idade de beat."
        )

        (health,) = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef) and node.name == "HealthConnection"
        ]
        assert _calls(health, "_connect"), (
            "`HealthConnection` deixou de reabrir por `app._connect`. Uma "
            "reconexão que não passe por lá devolve ao listener o dono do DSN "
            "(BYPASSRLS no Supabase mesmo sem superuser), sem `set role` e sem "
            "`assert_rls_enforced` — e o healthz responde 200 do mesmo jeito."
        )

        imported = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module == "agents_runtime.app"
            for alias in node.names
        }
        assert "_connect" in imported, (
            "`_connect` não vem mais de `agents_runtime.app`. A asserção acima "
            "passaria com um `_connect` local que não guardasse nada — o nome "
            "só prova alguma coisa enquanto for A porta guardada do processo."
        )

    def test_every_read_happens_inside_the_scoped_transaction(self) -> None:
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
        (preview,) = [fn for fn in _functions(tree) if fn.name == "_preview"]

        transactions = [
            block
            for block in ast.walk(preview)
            if isinstance(block, ast.AsyncWith)
            and any(_calls(item.context_expr, "transaction") for item in block.items)
        ]
        assert len(transactions) == 1, (
            f"`_preview` abriu {len(transactions)} transações. Escopo é por "
            "transação: duas são dois escopos, e o segundo pode nascer vazio."
        )
        (scoped,) = transactions
        assert _calls(scoped, "scope_to_organization"), (
            "a transação do preview não escopa mais por organização — as "
            "leituras passariam a correr com a RLS vendo organização NULL."
        )
        inside = {id(node) for node in ast.walk(scoped)}

        strays = [
            name
            for node in ast.walk(preview)
            if (name := _called_name(node))
            and name.startswith("load_")
            and id(node) not in inside
        ]
        assert strays == [], (
            "leitura do preview fora da transação escopada: "
            f"{strays}. `scope_to_organization` é SET LOCAL e a conexão é "
            "autocommit — fora da transação a RLS vê organização NULL e a "
            "query volta zero linhas, sem erro e sem log."
        )


@pytest.mark.parametrize(
    ("config", "expected"),
    [
        (QueueingConfig(), (3, "15000")),
        (QueueingConfig(connect_timeout_seconds=7, statement_timeout_ms=23), (7, "23")),
    ],
)
async def test_all_four_connection_doors_apply_the_same_time_limits(
    config: QueueingConfig,
    expected: tuple[int, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    opened: list[tuple[dict, _Connection]] = []

    async def connect(_dsn: str, **kwargs):
        conn = _Connection()
        opened.append((kwargs, conn))
        return conn

    async def stop_after_initialization(*_):
        raise _Initialized

    monkeypatch.setattr(app.psycopg.AsyncConnection, "connect", connect)
    monkeypatch.setattr(app, "assert_rls_enforced", stop_after_initialization)
    monkeypatch.setattr(server, "assert_rls_enforced", stop_after_initialization)
    monkeypatch.setattr(responder, "assert_rls_enforced", stop_after_initialization)
    monkeypatch.setattr(toucher, "assert_rls_enforced", stop_after_initialization)
    with pytest.raises(_Initialized):
        await app._connect("postgresql://unused", WORKER_ROLE, WORKER_ROLE, config=config)
    with pytest.raises(_Initialized):
        async with server._connection("postgresql://unused", WORKER_ROLE, config=config):
            pass

    reply = responder.build_responder(
        "postgresql://unused",
        llm=object(),
        set_role=WORKER_ROLE,
        config=config,
    )
    with pytest.raises(_Initialized):
        await reply(
            InboundJob(
                organization_id=UUID("00000000-0000-4000-8000-000000000811"),
                conversation_id=UUID("00000000-0000-4000-8000-000000000812"),
                generation=1,
                target_seq=1,
            )
        )

    touch = toucher.build_toucher(
        "postgresql://unused",
        llm=object(),
        set_role=WORKER_ROLE,
        config=config,
    )
    with pytest.raises(_Initialized):
        await touch(
            MissionTouchJob(
                organization_id=UUID("00000000-0000-4000-8000-000000000811"),
                contact_id=UUID("00000000-0000-4000-8000-000000000813"),
                conversation_id=UUID("00000000-0000-4000-8000-000000000812"),
                touch_id=UUID("00000000-0000-4000-8000-000000000814"),
                event_family="cart.abandoned",
            )
        )

    assert len(opened) == 4
    for kwargs, conn in opened:
        assert kwargs["connect_timeout"] == expected[0]
        assert conn.executed[:2] == [
            ("set role worker_role", None),
            (
                "select set_config('statement_timeout', %s, false)",
                (expected[1],),
            ),
        ]
        assert conn.closed


def test_real_agent_factories_snapshot_timeout_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[QueueingConfig] = []

    def build(_dsn, **kwargs):
        captured.append(kwargs["config"])
        return object()

    monkeypatch.setenv("AGENTS_TURN_TIMEOUT_MS", "31")
    monkeypatch.setattr(responder.openrouter, "from_env", lambda: object())
    monkeypatch.setattr(toucher.openrouter, "from_env", lambda: object())
    monkeypatch.setattr(responder, "build_responder", build)
    monkeypatch.setattr(toucher, "build_toucher", build)

    responder.agent_responder("postgresql://unused")
    toucher.agent_toucher("postgresql://unused")

    assert [config.turn_timeout.total_seconds() for config in captured] == [0.031, 0.031]
    assert [config.connect_timeout_seconds for config in captured] == [3, 3]
    assert [config.statement_timeout_ms for config in captured] == [15_000, 15_000]


async def test_one_config_snapshot_reaches_preflight_health_listener_and_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = QueueingConfig(
        turn_timeout=timedelta(milliseconds=31),
        connect_timeout_seconds=7,
        statement_timeout_ms=23,
    )
    seen: list[tuple[str, QueueingConfig]] = []

    class Http:
        def close(self):
            return None

        async def wait_closed(self):
            return None

    class Health:
        def __init__(self, *_, config, **__):
            seen.append(("health", config))

        async def aclose(self):
            return None

    async def connect(*_, config, **__):
        seen.append(("preflight", config))
        return object()

    async def serve(*_, config, **__):
        seen.append(("listener", config))
        return Http()

    async def run(*_, config, **__):
        seen.append(("runtime", config))

    monkeypatch.setenv("AGENTS_HTTP_PORT", "1234")
    monkeypatch.setattr(runtime_main, "config_from_env", lambda _: snapshot)
    monkeypatch.setattr(runtime_main, "_connect", connect)
    monkeypatch.setattr(runtime_main.server, "HealthConnection", Health)
    monkeypatch.setattr(runtime_main.server, "serve", serve)
    monkeypatch.setattr(runtime_main, "run", run)
    monkeypatch.setattr(runtime_main, "_factory_from_env", lambda *_args, **_kwargs: object())
    monkeypatch.setattr(runtime_main, "_channel_from_env", lambda _: None)

    await runtime_main._serve("postgresql://unused")

    assert [name for name, _ in seen] == ["preflight", "health", "listener", "runtime"]
    assert all(config is snapshot for _, config in seen)


async def test_runtime_pools_receive_the_same_config_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    snapshot = QueueingConfig(turn_timeout=timedelta(milliseconds=31))
    seen: list[tuple[str, QueueingConfig]] = []

    async def connect(_dsn, _set_role, expected_role, *, config, **__):
        seen.append((expected_role, config))
        return _Connection()

    monkeypatch.setattr(app, "_connect", connect)
    stop = asyncio.Event()
    stop.set()
    await app.run(
        "postgresql://unused",
        stop=stop,
        config=snapshot,
        respond=object(),
        touch=object(),
        channel=object(),
        workers=2,
    )

    assert [role for role, _ in seen] == [
        "worker_role",
        "worker_role",
        "worker_role",
        "worker_role",
        "sender_role",
    ]
    assert all(config is snapshot for _, config in seen)
