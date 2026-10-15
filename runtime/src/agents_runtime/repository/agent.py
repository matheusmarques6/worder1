"""O que o responder precisa ler antes de gerar (§2.1, §4.2, §4.3).

Cada função recebe uma conexão e não abre nem comita nenhuma: quem chama é dono
da transação curta e do `SET LOCAL app.organization_id` dentro dela. No responder isso
importa mais do que em qualquer outro lugar — a FASE 2 roda **fora** de
transação, e uma leitura que abrisse a sua e a deixasse aberta seria uma
conexão presa atravessando a chamada do LLM (ADR-6).

Não há `where organization_id = …` em lugar nenhum aqui: quem escopa é a policy
(CLAUDE.md, fronteiras de confiança). O que a conexão não pode ver, ela não vê.

A versão ativa vem do **índice parcial** do S2 (D6): não existe FK de cache em
`tenants`, então "qual versão está rodando" é pergunta que só o banco responde,
e dois mecanismos dizendo a mesma coisa divergiriam no pior dia.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import psycopg

from agents_runtime.agent_core.guards import GuardState
from agents_runtime.agent_core.media import read_media_ref, read_message
from agents_runtime.agent_core.think_gate import PendingMessage

#: Quantas mensagens de histórico acompanham a pergunta. Conversa de meses não
#: cabe num prompt, e o que decide a próxima resposta é o fim dela.
DEFAULT_TRANSCRIPT_LIMIT = 20


@dataclass(frozen=True, slots=True)
class AgentConfig:
    """One `agent_versions` row, by value.

    Morava em `agent_core/prompt.py` até o item 56 apagar o motor de camadas.
    Veio para cá porque este módulo é quem a constrói em produção
    (`load_active_version`, abaixo) — e a validação de `__post_init__` veio
    junto: é ela que impede uma versão sem instrução de virar um agente sem
    instrução, já que `prompt_compiler` faria `base_instructions=""` calado.
    """

    model: str
    base_prompt: str
    enabled_tools: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.base_prompt or not self.base_prompt.strip():
            raise ValueError(
                "agent config inválida: base_prompt vazio — a versão não tem instrução"
            )
        if not self.model or not self.model.strip():
            raise ValueError("agent config inválida: model vazio")


@dataclass(frozen=True, slots=True)
class TenantPolicy:
    """The two tenant-level switches that reach the prompt (`tenants` row)."""

    primary_language: str
    never_say_ai: bool


@dataclass(frozen=True, slots=True)
class ActiveVersion:
    id: UUID
    config: AgentConfig
    agent_id: UUID | None = None
    name: str = "Assistente"
    provider: str = "openai"
    persona: dict | None = None
    settings: dict | None = None
    # 10.4: como o agente se apresenta e a que se adapta — colunas de
    # ai_agents que a radial escreve e o compiler consome.
    presentation_mode: str = "nome_funcao"
    client_adaptation: dict | None = None
    role: str | None = None
    """Função do agente (`ai_agents.role`, 20261016000008) — só informativa."""

    @property
    def adaptation_flags(self) -> tuple[str, ...]:
        """As flags LIGADAS, no vocabulário do compiler (_ADAPTATION_LINES).
        A UI grava emoji_if_client; o compiler fala emoji — a ponte é aqui."""
        raw = self.client_adaptation or {}
        renames = {"emoji_if_client": "emoji"}
        return tuple(
            renames.get(key, key) for key, enabled in raw.items() if enabled
        )

    @property
    def base_prompt(self) -> str:
        return self.config.base_prompt


@dataclass(frozen=True, slots=True)
class TenantSettings:
    """A política do tenant usada pelos produtores de prompt."""

    policy: TenantPolicy

    @property
    def primary_language(self) -> str:
        return self.policy.primary_language

    @property
    def never_say_ai(self) -> bool:
        return self.policy.never_say_ai


@dataclass(frozen=True, slots=True)
class ConversationState:
    status: str
    last_channel: str | None
    owner_mission_version_id: UUID | None
    contact_id: UUID
    contact_name: str | None
    last_processed_seq: int
    last_inbound_at: datetime | None
    contact_tags: tuple[str, ...] = ()
    """Etiquetas que o LOJISTA pôs no contato ("vip", "atacado") — dado fixo
    do prompt (E3), nunca texto que o contato escreveu."""
    contact_since: datetime | None = None
    contact_phone: str | None = None
    """O telefone do contato (alteração 2026-10-15-06) — só para as
    ferramentas acharem pedido/contato; nunca entra no prompt."""
    agent_id: UUID | None = None
    """O agente que já atende esta conversa (alteração 2026-10-15-09):
    gravado no fim de cada turno aceito e trocado por `transfer_to_agent`.
    Quando existe (e o agente segue ativo), vence a entrada do número."""


def contact_fact_pairs(state: ConversationState) -> tuple[tuple[str, str], ...]:
    """Os fatos fixos do contato para o bloco ESTADO (E3). Só o que existe:
    um par ausente é ausência de dado, não um "não informado" inventado."""
    pairs: list[tuple[str, str]] = []
    if state.contact_name:
        pairs.append(("nome", state.contact_name))
    if state.contact_since is not None:
        pairs.append(("cliente desde", f"{state.contact_since:%m/%Y}"))
    if state.contact_tags:
        pairs.append(("etiquetas da loja", ", ".join(state.contact_tags)))
    return tuple(pairs)


_VERSION_SELECT = """
        select v.id, a.model, coalesce(v.system_prompt, a.system_prompt),
               a.id, a.name, coalesce(v.persona, a.persona),
               coalesce(v.settings, a.settings), coalesce(a.provider, 'openai'),
               coalesce(a.presentation_mode, 'nome_funcao'), a.client_adaptation,
               a.role
          from public.ai_agent_versions v
          join public.ai_agents a on a.id = v.agent_id
         where v.status = 'produção'
           and a.is_active
           and a.organization_id = %(org)s
