"""O contrato do DEPLOY.md como função: o que impediria o processo de subir,
dito antes de alguém abrir o console do Render."""

import pytest
from piloto_check import validate_env

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
