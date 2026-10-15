"""Simulação de turno — o painel Testar do editor (alteração 2026-10-15-12).

O MESMO caminho de um turno real (prompt compilado com missão e regras,
conhecimento do agente, ferramentas, Juiz 1 com as rubricas da plataforma e
os juízes do lojista), em sandbox:

  * não há conversa nem lease: nada é gravado em `conversations`,
    `messages`, `internal.message_outbox`, `incentive_grants` ou
    `internal.tool_calls`;
  * ferramentas que ESCREVEM (CRM, transferências, cupom) não executam —
    devolvem "simulado: faria X com estes argumentos";
  * ferramentas que só LEEM (produto, pedido) executam de verdade;
  * toda chamada de LLM é registrada em `internal.llm_calls` com
    `purpose='playground'` — custo de teste visível e separado do de produção;
  * o rascunho do agente (persona/settings/prompt ainda não salvos) vence a
    versão gravada, para o lojista testar antes de salvar.

A parte pura (aplicar o rascunho, montar o estado do perfil de contato,
decidir o que é escrita) tem teste de unidade; `simulate_turn` junta banco e
rede e é chamada pelo listener HTTP (`server.py`).
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from functools import partial
from typing import Any
from uuid import UUID, uuid4

from agents_runtime.agent_core.llm import LlmPort, Message, ToolCall, ToolSpec
from agents_runtime.agent_core.metering import CallRecord, MeteredLlm, TurnBudget
from agents_runtime.agent_core.mission_resolver import merge_mission
from agents_runtime.agent_core.prompt_compiler import (
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    agent_block,
    compile_prompt,
)
from agents_runtime.agent_core.providers import NoOrgLlmKey, resolve_agent_llm, scoped_agent_llm
from agents_runtime.agent_core.tool_loop import generate_with_tools
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.evals.pack import load_rubrics
from agents_runtime.judges.pre_send import (
    JudgeContext,
    PreSendJudge,
    guarded_reply,
    with_merchant_judges,
)
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import knowledge as knowledge_repo
from agents_runtime.repository import llm_calls as llm_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.agent import ActiveVersion
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext
from agents_runtime.tools.builtin import builtin_tools_for

PURPOSE = "playground"
DEFAULT_EVENT = "whatsapp.received"
KNOWLEDGE_LIMIT = 5
MAX_HISTORY = 20

#: Ferramentas que mudam o mundo — no sandbox, só dizem o que fariam.
WRITE_TOOLS = frozenset(
    {"save_customer", "save_interests", "transfer_to_human", "transfer_to_agent", "create_coupon"}
)
#: Ferramentas que dependem de um contato real (não há um no sandbox).
CONTACT_TOOLS = frozenset({"timeline"})

PROFILES = ("novo", "recorrente", "carrinho")


class SimulationUnavailable(RuntimeError):
    """Volta para a rota como 422: agente inexistente, sem chave de LLM…"""


@dataclass(frozen=True, slots=True)
class ContactProfile:
    kind: str = "novo"
    name: str | None = None
    cart_value: float | None = None
    orders: int | None = None

    @classmethod
    def parse(cls, raw: Mapping[str, Any] | None) -> "ContactProfile":
        raw = raw or {}
        kind = str(raw.get("kind") or "novo")
        if kind not in PROFILES:
            kind = "novo"

        def number(key: str) -> float | None:
            try:
                value = raw.get(key)
                return None if value in (None, "") else float(value)
            except (TypeError, ValueError):
                return None

        orders = number("orders")
        return cls(
            kind=kind,
            name=(str(raw["name"]).strip() or None) if raw.get("name") else None,
            cart_value=number("cart_value"),
            orders=int(orders) if orders is not None else None,
        )


def apply_draft(version: ActiveVersion, draft: Mapping[str, Any] | None) -> ActiveVersion:
    """O rascunho não salvo vence a versão gravada, campo a campo. Só os
    campos que o editor manda; o resto fica como está. Pura."""
    if not draft:
        return version
    persona = {**(version.persona or {}), **dict(draft.get("persona") or {})}
    settings = {**(version.settings or {}), **dict(draft.get("settings") or {})}
    enabled = tuple((settings.get("tools") or {}).get("enabled") or version.config.enabled_tools)
    base_prompt = str(draft.get("system_prompt") or "").strip() or version.config.base_prompt
    config = replace(
        version.config,
        model=str(draft.get("model") or version.config.model),
        base_prompt=base_prompt,
        enabled_tools=enabled,
    )
    return replace(
        version,
        config=config,
        name=str(draft.get("name") or version.name),
        persona=persona,
        settings=settings,
        presentation_mode=str(draft.get("presentation_mode") or version.presentation_mode),
        client_adaptation=dict(draft.get("client_adaptation") or version.client_adaptation or {}),
    )


def profile_state(profile: ContactProfile) -> StateBlock:
    """O bloco ESTADO para o perfil escolhido no painel. Pura."""
    facts: list[tuple[str, str]] = []
    purchases: tuple[str, ...] = ()
    if profile.name:
        facts.append(("nome", profile.name))
    if profile.kind == "recorrente":
        orders = profile.orders or 3
        facts.append(("cliente", "recorrente"))
        purchases = (f"{orders} pedido(s) anteriores na loja",)
    elif profile.kind == "carrinho":
        value = profile.cart_value if profile.cart_value is not None else 250.0
        facts.append(("carrinho aberto", f"R$ {value:.2f}".replace(".", ",")))
    else:
        facts.append(("cliente", "primeiro contato"))
    return StateBlock(
        moment_ids=(),
        moment_facts=(),
        moment_public_claim=None,
        grant_id=None,
        grant_lines=(),
        ledger_lines=(),
        contact_facts=tuple(facts),
        purchase_lines=purchases,
    )


def simulated_tool_result(name: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
    """O que uma ferramenta de escrita devolve no sandbox. Pura."""
    return {
        "simulated": True,
        "would_call": name,
        "arguments": dict(arguments),
        "instruction": (
            "Simulação: a ação não foi executada. Continue a resposta como se ela "
            "tivesse sido feita."
        ),
    }


def as_chat(history: Sequence[Mapping[str, Any]], message: str) -> tuple[Message, ...]:
    """O histórico do painel como chat (contato = user, loja = assistant) e a
    mensagem nova no fim. Pura."""
    chat: list[Message] = []
    for entry in list(history)[-MAX_HISTORY:]:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        role = "user" if entry.get("author") in ("contact", "user", "cliente") else "assistant"
        chat.append(Message(role=role, content=text))
    if message.strip():
        chat.append(Message(role="user", content=message.strip()))
    return tuple(chat)


@dataclass
class SimulationTrace:
    reply: str | None = None
    blocked: bool = False
    blocked_by: str | None = None
    last_draft: str | None = None
    attempts: list[dict[str, Any]] = field(default_factory=list)
    tools: list[dict[str, Any]] = field(default_factory=list)
    knowledge: list[dict[str, Any]] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)
    mission: dict[str, Any] | None = None
    prompt_blocks: list[str] = field(default_factory=list)
    model: str | None = None
    provider: str | None = None
    cost_usd: float = 0.0
    cost_unknown: bool = False
    calls: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "reply": self.reply,
            "blocked": self.blocked,
            "blocked_by": self.blocked_by,
            "last_draft": self.last_draft,
            "attempts": self.attempts,
            "tools": self.tools,
            "knowledge": self.knowledge,
            "rules": self.rules,
            "mission": self.mission,
            "prompt_blocks": self.prompt_blocks,
            "model": self.model,
            "provider": self.provider,
            "cost_usd": round(self.cost_usd, 6),
            "cost_unknown": self.cost_unknown,
            "calls": self.calls,
        }


async def simulate_turn(
    conn: Any,
    *,
    organization_id: UUID,
    agent_id: UUID,
    message: str,
    history: Sequence[Mapping[str, Any]] = (),
    agent_draft: Mapping[str, Any] | None = None,
    mission_version_id: UUID | None = None,
    event_type: str = DEFAULT_EVENT,
    profile: ContactProfile | None = None,
    platform_llm: LlmPort,
    base_secret: str | None,
    rubrics_directory: Any = None,
    turn_llm_call_limit: int = 8,
    clock: Clock | None = None,
) -> SimulationTrace:
    clock = clock or SystemClock()
    profile = profile or ContactProfile()
    trace = SimulationTrace()
    sandbox_conversation = uuid4()

    # --- leitura: uma transação curta, fechada antes de qualquer rede
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        settings = await agent_repo.load_tenant_policy(conn, organization_id=organization_id)
        version = await agent_repo.load_version_for_preview(
            conn, organization_id=organization_id, agent_id=agent_id
        )
        if version is None:
            raise SimulationUnavailable("agente não encontrado nesta organização")
        if mission_version_id is not None:
            mission = await missions_repo.load_mission_by_id(
                conn, mission_version_id=mission_version_id
            )
        else:
            mission = await missions_repo.load_active_mission(
                conn, event_type=event_type, agent_id=agent_id
            )
        key_rows = await keys_repo.load_org_provider_keys(conn, organization_id=organization_id)
        has_knowledge = await knowledge_repo.has_knowledge(conn)
        rules = (
            await knowledge_repo.load_rules(conn, agent_id=agent_id) if has_knowledge else ()
        )

    version = apply_draft(version, agent_draft)
    trace.rules = list(rules)
    resolved = (
        merge_mission(mission, None, agent_tools=version.config.enabled_tools)
        if mission is not None
        else None
    )
    if resolved is not None:
        trace.mission = {
            "id": resolved.mission_version_id,
            "event_type": resolved.event_type,
            "objective": resolved.objective,
        }

    budget = TurnBudget(limit=turn_llm_call_limit)

    async def record(call: CallRecord) -> None:
        trace.calls += 1
        if call.cost_usd is None:
            trace.cost_unknown = True
        else:
            trace.cost_usd += float(call.cost_usd)
        try:
            async with conn.transaction():
                await scope_to_organization(conn, organization_id)
                await llm_repo.record_llm_call(
                    conn,
                    organization_id=organization_id,
                    purpose=PURPOSE,
                    provider=call.provider,
                    model=call.model,
                    conversation_id=None,
                    input_tokens=call.input_tokens,
                    output_tokens=call.output_tokens,
                    cost_usd=call.cost_usd,
                    latency_ms=call.latency_ms,
                    agent_id=agent_id,
                )
        except Exception:  # trilha nunca derruba a simulação
            pass

    def metered(llm: LlmPort) -> MeteredLlm:
        return MeteredLlm(llm, clock=clock, record=record, purpose=PURPOSE, budget=budget)

    # --- conhecimento do agente (mesma busca do turno)
    knowledge: tuple[str, ...] = ()
    if has_knowledge and message.strip():
        try:
            embedded = await metered(platform_llm).embed(
                [message.strip()], model=knowledge_repo.EMBEDDING_MODEL
            )
            async with conn.transaction():
                await scope_to_organization(conn, organization_id)
                chunks = await knowledge_repo.search_knowledge(
                    conn, embedding=embedded.vectors[0], limit=KNOWLEDGE_LIMIT, agent_id=agent_id
                )
            knowledge = tuple(chunk.content for chunk in chunks)
            trace.knowledge = [
                {
                    "content": chunk.content,
                    "source": chunk.source,
                    "source_id": str(chunk.source_id) if chunk.source_id else None,
                    "similarity": round(chunk.similarity, 4),
                }
                for chunk in chunks
            ]
        except Exception:  # conhecimento é contexto, não pré-requisito
            knowledge = ()

    agent = agent_block(version, settings)
    compiled = compile_prompt(
        agent=agent,
        mission=resolved,
        state=profile_state(profile),
        channel=ChannelBlock(channel="whatsapp", window_open=True),
        conversation=ConversationBlock(
            conversation_id=str(sandbox_conversation),
            transcript=tuple(
                ("contact" if e.get("author") in ("contact", "user", "cliente") else "agent",
                 str(e.get("text") or ""))
                for e in list(history)[-MAX_HISTORY:]
            ),
        ),
        mode="turn" if resolved is not None else "preview",
        knowledge=knowledge,
        rules=rules,
    )
    trace.prompt_blocks = [block.kind for block in compiled.blocks]

    # --- ferramentas: leitura executa, escrita simula
    tool_specs: tuple[ToolSpec, ...] = ()
    turn_tools: dict[str, Any] = {}
    for name, tool, spec in builtin_tools_for(version.config.enabled_tools, has_store=True):
        if name in CONTACT_TOOLS:
            continue
        turn_tools[name] = tool
        tool_specs = (*tool_specs, spec)
    if resolved is not None and "create_coupon" in resolved.tools:
        from agents_runtime.agent_core.responder import CREATE_COUPON_SPEC

        turn_tools["create_coupon"] = None
        tool_specs = (*tool_specs, CREATE_COUPON_SPEC)

    context = ToolContext(
        organization_id=organization_id,
        conversation_id=sandbox_conversation,
        agent_id=agent_id,
        last_question=message.strip() or None,
    )

    async def execute(attempt: int, call: ToolCall) -> str:
        arguments = dict(call.arguments)
        if call.name not in turn_tools:
            payload: dict[str, Any] = {"error": f"tool desconhecida: {call.name}"}
        elif call.name in WRITE_TOOLS:
            payload = simulated_tool_result(call.name, arguments)
        else:
            try:
                result = await turn_tools[call.name](conn, context, arguments)
                payload = dict(result.output or {}) if result.success else {"error": result.error}
            except Exception as exc:  # a simulação mostra o erro, não cai
                payload = {"error": str(exc)}
        trace.tools.append(
            {
                "attempt": attempt,
                "name": call.name,
                "arguments": arguments,
                "simulated": call.name in WRITE_TOOLS,
                "result": payload,
            }
        )
        return json.dumps(payload, ensure_ascii=False, default=str)

    try:
        choice = resolve_agent_llm(
            key_rows, agent_provider=version.provider, base_secret=base_secret
        )
    except NoOrgLlmKey as reason:
        raise SimulationUnavailable(str(reason)) from reason

    from agents_runtime.agent_core.responder import default_rubrics_directory

    rubrics = load_rubrics(rubrics_directory or default_rubrics_directory())
    judge = PreSendJudge(metered(platform_llm), with_merchant_judges(rubrics, version.settings))
    conversation = as_chat(history, message)
    judge_context = JudgeContext(
        conversation=tuple(
            f"{'contact' if m.role == 'user' else 'agent'}: {m.content}" for m in conversation[-1:]
        ),
        knowledge=knowledge,
        language=agent.language,
        never_say_ai=settings.never_say_ai,
    )

    async with scoped_agent_llm(choice.port, owns=choice.built_here) as agent_llm:
        chat = metered(agent_llm)

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
                execute=partial(execute, attempt),
            )

        outcome = await guarded_reply(generate, judge, context=judge_context)

    trace.model = version.config.model
    trace.provider = version.provider
    trace.reply = outcome.draft
    trace.blocked = outcome.draft is None
    trace.blocked_by = outcome.blocked_by
    trace.last_draft = outcome.last_draft
    trace.attempts = [
        {
            "attempt": index,
            "outcome": judgement.outcome,
            "score": round(judgement.score, 3),
            "failed": list(judgement.failed_criteria),
            "rationale": judgement.rationale,
        }
        for index, judgement in enumerate(outcome.judgements)
    ]
    return trace
