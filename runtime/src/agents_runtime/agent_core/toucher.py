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

import json
import logging
import os
from dataclasses import dataclass, replace
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import psycopg

from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.guards import (
    evaluate_inbound_guards,
    resolve_blocked_topic,
    schedule_silence,
)
from agents_runtime.agent_core.llm import LlmPort, Message, ToolCall, ToolSpec
from agents_runtime.agent_core.metering import TurnBudget
from agents_runtime.agent_core.mission_resolver import (
    NodeDelta,
    merge_mission,
)
from agents_runtime.agent_core.prompt_compiler import (
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    agent_block,
    compile_prompt,
)
from agents_runtime.agent_core.providers import (
    NoOrgLlmKey,
    resolve_agent_llm,
    scoped_agent_llm,
)
from agents_runtime.agent_core.responder import (
    TRANSCRIPT_LIMIT,
    UNMIRRORED_DETAIL,
    _as_chat,
    _knowledge,
    _metered,
    default_turn_llm_call_limit,
    delivery_flags,
    transfer_to_human,
)
from agents_runtime.agent_core.tool_loop import generate_with_tools
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.commerce.moments import apply_moment_restrictions, resolve_moments
from agents_runtime.config import QueueingConfig, config_from_env
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
from agents_runtime.repository import custom_tools as custom_tools_repo
from agents_runtime.repository import engine as engine_repo
from agents_runtime.repository import judge_scores as scores_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import moments as moments_repo
from agents_runtime.repository import orders as orders_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.scope import (
    WORKER_ROLE,
    assert_rls_enforced,
    scope_to_organization,
    set_statement_timeout,
)
from agents_runtime.tools.base import ToolContext, run_tool
from agents_runtime.tools.coupon import CreateCoupon
from agents_runtime.tools.custom_http import CustomHttpTool, tool_spec_for
from agents_runtime.tools.knowledge import DEFAULT_LIMIT

