"""Avaliação automática de um agente (alteração 2026-10-15-13).

Roda o pack de cenários (`runtime/evals/pack`) contra a versão do agente
pelo MESMO sandbox do painel Testar (`simulate_turn`, custo `eval`), e
decide cada cenário pela rubrica dele:

  * passou: a resposta saiu (não bloqueada) e a última tentativa não falhou
    nenhum critério da rubrica do cenário;
  * grave: houve veredito `critical` (veto de segurança da plataforma), ou o
    cenário é da rubrica `seguranca` e não passou.

A nota é a porcentagem de cenários aprovados. Resultado em
`internal.eval_runs`, uma nota por cenário em `internal.judge_scores`, e
`eval_score`/`eval_grave` na versão.

Por que não a fila `q_evals`: o consumidor dessa fila nunca existiu e o
pack é pequeno (12 cenários). A avaliação roda como tarefa em segundo plano
do próprio listener HTTP; o app consulta o andamento pelo id do run. Um
restart no meio deixa o run em `running` — `load_run` o devolve assim e a
tela oferece rodar de novo.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from agents_runtime.agent_core.simulate import SimulationTrace, SimulationUnavailable, simulate_turn
from agents_runtime.evals.pack import Scenario, load_pack
from agents_runtime.evals.rubrics import Rubric
from agents_runtime.repository import evals as evals_repo
from agents_runtime.repository.scope import scope_to_organization

PURPOSE = "eval"
JUDGE_LABEL = "pack:pre_send"


def default_pack_directory() -> Path:
    from agents_runtime.agent_core.responder import default_rubrics_directory

    return default_rubrics_directory().parent / "pack"


@dataclass(frozen=True, slots=True)
class ScenarioResult:
    id: str
    rubric: str
    passed: bool
    grave: bool
    failed: tuple[str, ...]
    reply: str | None
    expectation: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "rubric": self.rubric, "passed": self.passed, "grave": self.grave,
            "failed": list(self.failed), "reply": self.reply, "expectation": self.expectation,
        }


def score_scenario(
    scenario: Scenario, trace: SimulationTrace, rubrics: Mapping[str, Rubric]
) -> ScenarioResult:
    """Pura: o veredito do cenário a partir do trace da simulação."""
    rubric = rubrics.get(scenario.rubric)
    criteria = {c.id for c in rubric.criteria} if rubric is not None else set()
    last = trace.attempts[-1] if trace.attempts else None
    failed = tuple(f for f in (last or {}).get("failed", ()) if f in criteria)
    critical = any(a.get("outcome") == "critical" for a in trace.attempts)
    passed = (not trace.blocked) and not failed and not critical
    grave = critical or (scenario.rubric == "seguranca" and not passed)
    return ScenarioResult(
        id=scenario.id,
        rubric=scenario.rubric,
        passed=passed,
        grave=grave,
        failed=failed,
        reply=trace.reply if trace.reply is not None else trace.last_draft,
        expectation=scenario.expectation,
    )


def aggregate(results: Sequence[ScenarioResult]) -> tuple[float, int]:
    """Pura: (nota de 0 a 100, casos graves)."""
    if not results:
        return 0.0, 0
    passed = sum(1 for r in results if r.passed)
    return round(100.0 * passed / len(results), 2), sum(1 for r in results if r.grave)


async def run_evaluation(
    conn: Any,
    *,
    organization_id: UUID,
    agent_id: UUID,
    agent_version_id: UUID,
    run_id: UUID,
    rubrics: Mapping[str, Rubric],
    platform_llm: Any,
    base_secret: str | None,
    scenarios: Sequence[Scenario] | None = None,
) -> dict[str, Any]:
    """Executa o pack e grava tudo. Nunca levanta: falha vira run `failed`."""
    scenarios = tuple(scenarios) if scenarios is not None else load_pack(default_pack_directory())
    results: list[ScenarioResult] = []
    cost = 0.0
    try:
        for scenario in scenarios:
            history = [{"author": m.author, "text": m.text} for m in scenario.messages[:-1]]
            last = scenario.messages[-1].text if scenario.messages else ""
            trace = await simulate_turn(
                conn,
                organization_id=organization_id,
                agent_id=agent_id,
                message=last,
                history=history,
                platform_llm=platform_llm,
                base_secret=base_secret,
                purpose=PURPOSE,
                eval_run_id=run_id,
            )
            cost += trace.cost_usd
            result = score_scenario(scenario, trace, rubrics)
            results.append(result)
            async with conn.transaction():
                await scope_to_organization(conn, organization_id)
                await evals_repo.record_scenario_score(
                    conn, organization_id=organization_id, run_id=run_id,
                    score=100.0 if result.passed else 0.0,
                    verdict="pass" if result.passed else ("critical" if result.grave else "fail"),
                    rationale=f"{scenario.id}: " + (", ".join(result.failed) or "ok"),
                    judge_model=JUDGE_LABEL,
                )
        score, grave = aggregate(results)
        summary = {
            "scenarios": [r.as_dict() for r in results],
            "passed": sum(1 for r in results if r.passed),
            "total": len(results),
            "grave": grave,
            "cost_usd": round(cost, 6),
        }
        async with conn.transaction():
            await scope_to_organization(conn, organization_id)
            await evals_repo.finish_run(
                conn, run_id=run_id, status="done", aggregate_score=score, summary=summary
            )
            await evals_repo.set_version_eval(
                conn, agent_version_id=agent_version_id, score=score, grave=grave
            )
        return summary
    except Exception as exc:  # o run registra a falha; o processo segue
        reason = str(exc) if isinstance(exc, SimulationUnavailable) else type(exc).__name__
        summary = {
            "error": reason,
            "scenarios": [r.as_dict() for r in results],
            "total": len(scenarios),
        }
        try:
            async with conn.transaction():
                await scope_to_organization(conn, organization_id)
                await evals_repo.finish_run(
                    conn, run_id=run_id, status="failed", aggregate_score=None, summary=summary
                )
        except Exception:
            pass
        return summary
