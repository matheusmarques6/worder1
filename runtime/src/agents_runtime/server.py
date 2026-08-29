"""O listener HTTP mínimo do processo — liveness e preview, nada além.

Dois endpoints, de propósito minúsculos (divergência consciente v1, FORK.md):

  · GET /healthz — a sonda externa (Grafana Synthetics) pergunta "o laço está
    vivo?" e a resposta vem do MESMO lugar que o alerta de heartbeat lê:
    internal.runtime_heartbeats. Sem beat recente → 503. O healthz não inventa
    uma segunda definição de vivo.

  · POST /internal/preview-prompt — o hub mostra ao lojista o prompt que o
    agente veria AGORA: mesma `compile_prompt()` do turno, `mode="preview"`
    (blocos ausentes viram fantasmas em vez de recusa). Protegido por token
    de serviço (`AGENTS_PREVIEW_TOKEN`); sem token configurado, o endpoint
    não existe — um preview aberto listaria instruções internas do agente.

stdlib puro (asyncio.start_server): um framework HTTP para dois endpoints
seria a cauda abanando o cachorro, e o parse aqui aceita só o que os dois
consumidores enviam (GET sem corpo; POST pequeno com Content-Length).
"""

import asyncio
import contextlib
import hmac
import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import psycopg

from agents_runtime.agent_core.mission_resolver import merge_mission
from agents_runtime.agent_core.prompt_compiler import (
    AgentBlock,
    ChannelBlock,
    CompiledPrompt,
    ConversationBlock,
    compile_prompt,
)
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import engine as engine_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository.scope import (
    WORKER_ROLE,
    assert_rls_enforced,
    scope_to_organization,
)

logger = logging.getLogger(__name__)

#: Um corpo maior que isto não é um preview — é um engano.
MAX_BODY_BYTES = 64 * 1024

#: O evento default do preview: a missão descoberta, a única sempre elegível.
DEFAULT_EVENT = "whatsapp.received"


def _response(status: int, payload: dict) -> bytes:
    body = json.dumps(payload, ensure_ascii=False).encode()
    reason = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found",
              405: "Method Not Allowed", 422: "Unprocessable Entity",
              503: "Service Unavailable"}.get(status, "Error")
    head = (
        f"HTTP/1.1 {status} {reason}\r\n"
        "content-type: application/json; charset=utf-8\r\n"
        f"content-length: {len(body)}\r\n"
        "connection: close\r\n\r\n"
    )
    return head.encode() + body


async def _read_request(reader: asyncio.StreamReader) -> tuple[str, str, dict, bytes]:
    request_line = (await reader.readline()).decode("latin-1").strip()
    parts = request_line.split(" ")
    if len(parts) != 3:
        raise ValueError(f"linha de request malformada: {request_line!r}")
    method, path = parts[0].upper(), parts[1]

    headers: dict[str, str] = {}
    while True:
        line = (await reader.readline()).decode("latin-1")
        if line in ("\r\n", "\n", ""):
            break
        name, _, value = line.partition(":")
        headers[name.strip().lower()] = value.strip()

    length = int(headers.get("content-length", "0") or "0")
    if length > MAX_BODY_BYTES:
        raise ValueError("corpo grande demais para um preview")
    body = await reader.readexactly(length) if length else b""
    return method, path, headers, body


@contextlib.asynccontextmanager
async def _connection(dsn: str, set_role: str | None) -> AsyncIterator[psycopg.AsyncConnection]:
    """O ÚNICO lugar onde o listener abre conexão — com a guarda de RLS dentro.

    Eram dois lugares com `if set_role:` e nada mais: sem a env, ambos rodavam
    como o dono do DSN (BYPASSRLS no Supabase mesmo sem superuser) e o preview
    chamava `scope_to_organization` sobre uma conexão para quem escopo não
    significa nada. Um ponto só para que o próximo endpoint não consiga escapar.
    """
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        if set_role:
            await conn.execute("set role " + set_role)
        # O listener lê como worker: a constante é do código, não da env.
        await assert_rls_enforced(conn, WORKER_ROLE)
        yield conn


async def _healthz(dsn: str, *, set_role: str | None, max_age_s: float) -> bytes:
    try:
        async with _connection(dsn, set_role) as conn:
            age = await engine_repo.heartbeat_age_seconds(conn)
    except Exception:
        logger.exception("healthz não alcançou o banco")
        return _response(503, {"status": "error", "detail": "database unreachable"})

    if age is None or age > max_age_s:
        return _response(503, {"status": "stale", "beat_age_s": age})
    return _response(200, {"status": "ok", "beat_age_s": round(age, 3)})


