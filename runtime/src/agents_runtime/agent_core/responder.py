"""O responder — a costura entre o motor e o agente real.

O E1 deixou a costura pronta: `respond(job) -> dict | None`, chamada pelo worker
dentro da FASE 2. O E2 troca a resposta fixa pelo agente de verdade **sem tocar
no motor** (Lei 1 do plano): tudo o que segue acontece dentro desta função.

**D5 na prática.** A assinatura do §3 (`respond(conversation, pending_msgs) ->
draft`) vive DENTRO daqui: a fábrica devolve a forma que o motor conhece e, por
dentro, carrega conversa e pendentes em transações curtas próprias e chama o
núcleo. Sem isso, a Lei 1 cairia no primeiro passo.

**Nenhuma transação atravessa uma chamada de rede.** As leituras acontecem numa
transação curta que fecha antes do LLM; a busca de conhecimento abre a sua
(dentro da tool, S7); a gravação dos scores abre outra depois. É o ADR-6 valendo
dentro do responder, não só no motor.

**O portão é estrutura, não boa intenção (pendência do S8, fechada aqui).** A
nota de cada tentativa e o alerta do não-envio são gravados por este arquivo —
não pelo chamador, que poderia esquecer.

O que NÃO existe no E2, declarado: `get_customer_context` (S7) não tem
consumidor aqui porque a camada `customer_context` do RF-010 fala de PEDIDOS, e
o espelho de pedidos chega no E3 — inventar um "cliente sem histórico" para
quem já conversou três vezes seria pior que a ausência (decisão 86d).
"""

import os
from collections.abc import Awaitable, Callable, Sequence
from datetime import timedelta
from functools import partial
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg

