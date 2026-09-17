"""O contrato do DEPLOY.md como função: o que impediria o processo de subir,
dito antes de alguém abrir o console do Render."""

import inspect

import psycopg
import pytest
from piloto_check import (
    DEFAULT_STALE_AFTER,
    _main,
    _probe,
    _smoke,
    build_smoke_report,
    describe_health,
    validate_env,
)

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

    def test_a_direct_connection_with_pooler_text_in_the_password_is_still_refused(
        self,
    ) -> None:
        direct = (
            "postgresql://postgres:s3nha_pooler.supabase.com"
            "@db.abc.supabase.co:5432/postgres"
        )
        problems = validate_env(_env(SUPABASE_DB_URL=direct))
        assert any("pooler" in problem for problem in problems)

    def test_a_session_pooler_with_6543_text_in_the_password_is_accepted(self) -> None:
        pooler_with_noisy_password = (
            "postgresql://postgres.abc:s3n:6543ha"
            "@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
        )
        assert validate_env(_env(SUPABASE_DB_URL=pooler_with_noisy_password)) == []

    def test_an_unparseable_dsn_is_a_problem_of_its_own(self) -> None:
        problems = validate_env(_env(SUPABASE_DB_URL="isso não é uma dsn"))
        assert any("ilegível" in problem for problem in problems)

    def test_a_non_numeric_port_is_a_problem_of_its_own(self) -> None:
        bad_port = "postgresql://u:p@host:notaport/db"
        problems = validate_env(_env(SUPABASE_DB_URL=bad_port))
        assert any("ilegível" in problem for problem in problems)


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

    def test_a_fresh_beat_does_not_claim_to_prove_the_queue_is_draining(self) -> None:
        _, lines = describe_health(12.0, {})
        assert any("não prova fila drenando" in line for line in lines)