"""


def _as_version(row) -> ActiveVersion:
    persona = dict(row[5] or {})
    settings = dict(row[6] or {})
    enabled = tuple((settings.get("tools") or {}).get("enabled") or ())
    return ActiveVersion(
        id=row[0],
        config=AgentConfig(
            # Slug da OpenRouter: sem `provedor/` o adapter leva 400 e o turno
            # morre. O fallback só vale quando a linha do tenant vem sem modelo,
            # então quebrava calado — mesma falha do juiz (17/ago).
            model=row[1] or "openai/gpt-4o-mini",
            base_prompt=row[2] or "",
            enabled_tools=enabled,
        ),
        agent_id=row[3],
        name=row[4],
        provider=row[7],
        persona=persona,
        settings=settings,
        presentation_mode=row[8],
        client_adaptation=dict(row[9] or {}),
        role=row[10] if len(row) > 10 else None,
    )


async def load_active_version(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> ActiveVersion | None:
    """A versão em produção deste tenant, ou None — que significa "esta conta
    não pode responder", nunca "improvise um prompt".

    FORK: lê ai_agents + ai_agent_versions (status local 'produção'); tabelas
    legadas têm RLS desligada, então o escopo por org é EXPLÍCITO na query
    (FORK.md item 6). enabled_tools vem de settings->tools->enabled.

    Alteração 2026-10-15-09: com vários agentes ativos por org esta função
    devolve o mais recente — serve ao preview/copiloto (sem conversa nem
    número); o turno usa `resolve_agent_for_turn`.
    """
    cursor = await conn.execute(
        _VERSION_SELECT + " order by v.created_at desc limit 1",
        {"org": organization_id},
    )
    row = await cursor.fetchone()
    return None if row is None else _as_version(row)


async def load_active_versions(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> tuple[ActiveVersion, ...]:
    """Uma versão em produção por agente ATIVO da org (alteração 2026-10-15-09)."""
    cursor = await conn.execute(
        _VERSION_SELECT + " order by a.created_at, v.created_at desc",
        {"org": organization_id},
    )
    rows = await cursor.fetchall()
    seen: set[UUID] = set()
    out: list[ActiveVersion] = []
    for row in rows:
        if row[3] in seen:
            continue
        seen.add(row[3])
        out.append(_as_version(row))
    return tuple(out)


async def load_version_for_agent(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, agent_id: UUID
) -> ActiveVersion | None:
    """A versão em produção DESTE agente, se ele estiver ativo; senão None."""
    cursor = await conn.execute(
        _VERSION_SELECT + " and a.id = %(agent)s order by v.created_at desc limit 1",
        {"org": organization_id, "agent": agent_id},
    )
    row = await cursor.fetchone()
    return None if row is None else _as_version(row)


async def load_entry_agent_id(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, kind: str, ref_id: UUID
) -> UUID | None:
    """O agente ligado a uma entrada (`ai_agent_entries`, 20261016000008):
    `whatsapp_account` com ref = whatsapp_business_accounts.id."""
    cursor = await conn.execute(
        """
        select e.agent_id
          from public.ai_agent_entries e
         where e.organization_id = %s and e.kind = %s and e.ref_id = %s and e.active
         limit 1
        """,
        (organization_id, kind, ref_id),
    )
    row = await cursor.fetchone()
    return None if row is None else row[0]


@dataclass(frozen=True, slots=True)
class AgentResolution:
    """Quem atende este turno e POR QUÊ (alteração 2026-10-15-09).

    reason: 'conversation' (a conversa já tem agente), 'entry' (o número tem
    agente), 'single_active' (a org tem um só agente ativo — modelo antigo),
    'ambiguous' (vários ativos e nenhuma entrada: alerta e silêncio) ou
    'none' (nenhum agente ativo).
    """

    version: ActiveVersion | None
    reason: str


def choose_agent(
    *,
    conversation_version: ActiveVersion | None,
    entry_version: ActiveVersion | None,
    active_versions: tuple[ActiveVersion, ...],
) -> AgentResolution:
    """A regra pura, testável sem banco: conversa > entrada > único ativo."""
    if conversation_version is not None:
        return AgentResolution(conversation_version, "conversation")
    if entry_version is not None:
        return AgentResolution(entry_version, "entry")
    if len(active_versions) == 1:
        return AgentResolution(active_versions[0], "single_active")
    if not active_versions:
        return AgentResolution(None, "none")
    return AgentResolution(None, "ambiguous")


async def resolve_agent_for_turn(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_agent_id: UUID | None,
    channel_account_id: UUID | None,
) -> AgentResolution:
    """O agente do turno de RESPOSTA: a conversa já atendida por um agente
    ativo fica com ele; senão a entrada do número; senão o único ativo."""
    conversation_version = None
    if conversation_agent_id is not None:
        conversation_version = await load_version_for_agent(
            conn, organization_id=organization_id, agent_id=conversation_agent_id
        )
    if conversation_version is not None:
        return AgentResolution(conversation_version, "conversation")

    entry_version = None
    if channel_account_id is not None:
        entry_agent = await load_entry_agent_id(
            conn, organization_id=organization_id,
            kind="whatsapp_account", ref_id=channel_account_id,
        )
        if entry_agent is not None:
            entry_version = await load_version_for_agent(
                conn, organization_id=organization_id, agent_id=entry_agent
            )
    if entry_version is not None:
        return AgentResolution(entry_version, "entry")

    actives = await load_active_versions(conn, organization_id=organization_id)
    return choose_agent(
        conversation_version=None, entry_version=None, active_versions=actives
    )


async def resolve_agent_for_mission(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    mission_agent_id: UUID | None,
) -> AgentResolution:
    """O agente do TOQUE: o dono da missão (`ai_missions.agent_id`); sem dono,
    o único ativo da org (missões de antes do modelo multiagente)."""
    if mission_agent_id is not None:
        version = await load_version_for_agent(
            conn, organization_id=organization_id, agent_id=mission_agent_id
        )
        if version is not None:
            return AgentResolution(version, "entry")
    actives = await load_active_versions(conn, organization_id=organization_id)
    return choose_agent(
        conversation_version=None, entry_version=None, active_versions=actives
    )


async def assign_conversation_agent(
    conn: psycopg.AsyncConnection,
    *,
    conversation_id: UUID,
    agent_id: UUID,
    reset_owner_mission: bool = False,
) -> bool:
    """Grava quem atende a conversa (`conversations.agent_id`). Com
    `reset_owner_mission`, a dona é limpa para o novo agente arbitrar as
    missões DELE no próximo turno (transferência entre agentes)."""
    if reset_owner_mission:
        cursor = await conn.execute(
            """
            update public.conversations
               set agent_id = %s, owner_mission_version_id = null
             where id = %s and agent_id is distinct from %s
            """,
            (agent_id, conversation_id, agent_id),
        )
    else:
        cursor = await conn.execute(
            """
            update public.conversations
               set agent_id = %s
             where id = %s and agent_id is distinct from %s
            """,
            (agent_id, conversation_id, agent_id),
        )
    return cursor.rowcount > 0


async def list_active_agents(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> tuple[tuple[UUID, str, str | None], ...]:
    """(id, nome, função) de cada agente ativo da org — para a tool
    `transfer_to_agent` escolher o destino pelo nome."""
    cursor = await conn.execute(
        """
        select id, name, role
          from public.ai_agents
         where organization_id = %s and status = 'active'
         order by created_at
        """,
        (organization_id,),
    )
    return tuple((row[0], row[1], row[2]) for row in await cursor.fetchall())


async def load_tenant_policy(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> TenantSettings:
    # FORK: Worder has no `tenants` table; the org-level policy knobs the motor
    # kept there (primary_language, never_say_ai) do not exist on
    # `organizations`, so the motor defaults are pinned here. Etapa 3 replaces
    # this loader with per-agent config from ai_agents (see FORK.md).
    cursor = await conn.execute(
        "select 'pt-BR'::text, true from public.organizations where id = %s",
        (organization_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise LookupError(f"organization {organization_id} is not visible to this connection")

    return TenantSettings(
        policy=TenantPolicy(primary_language=row[0], never_say_ai=row[1]),
    )


async def canonical_conversation_for_mirror(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, mirror_conversation_id: UUID
) -> UUID | None:
    """Alteração 2026-10-15-07: id do espelho (inbox) → conversa canônica."""
    cursor = await conn.execute(
        "select internal.canonical_conversation_for_mirror(%s, %s)",
        (organization_id, mirror_conversation_id),
    )
    row = await cursor.fetchone()
    return row[0] if row else None


async def load_conversation_view(
    conn: psycopg.AsyncConnection, *, conversation_id: UUID
) -> ConversationState | None:
    cursor = await conn.execute(
        """
        select conversation.status, conversation.last_channel,
               conversation.owner_mission_version_id, conversation.contact_id,
               nullif(trim(contact.full_name), ''),
               conversation.last_processed_seq, conversation.last_inbound_at,
               contact.tags, contact.created_at, contact.phone,
               conversation.agent_id
          from public.conversations conversation
          join public.contacts contact on contact.id = conversation.contact_id
         where conversation.id = %s
        """,
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    return ConversationState(
        status=row[0],
        last_channel=row[1],
        owner_mission_version_id=row[2],
        contact_id=row[3],
        contact_name=row[4],
        last_processed_seq=row[5],
        last_inbound_at=row[6],
        contact_tags=tuple(row[7] or ()),
        contact_since=row[8],
        contact_phone=row[9] if len(row) > 9 else None,
        agent_id=row[10] if len(row) > 10 else None,
    )


@dataclass(frozen=True, slots=True)
class MirrorMedia:
    """As colunas de mídia do espelho legado (`whatsapp_cloud_messages`),
    preenchidas pelo pipeline de download do app."""

    media_url: str | None
    media_storage_path: str | None
    media_mime_type: str | None


async def load_mirror_media(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, provider_message_id: str
) -> MirrorMedia | None:
    """Alteração 2026-10-15-03: o caminho 1 de `media_fetch.py`."""
    cursor = await conn.execute(
        """
        select media_url, media_storage_path, media_mime_type
          from public.whatsapp_cloud_messages
         where organization_id = %s and message_id = %s
         limit 1
        """,
        (organization_id, provider_message_id),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return MirrorMedia(media_url=row[0], media_storage_path=row[1], media_mime_type=row[2])


async def save_transcript(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    provider_message_id: str,
    text: str,
) -> None:
    """Alteração 2026-10-15-03: a transcrição fica na canônica, para a próxima
    leitura (retry, próximo turno, transcript) não pagar o STT de novo — o
    TS faz o mesmo em `text_body`. O espelho legado recebe `text_body` em
    melhor esforço: o inbox mostra o texto, mas um grant ausente ali nunca
    pode custar a transcrição."""
    await conn.execute(
        """
        update public.messages
           set content = content || jsonb_build_object('text', %s::text, 'transcribed', true)
         where organization_id = %s and conversation_id = %s and provider_message_id = %s
        """,
        (text, organization_id, conversation_id, provider_message_id),
    )
    try:
        await conn.execute(
            """
            update public.whatsapp_cloud_messages
               set text_body = %s
             where organization_id = %s and message_id = %s
               and coalesce(text_body, '') = ''
            """,
            (text, organization_id, provider_message_id),
        )
    except psycopg.Error:
        pass


def _message(row: tuple) -> PendingMessage:
    """`(author_type, content)` → a mensagem como o prompt a verá.

    A leitura do `content` ficou em Python (item 31) porque são QUATRO
    dialetos — texto plano, o envelope Meta do backfill, o `p_content` do
    ingest com `media_id`, e o `content` cru do espelho copiado na criação da
    conversa. Um `case` de SQL cobrindo os quatro seria ilegível e não teria
    teste unitário; `agent_core.media` tem os dois.
    """
    text, media_kind = read_message(row[1], row[0])
    media_id, mime_type = read_media_ref(row[1]) if media_kind else (None, None)
    return PendingMessage(
        author=row[0],
        text=text,
        media_kind=media_kind,
        provider_message_id=row[2] if len(row) > 2 else None,
        media_id=media_id,
        mime_type=mime_type,
    )


async def load_pending_messages(
    conn: psycopg.AsyncConnection,
    *,
    conversation_id: UUID,
    after_seq: int,
    target_seq: int,
) -> tuple[PendingMessage, ...]:
    """A janela que o debounce coalesceu: `(after_seq, target_seq]`, inbound.

    Nem tudo o que existe na conversa (o que já foi respondido não se responde
    de novo) nem só a última (a rajada inteira é uma pergunta só). O que chegou
    DEPOIS do alvo é da próxima geração — respondê-lo agora seria exatamente a
    resposta constrangedora que o ADR-6 existe para impedir.
    """
    cursor = await conn.execute(
        """
        select author_type, content, provider_message_id
          from public.messages
         where conversation_id = %s
           and direction = 'inbound'
           and seq > %s
           and seq <= %s
         order by seq
        """,
        (conversation_id, after_seq, target_seq),
    )
    return tuple(_message(row) for row in await cursor.fetchall())


async def load_recent_transcript(
    conn: psycopg.AsyncConnection,
    *,
    conversation_id: UUID,
    limit: int = DEFAULT_TRANSCRIPT_LIMIT,
    exclude_inbound_after_seq: int | None = None,
) -> tuple[PendingMessage, ...]:
    """As últimas `limit` mensagens, nas duas direções, na ordem em que
    aconteceram.

    Ordenar por `seq` embaralharia a conversa: inbound e outbound têm contadores
    SEPARADOS (`unique (conversation_id, direction, seq)`), então o relógio do
    banco é o único que sabe a ordem real.

    Item 39 — `exclude_inbound_after_seq`: quando informado, tira do
    transcript as mensagens INBOUND ainda não processadas (`seq` maior que o
    valor dado) — exatamente a janela que `load_pending_messages` também
    busca. Sem isso as duas consultas quase sempre se sobrepõem (a pendente é
    a cauda do transcript por tempo), e quem monta o turno tinha que dedupar
    depois em Python — código que apodrece e some sem aviso no próximo
    refactor. `None` (o padrão) preserva a consulta de sempre: o toque
    (`agent_core/toucher.py`) e o preview (`server.py::_preview`) não têm
    janela pendente e não devem filtrar nada.
    """
    cursor = await conn.execute(
        """
        select author_type, content
          from (
            select author_type, content, created_at, direction
              from public.messages
             where conversation_id = %s
               and (direction <> 'inbound' or %s::bigint is null or seq <= %s)
             -- Empate no relógio: a pergunta vem antes da resposta a ela.
             order by created_at desc, direction asc
             limit %s
          ) recent
         order by created_at asc, direction desc
        """,
        (
            conversation_id,
            exclude_inbound_after_seq,
            exclude_inbound_after_seq,
            limit,
        ),
    )
    return tuple(_message(row) for row in await cursor.fetchall())


async def load_legacy_guard_state(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, conversation_id: UUID,
    channel_account_id: UUID | None = None,
    count_bot: bool = True, check_human: bool = True,
) -> GuardState:
    """O estado que os guards de comportamento leem (auditoria item 30).

    FORK: vem do espelho legado do inbox, não da canônica, porque a canônica
    não tem o dado. `public.conversations` não tem `ai_agent_id` nem
    `ai_transferred_at`, e `public.messages` nunca recebe outbound humano
    (ausência 29 do FORK.md) — ler de lá faria `stop_on_human_reply` nunca
    disparar, que é pior que não ter o guard. A função é SECURITY DEFINER e
    filtra por `organization_id`: as tabelas legadas têm RLS desligada, então
    um grant de tabela ao worker_role abriria o inbox de toda org.

    Conversa ausente do espelho devolve o estado zerado — ninguém transferiu,
    o bot não respondeu, nenhum humano falou, e o bot segue ligado.

    `count_bot`/`check_human` (W3-T6a) pulam a varredura de mensagens que o
    agente não usa — teto por conversa desligado, ou stop_on_human_reply
    desligado. `last_bot_message_at` NUNCA é pulado: o cooldown curto
    anti-loop (`guards.py` RECENT_REPLY_COOLDOWN_SECONDS) não é knob de loja e
    lê esse campo sempre, nos dois defaults `True` de quem não passa nada.
    """
    cursor = await conn.execute(
        "select * from internal.legacy_conversation_guard_state(%s, %s, %s, %s, %s)",
        (organization_id, conversation_id, channel_account_id, count_bot, check_human),
    )
    row = await cursor.fetchone()
    if row is None:
        return GuardState()
    return GuardState(
        ai_enabled=bool(row[0]),
        ai_agent_id=row[1],
        ai_transferred_at=row[2],
        bot_message_count=row[3] or 0,
        last_bot_message_at=row[4],
        has_human_reply=bool(row[5]),
    )


async def mark_ai_handoff(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    reason: str,
    channel_account_id: UUID | None = None,
) -> bool:
    """Transfere a conversa para humano no espelho legado (item 30).

    É o mesmo freio que o webhook já respeita para org migrada: com
    `ai_enabled = false` o ingest chama `cancel_pending_ai_response`, então a
    transferência vale para os turnos SEGUINTES e não só para este.
    """
    cursor = await conn.execute(
        "select internal.mark_ai_handoff(%s, %s, %s, %s)",
        (organization_id, conversation_id, reason, channel_account_id),
    )
    return bool((await cursor.fetchone())[0])