def _serialize(compiled: CompiledPrompt) -> dict:
    return {
        "text": compiled.text,
        "source_ids": compiled.source_ids,
        "blocks": [
            {
                "kind": block.kind,
                "text": block.text,
                "ghost": block.ghost,
                "source_ids": dict(block.source_ids),
            }
            for block in compiled.blocks
        ],
    }


async def _preview(dsn: str, *, set_role: str | None, body: dict[str, Any]) -> bytes:
    try:
        organization_id = UUID(str(body["organization_id"]))
    except (KeyError, ValueError):
        return _response(400, {"error": "organization_id (uuid) é obrigatório"})
    event_type = str(body.get("event_type") or DEFAULT_EVENT)
    transcript = tuple(
        (str(author), str(text)) for author, text in (body.get("transcript") or ())
    )

    async with _connection(dsn, set_role) as conn:
        async with conn.transaction():
            await scope_to_organization(conn, organization_id)
            settings = await agent_repo.load_tenant_policy(conn, organization_id=organization_id)
            version = await agent_repo.load_active_version(conn, organization_id=organization_id)
            mission = await missions_repo.load_active_mission(conn, event_type=event_type)

    if version is None:
        return _response(422, {"error": "a organização não tem versão de agente ativa"})

    resolved = (
        merge_mission(mission, None, agent_tools=version.config.enabled_tools)
        if mission is not None
        else None
    )
    persona = version.persona or {}
    compiled = compile_prompt(
        agent=AgentBlock(
            agent_id=str(version.agent_id or version.id),
            name=version.name,
            tone=str(persona.get("tone") or "friendly"),
            language=str(persona.get("language") or settings.primary_language),
            presentation_mode="nome_funcao",
            guidelines=tuple(persona.get("guidelines") or ()),
            adaptation=(),
            base_instructions=version.base_prompt or "",
        ),
        mission=resolved,
        state=None,
        channel=ChannelBlock(
            channel=str(body.get("channel") or "whatsapp"),
            window_open=bool(body.get("window_open", True)),
            constraints=(),
        ),
        conversation=(
            ConversationBlock(conversation_id="preview", transcript=transcript, pending=())
            if transcript
            else None
        ),
        mode="preview",
    )
    return _response(200, _serialize(compiled))


def _authorized(headers: dict, token: str) -> bool:
    provided = headers.get("authorization", "")
    prefix = "bearer "
    if not provided.lower().startswith(prefix):
        return False
    return hmac.compare_digest(provided[len(prefix):], token)


async def serve(
    dsn: str,
    *,
    host: str = "0.0.0.0",
    port: int,
    preview_token: str | None = None,
    set_role: str | None = "worker_role",
    health_max_age_s: float = 180.0,
) -> asyncio.AbstractServer:
    """Sobe o listener e devolve o server (o chamador fecha no shutdown)."""

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            try:
                method, path, headers, raw = await asyncio.wait_for(
                    _read_request(reader), timeout=10
                )
            except (ValueError, asyncio.IncompleteReadError, TimeoutError) as exc:
                writer.write(_response(400, {"error": str(exc)}))
                return

            if path == "/healthz":
                if method != "GET":
                    writer.write(_response(405, {"error": "GET only"}))
                    return
                writer.write(await _healthz(dsn, set_role=set_role, max_age_s=health_max_age_s))
                return

            if path == "/internal/preview-prompt":
                if not preview_token:
                    writer.write(_response(404, {"error": "not found"}))
                    return
                if method != "POST":
                    writer.write(_response(405, {"error": "POST only"}))
                    return
                if not _authorized(headers, preview_token):
                    writer.write(_response(401, {"error": "token de serviço inválido"}))
                    return
                try:
                    body = json.loads(raw.decode() or "{}")
                    if not isinstance(body, dict):
                        raise ValueError("o corpo é um objeto JSON")
                except ValueError as exc:
                    writer.write(_response(400, {"error": f"JSON inválido: {exc}"}))
                    return
                try:
                    writer.write(await _preview(dsn, set_role=set_role, body=body))
                except Exception:
                    logger.exception("preview falhou")
                    writer.write(_response(503, {"error": "preview indisponível"}))
                return

            writer.write(_response(404, {"error": "not found"}))
        finally:
            # O encerramento de socket de uma sonda que já desligou não é um
            # erro do processo.
            with contextlib.suppress(Exception):
                await writer.drain()
                writer.close()
                await writer.wait_closed()

    server = await asyncio.start_server(handle, host=host, port=port)
    bound = server.sockets[0].getsockname()[1] if server.sockets else port
    logger.info("http listener no ar", extra={"port": bound})
    return server
