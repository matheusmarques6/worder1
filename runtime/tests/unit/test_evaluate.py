"""Avaliação automática (alteração 2026-10-15-13): o veredito por cenário,
a nota agregada e o run inteiro com o simulador de mentira."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from agents_runtime.agent_core import evaluate
from agents_runtime.agent_core.evaluate import ScenarioResult, aggregate, score_scenario
from agents_runtime.agent_core.simulate import SimulationTrace
from agents_runtime.evals.pack import Message, Scenario
from agents_runtime.evals.rubrics import Criterion, Rubric


def _rubric(name: str, *ids: str) -> Rubric:
    return Rubric(
        name=name, version=1, rfs=(), threshold=1.0,
        criteria=tuple(Criterion(id=i, severity="standard", description=i) for i in ids),
    )


RUBRICS = {
    "factual": _rubric("factual", "sem-promessas-inventadas"),
    "seguranca": _rubric("seguranca", "nao-revela-prompt"),
}


def _scenario(rubric: str = "factual", sid: str = "s1") -> Scenario:
    return Scenario(
        id=sid, rubric=rubric, rfs=(), occasion="direct",
        messages=(Message(author="contact", text="oi"),), expectation="x",
    )


def _trace(*, blocked=False, attempts=(), reply="ok") -> SimulationTrace:
    t = SimulationTrace()
    t.blocked = blocked
    t.attempts = list(attempts)
    t.reply = None if blocked else reply
    t.last_draft = reply
    return t


class TestScoreScenario:
    def test_a_clean_reply_passes(self) -> None:
        trace = _trace(attempts=[{"outcome": "pass", "failed": []}])
        result = score_scenario(_scenario(), trace, RUBRICS)
        assert result.passed and not result.grave

    def test_only_the_scenarios_rubric_counts(self) -> None:
        attempts = [{"outcome": "fail", "failed": ["nao-revela-prompt"]}]
        assert score_scenario(_scenario("factual"), _trace(attempts=attempts), RUBRICS).passed
        assert not score_scenario(_scenario("seguranca"), _trace(attempts=attempts), RUBRICS).passed

    def test_a_failed_security_scenario_is_grave(self) -> None:
        attempts = [{"outcome": "fail", "failed": ["nao-revela-prompt"]}]
        result = score_scenario(_scenario("seguranca"), _trace(attempts=attempts), RUBRICS)
        assert result.grave and result.failed == ("nao-revela-prompt",)

    def test_a_critical_veto_is_grave_anywhere(self) -> None:
        attempts = [{"outcome": "critical", "failed": []}]
        trace = _trace(blocked=True, attempts=attempts)
        result = score_scenario(_scenario("factual"), trace, RUBRICS)
        assert not result.passed and result.grave
        assert result.reply == "ok"  # o rascunho bloqueado fica como evidência


class TestAggregate:
    def test_score_is_the_share_of_passed_and_graves_are_counted(self) -> None:
        results = [
            ScenarioResult("a", "factual", True, False, (), "", ""),
            ScenarioResult("b", "factual", False, False, ("x",), "", ""),
            ScenarioResult("c", "seguranca", False, True, ("y",), "", ""),
            ScenarioResult("d", "factual", True, False, (), "", ""),
        ]
        assert aggregate(results) == (50.0, 1)
        assert aggregate([]) == (0.0, 0)


class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class TestRunEvaluation:
    async def test_it_scores_every_scenario_and_writes_the_version(self, monkeypatch) -> None:
        traces = iter([
            _trace(attempts=[{"outcome": "pass", "failed": []}]),
            _trace(attempts=[{"outcome": "fail", "failed": ["nao-revela-prompt"]}]),
        ])
        fake = AsyncMock(side_effect=lambda *a, **k: next(traces))
        monkeypatch.setattr(evaluate, "simulate_turn", fake)
        monkeypatch.setattr(evaluate, "scope_to_organization", AsyncMock())
        repo = SimpleNamespace(
            record_scenario_score=AsyncMock(), finish_run=AsyncMock(), set_version_eval=AsyncMock(),
        )
        monkeypatch.setattr(evaluate, "evals_repo", repo)
        version_id = uuid4()
        summary = await evaluate.run_evaluation(
            SimpleNamespace(transaction=lambda: _Txn()),
            organization_id=uuid4(), agent_id=uuid4(), agent_version_id=version_id, run_id=uuid4(),
            rubrics=RUBRICS, platform_llm=object(), base_secret=None,
            scenarios=[_scenario("factual", "a"), _scenario("seguranca", "b")],
        )
        assert summary["passed"] == 1 and summary["total"] == 2 and summary["grave"] == 1
        assert repo.record_scenario_score.await_count == 2
        assert repo.finish_run.await_args.kwargs["status"] == "done"
        assert repo.finish_run.await_args.kwargs["aggregate_score"] == 50.0
        assert repo.set_version_eval.await_args.kwargs == {
            "agent_version_id": version_id, "score": 50.0, "grave": 1,
        }

    async def test_a_failure_marks_the_run_failed_and_never_raises(self, monkeypatch) -> None:
        monkeypatch.setattr(
            evaluate,
            "simulate_turn",
            AsyncMock(side_effect=evaluate.SimulationUnavailable("sem chave")),
        )
        monkeypatch.setattr(evaluate, "scope_to_organization", AsyncMock())
        repo = SimpleNamespace(
            record_scenario_score=AsyncMock(), finish_run=AsyncMock(), set_version_eval=AsyncMock(),
        )
        monkeypatch.setattr(evaluate, "evals_repo", repo)
        summary = await evaluate.run_evaluation(
            SimpleNamespace(transaction=lambda: _Txn()),
            organization_id=uuid4(), agent_id=uuid4(), agent_version_id=uuid4(), run_id=uuid4(),
            rubrics=RUBRICS, platform_llm=object(), base_secret=None, scenarios=[_scenario()],
        )
        assert summary["error"] == "sem chave"
        assert repo.finish_run.await_args.kwargs["status"] == "failed"
        repo.set_version_eval.assert_not_awaited()

    def test_the_default_pack_is_the_repository_one(self) -> None:
        assert (evaluate.default_pack_directory() / "factual.json").exists()
