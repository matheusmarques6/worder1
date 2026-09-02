"""Auditoria 2026-08-28, item 37 — o mapa `purpose` -> `feature` do espelho
de `internal.llm_calls` para `public.ai_usage_logs`.

Ruling B do item é explícito: "o mapa purpose->feature tem de ser explícito
e declarado — feature com valor inventado é pior que coluna vazia, porque o
relatório passa a mentir com confiança". O mapa mora dentro de uma função
`plpgsql` (`20260902000001_ai_usage_logs_bridge.sql`), que este runtime não
tem como exercitar sem Postgres — mas o CONTRATO (todo `purpose` do CHECK tem
`when`; quem não tem cai num `else` que falha alto, não que inventa) é uma
propriedade de TEXTO dos dois arquivos .sql, provável sem banco nenhum.

Se algum dia alguém acrescentar um `purpose` ao CHECK de `internal.llm_calls`
sem adicionar o `when` correspondente na migration do espelho, este teste
quebra — é a prova pedida pelo ruling G, sem depender de Docker.
"""

import re
from pathlib import Path

# runtime/tests/unit/ -> runtime/tests -> runtime -> raiz do repositório
_MIGRATIONS = Path(__file__).parents[3] / "supabase" / "migrations"
_TRAIL_MIGRATION = _MIGRATIONS / "20260813000002_internal_llm_trail.sql"
_BRIDGE_MIGRATION = _MIGRATIONS / "20260902000001_ai_usage_logs_bridge.sql"

_CHECK_PURPOSES = re.compile(r"check\s*\(\s*purpose\s+in\s*\(([^)]*)\)\s*\)", re.IGNORECASE)
_QUOTED = re.compile(r"'([a-z_]+)'")
_WHEN_ARM = re.compile(
    r"when\s+'([a-z_]+)'\s+then\s+v_feature\s*:=\s*'([a-z_]+)'", re.IGNORECASE
)
_ELSE_RAISES = re.compile(r"else\s+raise\s+exception", re.IGNORECASE | re.DOTALL)


def _purposes_allowed_by_the_check(sql: str) -> set[str]:
    match = _CHECK_PURPOSES.search(sql)
    assert match, "CHECK (purpose in (...)) não encontrado em 20260813000002 — mudou de forma?"
    return set(_QUOTED.findall(match.group(1)))


def _purpose_to_feature_map(sql: str) -> dict[str, str]:
    return dict(_WHEN_ARM.findall(sql))


class TestThePurposeToFeatureMap:
    def test_every_allowed_purpose_has_a_mapped_feature(self) -> None:
        purposes = _purposes_allowed_by_the_check(_TRAIL_MIGRATION.read_text(encoding="utf-8"))
        mapped = _purpose_to_feature_map(_BRIDGE_MIGRATION.read_text(encoding="utf-8"))

        missing = purposes - mapped.keys()
        assert not missing, (
            f"purpose(s) sem mapa para ai_usage_logs.feature em "
            f"{_BRIDGE_MIGRATION.name}: {sorted(missing)}. Ruling B do item 37: "
            "gravar sem mapa é pior que não gravar."
        )

    def test_no_mapped_purpose_is_a_stranger_to_the_check(self) -> None:
        """O inverso: um `when` para um purpose que o CHECK nem aceita é
        morto — nunca dispara — e esconde um mapa desatualizado."""
        purposes = _purposes_allowed_by_the_check(_TRAIL_MIGRATION.read_text(encoding="utf-8"))
        mapped = _purpose_to_feature_map(_BRIDGE_MIGRATION.read_text(encoding="utf-8"))

        extra = mapped.keys() - purposes
        assert not extra, f"`when` para purpose(s) que o CHECK não permite: {sorted(extra)}"

    def test_the_features_do_not_borrow_the_ts_vocabulary(self) -> None:
        """Divergência deliberada (ruling B): o runtime não reaproveita nomes
        como `whatsapp_agent`/`eval_judge` do TS — são finalidades diferentes,
        emprestar o nome fingiria uma equivalência que não existe."""
        mapped = _purpose_to_feature_map(_BRIDGE_MIGRATION.read_text(encoding="utf-8"))
        ts_features = {
            "whatsapp_agent",
            "eval_judge",
            "proposals_generate",
            "test_runner_generate",
            "ai_respond",
        }
        assert not (set(mapped.values()) & ts_features)

    def test_an_unmapped_purpose_fails_loud_instead_of_inventing_a_feature(self) -> None:
        sql = _BRIDGE_MIGRATION.read_text(encoding="utf-8")
        assert _ELSE_RAISES.search(sql), (
            f"{_BRIDGE_MIGRATION.name}: o `else` do CASE precisa levantar "
            "exceção — sem isso um purpose novo, sem `when`, gravaria "
            "`feature` NULL (ou pior, seria silenciosamente ignorado)."
        )


class TestTheDetectorItself:
    """Trava que ninguém viu falhar é decoração (mesmo padrão de
    test_no_max_seq.py e test_no_sql_outside_repository.py)."""

    def test_extracts_the_check_purposes(self) -> None:
        sql = "check (purpose in ('a_purpose', 'another_one'))"
        assert _purposes_allowed_by_the_check(sql) == {"a_purpose", "another_one"}

    def test_extracts_the_when_arms(self) -> None:
        sql = "when 'a_purpose' then v_feature := 'runtime_a_purpose';"
        assert _purpose_to_feature_map(sql) == {"a_purpose": "runtime_a_purpose"}

    def test_catches_a_missing_when_arm(self) -> None:
        purposes = {"a_purpose", "forgotten_purpose"}
        mapped = {"a_purpose": "runtime_a_purpose"}
        assert purposes - mapped.keys() == {"forgotten_purpose"}

    def test_catches_an_else_that_does_not_raise(self) -> None:
        assert not _ELSE_RAISES.search("else v_feature := 'runtime_fallback';")
