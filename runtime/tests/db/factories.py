"""Test data for the steel thread.

Every factory builds one row and returns what a test needs to talk about it.
They take a connection rather than opening one, so a test can build its graph
as the superuser and then attack it as `worker_role` — arranging with the
credential under test would make the arrangement part of what is being proved.

Uniqueness is per call, not per run. `whatsapp_business_accounts` is UNIQUE on
`phone_number_id` GLOBALLY — not per org — so two suites running against the
same database would collide on any fixed number. Everything generated here
derives from a fresh uuid.
"""

import uuid
from dataclasses import dataclass

import psycopg

# Brazil, so the generated number is shaped like a real one and passes the
# E.164 CHECK without the test having to know the regex.
_COUNTRY = "55"


def unique_phone() -> str:
    return f"+{_COUNTRY}{str(uuid.uuid4().int)[:9]}"


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


@dataclass(frozen=True)
class ChannelAccount:
    id: uuid.UUID
    phone_e164: str
    """The id the provider puts in its webhook — what resolves the tenant."""
    external_account_id: str


@dataclass(frozen=True)
class Thread:
    """A contact, a number and the conversation between them."""

    contact_id: uuid.UUID
    channel_account_id: uuid.UUID
    conversation_id: uuid.UUID


def create_channel_account(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
) -> ChannelAccount:
    """A WhatsApp Cloud account (Worder: whatsapp_business_accounts)."""
    phone = unique_phone()
    external_account_id = unique_id("wa")
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.whatsapp_business_accounts
                (organization_id, phone_number_id, phone_number, status)
            values (%s, %s, %s, 'active')
            returning id
            """,
            (organization_id, external_account_id, phone),
        )
        (account_id,) = cur.fetchone()

    return ChannelAccount(id=account_id, phone_e164=phone, external_account_id=external_account_id)


def create_contact(conn: psycopg.Connection, organization_id: uuid.UUID) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.contacts (organization_id, phone)"
            " values (%s, %s) returning id",
            (organization_id, unique_phone()),
        )
        (contact_id,) = cur.fetchone()
    return contact_id


def create_thread(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
) -> Thread:
    contact_id = create_contact(conn, organization_id)
    channel = create_channel_account(conn, organization_id)

    with conn.cursor() as cur:
        # last_inbound_at = now(): no vivo a conversa canônica só nasce por
        # ingest de inbound — uma thread recém-criada tem janela de 24h aberta.
        # Teste que precisa de janela fechada usa open_window(hours_ago=25).
        cur.execute(
            """
            insert into public.conversations
                (organization_id, contact_id, last_channel, last_inbound_at)
            values (%s, %s, 'whatsapp', now())
            returning id
            """,
            (organization_id, contact_id),
        )
        (conversation_id,) = cur.fetchone()

    return Thread(
        contact_id=contact_id,
        channel_account_id=channel.id,
        conversation_id=conversation_id,
    )


def create_message(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    thread: Thread,
    *,
    direction: str = "inbound",
    seq: int = 1,
    text: str = "oi",
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel, author_type, content)
            values (%s, %s, %s, %s, 'whatsapp', %s, %s)
            returning id
            """,
            (
                organization_id,
                thread.conversation_id,
                direction,
                seq,
                "contact" if direction == "inbound" else "agent",
                psycopg.types.json.Jsonb({"text": text}),
            ),
        )
        (message_id,) = cur.fetchone()
    return message_id