class TestTheImpureProbe:
    async def test_an_unreachable_database_is_reported_not_raised(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def failing_connect(*_args: object, **_kwargs: object) -> None:
            raise OSError("Network is unreachable")

        monkeypatch.setattr(psycopg.AsyncConnection, "connect", failing_connect)

        healthy, lines = await _probe("postgresql://unreachable/db", stale_after=180.0)

        assert healthy is False
        assert any(
            "banco inalcançável" in line and "Network is unreachable" in line
            for line in lines
        )

    def test_exit_code_is_0_when_healthy_and_1_when_not(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import piloto_check

        monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://x/y")

        async def healthy_probe(dsn: str, *, stale_after: float) -> tuple[bool, list[str]]:
            return True, ["heartbeat: 1s desde o último beat"]

        monkeypatch.setattr(piloto_check, "_probe", healthy_probe)
        assert _main(["probe"]) == 0

        async def unreachable_probe(dsn: str, *, stale_after: float) -> tuple[bool, list[str]]:
            return False, ["banco inalcançável: Network is unreachable"]

        monkeypatch.setattr(piloto_check, "_probe", unreachable_probe)
        assert _main(["probe"]) == 1


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

    def test_an_empty_outbox_is_named_vazio(self) -> None:
        passed, lines = build_smoke_report(
            inbound=1, outbound=1, outbox={}, mirrored=0, steps=STEPS
        )
        assert passed is False
        assert any("outbox" in line and "vazio" in line for line in lines)

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


class TestTheImpureSmoke:
    async def test_an_unreachable_database_is_reported_not_raised(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def failing_connect(*_args: object, **_kwargs: object) -> None:
            raise OSError("Network is unreachable")

        monkeypatch.setattr(psycopg.AsyncConnection, "connect", failing_connect)

        passed, lines = await _smoke(
            "postgresql://unreachable/db",
            organization_id="00000000-0000-0000-0000-000000000000",
            phone="+5511999999999",
            minutes=15,
        )

        assert passed is False
        assert any(
            "banco inalcançável" in line and "Network is unreachable" in line
            for line in lines
        )


class TestTheMissingDSNGuard:
    """`os.environ["SUPABASE_DB_URL"]` sem guarda estoura `KeyError` cru — o
    cenário mais provável de todos (shell novo, env ainda não carregada) e o
    exato caso que o runbook promete não deixar virar traceback."""

    def test_probe_without_a_dsn_fails_without_a_traceback(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

        assert _main(["probe"]) == 1

        assert "SUPABASE_DB_URL" in capsys.readouterr().out

    def test_smoke_without_a_dsn_fails_without_a_traceback(
        self, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

        assert _main(["smoke", "--organization", "org1", "--phone", "+5511999999999"]) == 1

        assert "SUPABASE_DB_URL" in capsys.readouterr().out


class _FakeCursor:
    def __init__(self, *, one: tuple | None = None, all_: list[tuple] | None = None) -> None:
        self._one = one
        self._all = all_ if all_ is not None else []

    async def fetchone(self) -> tuple | None:
        return self._one

    async def fetchall(self) -> list[tuple]:
        return self._all


class _FakeConnection:
    """Um psycopg falso que roteia por trecho do SQL — o suficiente para
    provar QUAIS parâmetros cada consulta do `_smoke` recebe, sem precisar de
    um Postgres real."""

    def __init__(self, *, cloud_conversation_id: str | None) -> None:
        self.calls: list[tuple[str, tuple]] = []
        self._cloud_conversation_id = cloud_conversation_id

    async def execute(self, sql: str, params: tuple = ()) -> "_FakeCursor":
        self.calls.append((sql, params))
        if "from public.conversations c" in sql:
            return _FakeCursor(one=("11111111-1111-1111-1111-111111111111",))
        if "from public.messages" in sql:
            return _FakeCursor(one=(1, 1))
        if "from internal.message_outbox" in sql:
            return _FakeCursor(all_=[("sent", 1)])
        if "from public.whatsapp_cloud_conversations wcc" in sql:
            cloud = self._cloud_conversation_id
            return _FakeCursor(one=(cloud,) if cloud is not None else None)
        if "from public.whatsapp_cloud_messages" in sql:
            return _FakeCursor(one=(1,))
        if "from public.whatsapp_ai_run_steps" in sql:
            return _FakeCursor(all_=[("started",)])
        raise AssertionError(f"consulta inesperada: {sql}")

    async def close(self) -> None:
        return None


class TestTheSmokeMirrorScope:
    """A checagem de espelho tem que ser do turno (conversa cloud resolvida),
    não da organização inteira — senão a mensagem de outro cliente da mesma
    loja faz a linha dizer `ok` num turno que não teve resposta nenhuma."""

    async def test_the_mirror_query_is_scoped_to_the_resolved_cloud_conversation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        cloud_id = "22222222-2222-2222-2222-222222222222"
        fake_conn = _FakeConnection(cloud_conversation_id=cloud_id)

        async def fake_connect(*_args: object, **_kwargs: object) -> _FakeConnection:
            return fake_conn

        monkeypatch.setattr(psycopg.AsyncConnection, "connect", fake_connect)

        await _smoke(
            "postgresql://x/y", organization_id="org-1", phone="+5511999999999", minutes=15
        )

        mirror_calls = [
            (sql, params) for sql, params in fake_conn.calls
            if "from public.whatsapp_cloud_messages" in sql
        ]
        assert len(mirror_calls) == 1
        _, params = mirror_calls[0]
        assert cloud_id in params, (
            "a consulta do espelho não recebeu a conversa cloud resolvida como "
            f"parâmetro — ficou escopada só pela organização: {params!r}"
        )


class TestTheStaleAfterLock:
    """`DEFAULT_STALE_AFTER` copia o default de `server.serve(health_max_age_s=...)`
    — sem esta trava, um dos dois lados pode mudar sem o outro perceber."""

    def test_matches_the_server_healthz_default(self) -> None:
        from agents_runtime import server as server_module

        default = inspect.signature(server_module.serve).parameters["health_max_age_s"].default
        assert DEFAULT_STALE_AFTER == default
