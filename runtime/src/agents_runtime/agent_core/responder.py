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

O que NÃO existe aqui, declarado: não há tool de contexto do cliente. A
`get_customer_context` (S7) nunca teve consumidor neste arquivo e foi apagada no
item 59; os fatos do contato e o histórico de pedidos chegam pelo bloco ESTADO
(`contact_fact_pairs` e `history_lines`), não por tool — inventar um "cliente
sem histórico" para quem já conversou três vezes seria pior que a ausência
(decisão 86d).
"""

import json
import logging
import os
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import timedelta
from functools import partial
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import psycopg

import agents_runtime
from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.guards import (
    evaluate_inbound_guards,
    resolve_blocked_topic,
    resolve_handoff,
    schedule_silence,
)
from agents_runtime.agent_core.llm import (
    ChatRequest,
    LlmPort,
    Message,
    ToolCall,
    ToolSpec,
)
from agents_runtime.agent_core.media import (
    is_store_media_line,
    media_apology,
    media_handoff,
    media_step_detail,
    speechless_media,
)
from agents_runtime.agent_core.metering import (
    DEFAULT_TURN_LLM_CALL_LIMIT,
    TURN_LLM_CALL_LIMIT_VARIABLE,
    CallRecord,
    MeteredLlm,
    TurnBudget,
)
from agents_runtime.agent_core.mission_resolver import (
    DISCOVERY_EVENT,
    MissionUnavailable,
    arbitrate,
    merge_mission,
)
from agents_runtime.agent_core.prompt_compiler import (
    ChannelBlock,
    ConversationBlock,
    StateBlock,
    agent_block,
    compile_prompt,
)
from agents_runtime.agent_core.providers import NoOrgLlmKey, resolve_agent_llm, scoped_agent_llm
from agents_runtime.agent_core.think_gate import PendingMessage, should_think
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
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import alerts as alerts_repo
from agents_runtime.repository import custom_tools as custom_tools_repo
from agents_runtime.repository import engine as engine_repo
from agents_runtime.repository import incentives as incentives_repo
from agents_runtime.repository import judge_scores as scores_repo
from agents_runtime.repository import llm_calls as llm_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import moments as moments_repo
from agents_runtime.repository import orders as orders_repo
from agents_runtime.repository import provider_keys as keys_repo
from agents_runtime.repository.scope import WORKER_ROLE, assert_rls_enforced, scope_to_organization
from agents_runtime.tools.base import ToolContext, run_tool
from agents_runtime.tools.coupon import BENEFIT_KINDS, OBJECT_KINDS, CreateCoupon
from agents_runtime.tools.custom_http import CustomHttpTool, tool_spec_for
from agents_runtime.tools.knowledge import SearchKnowledge

logger = logging.getLogger(__name__)


def delivery_flags(settings: Mapping | None) -> tuple[bool, bool]:
    """(dividir em bolhas, ritmo de digitação) de settings.delivery — os knobs
    da loja (órbita → Adaptação → Entrega, Pacote B 17/08). Lixo degrada para
    o padrão LIGADO: entrega humanizada é o default do produto."""
    delivery = settings.get("delivery") if isinstance(settings, Mapping) else None
    if not isinstance(delivery, Mapping):
        return (True, True)
    return (
        delivery.get("split_bubbles") is not False,
        delivery.get("typing_rhythm") is not False,
    )


#: A costura do motor, intocada desde o E1: o worker chama isto e nada mais.
#: `None` significa "conclua o turno e não envie nada" (S8).
Responder = Callable[[InboundJob], Awaitable[dict[str, Any] | None]]

FIXED_REPLY = "Recebemos sua mensagem! Já estamos cuidando do seu pedido. 🧡"

#: Quantas mensagens de histórico acompanham a pergunta.
TRANSCRIPT_LIMIT = 20

#: Variável de ambiente que sobrescreve de onde as rubricas do Judge 1 são lidas.
RUBRICS_DIRECTORY_VARIABLE = "AGENTS_RUBRICS_DIR"

#: Rodadas de tool por TENTATIVA de geração (9.3b). Esgotou, a chamada final
#: sai sem tools — o modelo é obrigado a concluir em texto. Regeneração do
#: Judge reabre o loop, e o dinheiro aguenta: o offer engine reusa antes de
#: emitir e o idempotency_key mata a duplicata no banco.
MAX_TOOL_ROUNDS = 3

#: O que o modelo lê antes de decidir pedir. A autoridade está no texto: quem
#: decide é o engine — o modelo só PEDE (§3.3.5).
CREATE_COUPON_SPEC = ToolSpec(
    name="create_coupon",
    description=(
        "Pede um benefício (cupom) para o objeto comercial da conversa. Quem "
        "decide é o offer engine: a resposta traz decision reused (já havia "
        "cupom vigente — use esse), issued (novo) ou denied (sem autorização; "
        "diga um não honesto). Use apenas quando o cliente pedir desconto ou "
        "benefício."
    ),
    parameters={
        "type": "object",
        "properties": {
            "object_kind": {"type": "string", "enum": list(OBJECT_KINDS)},
            "object_ref": {
                "type": "string",
                "description": "A referência do objeto, como aparece no ESTADO.",
            },
            "kind": {"type": "string", "enum": list(BENEFIT_KINDS)},
            "value": {"type": "number"},
        },
        "required": ["object_kind", "object_ref"],
    },
)


def _money_lines(grants: Sequence[incentives_repo.Grant]) -> tuple[str, ...]:
    """Grants vigentes como linhas do bloco de ESTADO (9.3a). O vocabulário
    espelha o do toucher (kind/value crus) — o agente lê os dois blocos com a
    mesma gramática; a diferença é o tempo verbal: aqui o benefício JÁ existe."""
    return tuple(
        "Cupom vigente {code}: {kind} {value}, válido até {until} "
        "— uso {uses}/{max_uses} ({object_kind} {object_ref})".format(
            code=grant.coupon_code,
            kind=grant.kind,
            value=grant.value,
            until=grant.validity_until.strftime("%d/%m"),
            uses=grant.uses,
            max_uses=grant.max_uses,
            object_kind=grant.object_kind,
            object_ref=grant.object_ref,
        )
        for grant in grants
    )


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


def default_turn_llm_call_limit() -> int:
    """Item 41 — o teto de chamadas de LLM por turno, lido uma vez na
    composição (mesmo padrão de `default_rubrics_directory` acima). O default
    e a conta de onde ele saiu estão em `metering.DEFAULT_TURN_LLM_CALL_LIMIT`
    e em `runtime/FORK.md`."""
    override = os.environ.get(TURN_LLM_CALL_LIMIT_VARIABLE)
    return int(override) if override else DEFAULT_TURN_LLM_CALL_LIMIT


def _as_chat(messages: Sequence[PendingMessage]) -> list[Message]:
    """A conversa na gramática do provedor: o contato é `user`, o agente é
    `assistant`. Um humano em takeover também fala como o agente — para o
    modelo, é a mesma voz da loja.

    A rubrica da mídia da loja fica de fora (item 31): aqui ela seria uma
    mensagem `assistant` inteiramente entre colchetes, isto é, uma instrução
    de palco servida como fala anterior do próprio modelo — a superfície de
    imitação que custou a esta casa a resposta crua de 17/08. Ela continua no
    bloco CONVERSA, onde é narração e não convite."""
    return [
        Message(
            role="user" if message.author == "contact" else "assistant",
            content=message.text,
        )
        for message in messages
        if not is_store_media_line(message)
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
    shopify_transport: httpx.AsyncBaseTransport | None = None,
    turn_llm_call_limit: int | None = None,
):
    """O responder real. `llm` é a porta da PLATAFORMA (Judge 1 + embeddings —
    D4); com `agent_llm_from_org_keys` ligado (produção), a resposta do agente
    sai pela cascata BYO de organization_api_keys. Nos testes, desligado: o
    dublê injetado serve para tudo.

    `turn_llm_call_limit` (item 41) é o teto de chamadas de LLM por turno —
    `None` lê o default/override de ambiente uma vez aqui, na composição, do
    mesmo jeito que `rubrics_directory` lê o seu."""
    clock = clock or SystemClock()
    rubrics = load_rubrics(rubrics_directory or default_rubrics_directory())
    turn_llm_call_limit = (
        turn_llm_call_limit if turn_llm_call_limit is not None else default_turn_llm_call_limit()
    )

    async def respond(job: InboundJob) -> dict[str, Any] | None:
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            if set_role:
                await conn.execute("set role " + set_role)
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
                pending = await agent_repo.load_pending_messages(
                    conn,
                    conversation_id=job.conversation_id,
                    after_seq=state.last_processed_seq,
                    target_seq=job.target_seq,
                )
                transcript = await agent_repo.load_recent_transcript(
                    conn,
                    conversation_id=job.conversation_id,
                    limit=TRANSCRIPT_LIMIT,
                    # Item 39: sem isso `transcript` quase sempre já continha a
                    # cauda de `pending` de novo (mesma mensagem, duas
                    # consultas) — a fonte do dobro de tokens de entrada por
                    # chamada. `pending` entra no array de chat separado, mais
                    # abaixo (`_as_chat(transcript + pending)`).
                    exclude_inbound_after_seq=state.last_processed_seq,
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
                active_moments = await moments_repo.load_active_moments(conn)
                # 9.3a — o dinheiro no inbound: o agente conhece o benefício
                # que JÁ existe (e a memória de pedidos negados) antes de
                # decidir o que dizer. Validade pelo relógio do banco, como
                # todo o resto do estado lido nesta transação.
                valid_grants = await incentives_repo.valid_grants_for_contact(
                    conn, contact_id=state.contact_id
                )
                ledger_lines = await incentives_repo.recent_ledger_lines(
                    conn, contact_id=state.contact_id
                )
                # E3 — dado fixo do prompt: o que este contato JÁ comprou.
                # None = org sem espelho; o prompt fica calado (decisão 81b).
                purchase = await orders_repo.load_purchase_history(
                    conn,
                    organization_id=job.organization_id,
                    contact_id=state.contact_id,
                )
                # Item 30: o estado que os guards de comportamento leem. Vem do
                # espelho legado do inbox porque a canônica não tem o dado —
                # ver `load_legacy_guard_state`.
                guard_state = await agent_repo.load_legacy_guard_state(
                    conn,
                    organization_id=job.organization_id,
                    conversation_id=job.conversation_id,
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
                raise NoActiveVersion(f"tenant {job.organization_id} has no active agent version")

            if not pending:
                # Janela vazia: não há o que responder, e a conversa precisa
                # avançar mesmo assim — senão o coalescer a recria para sempre.
                return None

            # Item 41: UM teto por turno, compartilhado pelas três finalidades
            # (agent_reply, judge_pre, embedding) que `metered(...)` constrói
            # abaixo — é por isso que o `TurnBudget` nasce aqui, fora delas.
            turn_budget = TurnBudget(limit=turn_llm_call_limit)
            metered = partial(_metered, conn, job, llm, clock, budget=turn_budget)
            gate = should_think(pending)

            # --- progresso no chat (pedido 17/08): os chips do inbox. Adereço
            # de UI por contrato — um chip perdido jamais custa um turno.
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
                    )
                except Exception:  # adereço nunca vira causa de morte do turno
                    logger.debug("run-step emit failed", exc_info=True)

            # --- guards de comportamento do lojista (item 30). Rodam ANTES de
            # qualquer trabalho caro — antes da cascata de chave BYO, antes do
            # LLM — porque calar cedo não custa nada, e é a ordem do TS.
            # O silêncio é sempre explicável: o motivo vai para o passo
            # `skipped`, o mesmo chip que o inbox já lê.
            silence = evaluate_inbound_guards(
                version.settings,
                guard_state,
                agent_id=version.agent_id,
                now=clock.now(),
            )
            if silence is not None:
                await note_step("skipped", silence.detail)
                return None

            # --- handoff por keyword (item 30): o cliente pediu um humano.
            # Depois dos guards e ANTES da cascata de chave BYO — um pedido de
            # atendente não pode depender de a loja ter chave de LLM válida
            # (cloud-runner.ts:571-577 diz isso com todas as letras).
            handoff = resolve_handoff(version.settings, tuple(m.text for m in pending))
            if handoff is not None:
                marked = await transfer_to_human(
                    conn,
                    organization_id=job.organization_id,
                    conversation_id=job.conversation_id,
                    reason="handoff_keyword",
                    severity="warning",
                    title="Cliente pediu atendimento humano — IA transferida",
                    payload={"keyword": handoff.keyword},
                )
                await note_step(
                    "transferred",
                    f"Cliente pediu atendimento humano (“{handoff.keyword}”)"
                    + ("" if marked else UNMIRRORED_DETAIL),
                )
                if not handoff.confirmation:
                    return None
                # A confirmação sai pelo caminho normal de envio. Falha na
                # entrega não desfaz a transferência: quem já foi passado para
                # um humano continua passado.
                split, rhythm = delivery_flags(version.settings)
                return {
                    "text": handoff.confirmation,
                    "humanize": {"split": split, "rhythm": rhythm},
                }

            # --- horário de atendimento (item 30). DEPOIS do handoff, como
            # no TS: lá o horário é checado dentro do engine (engine.ts:85-88),
            # que só roda depois do handoff por keyword — um pedido de
            # atendente fora do horário transfere, não vira silêncio.
            outside = schedule_silence(version.settings, now=clock.now())
            if outside is not None:
                await note_step("skipped", outside.detail)
                return None

            # --- mídia sem uma palavra (item 31). O runtime não transcreve
            # áudio nem enxerga imagem, e os dois NÃO são `unsupported` para o
            # webhook: o turno é agendado igual. Sem esta saída, a rajada vazia
            # ia para o modelo e ele escrevia sobre nada — resposta no vazio, o
            # pior dos dois desfechos.
            #
            # Depois dos guards, de propósito: eles decidem SE a loja fala;
            # isto decide o QUE ela diz. E antes da arbitragem e da cascata de
            # chave BYO, porque nada aqui precisa de missão nem de LLM — a
            # chamada seria token queimado para gerar a partir de nada.
            speechless = speechless_media(pending)
            if speechless is not None:
                # A loja pode ter configurado que mídia vai para humano em vez
                # de virar pedido de texto. É o mesmo knob do TS, e lá ele
                # também dispara por incapacidade ESTRUTURAL, não por falha:
                # `cloud-runner.ts:657-660` manda todo áudio ao fallback com
                # `no_stt_provider` quando a org não tem STT. Quem responde
                # nesse modo é o humano — o cliente não recebe nada da IA,
                # como no legado (`:210-241`).
                if media_handoff(version.settings):
                    marked = await transfer_to_human(
                        conn,
                        organization_id=job.organization_id,
                        conversation_id=job.conversation_id,
                        reason="media_handoff",
                        severity="warning",
                        title="Cliente enviou mídia que a IA não interpreta — IA transferida",
                        payload={"media_kind": speechless},
                    )
                    await note_step(
                        "transferred",
                        media_step_detail(speechless, handoff=True)
                        + ("" if marked else UNMIRRORED_DETAIL),
                    )
                    return None
                await note_step("started", media_step_detail(speechless))
                split, rhythm = delivery_flags(version.settings)
                return {
                    "text": media_apology(speechless, version.settings),
                    "humanize": {"split": split, "rhythm": rhythm},
                }

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
                await note_step("skipped", "Sem missão ativa para este evento — nada respondido")
                return None

            resolved = merge_mission(
                winner, None, agent_tools=version.config.enabled_tools
            )

            # --- momentos (§3.3.4): fatos somam; a frase promocional só entra
            # quando a missão vencedora promove; restrição acumula na missão.
            moment_view = resolve_moments(active_moments, promote=resolved.promote_moment)
            resolved = apply_moment_restrictions(resolved, moment_view)

            # --- cascata D4 (BYO-only): sem chave da org, o toque morre alto.
            agent_llm: LlmPort = llm
            # Item 40 da auditoria: só o cliente que ESTA chamada construiu (via
            # `resolve_agent_llm`/`client_for`) é fechado no `finally` abaixo.
            # `llm` é o cliente de plataforma do Judge 1 — por processo, ruling
            # D — e nunca passa por aqui dentro. A posse vem da PRÓPRIA cascata
            # (`built_here`, item 52), não é `True` fixo aqui: quem sabe se
            # construiu ou tomou emprestado é quem resolveu.
            owns_agent_llm = False
            if agent_llm_from_org_keys:
                try:
                    agent_llm_choice = resolve_agent_llm(
                        key_rows,
                        agent_provider=version.provider,
                        base_secret=base_secret,
                    )
                    # Por atributo, não por desempacotamento posicional: sem
                    # type checker no repositório, trocar a ordem dos dois
                    # passaria silencioso e fecharia o cliente de plataforma.
                    agent_llm = agent_llm_choice.port
                    owns_agent_llm = agent_llm_choice.built_here
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
                    await note_step("skipped", "Sem chave de LLM da loja — agente não respondeu")
                    return None

            async with scoped_agent_llm(agent_llm, owns=owns_agent_llm):
                knowledge = await _knowledge(
                    conn,
                    job,
                    resolved.tools,
                    pending,
                    metered("embedding", version.agent_id),
                    clock,
                    knowledge_limit,
                )

                agent = agent_block(version, settings)
                window_open = True
                if state.last_inbound_at is not None:
                    window_open = clock.now() - state.last_inbound_at < timedelta(hours=24)
                compiled = compile_prompt(
                    agent=agent,
                    mission=resolved,
                    state=StateBlock(
                        moment_ids=tuple(str(m) for m in moment_view.moment_ids),
                        moment_facts=moment_view.facts,
                        moment_public_claim=moment_view.public_claim,
                        grant_id=str(valid_grants[0].id) if valid_grants else None,
                        grant_lines=_money_lines(valid_grants),
                        ledger_lines=ledger_lines,
                        contact_facts=agent_repo.contact_fact_pairs(state),
                        purchase_lines=orders_repo.history_lines(purchase),
                    ),
                    channel=ChannelBlock(
                        channel=state.last_channel or "whatsapp",
                        window_open=window_open,
                    ),
                    conversation=ConversationBlock(
                        conversation_id=str(job.conversation_id),
                        transcript=tuple((m.author, m.text) for m in transcript),
                    ),
                    mode="turn",
                )
                # 9.1: o span do turno (aberto pelo worker) ganha os IDs que a
                # trilha interna já tem — telemetria e banco contam UMA história.
                annotate(
                    mission_version_id=resolved.mission_version_id,
                    moment_ids=(
                        ",".join(str(m) for m in moment_view.moment_ids)
                        if moment_view.moment_ids
                        else None
                    ),
                    grant_id=str(valid_grants[0].id) if valid_grants else None,
                )

                system = compiled.text
                if knowledge:
                    # Conhecimento é recuperação, não área de config — anexa ao
                    # frame sem virar bloco de dono (registro em tool_calls).
                    system += "\n\n# CONHECIMENTO\n" + "\n".join(
                        f"- {chunk}" for chunk in knowledge
                    )
                # Item 39: `transcript` já exclui a janela pendente (query em
                # `repository/agent.py::load_recent_transcript`), então concatenar
                # é seguro — nenhuma mensagem aparece duas vezes.
                conversation = _as_chat(transcript + pending)

                chat = _metered(
                    conn, job, agent_llm, clock, "agent_reply", version.agent_id, budget=turn_budget
                )
                # Juízes do lojista (radial → Juízes) entram como rubrica extra,
                # sempre standard — o veto de silêncio segue só da plataforma.
                judge = PreSendJudge(
                    metered("judge_pre", version.agent_id),
                    with_merchant_judges(rubrics, version.settings),
                )
                context = JudgeContext(
                    conversation=tuple(f"{message.author}: {message.text}" for message in pending),
                    knowledge=tuple(knowledge),
                    # A língua do juiz é a MESMA do bloco do agente — lida de
                    # volta dele, não recalculada: duas cópias da fórmula
                    # `persona["language"] or settings.primary_language` são o
                    # fóssil que este item existe para matar.
                    language=agent.language,
                    never_say_ai=settings.never_say_ai,
                )

                # --- 9.3b: as tools que o modelo pode PEDIR neste turno. A grade é
                # a interseção missão∩agente (permissão estreita); o dinheiro segue
                # decidido pelo offer engine dentro da própria tool.
                turn_tools: dict[str, Any] = {}
                tool_specs: tuple[ToolSpec, ...] = ()
                if "create_coupon" in resolved.tools:
                    turn_tools["create_coupon"] = CreateCoupon(
                        mission=resolved,
                        moment=active_moments[0] if active_moments else None,
                        base_secret=base_secret,
                        clock=clock,
                        transport=shopify_transport,
                    )
                    tool_specs = (CREATE_COUPON_SPEC,)
                # 10.7 — tools custom LIGADAS (ligar exigiu teste ok, CHECK do
                # schema). Read-only por construção: nunca abrem a porta do
                # dinheiro, então entram por serem do agente, sem passar pela
                # interseção de missão que governa create_coupon.
                for row in custom_rows:
                    if row.name in turn_tools:
                        continue
                    turn_tools[row.name] = CustomHttpTool(row, base_secret=base_secret)
                    tool_specs = (*tool_specs, tool_spec_for(row))

                async def run_turn_tool(call: ToolCall) -> str:
                    tool = turn_tools.get(call.name)
                    if tool is None:
                        payload: dict[str, Any] = {"error": f"tool desconhecida: {call.name}"}
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
                    for _ in range(MAX_TOOL_ROUNDS):
                        answer = await chat.chat(
                            ChatRequest(
                                model=version.config.model,
                                messages=tuple(messages),
                                think=gate.think,
                                tools=tool_specs,
                            )
                        )
                        if not answer.tool_calls:
                            # Cru de propósito: o desembrulho do envelope JSON
                            # mora em `guarded_reply` (item 44), o ponto único
                            # por onde este `generate` e o do toque passam.
                            # Desembrulhar aqui também seria a mesma correção
                            # duas vezes no mesmo caminho.
                            return answer.text
                        # A volta do loop: o pedido do modelo e a resposta da tool
                        # entram na conversa; nenhuma transação fica aberta aqui
                        # (run_tool abre e fecha as suas — ADR-6 vale no loop).
                        messages.append(
                            Message(
                                role="assistant",
                                content=answer.text,
                                tool_calls=answer.tool_calls,
                            )
                        )
                        for call in answer.tool_calls:
                            messages.append(
                                Message(
                                    role="tool",
                                    content=await run_turn_tool(call),
                                    tool_call_id=call.id,
                                )
                            )
                    # Rodadas esgotadas: a última chamada sai SEM tools — concluir
                    # em texto deixa de ser opcional.
                    answer = await chat.chat(
                        ChatRequest(
                            model=version.config.model,
                            messages=tuple(messages),
                            think=gate.think,
                        )
                    )
                    return answer.text

                await note_step("started", f"{version.name} assumiu a conversa")

                async def traced_generate(attempt: int, feedback: tuple[str, ...]) -> str:
                    await note_step(
                        "generating",
                        "Gerando resposta"
                        if attempt == 0
                        else "Refinando a resposta (ajustes da verificação)",
                    )
                    return await generate(attempt, feedback)

                async def traced_judge(draft: str, *args: Any, **kwargs: Any):
                    await note_step("judging", "Verificando a resposta antes de enviar")
                    return await judge(draft, *args, **kwargs)

                outcome = await guarded_reply(traced_generate, traced_judge, context=context)

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
                    # Item 41: se o motivo foi o teto do turno (e não o juiz),
                    # o título tem de dizer isso — um alerta que culpa o Judge
                    # 1 por uma reprovação que ele nunca chegou a fazer é o
                    # tipo de comentário/registro que mente (regra da casa).
                    budget_capped = outcome.blocked_by == "budget_exceeded"
                    title = (
                        "Teto de custo do turno foi atingido antes de haver "
                        "rascunho aprovável — nada foi enviado"
                        if budget_capped
                        else "Judge 1 reprovou a resposta e nada foi enviado"
                    )
                    # O alerta vem ANTES da conclusão: uma morte no meio deixa
                    # alerta duplicado (benigno e visível) em vez de silêncio.
                    async with conn.transaction():
                        await scope_to_organization(conn, job.organization_id)
                        await alerts_repo.open_alert(
                            conn,
                            organization_id=job.organization_id,
                            type=alerts_repo.CRITICAL_VIOLATION,
                            severity="critical",
                            title=title,
                            payload={
                                "conversation_id": str(job.conversation_id),
                                "blocked_by": outcome.blocked_by,
                                "attempts": outcome.attempts,
                                "think": gate.think,
                                "think_reason": gate.reason,
                                # "Quero ver o que ela iria mandar" (17/08): o veto
                                # segura o envio, não a evidência.
                                "draft": outcome.last_draft,
                                "judge_rationale": (
                                    outcome.judgement.rationale if outcome.judgement else None
                                ),
                            },
                        )
                    retained = (outcome.last_draft or "").strip()
                    preview = f" — ia enviar: “{retained[:120]}”" if retained else ""
                    skip_reason = (
                        "Teto de custo do turno atingido"
                        if budget_capped
                        else "Resposta retida pela verificação de qualidade"
                    )
                    await note_step("skipped", skip_reason + preview)
                    return None

                # --- blocked_topics (item 30): a última coisa antes do envio.
                # Os outros guards decidem sobre o que CHEGOU; este decide sobre o
                # que o modelo PRODUZIU, e por isso mora aqui e não lá em cima.
                # Não substitui o Judge 1: o juiz tem rubricas próprias e não
                # conhece a lista de assuntos que ESTE lojista proibiu.
                topic = resolve_blocked_topic(version.settings, outcome.draft)
                if topic is not None:
                    marked = await transfer_to_human(
                        conn,
                        organization_id=job.organization_id,
                        conversation_id=job.conversation_id,
                        reason="blocked_topic",
                        severity="critical",
                        title="Resposta tocou num assunto proibido — nada foi enviado",
                        # Mesma regra do veto do Judge 1: o bloqueio segura o
                        # envio, não a evidência.
                        payload={"topic": topic, "draft": outcome.draft},
                    )
                    await note_step(
                        "transferred",
                        f"Assunto proibido na resposta (“{topic}”)"
                        + ("" if marked else UNMIRRORED_DETAIL),
                    )
                    return None

                # As flags de entrega viajam COM o envio (payload da outbox): o
                # sender obedece por linha, sem env global (Pacote B 17/08).
                split, rhythm = delivery_flags(version.settings)
                return {"text": outcome.draft, "humanize": {"split": split, "rhythm": rhythm}}

    return respond


#: O que o passo e o título dizem quando a marca NÃO pegou. A transferência
#: mora no espelho legado, a dois saltos sem FK da canônica: conversa sem
#: identidade WhatsApp, ou sem linha no espelho, não pega a marca.
UNMIRRORED_DETAIL = " — a IA não foi desligada (conversa sem espelho no inbox)"


async def transfer_to_human(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    reason: str,
    severity: str,
    title: str,
    payload: dict,
) -> bool:
    """Tira a IA de cena e registra — devolvendo se a marca PEGOU.

    Um lugar só para os dois (três, com o toque) call sites, porque o defeito
    era justamente ninguém ler o booleano: `mark_ai_handoff` devolve false
    quando não há espelho onde escrever, e nesse caso `ai_enabled` continua
    true, o webhook não cancela nada, e a transferência não vale para os
    turnos seguintes. O alerta que dissesse "IA transferida" assim mesmo faria
    a operação acreditar numa transferência que não aconteceu.

    O alerta é deduplicado por conversa, motivo e SE A MARCA PEGOU: sem
    transferência efetiva o mesmo assunto pode reincidir a cada turno, e um
    `critical` novo por mensagem seria um alarme que ninguém consegue ler —
    mas deixar `mirrored` fora da chave fazia um `warning` ainda aberto engolir
    o `critical` "a IA não foi desligada". Dedup que suprime na direção da
    escalação está invertido, e nesse caso o alerta é o ÚNICO registro que
    sobra: o passo `transferred` não espelha pelo mesmo motivo que a marca não
    pegou.
    """
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        # Desliga a IA no espelho legado — é o freio que o webhook já respeita
        # para org migrada, então a transferência vale para os turnos
        # seguintes, não só para este.
        marked = await agent_repo.mark_ai_handoff(
            conn,
            organization_id=organization_id,
            conversation_id=conversation_id,
            reason=reason,
        )
        await alerts_repo.open_alert(
            conn,
            organization_id=organization_id,
            type=alerts_repo.HANDOFF,
            # Marca que não pegou é sempre grave: alguém precisa desligar a IA
            # na mão, e ninguém vai saber disso por outro caminho.
            severity=severity if marked else "critical",
            title=title if marked else title + UNMIRRORED_DETAIL,
            payload={
                **payload,
                "conversation_id": str(conversation_id),
                "reason": reason,
                "mirrored": marked,
            },
            dedup_key=(
                f"handoff:{reason}:{'mirrored' if marked else 'unmirrored'}:{conversation_id}"
            ),
        )
    return marked


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
    agent_id: UUID | None = None,
    *,
    budget: TurnBudget | None = None,
) -> MeteredLlm:
    """Um medidor por finalidade: o custo do agente e o custo do portão são
    linhas diferentes da mesma conta.

    `agent_id` (auditoria item 37) chega por parâmetro, do mesmo jeito que
    `organization_id`/`conversation_id` chegam do `job` — nunca pelo
    `CallRecord`, que `metering.py` declara livre de identificadores de
    negócio além de `purpose`/`provider`/`model`.

    `budget` (item 41) é o `TurnBudget` do TURNO — a mesma instância entra
    aqui uma vez por finalidade (agent_reply, judge_pre, embedding), para que
    as três dividam o mesmo teto em vez de cada uma ter o seu.
    """
    return MeteredLlm(
        llm,
        clock=clock,
        record=_recorder(conn, job.organization_id, job.conversation_id, agent_id),
        purpose=purpose,
        budget=budget,
    )


def _recorder(
    conn: psycopg.AsyncConnection,
    organization_id: UUID,
    conversation_id: UUID,
    agent_id: UUID | None = None,
):
    async def record(call: CallRecord) -> None:
        try:
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
                    agent_id=agent_id,
                )
        except Exception:
            # Ruling D (item 37): trilha nunca derruba o turno. O INSERT
            # dispara, na mesma transação, o trigger que espelha para
            # ai_usage_logs (20260902000001) — hoje inalcançável porque o
            # mapa purpose->feature cobre 100% do CHECK, mas "não acontece"
            # não é "não pode acontecer": mesmo padrão de `note_step` acima
            # ("adereço nunca vira causa de morte do turno") — a linha de
            # custo perdida é preferível a uma resposta que nunca sai.
            logger.debug("llm_calls write failed", exc_info=True)

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

