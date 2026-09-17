"""Item 48 — o `/healthz` lê por uma conexão só, e sobrevive à queda dela.

A fitness vizinha (`test_listener_connects_in_one_guarded_place.py`) afirma a
FORMA: `_healthz` não chama `_connection`, e quem reabre é `app._connect`. Ela
não vê o comportamento — e o comportamento é onde mora o risco desta mudança.

Trocar "uma conexão por probe" por "uma conexão longeva" troca um custo por um
modo de falha: psycopg não reconecta, então uma sessão derrubada (idle timeout
do pooler, restart do Supabase, deploy) deixaria toda leitura seguinte
estourando e o `/healthz` respondendo 503 `database unreachable` PARA SEMPRE,
com o banco vivo. Sob `healthCheckPath` (`render.yaml:24`) isso é instância
insalubre permanente → restart → crash-loop, que é o perfil que dispara o
circuit breaker do Supavisor. Um healthz caro é ruim; um healthz que mente
"doente" derruba o pooler.

O único caminho que a suíte `-m db` exercita é o feliz, e ela não roda sem
Postgres. Estes quatro casos rodam em `-m unit` porque a conexão é falsa: o que
está sob teste é a SEQUÊNCIA (ler → falhar → reabrir → ler), a porta por onde a
reabertura passa, e a posse — não o SQL, que `tests/db/test_server.py` cobre.
"""

import asyncio
from datetime import timedelta

import psycopg
import pytest
from psycopg.pq import TransactionStatus

from agents_runtime import server
from agents_runtime.config import QueueingConfig
from agents_runtime.repository.scope import WORKER_ROLE

DSN = "postgresql://exemplo/nao-conecta"


class FakePgconn:
    def __init__(self) -> None:
        self.finished = False
        self.socket = 1
        self.transaction_status = TransactionStatus.ACTIVE

    def finish(self) -> None:
        self.finished = True
        self.transaction_status = TransactionStatus.UNKNOWN


class FakeConnection:
    """Uma conexão que pode estar morta — e que cede o loop em toda operação.

    O `await asyncio.sleep(0)` não é decoração: sem um ponto de suspensão real,
    duas corrotinas concorrentes rodariam uma inteira depois da outra e o teste
    do lock passaria por vacuidade, provando nada.
    """

    def __init__(self, *, alive: bool = True) -> None:
        self.alive = alive
        self.closed = False
        self.pgconn = FakePgconn()

    async def beat_age(self) -> float:
        await asyncio.sleep(0)
        if not self.alive:
            raise RuntimeError("server closed the connection unexpectedly")
        return 1.5

    async def close(self) -> None:
        await asyncio.sleep(0)
        self.closed = True


class SlowThenDeadConnection(FakeConnection):
    async def beat_age(self) -> float:
        if self.alive:
            try:
                await asyncio.Event().wait()
            finally:
                self.alive = False
        raise RuntimeError("the timed-out session is no longer usable")


