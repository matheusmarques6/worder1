"""O toucher — F1 §3.2.2 passos 2-6: o toque de missão gerado e julgado.

O mesmo maquinário do responder (cascata BYO, frame compilado, Judge 1 com
duas regenerações), apontado para o caso em que NINGUÉM escreveu: o nó pediu.
As diferenças que importam:

  * a missão vem da FAMÍLIA do job, re-resolvida AGORA — a emissão só recusou
    cedo; a verdade é do turno. Família sem versão ativa: alerta e silêncio
    (§3.4-8: toque sem missão não sai jamais);
  * o `delta` do nó refina a missão DESTE toque (merge_mission — restrição
    acumula, permissão estreita);
  * o `concession_request` passa pelo create_coupon (engine → grant → cupom
    materializado ANTES da geração): o benefício entra no prompt como FATO
    ("cupom X, 10%, até sexta"), nunca como esperança. Negado = toque segue
    sem benefício (a negativa já virou ledger);
  * quem conclui é `run_touch` (worker.py): mesmo lease, mesmo CAS — inbound
    no meio da geração mata o rascunho e o turno de RESPOSTA assume.
"""

import os
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import httpx
import psycopg

from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.llm import ChatRequest, LlmPort, Message
from agents_runtime.agent_core.mission_resolver import (
    NodeDelta,
    merge_mission,
)
from agents_runtime.agent_core.prompt_compiler import (
    AgentBlock,
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    compile_prompt,
)
from agents_runtime.agent_core.providers import NoOrgLlmKey, resolve_agent_llm
from agents_runtime.agent_core.responder import TRANSCRIPT_LIMIT, _as_chat, _metered
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.commerce.moments import apply_moment_restrictions, resolve_moments
from agents_runtime.evals.pack import load_rubrics
from agents_runtime.judges.pre_send import (
    JUDGE_MODEL,
    JudgeContext,
    PreSendJudge,
    guarded_reply,
    with_merchant_judges,
)
from agents_runtime.obs.telemetry import annotate
from agents_runtime.queueing.jobs import MissionTouchJob
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import alerts as alerts_repo
from agents_runtime.repository import judge_scores as scores_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import moments as moments_repo
from agents_runtime.repository import orders as orders_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext, run_tool
from agents_runtime.tools.coupon import CreateCoupon

#: O texto do toucher de andaime (paridade com fixed_responder): a suíte
#: pipeline dirige o processo real sem LLM nenhum.
FIXED_TOUCH = "Oi! Vi que você deixou algo esperando por aqui — posso ajudar?"


@dataclass(frozen=True, slots=True)
class TouchDraft:
    """O que o toucher entrega ao run_touch para concluir."""

    content: dict | None
    moment_ids: tuple[UUID, ...]
    mission_version_id: UUID | None


def fixed_toucher(text: str = FIXED_TOUCH):
    async def touch(job: MissionTouchJob) -> TouchDraft:
        return TouchDraft(content={"text": text}, moment_ids=(), mission_version_id=None)

    return touch


def _node_delta(raw: dict | None) -> NodeDelta:
    raw = raw or {}
    return NodeDelta(
        objective=raw.get("objective"),
        success_criteria=tuple(raw.get("success_criteria") or ()),
        tone=raw.get("tone"),
        context=dict(raw.get("context") or {}),
        enabled_tools=(
            tuple(raw["enabled_tools"]) if raw.get("enabled_tools") is not None else None
        ),
        forbidden=tuple(raw.get("forbidden") or ()),
    )


