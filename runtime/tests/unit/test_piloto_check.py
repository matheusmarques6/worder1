"""O contrato do DEPLOY.md como função: o que impediria o processo de subir,
dito antes de alguém abrir o console do Render."""

import psycopg
import pytest
from piloto_check import _main, _probe, describe_health, validate_env

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