@pytest.fixture
def guarded_door(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    """Substitui a porta guardada e a leitura do beat; devolve o log de aberturas."""
    opened: list[tuple] = []

    async def fake_connect(dsn, set_role, expected_role, *, config=None, on_open=None):
        await asyncio.sleep(0)
        opened.append((dsn, set_role, expected_role))
        conn = FakeConnection()
        if on_open is not None:
            on_open(conn)
        return conn

    async def fake_age(conn):
        return await conn.beat_age()

    monkeypatch.setattr(server, "_connect", fake_connect)
    monkeypatch.setattr(server.engine_repo, "heartbeat_age_seconds", fake_age)
    return opened


def _status(raw: bytes) -> int:
    return int(raw.split(b" ")[1])


class TestTheHealthzConnectionIsOnePerProcess:
    async def test_repeated_probes_do_not_open_anything(self, guarded_door: list) -> None:
        """O item 48 inteiro em uma asserção: probe não paga handshake."""
        health = server.HealthConnection(DSN, "worker_role", FakeConnection())

        assert [await health.beat_age_seconds() for _ in range(5)] == [1.5] * 5
        assert guarded_door == [], (
            "cinco probes abriram conexão. A economia do item 48 é justamente "
            "que a sonda — a boca de maior frequência do processo, independente "
            "de tráfego de loja — pare de abrir uma sessão por pergunta."
        )

    async def test_a_dead_session_is_reopened_by_the_guarded_door(
        self, guarded_door: list
    ) -> None:
        """A queda vira 200 depois de uma reabertura, não 503 para sempre."""
        dead = FakeConnection(alive=False)
        health = server.HealthConnection(DSN, "worker_role", dead)

        raw = await server._healthz(health, max_age_s=180.0)

        assert _status(raw) == 200, (
            "sessão derrubada virou 503 com o banco vivo — é o crash-loop sob "
            "healthCheckPath, e o crash-loop é o que acorda o breaker do pooler."
        )
        assert dead.closed, "a conexão morta ficou pendurada no pooler"
        assert guarded_door == [(DSN, "worker_role", WORKER_ROLE)], (
            "a reabertura não passou por `app._connect` com o role esperado "
            "vindo da CONSTANTE. Passar a env nos dois lados torna a guarda "
            "tautológica; não passar nenhum devolve o dono do DSN (BYPASSRLS)."
        )

    async def test_concurrent_probes_reopen_once(self, guarded_door: list) -> None:
        """O lock protege a SEQUÊNCIA, não o statement.

        O lock interno do psycopg serializa statements. Sem o `asyncio.Lock`
        desta classe, os três sondadores que chegam juntos numa conexão caída
        entram os três no ramo de reabertura: TRÊS handshakes onde devia haver
        um, e duas sessões órfãs — `_conn` guarda só a última, e ninguém fecha
        as outras duas, que ficam penduradas no pooler que este item veio
        poupar. É isso, e só isso, que a remoção do lock produz: conferido por
        mutação, inclusive com um fake instrumentado para estourar se alguém
        lesse de conexão fechada — a exceção nunca dispara, porque `_open` zera
        `self._conn` antes de fechar a morta e a leitura relê o campo depois.
        """
        health = server.HealthConnection(DSN, "worker_role", FakeConnection(alive=False))

        ages = await asyncio.gather(*(health.beat_age_seconds() for _ in range(3)))

        assert ages == [1.5, 1.5, 1.5]
        assert len(guarded_door) == 1, (
            f"três probes concorrentes abriram {len(guarded_door)} conexões — "
            "o lock não está em volta de ler-falhar-reabrir-ler."
        )

    async def test_closing_reaches_the_connection_that_replaced_the_first(
        self, guarded_door: list
    ) -> None:
        """Posse: o `finally` de `__main__` fecha a conexão ATUAL, não a original."""
        health = server.HealthConnection(DSN, "worker_role", FakeConnection(alive=False))
        await health.beat_age_seconds()
        reaberta = health._conn

        await health.aclose()

        # As duas metades, porque uma sem a outra passa com `aclose` quebrado:
        # um `aclose` que só fizesse `self._conn = None` satisfaria a segunda
        # asserção inteira e deixaria a sessão pendurada no pooler para sempre.
        assert reaberta.closed, (
            "`aclose()` não fechou a conexão — o processo desligaria deixando a "
            "sessão do healthz pendurada no pooler, que é o buraco de posse que "
            "este item veio fechar."
        )
        assert health._conn is None
        raw = await server._healthz(health, max_age_s=180.0)
        assert _status(raw) == 503
        assert len(guarded_door) == 1

    async def test_a_timed_out_probe_returns_503_and_the_next_probe_reconnects(
        self, guarded_door: list
    ) -> None:
        health = server.HealthConnection(DSN, "worker_role", SlowThenDeadConnection())

        timed_out = await server._healthz(
            health,
            max_age_s=180.0,
            probe_timeout=timedelta(milliseconds=10),
        )
        recovered = await server._healthz(
            health,
            max_age_s=180.0,
            probe_timeout=timedelta(milliseconds=100),
        )

        assert _status(timed_out) == 503
        assert _status(recovered) == 200
        assert guarded_door == [(DSN, "worker_role", WORKER_ROLE)]

    async def test_reconnect_receives_the_health_config_snapshot(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        snapshot = QueueingConfig(connect_timeout_seconds=7, statement_timeout_ms=23)
        seen = []

        async def connect(*_, config, on_open):
            seen.append(config)
            conn = FakeConnection()
            on_open(conn)
            return conn

        async def fake_age(conn):
            return await conn.beat_age()

        monkeypatch.setattr(server, "_connect", connect)
        monkeypatch.setattr(server.engine_repo, "heartbeat_age_seconds", fake_age)
        health = server.HealthConnection(
            DSN,
            "worker_role",
            FakeConnection(alive=False),
            config=snapshot,
        )

        assert _status(await server._healthz(health, max_age_s=180.0)) == 200
        assert seen == [snapshot]

    async def test_cancelling_a_slow_open_leaves_no_connection_or_locked_probe(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def slow_open(*_, **__):
            await asyncio.Event().wait()

        monkeypatch.setattr(server, "_connect", slow_open)
        health = server.HealthConnection(DSN, "worker_role")

        raw = await server._healthz(
            health,
            max_age_s=180.0,
            probe_timeout=timedelta(milliseconds=10),
        )

        assert _status(raw) == 503
        assert health._conn is None
        assert not health._lock.locked()

    async def test_probe_waiting_for_the_lock_does_not_close_the_owners_session(
        self, guarded_door: list
    ) -> None:
        conn = FakeConnection()
        health = server.HealthConnection(DSN, "worker_role", conn)
        await health._lock.acquire()
        try:
            started = asyncio.get_running_loop().time()
            raw = await server._healthz(
                health,
                max_age_s=180.0,
                probe_timeout=timedelta(milliseconds=10),
            )
            elapsed = asyncio.get_running_loop().time() - started
        finally:
            health._lock.release()

        assert _status(raw) == 503
        assert elapsed < 0.1
        assert not conn.pgconn.finished

    async def test_expired_waiter_refuses_sql_if_it_wins_lock_before_cancellation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls = 0

        async def age(_):
            nonlocal calls
            calls += 1
            return 0.0

        monkeypatch.setattr(server.engine_repo, "heartbeat_age_seconds", age)
        health = server.HealthConnection(DSN, "worker_role", FakeConnection())
        await health._lock.acquire()
        token = object()
        waiting = asyncio.create_task(health.beat_age_seconds(probe=token))
        await asyncio.sleep(0)

        health.expire(token, waiting)
        health._lock.release()

        with pytest.raises(TimeoutError):
            await waiting
        assert calls == 0
        assert not health._conn.pgconn.finished

    async def test_probe_finishes_raw_connection_before_psycopg_can_wait_to_cancel(
        self, guarded_door: list, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        conn = FakeConnection()
        cancel_started = asyncio.Event()
        allow_cancel = asyncio.Event()
        waits = 0

        async def wait_async(*_, **__):
            nonlocal waits
            waits += 1
            if waits > 1:
                raise psycopg.errors.QueryCanceled("cancelled")
            await asyncio.Event().wait()

        async def slow_cancel(*_, **__):
            cancel_started.set()
            await allow_cancel.wait()

        async def age(raw_conn):
            raw_conn._try_cancel = slow_cancel
            await psycopg.AsyncConnection.wait(raw_conn, iter(()))

        monkeypatch.setattr(psycopg.connection_async.waiting, "wait_async", wait_async)
        monkeypatch.setattr(server.engine_repo, "heartbeat_age_seconds", age)
        health = server.HealthConnection(DSN, "worker_role", conn)
        running = asyncio.create_task(
            server._healthz(
                health,
                max_age_s=180.0,
                probe_timeout=timedelta(milliseconds=10),
            )
        )
        done, _ = await asyncio.wait({running}, timeout=0.1)
        if not done:
            allow_cancel.set()
            await asyncio.wait({running}, timeout=0.1)
            pytest.fail("psycopg entrou na espera de cancelamento de 5s")

        assert _status(await running) == 503
        assert conn.pgconn.finished
        assert not cancel_started.is_set()

    @pytest.mark.parametrize("reconnecting", [False, True])
    async def test_slow_session_initialization_is_aborted_and_never_published(
        self, reconnecting: bool, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        candidate = FakeConnection()
        started = asyncio.Event()

        async def slow_open(*_, on_open=None, **__):
            assert on_open is not None
            on_open(candidate)
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                return candidate

        async def age(conn):
            if reconnecting and conn is not candidate:
                raise RuntimeError("dead")
            return await conn.beat_age()

        monkeypatch.setattr(server, "_connect", slow_open)
        monkeypatch.setattr(server.engine_repo, "heartbeat_age_seconds", age)
        initial = FakeConnection(alive=False) if reconnecting else None
        health = server.HealthConnection(DSN, "worker_role", initial)

        raw = await server._healthz(
            health,
            max_age_s=180.0,
            probe_timeout=timedelta(milliseconds=10),
        )

        assert started.is_set()
        assert _status(raw) == 503
        assert candidate.pgconn.finished
        assert health._conn is None
        assert health._opening is None