logger = logging.getLogger(__name__)

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
        success_criteria=raw.get("success_criteria"),
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
    turn_llm_call_limit: int | None = None,
    config: QueueingConfig | None = None,
):
    """O toucher real. Mesmas costuras do build_responder — `llm` é a porta da
    PLATAFORMA (Judge 1 e embeddings); a fala do agente sai pela cascata BYO em produção.

    `turn_llm_call_limit` (item 41, fix round 1): o toque é o SEGUNDO tipo de
    turno que passa por `guarded_reply`/`MeteredLlm` — sem isto ele ficava
    inteiramente fora do teto de chamadas do item 41 (achado da review)."""
    clock = clock or SystemClock()
    config = config or QueueingConfig()
    from agents_runtime.agent_core.responder import default_rubrics_directory

    rubrics = load_rubrics(rubrics_directory or default_rubrics_directory())
    turn_llm_call_limit = (
        turn_llm_call_limit if turn_llm_call_limit is not None else default_turn_llm_call_limit()
    )

    async def touch(job: MissionTouchJob) -> TouchDraft:
        async with await psycopg.AsyncConnection.connect(
            dsn,
            autocommit=True,
            connect_timeout=config.connect_timeout_seconds,
        ) as conn:
            if set_role:
                await conn.execute("set role " + set_role)
            await set_statement_timeout(conn, config.statement_timeout_ms)
            await assert_rls_enforced(conn, WORKER_ROLE)

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
                # Item 30: o toque é o SEGUNDO produtor de fala do runtime, e
                # lê o mesmo estado que o turno de resposta lê.
                guard_state = await agent_repo.load_legacy_guard_state(
                    conn,
                    organization_id=job.organization_id,
                    conversation_id=job.conversation_id,
                    channel_account_id=job.channel_account_id,
                )
                # E3 — o toque também fala com quem já comprou (ou nunca
                # comprou): mesmo dado fixo do responder, mesma decisão 81b.
                purchase = await orders_repo.load_purchase_history(
                    conn,
                    organization_id=job.organization_id,
                    contact_id=state.contact_id,
                )
                custom_rows = await custom_tools_repo.load_enabled_custom_tools(conn)
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

            # --- chip de progresso no chat, o mesmo canal do responder. Sem
            # ele o toque calado por guard sumia: o nó pedia, recebia `queued`,
            # e nada acontecia — nem alerta (guard não é anomalia, e não deve
            # abrir um) nem motivo legível. Best-effort por contrato: sem
            # conversa no espelho o passo some num `false` silencioso, e um
            # chip perdido jamais custa um turno.
            run_id = uuid4()

            async def note_step(step_name: str, step_detail: str | None = None) -> None:
                try:
                    await engine_repo.emit_ai_run_step(
                        conn,
                        organization_id=job.organization_id,
                        run_id=run_id,
                        step=step_name,
                        detail=step_detail,
                        agent_id=version.agent_id,
                        conversation_id=job.conversation_id,
                        channel_account_id=job.channel_account_id,
                    )
                except Exception:  # adereço nunca vira causa de morte do turno
                    logger.debug("run-step emit failed", exc_info=True)

            # --- guards de comportamento (item 30): o MESMO módulo puro do
            # turno de resposta. O toque nasce de `emit_ai_mission_job`, fora
            # do ingest, então nada do que o webhook freia vale para ele — sem
            # isto, o toque desfazia pela outra porta a transferência que o
            # próprio item 30 construiu.
            #
            # Handoff por keyword é o único que não se aplica: não há inbound
            # num toque. Todo o resto vale, e vale MAIS aqui: falar por cima do
            # atendente, ou às 3h da manhã, é pior quando ninguém pediu nada.
            #
            # Silêncio de guard não abre alerta: é comportamento que a loja
            # configurou, não anomalia — ao contrário de "sem missão ativa".
            # Mas deixa passo: mudo sem motivo legível é o defeito (requisito 3
            # do brief), e vale para os dois produtores de fala.
            silence = evaluate_inbound_guards(
                version.settings,
                guard_state,
                agent_id=version.agent_id,
                now=clock.now(),
            ) or schedule_silence(version.settings, now=clock.now())
            if silence is not None:
                await note_step("skipped", silence.detail)
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
            # Item 40 da auditoria: só o cliente que ESTA chamada construiu
            # (via `resolve_agent_llm`) é fechado por `scoped_agent_llm`
            # abaixo. `llm` é o cliente de plataforma do Judge 1 — por
            # processo, ruling D — e nunca passa por aqui dentro. A posse vem
            # da PRÓPRIA cascata (`built_here`, item 52), não é `True` fixo
            # aqui: quem sabe se construiu ou tomou emprestado é quem resolveu.
            owns_agent_llm = False
            if agent_llm_from_org_keys:
                try:
                    agent_llm_choice = resolve_agent_llm(
                        key_rows, agent_provider=version.provider, base_secret=base_secret
                    )
                    # Por atributo, não por desempacotamento posicional — ver
                    # o gêmeo em `responder.py`.
                    agent_llm = agent_llm_choice.port
                    owns_agent_llm = agent_llm_choice.built_here
                except NoOrgLlmKey as reason:
                    await _alert(
                        conn, job,
                        type="no_org_llm_key",
                        severity="critical",
                        title="Sem chave de LLM da organização — toque não saiu",
                        payload={"reason": str(reason), "node_ref": job.node_ref},
                    )
                    return TouchDraft(None, (), None)

            async with scoped_agent_llm(agent_llm, owns=owns_agent_llm):
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
                            **(
                                {"value": request["value"]}
                                if request.get("value") is not None
                                else {}
                            ),
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

                # Um teto para embedding, resposta e juiz, como no responder.
                turn_budget = TurnBudget(limit=turn_llm_call_limit)
                knowledge = await _knowledge(
                    conn, job, resolved.tools, resolved.objective,
                    _metered(
                        conn, job, llm, clock, "embedding", version.agent_id,
                        budget=turn_budget,
                    ),
                    clock, DEFAULT_LIMIT,
                )

                turn_tools: dict[str, CustomHttpTool] = {}
                tool_specs: tuple[ToolSpec, ...] = ()
                for row in custom_rows:
                    if row.name == "create_coupon":
                        continue
                    turn_tools[row.name] = CustomHttpTool(row, base_secret=base_secret)
                    tool_specs = (*tool_specs, tool_spec_for(row))

                async def run_turn_tool(call: ToolCall) -> str:
                    tool = turn_tools.get(call.name)
                    if tool is None:
                        payload = {"error": f"tool desconhecida: {call.name}"}
                    else:
                        result = await run_tool(
                            conn,
                            tool,
                            ToolContext(
                                organization_id=job.organization_id,
                                conversation_id=job.conversation_id,
                            ),
                            dict(call.arguments),
                            clock=clock,
                        )
                        payload = (
                            dict(result.output or {})
                            if result.success
                            else {"error": result.error}
                        )
                    return json.dumps(payload, ensure_ascii=False)

                agent = agent_block(version, settings)
                window_open = (
                    state.last_inbound_at is not None
                    and clock.now() - state.last_inbound_at < timedelta(hours=24)
                )
                compiled = compile_prompt(
                    agent=agent,
                    # A oferta do toque contém só consultas custom. O cupom já
                    # foi materializado por concession_request e entra como fato.
                    mission=replace(resolved, tools=tuple(turn_tools)),
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
                    ),
                    conversation=ConversationBlock(
                        conversation_id=str(job.conversation_id),
                        transcript=tuple((m.author, m.text) for m in transcript),
                    ),
                    mode="turn",
                    knowledge=knowledge,
                )

                chat = _metered(
                    conn, job, agent_llm, clock, "agent_reply", version.agent_id,
                    budget=turn_budget,
                )
                judge = PreSendJudge(
                    _metered(
                        conn, job, llm, clock, "judge_pre", version.agent_id,
                        budget=turn_budget,
                    ),
                    with_merchant_judges(rubrics, version.settings),
                )
                context = JudgeContext(
                    conversation=tuple(f"{m.author}: {m.text}" for m in transcript[-5:]),
                    knowledge=knowledge,
                    # Lida de volta do bloco do agente, não recalculada — uma
                    # fórmula só para a língua em todo o runtime (item 45).
                    language=agent.language,
                    never_say_ai=settings.never_say_ai,
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
                    return await generate_with_tools(
                        chat,
                        model=version.config.model,
                        messages=tuple(messages),
                        tools=tool_specs,
                        execute=run_turn_tool,
                        think=False,
                    )

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
                    # Item 41: mesma correção do responder — um título que
                    # culpasse o Judge 1 por um estouro de teto mentiria sobre
                    # a causa (regra da casa).
                    title = (
                        "Teto de custo do toque foi atingido antes de haver "
                        "rascunho aprovável — nada foi enviado"
                        if outcome.blocked_by == "budget_exceeded"
                        else "Judge 1 reprovou o toque e nada foi enviado"
                    )
                    await _alert(
                        conn, job,
                        type=alerts_repo.CRITICAL_VIOLATION,
                        severity="critical",
                        title=title,
                        payload={
                            "node_ref": job.node_ref,
                            "blocked_by": outcome.blocked_by,
                            "attempts": outcome.attempts,
                        },
                    )
                    return TouchDraft(None, (), mission_version_id)

                # --- blocked_topics (item 30): o toque é uma SAÍDA, e o ruling do
                # brief põe este guard do lado da saída. Transfere como no
                # responder — marca o handoff, abre o alerta, não envia.
                topic = resolve_blocked_topic(version.settings, outcome.draft)
                if topic is not None:
                    marked = await transfer_to_human(
                        conn,
                        organization_id=job.organization_id,
                        conversation_id=job.conversation_id,
                        reason="blocked_topic",
                        channel_account_id=job.channel_account_id,
                        severity="critical",
                        title="Toque tocou num assunto proibido — nada foi enviado",
                        payload={
                            "topic": topic,
                            "node_ref": job.node_ref,
                            # O bloqueio segura o envio, não a evidência.
                            "draft": outcome.draft,
                        },
                    )
                    # Item 44: o booleano é lido aqui como no responder. O
                    # alerta já sai certo dos dois lados (a escalada de
                    # severidade e o sufixo do título moram DENTRO de
                    # `transfer_to_human`); o que se perdia era só o chip —
                    # quem opera o inbox lia "transferido" e ia embora, sem
                    # saber que a IA continuou ligada nessa conversa porque
                    # não há espelho onde escrever a marca.
                    await note_step(
                        "transferred",
                        f"Assunto proibido no toque (“{topic}”)"
                        + ("" if marked else UNMIRRORED_DETAIL),
                    )
                    return TouchDraft(None, (), mission_version_id)

                # As flags de entrega viajam COM o envio, como no responder: o
                # `content` do rascunho vira `payload` da outbox, e o sender lê
                # `humanize` de lá (`queueing/sender.py`). Sem elas o toque caía
                # no default LIGADO — o lojista desligava "dividir em bolhas" e
                # "ritmo de digitação" na órbita → Adaptação → Entrega, valia
                # nas respostas e era ignorado nos toques. Configuração salva
                # que não faz nada é pior que configuração ausente (item 30).
                split, rhythm = delivery_flags(version.settings)
                return TouchDraft(
                    content={"text": outcome.draft, "humanize": {"split": split, "rhythm": rhythm}},
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
        config=config_from_env(dict(os.environ)),
    )