def build_toucher(
    dsn: str,
    *,
    llm: LlmPort,
    clock: Clock | None = None,
    rubrics_directory: Path | None = None,
    set_role: str | None = None,
    agent_llm_from_org_keys: bool = False,
    base_secret: str | None = None,
    shopify_transport: httpx.AsyncBaseTransport | None = None,
):
    """O toucher real. Mesmas costuras do build_responder — `llm` é a porta da
    PLATAFORMA (Judge 1); a fala do agente sai pela cascata BYO em produção."""
    clock = clock or SystemClock()
    from agents_runtime.agent_core.responder import default_rubrics_directory

    rubrics = load_rubrics(rubrics_directory or default_rubrics_directory())

    async def touch(job: MissionTouchJob) -> TouchDraft:
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            if set_role:
                await conn.execute("set role " + set_role)

            # --- leitura: uma transação curta, fechada antes de qualquer rede
            async with conn.transaction():
                await scope_to_organization(conn, job.organization_id)
                settings = await agent_repo.load_tenant_policy(
                    conn, organization_id=job.organization_id
                )
                version = await agent_repo.load_active_version(
                    conn, organization_id=job.organization_id
                )
                state = await agent_repo.load_conversation_view(
                    conn, conversation_id=job.conversation_id
                )
                if state is None:
                    raise LookupError(f"conversation {job.conversation_id} is not this tenant's")
                mission = await missions_repo.load_active_mission(
                    conn, event_type=job.event_family
                )
                transcript = await agent_repo.load_recent_transcript(
                    conn, conversation_id=job.conversation_id, limit=TRANSCRIPT_LIMIT
                )
                active_moments = await moments_repo.load_active_moments(conn)
                # E3 — o toque também fala com quem já comprou (ou nunca
                # comprou): mesmo dado fixo do responder, mesma decisão 81b.
                purchase = await orders_repo.load_purchase_history(
                    conn,
                    organization_id=job.organization_id,
                    contact_id=state.contact_id,
                )
                key_rows = (
                    await keys_repo.load_org_provider_keys(
                        conn, organization_id=job.organization_id
                    )
                    if agent_llm_from_org_keys
                    else ()
                )

            if version is None:
                # Sem agente ativo não há voz para o toque — e ninguém está
                # esperando resposta: alerta e arquiva, sem escada de DLQ.
                await _alert(
                    conn, job,
                    type="mission_touch_failed",
                    title="Toque pedido sem versão de agente ativa",
                    payload={"event_family": job.event_family, "node_ref": job.node_ref},
                )
                return TouchDraft(None, (), None)

            if mission is None:
                # A emissão validou, mas a missão saiu do ar até aqui — a
                # verdade é do turno (§3.2.2-2): alerta e silêncio.
                await _alert(
                    conn, job,
                    type=alerts_repo.NO_ACTIVE_MISSION,
                    title="Toque sem missão ativa — nada foi enviado",
                    payload={"event_family": job.event_family, "node_ref": job.node_ref},
                )
                return TouchDraft(None, (), None)

            resolved = merge_mission(
                mission,
                _node_delta(job.delta),
                agent_tools=version.config.enabled_tools,
                node_ref=job.node_ref,
            )
            moment_view = resolve_moments(active_moments, promote=resolved.promote_moment)
            resolved = apply_moment_restrictions(resolved, moment_view)
            # 9.1: os IDs do toque no span aberto pelo worker (mission_touch).
            annotate(
                mission_version_id=resolved.mission_version_id,
                moment_ids=(
                    ",".join(str(m) for m in moment_view.moment_ids)
                    if moment_view.moment_ids
                    else None
                ),
            )
            mission_version_id = UUID(resolved.mission_version_id)

            # --- cascata D4 (BYO-only): sem chave da org, o toque morre alto.
            agent_llm: LlmPort = llm
            if agent_llm_from_org_keys:
                try:
                    agent_llm = resolve_agent_llm(
                        key_rows, agent_provider=version.provider, base_secret=base_secret
                    )
                except NoOrgLlmKey as reason:
                    await _alert(
                        conn, job,
                        type="no_org_llm_key",
                        severity="critical",
                        title="Sem chave de LLM da organização — toque não saiu",
                        payload={"reason": str(reason), "node_ref": job.node_ref},
                    )
                    return TouchDraft(None, (), None)

            # --- o caminho do dinheiro ANTES da geração: benefício é fato ----
            grant_lines: tuple[str, ...] = ()
            request = dict(job.concession_request or {})
            if request.get("object_kind") and request.get("object_ref"):
                leader = active_moments[0] if active_moments else None
                result = await run_tool(
                    conn,
                    CreateCoupon(
                        mission=resolved,
                        moment=leader,
                        base_secret=base_secret,
                        clock=clock,
                        transport=shopify_transport,
                    ),
                    ToolContext(
                        organization_id=job.organization_id,
                        conversation_id=job.conversation_id,
                    ),
                    {
                        "object_kind": request["object_kind"],
                        "object_ref": request["object_ref"],
                        **({"kind": request["kind"]} if request.get("kind") else {}),
                        **({"value": request["value"]} if request.get("value") is not None else {}),
                    },
                    clock=clock,
                )
                if result.success and result.output.get("coupon_code"):
                    grant_lines = (
                        "Benefício autorizado — cupom {code}: {kind} {value}, "
                        "válido até {until} (grant {grant})".format(
                            code=result.output["coupon_code"],
                            kind=result.output["kind"],
                            value=result.output["value"],
                            until=result.output["valid_until"],
                            grant=result.output["grant_id"],
                        ),
                    )
                    annotate(grant_id=result.output["grant_id"])
                # Negado ou provedor caído: o toque segue SEM benefício — a
                # negativa já é ledger, e prometer sem cupom seria mentira.

            persona = version.persona or {}
            language = str(persona.get("language") or settings.primary_language)
            window_open = (
                state.last_inbound_at is not None
                and clock.now() - state.last_inbound_at < timedelta(hours=24)
            )
            compiled = compile_prompt(
                agent=AgentBlock(
                    agent_id=str(version.agent_id or version.id),
                    name=version.name,
                    tone=str(persona.get("tone") or "friendly"),
                    language=language,
                    # 10.4: mesmas colunas da radial no toque outbound.
                    presentation_mode=version.presentation_mode,
                    guidelines=tuple(persona.get("guidelines") or ()),
                    adaptation=version.adaptation_flags,
                    base_instructions=version.base_prompt or "",
                ),
                mission=resolved,
                state=StateBlock(
                    moment_ids=tuple(str(m) for m in moment_view.moment_ids),
                    moment_facts=moment_view.facts,
                    moment_public_claim=moment_view.public_claim,
                    grant_id=None,
                    grant_lines=grant_lines,
                    ledger_lines=(),
                    contact_facts=agent_repo.contact_fact_pairs(state),
                    purchase_lines=orders_repo.history_lines(purchase),
                ),
                channel=ChannelBlock(
                    channel=job.preferred_channel,
                    window_open=window_open,
                    constraints=(),
                ),
                conversation=ConversationBlock(
                    conversation_id=str(job.conversation_id),
                    transcript=tuple((m.author, m.text) for m in transcript),
                    pending=(),
                ),
                mode="turn",
            )

            chat = _metered(conn, job, agent_llm, clock, "agent_reply")
            judge = PreSendJudge(
                _metered(conn, job, llm, clock, "judge_pre"),
                with_merchant_judges(rubrics, version.settings),
            )
            context = JudgeContext(
                conversation=tuple(f"{m.author}: {m.text}" for m in transcript[-5:]),
                knowledge=(),
                language=language,
                never_say_ai=True,
            )
            conversation = _as_chat(transcript)

            async def generate(attempt: int, feedback: tuple[str, ...]) -> str:
                messages = [Message(role="system", content=compiled.text), *conversation]
                if feedback:
                    messages.append(
                        Message(
                            role="system",
                            content=(
                                "A resposta anterior foi reprovada nos critérios: "
                                f"{', '.join(feedback)}. Reescreva corrigindo isso."
                            ),
                        )
                    )
                answer = await chat.chat(
                    ChatRequest(
                        model=version.config.model,
                        messages=tuple(messages),
                        think=False,
                    )
                )
                return answer.text

            outcome = await guarded_reply(generate, judge, context=context)

            for judgement in outcome.judgements:
                async with conn.transaction():
                    await scope_to_organization(conn, job.organization_id)
                    await scores_repo.record_pre_send_score(
                        conn,
                        organization_id=job.organization_id,
                        conversation_id=job.conversation_id,
                        judge_model=JUDGE_MODEL,
                        score=judgement.score,
                        verdict=judgement.outcome,
                        rationale=judgement.rationale,
                    )

            if outcome.draft is None:
                await _alert(
                    conn, job,
                    type=alerts_repo.CRITICAL_VIOLATION,
                    severity="critical",
                    title="Judge 1 reprovou o toque e nada foi enviado",
                    payload={
                        "node_ref": job.node_ref,
                        "blocked_by": outcome.blocked_by,
                        "attempts": outcome.attempts,
                    },
                )
                return TouchDraft(None, (), mission_version_id)

            return TouchDraft(
                content={"text": outcome.draft},
                moment_ids=moment_view.moment_ids,
                mission_version_id=mission_version_id,
            )

    return touch


async def _alert(
    conn: psycopg.AsyncConnection,
    job: MissionTouchJob,
    *,
    type: str,
    title: str,
    payload: dict,
    severity: str = "warning",
) -> None:
    async with conn.transaction():
        await scope_to_organization(conn, job.organization_id)
        await alerts_repo.open_alert(
            conn,
            organization_id=job.organization_id,
            type=type,
            severity=severity,
            title=title,
            payload={**payload, "conversation_id": str(job.conversation_id)},
        )


def agent_toucher(dsn: str):
    """A fábrica que `AGENTS_TOUCHER` aponta — o toque real em produção."""
    return build_toucher(
        dsn,
        llm=openrouter.from_env(),
        set_role=os.environ.get("AGENTS_WORKER_SET_ROLE"),
        agent_llm_from_org_keys=True,
        base_secret=os.environ.get("ENCRYPTION_KEY") or None,
    )