import agents_runtime
from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.llm import ChatRequest, LlmPort, Message
from agents_runtime.agent_core.metering import CallRecord, MeteredLlm
from agents_runtime.agent_core.mission_resolver import (
    DISCOVERY_EVENT,
    MissionUnavailable,
    arbitrate,
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
from agents_runtime.agent_core.think_gate import PendingMessage, should_think
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.evals.pack import load_rubrics
from agents_runtime.judges.pre_send import (
    JUDGE_MODEL,
    JudgeContext,
    PreSendJudge,
    guarded_reply,
)
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import alerts as alerts_repo
from agents_runtime.repository import judge_scores as scores_repo
from agents_runtime.repository import llm_calls as llm_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext, run_tool
from agents_runtime.tools.knowledge import SearchKnowledge

#: A costura do motor, intocada desde o E1: o worker chama isto e nada mais.
#: `None` significa "conclua o turno e não envie nada" (S8).
Responder = Callable[[InboundJob], Awaitable[dict[str, Any] | None]]

FIXED_REPLY = "Recebemos sua mensagem! Já estamos cuidando do seu pedido. 🧡"

# The E1 touch — what an abandonment event says until the funnel copy (E3)
# exists. Constant for the same reason the E1 reply was.
FIXED_TOUCH = "Vimos que ficou algo no seu carrinho! Posso ajudar a finalizar? 🧡"

#: Quantas mensagens de histórico acompanham a pergunta.
TRANSCRIPT_LIMIT = 20

#: Variável de ambiente que sobrescreve de onde as rubricas do Judge 1 são lidas.
RUBRICS_DIRECTORY_VARIABLE = "AGENTS_RUBRICS_DIR"


def fixed_responder(text: str = FIXED_REPLY):
    """A resposta constante do E1. Continua existindo porque os cenários do
    motor a usam: enquanto a resposta é fixa, toda diferença observada é do
    motor."""

    async def respond(job: InboundJob) -> dict[str, Any]:
        return {"text": text}

    return respond


class NoActiveVersion(RuntimeError):
    """A conta não tem versão ativa. Não é caso de improvisar um prompt: é
    configuração faltando, e o lugar disso é a escada de retentativa até a DLQ,
    onde um humano vê."""


def default_rubrics_directory() -> Path:
    """`runtime/evals/rubrics` no repositório, `/app/evals/rubrics` na imagem.

    O caminho é derivado do pacote instalado, não do diretório de trabalho: o
    processo sobe de dentro de um container cujo cwd não é o repositório.
    """
    override = os.environ.get(RUBRICS_DIRECTORY_VARIABLE)
    if override:
        return Path(override)
    return Path(agents_runtime.__file__).parents[2] / "evals" / "rubrics"


def _as_chat(messages: Sequence[PendingMessage]) -> list[Message]:
    """A conversa na gramática do provedor: o contato é `user`, o agente é
    `assistant`. Um humano em takeover também fala como o agente — para o
    modelo, é a mesma voz da loja."""
    return [
        Message(
            role="user" if message.author == "contact" else "assistant",
            content=message.text,
        )
        for message in messages
    ]


def build_responder(
    dsn: str,
    *,
    llm: LlmPort,
    clock: Clock | None = None,
    rubrics_directory: Path | None = None,
    set_role: str | None = None,
    knowledge_limit: int = 5,
    agent_llm_from_org_keys: bool = False,
    base_secret: str | None = None,
):
    """O responder real. `llm` é a porta da PLATAFORMA (Judge 1 + embeddings —
    D4); com `agent_llm_from_org_keys` ligado (produção), a resposta do agente
    sai pela cascata BYO de organization_api_keys. Nos testes, desligado: o
    dublê injetado serve para tudo."""
    clock = clock or SystemClock()
    rubrics = load_rubrics(rubrics_directory or default_rubrics_directory())

    async def respond(job: InboundJob) -> dict[str, Any] | None:
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
                pending = await agent_repo.load_pending_messages(
                    conn,
                    conversation_id=job.conversation_id,
                    after_seq=state.last_processed_seq,
                    target_seq=job.target_seq,
                )
                transcript = await agent_repo.load_recent_transcript(
                    conn, conversation_id=job.conversation_id, limit=TRANSCRIPT_LIMIT
                )
                owner_mission = None
                if state is not None and state.owner_mission_version_id is not None:
                    owner_event = await missions_repo.load_mission_event_type(
                        conn, mission_version_id=state.owner_mission_version_id
                    )
                    if owner_event is not None:
                        # A dona indica a FAMÍLIA; quem responde é a versão
                        # ativa dela (§3.2.2 passo 2).
                        owner_mission = await missions_repo.load_active_mission(
                            conn, event_type=owner_event
                        )
                discovery_mission = await missions_repo.load_active_mission(
                    conn, event_type=DISCOVERY_EVENT
                )
                key_rows = (
                    await keys_repo.load_org_provider_keys(
                        conn, organization_id=job.organization_id
                    )
                    if agent_llm_from_org_keys
                    else ()
                )

            if version is None:
                raise NoActiveVersion(f"tenant {job.organization_id} has no active agent version")

            if not pending:
                # Janela vazia: não há o que responder, e a conversa precisa
                # avançar mesmo assim — senão o coalescer a recria para sempre.
                return None

            metered = partial(_metered, conn, job, llm, clock)
            gate = should_think(pending)

            # --- arbitragem: uma missão vence o turno; sem nenhuma, alerta e
            # silêncio deliberado (a conversa avança; §3.4 inv. 8).
            try:
                winner, _losers = arbitrate(owner=owner_mission, discovery=discovery_mission)
            except MissionUnavailable:
                async with conn.transaction():
                    await scope_to_organization(conn, job.organization_id)
                    await alerts_repo.open_alert(
                        conn,
                        organization_id=job.organization_id,
                        type=alerts_repo.NO_ACTIVE_MISSION,
                        severity="warning",
                        title="Inbound sem missão ativa — nada foi respondido",
                        payload={"conversation_id": str(job.conversation_id)},
                    )
                return None

            resolved = merge_mission(
                winner, None, agent_tools=version.config.enabled_tools
            )

            # --- cascata D4 (BYO-only): sem chave da org, o toque morre alto.
            agent_llm: LlmPort = llm
            if agent_llm_from_org_keys:
                try:
                    agent_llm = resolve_agent_llm(
                        key_rows,
                        agent_provider=version.provider,
                        base_secret=base_secret,
                    )
                except NoOrgLlmKey as reason:
                    async with conn.transaction():
                        await scope_to_organization(conn, job.organization_id)
                        await alerts_repo.open_alert(
                            conn,
                            organization_id=job.organization_id,
                            type="no_org_llm_key",
                            severity="critical",
                            title="Sem chave de LLM da organização — agente não respondeu",
                            payload={
                                "conversation_id": str(job.conversation_id),
                                "reason": str(reason),
                            },
                        )
                    return None

            knowledge = await _knowledge(
                conn,
                job,
                resolved.tools,
                pending,
                metered("embedding"),
                clock,
                knowledge_limit,
            )

            persona = version.persona or {}
            language = str(persona.get("language") or settings.primary_language)
            agent_block = AgentBlock(
                agent_id=str(version.agent_id or version.id),
                name=version.name,
                tone=str(persona.get("tone") or "friendly"),
                language=language,
                presentation_mode="nome_funcao",
                guidelines=tuple(persona.get("guidelines") or ()),
                adaptation=(),
                base_instructions=version.base_prompt or "",
            )
            window_open = True
            if state.last_inbound_at is not None:
                window_open = clock.now() - state.last_inbound_at < timedelta(hours=24)
            compiled = compile_prompt(
                agent=agent_block,
                mission=resolved,
                state=StateBlock(
                    moment_ids=(),
                    moment_facts=(),
                    moment_public_claim=None,
                    grant_id=None,
                    grant_lines=(),
                    ledger_lines=(),
                    contact_facts=(
                        (("nome", state.contact_name),) if state.contact_name else ()
                    ),
                ),
                channel=ChannelBlock(
                    channel=state.last_channel or "whatsapp",
                    window_open=window_open,
                    constraints=(),
                ),
                conversation=ConversationBlock(
                    conversation_id=str(job.conversation_id),
                    transcript=tuple((m.author, m.text) for m in transcript),
                    pending=tuple((m.author, m.text) for m in pending),
                ),
                mode="turn",
            )
            system = compiled.text
            if knowledge:
                # Conhecimento é recuperação, não área de config — anexa ao
                # frame sem virar bloco de dono (registro em tool_calls).
                system += "\n\n# CONHECIMENTO\n" + "\n".join(
                    f"- {chunk}" for chunk in knowledge
                )
            conversation = _as_chat(transcript)

            chat = _metered(conn, job, agent_llm, clock, "agent_reply")
            judge = PreSendJudge(metered("judge_pre"), rubrics)
            context = JudgeContext(
                conversation=tuple(f"{message.author}: {message.text}" for message in pending),
                knowledge=tuple(knowledge),
                language=language,
                never_say_ai=True,
            )

            async def generate(attempt: int, feedback: tuple[str, ...]) -> str:
                messages = [Message(role="system", content=system), *conversation]
                if feedback:
                    # Regenerar sem dizer o que estava errado é repetir.
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
                        think=gate.think,
                    )
                )
                return answer.text

            outcome = await guarded_reply(generate, judge, context=context)

            # --- o rastro: uma nota por tentativa (RNF-050), transação própria
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
                # O alerta vem ANTES da conclusão: uma morte no meio deixa
                # alerta duplicado (benigno e visível) em vez de silêncio.
                async with conn.transaction():
                    await scope_to_organization(conn, job.organization_id)
                    await alerts_repo.open_alert(
                        conn,
                        organization_id=job.organization_id,
                        type=alerts_repo.CRITICAL_VIOLATION,
                        severity="critical",
                        title="Judge 1 reprovou a resposta e nada foi enviado",
                        payload={
                            "conversation_id": str(job.conversation_id),
                            "blocked_by": outcome.blocked_by,
                            "attempts": outcome.attempts,
                            "think": gate.think,
                            "think_reason": gate.reason,
                        },
                    )
                return None

            return {"text": outcome.draft}

    return respond


