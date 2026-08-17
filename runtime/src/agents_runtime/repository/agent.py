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

from agents_runtime.agent_core.prompt import AgentConfig, TenantPolicy
from agents_runtime.agent_core.think_gate import PendingMessage

#: Quantas mensagens de histórico acompanham a pergunta. Conversa de meses não
#: cabe num prompt, e o que decide a próxima resposta é o fim dela.
DEFAULT_TRANSCRIPT_LIMIT = 20


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
    """A política do tenant mais o que decide o modo shadow (S9b)."""

    policy: TenantPolicy
    shadow_until: datetime | None

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


async def load_active_version(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> ActiveVersion | None:
    """A versão em produção deste tenant, ou None — que significa "esta conta
    não pode responder", nunca "improvise um prompt".

    FORK: lê ai_agents + ai_agent_versions (status local 'produção'); tabelas
    legadas têm RLS desligada, então o escopo por org é EXPLÍCITO na query
    (FORK.md item 6). enabled_tools vem de settings->tools->enabled.
    """
    cursor = await conn.execute(
        """
        select v.id, a.model, coalesce(v.system_prompt, a.system_prompt),
               a.id, a.name, coalesce(v.persona, a.persona),
               coalesce(v.settings, a.settings), coalesce(a.provider, 'openai'),
               coalesce(a.presentation_mode, 'nome_funcao'), a.client_adaptation
          from public.ai_agent_versions v
          join public.ai_agents a on a.id = v.agent_id
         where v.status = 'produção'
           and a.is_active
           and a.organization_id = %s
         order by v.created_at desc
         limit 1
        """,
        (organization_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

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
            scenario_prompts={},
            enabled_tools=enabled,
        ),
        agent_id=row[3],
        name=row[4],
        provider=row[7],
        persona=persona,
        settings=settings,
        presentation_mode=row[8],
        client_adaptation=dict(row[9] or {}),
    )


async def load_tenant_policy(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> TenantSettings:
    # FORK: Worder has no `tenants` table; the org-level policy knobs the motor
    # kept there (primary_language, never_say_ai, shadow_until) do not exist on
    # `organizations`, so the motor defaults are pinned here. Etapa 3 replaces
    # this loader with per-agent config from ai_agents (see FORK.md).
    cursor = await conn.execute(
        "select 'pt-BR'::text, true, null::timestamptz from public.organizations where id = %s",
        (organization_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise LookupError(f"organization {organization_id} is not visible to this connection")

    return TenantSettings(
        policy=TenantPolicy(primary_language=row[0], never_say_ai=row[1]),
        shadow_until=row[2],
    )


async def load_conversation_view(
    conn: psycopg.AsyncConnection, *, conversation_id: UUID
) -> ConversationState | None:
    cursor = await conn.execute(
        """
        select conversation.status, conversation.last_channel,
               conversation.owner_mission_version_id, conversation.contact_id,
               nullif(trim(contact.full_name), ''),
               conversation.last_processed_seq, conversation.last_inbound_at,
               contact.tags, contact.created_at
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
        select author_type, content ->> 'text'
          from public.messages
         where conversation_id = %s
           and direction = 'inbound'
           and seq > %s
           and seq <= %s
         order by seq
        """,
        (conversation_id, after_seq, target_seq),
    )
    return tuple(
        PendingMessage(author=row[0], text=row[1] or "") for row in await cursor.fetchall()
    )


async def load_recent_transcript(
    conn: psycopg.AsyncConnection,
    *,
    conversation_id: UUID,
    limit: int = DEFAULT_TRANSCRIPT_LIMIT,
) -> tuple[PendingMessage, ...]:
    """As últimas `limit` mensagens, nas duas direções, na ordem em que
    aconteceram.

    Ordenar por `seq` embaralharia a conversa: inbound e outbound têm contadores
    SEPARADOS (`unique (conversation_id, direction, seq)`), então o relógio do
    banco é o único que sabe a ordem real.
    """
    cursor = await conn.execute(
        """
        select author_type, content ->> 'text'
          from (
            select author_type, content, created_at, direction
              from public.messages
             where conversation_id = %s
             -- Empate no relógio: a pergunta vem antes da resposta a ela.
             order by created_at desc, direction asc
             limit %s
          ) recent
         order by created_at asc, direction desc
        """,
        (conversation_id, limit),
    )
    return tuple(
        PendingMessage(author=row[0], text=row[1] or "") for row in await cursor.fetchall()
    )
