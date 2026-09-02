"""O compilador de blocos tipados — o único componente que enxerga tudo.

As áreas nunca conversam entre si: escrevem objetos com ID, e o prompt é
montado DO ZERO a cada turno por este módulo (doc §1.2 inv. 4). Cada bloco só
aceita o schema do seu dono — dataclass congelada com campos exatos; campo
alheio explode na construção ("texto de missão dentro de nó = fronteira
vazou", §4.3).

Ordem fixa do frame: AGENT · MISSION · STATE · CHANNEL · CONVERSATION.
(O delta do nó já chegou FUNDIDO na missão pelo mission_resolver — o frame
grava o node_ref como proveniência, não como bloco próprio.)

A linha de divulgação de IA é ESTRUTURAL: emitida pelo compilador em todo
frame, depois de qualquer texto do lojista, fora do alcance de configuração
(invariante 6 da §3.4).

O modo preview é A MESMA função (uma fonte só, §4.4 item 6): bloco ausente
vira fantasma; `buildPrompt()` do protótipo nunca vira produção. Puro: sem
relógio, sem I/O, sem LLM — momento e ledger chegam resolvidos no StateBlock.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

from agents_runtime.agent_core.media import is_store_media_line
from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.agent_core.think_gate import PendingMessage

AI_DISCLOSURE_LINE = (
    "Se perguntarem se você é uma IA ou um robô, confirme com naturalidade — "
    "nunca negue ser uma IA."
)

_PRESENTATION = {
    "transparente": "Apresente-se como a assistente virtual da loja.",
    "nome_funcao": "Apresente-se pelo nome e pelo time (ex.: 'aqui é {name}, do time da loja').",
    "discreta": "Não se apresente espontaneamente; responda direto. Se perguntarem quem é, diga.",
}

_ADAPTATION_LINES = {
    "mirror_tone": "Espelhe o tom do cliente (formal com formal, leve com leve).",
    "mirror_length": "Espelhe o tamanho das mensagens do cliente.",
    "emoji": "Use emoji só se o cliente usar primeiro.",
    "insist_less_after_complaint": (
        "Se a pessoa já reclamou antes, insista menos e vá direto ao ponto."
    ),
    "distinct_greeting_repeat_buyer": (
        "Sauda quem já comprou como recorrente; primeira compra ganha boas-vindas."
    ),
}


@dataclass(frozen=True)
class AgentBlock:
    """Quem fala — dono: aba Agente (ai_agents)."""

    agent_id: str
    name: str
    tone: str
    language: str
    presentation_mode: str
    guidelines: tuple[str, ...]
    adaptation: tuple[str, ...]
    base_instructions: str = ""


@dataclass(frozen=True)
class StateBlock:
    """O que é verdade agora — dono: relógio (momento) + ledger + contato."""

    moment_ids: tuple[str, ...]
    moment_facts: tuple[str, ...]
    moment_public_claim: str | None
    grant_id: str | None
    grant_lines: tuple[str, ...]
    ledger_lines: tuple[str, ...]
    contact_facts: tuple[tuple[str, str], ...]
    purchase_lines: tuple[str, ...] = ()
    """Histórico de compras já projetado (repository.orders.history_lines).
    Vazio = sem espelho: o prompt não afirma nada (decisão 81b)."""


@dataclass(frozen=True)
class ChannelBlock:
    """O meio de entrega — dono: Canais."""

    channel: str
    window_open: bool
    constraints: tuple[str, ...]


@dataclass(frozen=True)
class ConversationBlock:
    """O que foi dito — dono: a própria conversa.

    Item 39: só carrega `transcript`. Em modo "turn" o histórico em si NUNCA
    entra no texto deste bloco — ele vai pro array de chat (`_as_chat`,
    responder.py/toucher.py) uma vez só; mandar os dois era ~2x tokens de
    entrada por chamada, em até 12 chamadas por turno. `transcript` continua
    aqui porque é dele que `_conversation_block` extrai a rubrica de mídia da
    loja (item 31), que é EXCLUSIVA do bloco — nunca vira turno de chat. Não
    existe mais campo `pending`: a janela pendente nunca carrega rubrica de
    loja (é sempre inbound, `repository/agent.py::load_pending_messages`) e
    não tinha nenhum outro uso aqui além do dump duplicado."""

    conversation_id: str
    transcript: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class RenderedBlock:
    kind: str
    text: str
    source_ids: Mapping = field(default_factory=dict)
    ghost: bool = False


@dataclass(frozen=True)
class CompiledPrompt:
    blocks: tuple[RenderedBlock, ...]

    @property
    def text(self) -> str:
        return "\n\n".join(block.text for block in self.blocks)

    @property
    def mission_version_id(self) -> str | None:
        for block in self.blocks:
            if block.kind == "MISSION":
                return block.source_ids.get("mission_version_id")
        return None

    @property
    def source_ids(self) -> dict:
        merged: dict = {}
        for block in self.blocks:
            merged.update(block.source_ids)
        return merged


def _agent_block(agent: AgentBlock) -> RenderedBlock:
    lines = [
        "# AGENTE",
        f"Você é {agent.name}, atendendo pelo WhatsApp da loja.",
        _PRESENTATION.get(agent.presentation_mode, _PRESENTATION["nome_funcao"]).format(
            name=agent.name
        ),
        f"Tom base: {agent.tone}.",
    ]
    if agent.base_instructions:
        lines.append(agent.base_instructions)
    lines.extend(f"Diretriz: {g}" for g in agent.guidelines)
    lines.extend(
        _ADAPTATION_LINES[a] for a in agent.adaptation if a in _ADAPTATION_LINES
    )
    lines.append(f"Idioma da resposta: {agent.language}.")
    # Estrutural, SEMPRE por último no bloco: vence qualquer diretriz acima.
    lines.append(AI_DISCLOSURE_LINE)
    return RenderedBlock(
        kind="AGENT", text="\n".join(lines), source_ids={"agent_id": agent.agent_id}
    )


def _mission_block(mission: ResolvedMission | None, mode: str) -> RenderedBlock:
    if mission is None:
        return RenderedBlock(
            kind="MISSION",
            text="# MISSÃO — entra a cada conversa\n(fantasma: nenhuma missão neste preview)",
            ghost=True,
        )
    lines = ["# MISSÃO"]
    if mission.situation:
        lines.append(f"Situação: {mission.situation}")
    lines.append(f"Objetivo único deste turno: {mission.objective}")
    if mission.tone:
        lines.append(f"Tom nesta situação: {mission.tone}")
    if mission.success_criteria:
        lines.append(f"Sucesso observável: {mission.success_criteria}")
    if mission.failure_criteria:
        lines.append(f"Falha observável: {mission.failure_criteria}")
    for key, value in mission.context.items():
        lines.append(f"Contexto: {key} = {value}")
    if mission.tools:
        lines.append(
            "Ferramentas desta situação (a tool valida sozinha): "
            + ", ".join(mission.tools)
        )
    lines.extend(f"Não fazer: {item}" for item in mission.forbidden)
    lines.append(
        f"Insistência: no máximo {mission.max_turns} turnos; mudança de assunto: "
        f"{mission.topic_change_policy}."
    )
    source_ids: dict = {"mission_version_id": mission.mission_version_id}
    if mission.node_ref:
        source_ids["node_ref"] = mission.node_ref
    return RenderedBlock(kind="MISSION", text="\n".join(lines), source_ids=source_ids)


def _state_block(state: StateBlock | None) -> RenderedBlock:
    if state is None:
        return RenderedBlock(
            kind="STATE",
            text="# ESTADO — momento ativo e promessas\n(fantasma: sem estado neste preview)",
            ghost=True,
        )
    lines = ["# ESTADO"]
    if state.moment_public_claim:
        lines.append(f"Momento ativo — pode afirmar: {state.moment_public_claim}")
    lines.extend(f"Fato do momento: {fact}" for fact in state.moment_facts)
    lines.extend(state.grant_lines)
    lines.extend(f"Histórico de incentivo: {line}" for line in state.ledger_lines)
    lines.extend(f"Contato — {key}: {value}" for key, value in state.contact_facts)
    lines.extend(state.purchase_lines)
    if len(lines) == 1:
        lines.append("Sem momento ativo, sem promessas pendentes.")
    source_ids: dict = {}
    if state.moment_ids:
        source_ids["moment_ids"] = state.moment_ids
    if state.grant_id:
        source_ids["grant_id"] = state.grant_id
    return RenderedBlock(kind="STATE", text="\n".join(lines), source_ids=source_ids)


def _channel_block(channel: ChannelBlock | None) -> RenderedBlock:
    if channel is None:
        return RenderedBlock(
            kind="CHANNEL",
            text="# CANAL\n(fantasma: sem canal neste preview)",
            ghost=True,
        )
    lines = [
        "# CANAL",
        f"Canal: {channel.channel}.",
        "Janela de resposta aberta."
        if channel.window_open
        else "Janela de 24h fechada: só template aprovado sai daqui.",
    ]
    lines.extend(channel.constraints)
    return RenderedBlock(
        kind="CHANNEL", text="\n".join(lines), source_ids={"channel": channel.channel}
    )


def _conversation_block(conversation: ConversationBlock | None, mode: str) -> RenderedBlock:
    if conversation is None:
        return RenderedBlock(
            kind="CONVERSATION",
            text="# CONVERSA\n(fantasma: sem conversa neste preview)",
            ghost=True,
        )
    lines = ["# CONVERSA"]
    if mode == "preview":
        # O preview (`/internal/preview-prompt`) nunca chama um LLM nem monta
        # array de chat — só devolve este texto para o lojista ler. Aqui o
        # dump é a ÚNICA forma de mostrar a conversa, e não duplica nada.
        lines.extend(f"{author}: {text}" for author, text in conversation.transcript)
    else:
        # Item 39: no turno real (`mode="turn"`) o histórico vai pro array de
        # chat, montado por `_as_chat` (responder.py/toucher.py) a partir do
        # MESMO `transcript` — repeti-lo aqui como texto dobrava o tamanho do
        # prompt de entrada por chamada, em até 12 chamadas por turno. Só
        # sobrevive o que é EXCLUSIVO do bloco: a rubrica de mídia da loja
        # (`agent_core/media.py::is_store_media_line`), que `_as_chat`
        # descarta de propósito (mesmo predicado, item 31) para não virar
        # fala imitável — apresentar `[A loja enviou uma imagem]` como
        # mensagem `assistant` anterior é a superfície de imitação que
        # custou a resposta crua de 17/08. Reusa o predicado canônico (não
        # reimplementa `STORE_MARK`/autor na mão) — `PendingMessage` só
        # existe aqui pra dar ao predicado a forma que ele espera;
        # `media_kind` (o único campo que sobra, default `None`) não importa
        # pra esta checagem.
        lines.extend(
            f"{author}: {text}"
            for author, text in conversation.transcript
            if is_store_media_line(PendingMessage(author=author, text=text))
        )
        if len(lines) == 1:
            lines.append("Sem rubrica de mídia da loja nesta janela.")
    return RenderedBlock(
        kind="CONVERSATION",
        text="\n".join(lines),
        source_ids={"conversation_id": conversation.conversation_id},
    )


def compile_prompt(
    *,
    agent: AgentBlock,
    mission: ResolvedMission | None,
    state: StateBlock | None,
    channel: ChannelBlock | None,
    conversation: ConversationBlock | None,
    mode: str = "turn",
) -> CompiledPrompt:
    """Monta o frame do turno. `mode='preview'` tolera blocos ausentes
    (viram fantasmas); um TURNO sem missão recusa compilar — toque sem missão
    não sai (§3.4 inv. 8)."""
    if mode not in ("turn", "preview"):
        raise ValueError(f"modo desconhecido: {mode}")
    if mode == "turn" and mission is None:
        raise ValueError("um turno nunca compila sem missão (§3.4)")

    return CompiledPrompt(
        blocks=(
            _agent_block(agent),
            _mission_block(mission, mode),
            _state_block(state),
            _channel_block(channel),
            _conversation_block(conversation, mode),
        )
    )