def agent_responder(dsn: str):
    """A fábrica que `AGENTS_RESPONDER` aponta — o agente real em produção.

    Resolve o que só o ambiente sabe (a chave do provedor, o role do pool) e
    entrega a costura do motor. Chave ausente mata o processo na largada: é a
    diferença entre um deploy que falha e um agente que emudece em produção.
    """
    return build_responder(
        dsn,
        llm=openrouter.from_env(),
        set_role=os.environ.get("AGENTS_WORKER_SET_ROLE"),
        agent_llm_from_org_keys=True,
        base_secret=os.environ.get("ENCRYPTION_KEY") or None,
    )


def _metered(
    conn: psycopg.AsyncConnection,
    job: InboundJob,
    llm: LlmPort,
    clock: Clock,
    purpose: str,
) -> MeteredLlm:
    """Um medidor por finalidade: o custo do agente e o custo do portão são
    linhas diferentes da mesma conta."""
    return MeteredLlm(
        llm,
        clock=clock,
        record=_recorder(conn, job.organization_id, job.conversation_id),
        purpose=purpose,
    )


def _recorder(conn: psycopg.AsyncConnection, organization_id: UUID, conversation_id: UUID):
    async def record(call: CallRecord) -> None:
        async with conn.transaction():
            await scope_to_organization(conn, organization_id)
            await llm_repo.record_llm_call(
                conn,
                organization_id=organization_id,
                purpose=call.purpose,
                provider=call.provider,
                model=call.model,
                conversation_id=conversation_id,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                cost_usd=call.cost_usd,
                latency_ms=call.latency_ms,
            )

    return record


async def _knowledge(
    conn: psycopg.AsyncConnection,
    job: InboundJob,
    enabled_tools: tuple[str, ...],
    pending: Sequence[PendingMessage],
    embedder: MeteredLlm,
    clock: Clock,
    limit: int,
) -> tuple[str, ...]:
    """A camada de conhecimento, buscada antes de gerar.

    No E2 a recuperação é determinística em vez de decidida pelo modelo: as duas
    tools do marco são contexto incondicional, e uma ida e volta a mais custa
    segundos numa conversa de WhatsApp. Tool que o modelo ESCOLHE chega no E3,
    quando existir escolha a fazer (pedido por id, rastreio). O registro em
    `tool_calls` é o mesmo — quem executa é o `run_tool` do S7.
    """
    if "search_knowledge" not in enabled_tools:
        return ()

    query = " ".join(message.text for message in pending if message.author == "contact")
    if not query.strip():
        return ()

    result = await run_tool(
        conn,
        SearchKnowledge(embedder, limit=limit),
        ToolContext(organization_id=job.organization_id, conversation_id=job.conversation_id),
        {"query": query},
        clock=clock,
    )
    if not result.success:
        # Conhecimento é contexto, não pré-requisito: sem ele o agente responde
        # com o que sabe, e a falha já ficou registrada em `tool_calls`.
        return ()

    return tuple(chunk["content"] for chunk in result.output.get("chunks", ()))