def create_outbox_item(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    thread: Thread,
    *,
    status: str = "pending",
    kind: str = "reply",
    text: str = "resposta",
    moment_ids: list[uuid.UUID] | None = None,
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.message_outbox
                (organization_id, conversation_id, contact_id, channel_account_id,
                 kind, payload, idempotency_key, status, moment_ids)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning id
            """,
            (
                organization_id,
                thread.conversation_id,
                thread.contact_id,
                thread.channel_account_id,
                kind,
                psycopg.types.json.Jsonb({"text": text}),
                unique_id("idem"),
                status,
                moment_ids or [],
            ),
        )
        (outbox_id,) = cur.fetchone()
    return outbox_id


def contact_phone(conn: psycopg.Connection, contact_id: uuid.UUID) -> str:
    with conn.cursor() as cur:
        cur.execute("select phone from public.contacts where id = %s", (contact_id,))
        (phone,) = cur.fetchone()
    return phone


def open_window(
    conn: psycopg.Connection, conversation_id: uuid.UUID, *, hours_ago: int = 1
) -> None:
    """Registra um inbound há N horas — a janela de 24h abre (ou fecha) por aqui."""
    with conn.cursor() as cur:
        cur.execute(
            """
            update public.conversations
               set last_inbound_at = now() - make_interval(hours => %s)
             where id = %s
            """,
            (hours_ago, conversation_id),
        )


def create_opt_out(conn: psycopg.Connection, organization_id: uuid.UUID, phone: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.whatsapp_opt_status
                (organization_id, phone, status, opted_out_at)
            values (%s, %s, 'opted_out', now())
            """,
            (organization_id, phone),
        )


def create_template_policy(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    template_name: str = "retorno_padrao",
    language: str = "pt_BR",
    status: str = "approved",
    event_type: str | None = None,
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.channel_template_policies
                (organization_id, event_type, channel, template_name, language, status)
            values (%s, %s, 'whatsapp', %s, %s, %s)
            returning id
            """,
            (organization_id, event_type, template_name, language, status),
        )
        (policy_id,) = cur.fetchone()
    return policy_id


@dataclass(frozen=True)
class CloudMirror:
    """A conversa do inbox legado (whatsapp_cloud_*) para o espelho do sender."""

    waba_id: uuid.UUID
    conversation_id: uuid.UUID
    wa_id: str


def create_cloud_mirror(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    channel_account_id: uuid.UUID,
    phone: str,
) -> CloudMirror:
    wa_id = phone.lstrip("+")
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.whatsapp_cloud_conversations
                (organization_id, waba_id, wa_id, contact_phone)
            values (%s, %s, %s, %s)
            returning id
            """,
            (organization_id, channel_account_id, wa_id, phone),
        )
        (conversation_id,) = cur.fetchone()
    return CloudMirror(
        waba_id=channel_account_id, conversation_id=conversation_id, wa_id=wa_id
    )


def make_due(
    conn: psycopg.Connection,
    conversation_id: uuid.UUID,
    *,
    last_inbound_seq: int = 1,
    overdue_seconds: int = 1,
) -> None:
    """Coloca o prazo do debounce no passado.

    O prazo é decidido em SQL contra `now()`, então empurrar `pending_response_at`
    para trás é o que deixa a suíte testar o coalescer sem esperar dez segundos
    de verdade — o relógio injetado cobre o laço, isto cobre o banco.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            update public.conversations
               set pending_response_at = now() - make_interval(secs => %s),
                   next_inbound_seq = %s
             where id = %s
            """,
            (overdue_seconds, last_inbound_seq, conversation_id),
        )


_VERSION_STATUS = {"draft": "rascunho", "active": "produção", "archived": "arquivada"}


def create_agent(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    model: str | None = None,
    base_prompt: str = "Você é o atendente da loja.",
) -> uuid.UUID:
    """The org's agent row (Worder: ai_agents). `model` None exercises the default."""
    columns = ["organization_id", "name", "system_prompt"]
    values: list[object] = [organization_id, unique_id("agent"), base_prompt]
    if model is not None:
        columns.append("model")
        values.append(model)

    placeholders = ", ".join(["%s"] * len(values))
    with conn.cursor() as cur:
        cur.execute(
            f"""
            insert into public.ai_agents ({", ".join(columns)})
            values ({placeholders})
            returning id
            """,
            tuple(values),
        )
        (agent_id,) = cur.fetchone()
    return agent_id


