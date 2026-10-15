"""O copiloto do inbox — a sugestão para o atendente humano (alteração 2026-10-15-07).

Mesmo prompt do agente (`compile_prompt`), mesma cascata de chave BYO, mesma
trilha de custo (`purpose="copilot"`). O que muda em relação a um turno:

  * não passa pelo Juiz 1 — o texto não vai ao cliente, vai para a tela do
    atendente, que é o juiz aqui;
  * não grava outbox, não mexe na conversa, não executa ferramenta;
  * recebe o id da conversa do ESPELHO (o inbox só conhece esse) e resolve a
    canônica por `internal.canonical_conversation_for_mirror`.

A parte pura (montar as mensagens) fica em `copilot_messages`, com teste de
unidade; a parte com banco e rede fica em `suggest_reply`, chamada pelo
listener HTTP (`server.py`).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from agents_runtime.agent_core.llm import ChatRequest, LlmPort, Message
from agents_runtime.agent_core.metering import CallRecord, MeteredLlm
from agents_runtime.agent_core.prompt_compiler import (
    ChannelBlock,
    ConversationBlock,
    agent_block,
    compile_prompt,
)
from agents_runtime.agent_core.providers import NoOrgLlmKey, resolve_agent_llm, scoped_agent_llm
from agents_runtime.agent_core.think_gate import PendingMessage
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import knowledge as knowledge_repo
from agents_runtime.repository import llm_calls as llm_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.scope import scope_to_organization

COPILOT_INSTRUCTION = (
    "Você é o copiloto de um atendente HUMANO da loja. Escreva a próxima mensagem "
    "que o atendente deve enviar ao cliente, na voz e nas regras do agente acima, "
    "curta e pronta para enviar. Responda SÓ com o texto da mensagem, sem "
    "explicações, sem aspas e sem assinatura."
)

TRANSCRIPT_LIMIT = 20
KNOWLEDGE_LIMIT = 5


class CopilotUnavailable(RuntimeError):
    """O motivo volta para a rota do app como 422: conversa sem canônica,
    org sem agente ativo, org sem chave de LLM."""


@dataclass(frozen=True, slots=True)
class Suggestion:
    text: str
    model: str
    provider: str
    cost_usd: float | None


def copilot_messages(
    system_text: str,
    transcript: Sequence[PendingMessage],
    last_message: str,
) -> tuple[Message, ...]:
    """Pura: o frame do agente + a instrução do copiloto como `system`, a
    conversa como chat (contato = user, loja = assistant) e a última
    mensagem do cliente garantida no fim, sem duplicar."""
    chat: list[Message] = []
    for message in transcript:
        if not message.text:
            continue
        chat.append(
            Message(
                role="user" if message.author == "contact" else "assistant",
                content=message.text,
            )
        )
    last = (last_message or "").strip()
    if last and not (chat and chat[-1].role == "user" and chat[-1].content.strip() == last):
        chat.append(Message(role="user", content=last))
    return (
        Message(role="system", content=system_text + "\n\n" + COPILOT_INSTRUCTION),
        *chat,
    )


async def suggest_reply(
    conn: Any,
    *,
    organization_id: UUID,
    mirror_conversation_id: UUID | None,
    conversation_id: UUID | None,
    last_message: str,
    platform_llm: LlmPort,
    base_secret: str | None,
    clock: Clock | None = None,
) -> Suggestion:
    clock = clock or SystemClock()

    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        target = conversation_id
        if target is None and mirror_conversation_id is not None:
            target = await agent_repo.canonical_conversation_for_mirror(
                conn, organization_id=organization_id, mirror_conversation_id=mirror_conversation_id
            )
        if target is None:
            raise CopilotUnavailable("conversa sem correspondente na canônica")
        settings = await agent_repo.load_tenant_policy(conn, organization_id=organization_id)
        version = await agent_repo.load_active_version(conn, organization_id=organization_id)
        if version is None:
            raise CopilotUnavailable("a organização não tem agente ativo")
        state = await agent_repo.load_conversation_view(conn, conversation_id=target)
        if state is None:
            raise CopilotUnavailable("conversa não é desta organização")
        transcript = await agent_repo.load_recent_transcript(
            conn, conversation_id=target, limit=TRANSCRIPT_LIMIT
        )
        key_rows = await keys_repo.load_org_provider_keys(conn, organization_id=organization_id)
        has_knowledge = await knowledge_repo.has_knowledge(conn)

    async def record(purpose: str):
        async def _record(call: CallRecord) -> None:
            try:
                async with conn.transaction():
                    await scope_to_organization(conn, organization_id)
                    await llm_repo.record_llm_call(
                        conn,
                        organization_id=organization_id,
                        purpose=purpose,
                        provider=call.provider,
                        model=call.model,
                        conversation_id=target,
                        input_tokens=call.input_tokens,
                        output_tokens=call.output_tokens,
                        cost_usd=call.cost_usd,
                        latency_ms=call.latency_ms,
                        agent_id=version.agent_id,
                    )
            except Exception:  # trilha nunca derruba a sugestão
                pass

        return _record

    knowledge: tuple[str, ...] = ()
    query = (last_message or "").strip()
    if has_knowledge and query:
        embedder = MeteredLlm(
            platform_llm, clock=clock, record=await record("embedding"), purpose="embedding"
        )
        try:
            embedded = await embedder.embed([query], model=knowledge_repo.EMBEDDING_MODEL)
            async with conn.transaction():
                await scope_to_organization(conn, organization_id)
                chunks = await knowledge_repo.search_knowledge(
                    conn, embedding=embedded.vectors[0], limit=KNOWLEDGE_LIMIT
                )
            knowledge = tuple(chunk.content for chunk in chunks)
        except Exception:  # conhecimento é contexto, não pré-requisito
            knowledge = ()

    compiled = compile_prompt(
        agent=agent_block(version, settings),
        mission=None,
        state=None,
        channel=ChannelBlock(channel=state.last_channel or "whatsapp", window_open=True),
        conversation=ConversationBlock(
            conversation_id=str(target),
            transcript=tuple((m.author, m.text) for m in transcript),
        ),
        mode="preview",
        knowledge=knowledge,
    )

    try:
        choice = resolve_agent_llm(
            key_rows, agent_provider=version.provider, base_secret=base_secret
        )
    except NoOrgLlmKey as reason:
        raise CopilotUnavailable(str(reason)) from reason

    async with scoped_agent_llm(choice.port, owns=choice.built_here) as agent_llm:
        chat = MeteredLlm(agent_llm, clock=clock, record=await record("copilot"), purpose="copilot")
        result = await chat.chat(
            ChatRequest(
                model=version.config.model,
                messages=copilot_messages(compiled.text, transcript, last_message),
            )
        )
    return Suggestion(
        text=result.text.strip(),
        model=result.model,
        provider=result.provider,
        cost_usd=result.usage.cost_usd,
    )
