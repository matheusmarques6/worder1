"""server.py — o healthz que não mente e o preview que não vaza.

O healthz responde do MESMO lugar que o alerta de heartbeat lê
(internal.runtime_heartbeats): sem beat → 503, beat fresco → 200. Não existe
uma segunda definição de "vivo".

O preview é a mesma compile_prompt() do turno em mode='preview' — e é uma
porta para as instruções internas do agente, então as três recusas importam
tanto quanto o caminho feliz: sem token configurado o endpoint NÃO EXISTE,
token errado é 401, e org sem versão ativa é 422 em vez de um prompt vazio
fingindo sucesso.
"""

import asyncio
import json
import uuid

import psycopg
import pytest

from agents_runtime import server
from agents_runtime.repository import engine as engine_repo
from tests.db.factories import create_agent_version, create_mission, create_tenant

TOKEN = "token-de-servico"


async def _request(
    port: int,
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
) -> tuple[int, dict]:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    raw = json.dumps(body).encode() if body is not None else b""
    headers = [f"{method} {path} HTTP/1.1", "host: localhost"]
    if token is not None:
        headers.append(f"authorization: Bearer {token}")
    if raw:
        headers.append("content-type: application/json")
    headers.append(f"content-length: {len(raw)}")
    writer.write(("\r\n".join(headers) + "\r\n\r\n").encode() + raw)
    await writer.drain()

    status_line = (await reader.readline()).decode()
    status = int(status_line.split(" ")[1])
    length = 0
    while True:
        line = (await reader.readline()).decode()
        if line in ("\r\n", "\n", ""):
            break
        if line.lower().startswith("content-length:"):
            length = int(line.split(":")[1])
    payload = json.loads((await reader.readexactly(length)).decode()) if length else {}
    writer.close()
    await writer.wait_closed()
    return status, payload


@pytest.fixture
async def listener(dsn: str):
    """Um server em porta efêmera, com preview ligado, papel de worker."""
    srv = await server.serve(
        dsn, host="127.0.0.1", port=0, preview_token=TOKEN, set_role="worker_role"
    )
    port = srv.sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        srv.close()
        await srv.wait_closed()


class TestHealthz:
    async def test_without_any_beat_it_says_stale(
        self, dsn: str, admin: psycopg.Connection, listener: int
    ) -> None:
        admin.execute("truncate internal.runtime_heartbeats")
        status, payload = await _request(listener, "GET", "/healthz")
        assert status == 503
        assert payload["status"] in ("stale", "error")

    async def test_a_fresh_beat_is_alive(
        self, dsn: str, admin: psycopg.Connection, listener: int
    ) -> None:
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            await engine_repo.beat(conn, "test-process")
        status, payload = await _request(listener, "GET", "/healthz")
        assert status == 200
        assert payload["beat_age_s"] < 5

    async def test_an_ancient_beat_is_stale_again(
        self, dsn: str, admin: psycopg.Connection, listener: int
    ) -> None:
        admin.execute(
            "update internal.runtime_heartbeats set beat_at = now() - interval '10 minutes'"
        )
        status, _ = await _request(listener, "GET", "/healthz")
        assert status == 503


class TestPreviewRefusals:
    async def test_without_a_configured_token_the_endpoint_does_not_exist(
        self, dsn: str
    ) -> None:
        srv = await server.serve(
            dsn, host="127.0.0.1", port=0, preview_token=None, set_role="worker_role"
        )
        port = srv.sockets[0].getsockname()[1]
        try:
            status, _ = await _request(
                port, "POST", "/internal/preview-prompt",
                token=TOKEN, body={"organization_id": str(uuid.uuid4())},
            )
        finally:
            srv.close()
            await srv.wait_closed()
        assert status == 404

    async def test_a_wrong_token_is_refused(self, listener: int) -> None:
        status, _ = await _request(
            listener, "POST", "/internal/preview-prompt",
            token="errado", body={"organization_id": str(uuid.uuid4())},
        )
        assert status == 401

    async def test_no_active_version_is_a_visible_absence(
        self, admin: psycopg.Connection, listener: int
    ) -> None:
        organization_id = create_tenant(admin)
        try:
            status, payload = await _request(
                listener, "POST", "/internal/preview-prompt",
                token=TOKEN, body={"organization_id": str(organization_id)},
            )
        finally:
            admin.execute("delete from public.organizations where id = %s", (organization_id,))
        assert status == 422
        assert "versão" in payload["error"]


class TestPreview:
    @pytest.fixture
    def tenant(self, admin: psycopg.Connection):
        organization_id = create_tenant(admin)
        create_agent_version(
            admin, organization_id, status="active", base_prompt="Você é a Lia da loja."
        )
        yield organization_id
        admin.execute("delete from public.organizations where id = %s", (organization_id,))

    async def test_the_preview_is_the_turn_frame_with_ghosts(
        self, admin: psycopg.Connection, listener: int, tenant: uuid.UUID
    ) -> None:
        """Sem missão ativa: o frame compila mesmo assim (preview tolera
        ausência) e a ausência aparece como fantasma — nunca como um turno."""
        status, payload = await _request(
            listener, "POST", "/internal/preview-prompt",
            token=TOKEN, body={"organization_id": str(tenant)},
        )
        assert status == 200
        assert "Você é a Lia da loja." in payload["text"]
        mission_block = next(b for b in payload["blocks"] if b["kind"] == "MISSION")
        assert mission_block["ghost"] is True

    async def test_an_active_mission_lands_in_the_block_with_its_id(
        self, admin: psycopg.Connection, listener: int, tenant: uuid.UUID
    ) -> None:
        mission_id = create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            objective="descobrir o que a pessoa precisa",
        )
        status, payload = await _request(
            listener, "POST", "/internal/preview-prompt",
            token=TOKEN,
            body={
                "organization_id": str(tenant),
                "transcript": [["contact", "oi, vocês têm tênis 42?"]],
            },
        )
        assert status == 200
        mission_block = next(b for b in payload["blocks"] if b["kind"] == "MISSION")
        assert mission_block["ghost"] is False
        assert "descobrir o que a pessoa precisa" in mission_block["text"]
        assert payload["source_ids"]["mission_version_id"] == str(mission_id)
        conversation_block = next(b for b in payload["blocks"] if b["kind"] == "CONVERSATION")
        assert "tênis 42" in conversation_block["text"]