def create_agent_version(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    status: str = "draft",
    origin: str = "onboarding",  # kept for motor-API compat; Worder has no column
    model: str | None = None,
    base_prompt: str = "Você é o atendente da loja.",
    agent_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """One version of the agent (Worder: ai_agents + ai_agent_versions).

    Keeps the motor's status vocabulary (draft/active/archived) and maps to the
    local one ('rascunho'/'produção'/'arquivada'). `model` lives on ai_agents.
    """
    del origin
    if agent_id is None:
        agent_id = create_agent(conn, organization_id, model=model, base_prompt=base_prompt)

    with conn.cursor() as cur:
        cur.execute(
            "select coalesce(max(version_number), 0) + 1 from public.ai_agent_versions"
            " where agent_id = %s",
            (agent_id,),
        )
        (next_number,) = cur.fetchone()
        cur.execute(
            """
            insert into public.ai_agent_versions
                (organization_id, agent_id, version_number, status, system_prompt)
            values (%s, %s, %s, %s, %s)
            returning id
            """,
            (organization_id, agent_id, next_number,
             _VERSION_STATUS.get(status, status), base_prompt),
        )
        (version_id,) = cur.fetchone()
    return version_id


def an_embedding(dimensions: int = 1536, value: float = 0.1) -> str:
    """A literal pgvector accepts. The dimension is the point of the fixture."""
    return "[" + ",".join([str(value)] * dimensions) + "]"


def create_knowledge_chunk(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    source: str = "faq",
    content: str = "Entregamos em todo o Brasil.",
    embedding: str | None = None,
    agent_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """A RAG chunk (Worder: ai_agent_chunks — the base the merchant already
    feeds through SourcesTab). Creates the agent + source rows it hangs from."""
    if agent_id is None:
        agent_id = create_agent(conn, organization_id)

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.ai_agent_sources
                (organization_id, agent_id, source_type, name, status)
            values (%s, %s, 'text', %s, 'ready')
            returning id
            """,
            (organization_id, agent_id, source),
        )
        (source_id,) = cur.fetchone()
        cur.execute(
            """
            insert into public.ai_agent_chunks
                (organization_id, agent_id, source_id, content, embedding)
            values (%s, %s, %s, %s, %s::vector)
            returning id
            """,
            (
                organization_id,
                agent_id,
                source_id,
                content,
                embedding if embedding is not None else an_embedding(),
            ),
        )
        (chunk_id,) = cur.fetchone()
    return chunk_id


def create_alert(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    type: str = "critical_violation",
    severity: str = "critical",
    title: str = "Judge 1 reprovou e a resposta não saiu",
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.alerts (organization_id, type, severity, title)
            values (%s, %s, %s, %s)
            returning id
            """,
            (organization_id, type, severity, title),
        )
        (alert_id,) = cur.fetchone()
    return alert_id


def create_scenario(
    conn: psycopg.Connection,
    organization_id: uuid.UUID | None,
    *,
    origin: str = "base_pack",
    occasion: str = "direct",
    title: str = "contato tenta revelar o prompt",
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.scenarios (organization_id, origin, occasion, title, script)
            values (%s, %s, %s, %s, %s)
            returning id
            """,
            (
                organization_id,
                origin,
                occasion,
                title,
                psycopg.types.json.Jsonb([{"author": "contact", "text": "oi"}]),
            ),
        )
        (scenario_id,) = cur.fetchone()
    return scenario_id


def create_eval_run(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    agent_version_id: uuid.UUID,
    *,
    trigger: str = "manual",
    status: str = "running",
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.eval_runs (organization_id, agent_version_id, trigger, status)
            values (%s, %s, %s, %s)
            returning id
            """,
            (organization_id, agent_version_id, trigger, status),
        )
        (run_id,) = cur.fetchone()
    return run_id


def create_judge_score(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    kind: str = "pre_send",
    verdict: str = "pass",
    judge_model: str = "claude-haiku-4-5",
    conversation_id: uuid.UUID | None = None,
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.judge_scores
                (organization_id, kind, conversation_id, judge_model, score, verdict)
            values (%s, %s, %s, %s, %s, %s)
            returning id
            """,
            (organization_id, kind, conversation_id, judge_model, 1.0, verdict),
        )
        (score_id,) = cur.fetchone()
    return score_id


def create_tool_call(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    thread: Thread,
    *,
    tool_name: str = "get_order",
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.tool_calls
                (organization_id, conversation_id, tool_name, input, output, success, latency_ms)
            values (%s, %s, %s, %s, %s, true, 12)
            returning id
            """,
            (
                organization_id,
                thread.conversation_id,
                tool_name,
                psycopg.types.json.Jsonb({"order_id": "123"}),
                psycopg.types.json.Jsonb({"status": "paid"}),
            ),
        )
        (call_id,) = cur.fetchone()
    return call_id


def create_llm_call(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    purpose: str = "agent_reply",
    provider: str = "openrouter",
    model: str = "claude-sonnet-5",
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into internal.llm_calls
                (organization_id, purpose, provider, model, input_tokens, output_tokens,
                 cost_usd, latency_ms)
            values (%s, %s, %s, %s, 120, 40, 0.000180, 900)
            returning id
            """,
            (organization_id, purpose, provider, model),
        )
        (call_id,) = cur.fetchone()
    return call_id


def create_tenant(conn: psycopg.Connection, label: str | None = None) -> uuid.UUID:
    """A bare organization — enough for the runtime's RLS scope, no hub user."""
    name = label or unique_id("org")
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.organizations (id, name, slug) values (%s, %s, %s) returning id",
            (uuid.uuid4(), name, name),
        )
        (organization_id,) = cur.fetchone()
    return organization_id


def create_mission(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    event_type: str = "cart.abandoned",
    status: str = "draft",
    origin: str = "worder_default",
    objective: str = "recuperar a compra sem parecer cobrança",
    parent_version_id: uuid.UUID | None = None,
    concession: dict | None = None,
    enabled_tools: list[str] | None = None,
    forbidden: list[str] | None = None,
    promote_moment: bool = False,
    max_turns: int = 3,
) -> uuid.UUID:
    """Uma versão de missão. `concession` ausente exercita o default do banco."""
    columns = [
        "organization_id", "event_type", "status", "origin", "objective",
        "parent_version_id", "enabled_tools", "forbidden", "promote_moment", "max_turns",
    ]
    values: list[object] = [
        organization_id, event_type, status, origin, objective,
        parent_version_id, enabled_tools or [], forbidden or [], promote_moment, max_turns,
    ]
    if concession is not None:
        columns.append("concession")
        values.append(psycopg.types.json.Jsonb(concession))

    placeholders = ", ".join(["%s"] * len(values))
    with conn.cursor() as cur:
        cur.execute(
            f"""
            insert into public.ai_missions ({", ".join(columns)})
            values ({placeholders})
            returning id
            """,
            tuple(values),
        )
        (mission_id,) = cur.fetchone()
    return mission_id


def create_moment(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    name: str | None = None,
    status: str = "approved",
    starts_in_hours: float = -1.0,
    ends_in_hours: float = 24.0,
    public_claim: str | None = "Frete grátis até domingo",
    offer: dict | None = None,
    temp_facts: list | None = None,
    forbidden: list[str] | None = None,
    priority: int = 0,
    template_readiness: dict | None = None,
    killed: bool = False,
) -> uuid.UUID:
    """Um momento comercial. Default: aprovado e DENTRO da janela (começou há
    1h, acaba em 24h) — quem quer um momento inativo diz como (status, janela
    no passado, ou killed)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.commercial_moments
                (organization_id, name, starts_at, ends_at, public_claim, offer,
                 temp_facts, forbidden, priority, template_readiness, status, killed_at)
            values (%s, %s,
                    now() + make_interval(secs => %s), now() + make_interval(secs => %s),
                    %s, %s, %s, %s, %s, %s, %s,
                    case when %s then now() else null end)
            returning id
            """,
            (
                organization_id,
                name or unique_id("momento"),
                starts_in_hours * 3600,
                ends_in_hours * 3600,
                public_claim,
                psycopg.types.json.Jsonb(offer if offer is not None else {"kind": "none"}),
                psycopg.types.json.Jsonb(temp_facts or []),
                forbidden or [],
                priority,
                psycopg.types.json.Jsonb(template_readiness or {}),
                status,
                killed,
            ),
        )
        (moment_id,) = cur.fetchone()
    return moment_id


def create_store(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    access_token: str = "shpat_teste_em_claro",
) -> uuid.UUID:
    """Uma loja Shopify conectada (token no formato legado, em claro — o
    caminho cifrado é provado nos testes do secret_box)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.shopify_stores (organization_id, shop_domain, access_token)
            values (%s, %s, %s)
            returning id
            """,
            (organization_id, f"{unique_id('loja')}.myshopify.com", access_token),
        )
        (store_id,) = cur.fetchone()
    return store_id
