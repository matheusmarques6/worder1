"""O listener HTTP mínimo do processo — liveness e preview, nada além.

Dois endpoints, de propósito minúsculos (divergência consciente v1, FORK.md):

  · GET /healthz — a sonda externa (Grafana Synthetics) pergunta "o laço está
    vivo?" e a resposta vem do MESMO lugar que o alerta de heartbeat lê:
    internal.runtime_heartbeats. Sem beat recente → 503. O healthz não inventa
    uma segunda definição de vivo. Ele lê por UMA conexão do processo inteiro
    (`HealthConnection`, item 48), não por uma conexão por probe.

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
from datetime import timedelta
from typing import Any
from uuid import UUID

import psycopg

from agents_runtime.agent_core.mission_resolver import merge_mission
from agents_runtime.agent_core.prompt_compiler import (
    ChannelBlock,
    CompiledPrompt,
    ConversationBlock,
    agent_block,
    compile_prompt,
)
from agents_runtime.app import _connect
from agents_runtime.commerce.moments import apply_moment_restrictions, resolve_moments
from agents_runtime.config import QueueingConfig
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import engine as engine_repo
from agents_runtime.repository import missions as missions_repo
from agents_runtime.repository import moments as moments_repo
from agents_runtime.repository.scope import (
    WORKER_ROLE,
    abort_connection,
    assert_rls_enforced,
    scope_to_organization,
    set_statement_timeout,
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
        name, separator, value = line.partition(":")
        name = name.lower()
        if not separator or not name or name != name.strip():
            raise ValueError("header malformado")
        if name in headers:
            raise ValueError(f"header duplicado: {name}")
        if name == "transfer-encoding":
            raise ValueError("transfer-encoding não suportado")
        headers[name] = value.strip()

    length_text = headers.get("content-length")
    if length_text is not None and (not length_text.isascii() or not length_text.isdigit()):
        raise ValueError("content-length inválido")
    length = int(length_text) if length_text is not None else 0
    if length > MAX_BODY_BYTES:
        raise ValueError("corpo grande demais para um preview")
    body = await reader.readexactly(length) if length else b""
    return method, path, headers, body


@contextlib.asynccontextmanager
async def _connection(
    dsn: str,
    set_role: str | None,
    *,
    config: QueueingConfig | None = None,
) -> AsyncIterator[psycopg.AsyncConnection]:
    """O ÚNICO lugar onde o listener abre conexão — com a guarda de RLS dentro.

    Eram dois lugares com `if set_role:` e nada mais: sem a env, ambos rodavam
    como o dono do DSN (BYPASSRLS no Supabase mesmo sem superuser) e o preview
    chamava `scope_to_organization` sobre uma conexão para quem escopo não
    significa nada. Um ponto só para que o próximo endpoint não consiga escapar.
    """
    config = config or QueueingConfig()
    async with await psycopg.AsyncConnection.connect(
        dsn,
        autocommit=True,
        connect_timeout=config.connect_timeout_seconds,
    ) as conn:
        if set_role:
            await conn.execute("set role " + set_role)
        await set_statement_timeout(conn, config.statement_timeout_ms)
        # O listener lê como worker: a constante é do código, não da env.
        await assert_rls_enforced(conn, WORKER_ROLE)
        yield conn


class HealthConnection:
    """A conexão longeva do `/healthz` — UMA por processo, não uma por probe.

    O `/healthz` era a boca mais cara do runtime: ≥3 sondadores (Render em
    `render.yaml:24`, mais as sondas de ≥2 regiões do Grafana Synthetics) e uma
    conexão nova a cada probe, com handshake TCP+TLS+SCRAM contra o session
    pooler em São Paulo enquanto o processo roda em Ohio. O trabalho útil é UMA
    leitura de idade de beat; a cerimônia em volta era ~8 a 10 round-trips. Como
    a sonda não depende de tráfego de loja, num piloto com poucas lojas isso era
    a maior fonte de handshakes do sistema — e churn de conexão contra um pooler
    em SESSION mode (slot 1:1, sem multiplexação) é o perfil que acorda o
    circuit breaker do Supavisor.

    Três coisas fazem esta classe existir, e nenhuma é opcional:

    · **Posse.** Quem constrói fecha (`aclose`). A conexão nasce do preflight de
      `__main__._serve` — que antes era aberta só para provar o role e jogada
      fora na linha seguinte — e morre no `finally` de lá, junto com o listener.
      Sem isso ela sobreviveria ao processo como lixo pendurado no pooler.

    · **Reconexão pela porta guardada.** psycopg NÃO reconecta. Uma sessão
      derrubada (idle timeout do pooler, restart do Supabase, deploy, blip de
      rede) deixaria toda leitura seguinte estourando e `_healthz` devolvendo
      503 `database unreachable` PARA SEMPRE, com o banco vivo — e sob
      `healthCheckPath` isso é instância insalubre permanente, restart, e o
      crash-loop que dispara o breaker. Um healthz que mente "doente" é pior que
      um healthz caro. Por isso `_open` reabre por `app._connect`, NUNCA por um
      `psycopg.connect` escrito aqui: `_connect` reaplica o `set role` e cobra
      `assert_rls_enforced`. Uma reconexão nua devolveria ao listener o dono do
      DSN — que no Supabase tem BYPASSRLS sem ser superuser.

    · **Lock em volta da SEQUÊNCIA.** O lock interno do psycopg serializa
      statements, não sequências, e `ler-falhar-reabrir-ler` é uma sequência.
      **O dano medido de não ter o lock** (mutação sobre o teste vizinho): três
      probes concorrentes numa conexão caída reabrem TRÊS vezes — três
      handshakes onde devia haver um, e duas sessões órfãs que ninguém fecha,
      penduradas no mesmo pooler que este item veio poupar. Só isso já sustenta
      o lock. *E há um segundo dano, reproduzido depois em harness com conexão
      falsa e escalonamento escolhido a dedo — o mecanismo é alcançável em
      asyncio; a frequência dele contra psycopg e um pooler de verdade continua
      não medida:* a leitura da retentativa está **fora do `try`**, então sem o
      lock um probe fica suspenso nela enquanto outro reabre e fecha a conexão
      que ele segurava, e a exceção sobe como 503 com o banco vivo.

    Uma consequência do lock que o operador precisa saber: os probes
    ENFILEIRAM. A decisão W3-TD-04 limita a sequência inteira em 4s, começando
    antes desse lock e incluindo abertura, inicialização, leitura e eventual
    reconexão. A conexão ainda tem seu teto próprio de 3s e cada statement,
    15s; o menor orçamento vence. O probe expirado responde 503, libera o lock
    e a tentativa seguinte reabre pela porta guardada quando a sessão caiu.

    O `/internal/preview-prompt` NÃO entra aqui: continua abrindo a sua por
    requisição, via `_connection`. Ele roda `scope_to_organization` dentro de
    `conn.transaction()`, e um `select` de healthz caindo dentro dessa transação
    aberta rodaria sob o `SET LOCAL app.organization_id` do preview. É endpoint
    administrativo, de frequência ~zero — não há economia a defender ali.
    """

    def __init__(
        self,
        dsn: str,
        set_role: str | None,
        conn: psycopg.AsyncConnection | None = None,
        *,
        config: QueueingConfig | None = None,
    ) -> None:
        self._dsn = dsn
        self._set_role = set_role
        self._config = config or QueueingConfig()
        #: `None` = ainda não aberta (ou fechada por queda). O primeiro probe abre.
        self._conn = conn
        self._lock = asyncio.Lock()
        self._opening: psycopg.AsyncConnection | None = None
        self._owner: asyncio.Task | None = None
        self._active_probe: object | None = None
        self._expired_probes: set[object] = set()
        self._closed = False

    @staticmethod
    def _finish(conn: psycopg.AsyncConnection | None) -> None:
        if conn is not None:
            try:
                abort_connection(conn)
            except Exception:
                logger.exception("healthz: falha ao invalidar conexão")

    def expire(self, probe: object, owner: asyncio.Task) -> None:
        self._expired_probes.add(probe)
        if self._owner is not owner or self._active_probe is not probe:
            return
        self._finish(self._opening or self._conn)
        self._conn = None

    def finish_probe(self, probe: object) -> None:
        self._expired_probes.discard(probe)

    def _probe_expired(self) -> bool:
        return (
            self._active_probe is not None
            and self._active_probe in self._expired_probes
        )

    async def beat_age_seconds(self, *, probe: object | None = None) -> float | None:
        """A idade do beat, reabrindo a conexão uma vez se ela tiver caído."""
        async with self._lock:
            if self._closed:
                raise RuntimeError("health connection is closed")
            if probe is not None and probe in self._expired_probes:
                raise TimeoutError
            self._owner = asyncio.current_task()
            self._active_probe = probe
            try:
                if self._conn is None:
                    await self._open()
                try:
                    age = await engine_repo.heartbeat_age_seconds(self._conn)
                except Exception:
                    # Uma retentativa, e uma só: se a segunda estourar, a exceção
                    # sobe e vira o 503 — que aí é verdade, não sequela de sessão
                    # morta. O operador vê este WARNING uma vez por queda de sessão,
                    # não uma por probe: se ele estiver em toda linha do log, o que
                    # caiu não foi a sessão.
                    logger.warning(
                        "healthz: a conexão longeva caiu; reabrindo pela porta guardada",
                        exc_info=True,
                    )
                    await self._open()
                    age = await engine_repo.heartbeat_age_seconds(self._conn)
                if self._probe_expired():
                    raise TimeoutError
                return age
            finally:
                self._owner = None
                self._active_probe = None

    async def _open(self) -> None:
        # Descarta a morta ANTES de abrir e zera o campo primeiro: se o
        # `_connect` estourar (banco fora do ar de verdade), o objeto fica sem
        # conexão em vez de guardar uma inutilizável, e o próximo probe tenta do
        # zero em vez de repetir a mesma falha contra o mesmo cadáver.
        dead, self._conn = self._conn, None
        self._opening = dead
        try:
            if dead is not None:
                with contextlib.suppress(Exception):
                    await dead.close()
            if self._closed or self._probe_expired():
                raise TimeoutError

            def remember(conn: psycopg.AsyncConnection) -> None:
                if self._closed or self._probe_expired():
                    self._finish(conn)
                else:
                    self._opening = conn

            conn = await _connect(
                self._dsn,
                self._set_role,
                WORKER_ROLE,
                config=self._config,
                on_open=remember,
            )
            if self._closed or self._probe_expired():
                self._finish(conn)
                raise TimeoutError
            self._conn = conn
        finally:
            self._opening = None

    async def aclose(self) -> None:
        self._closed = True
        self._finish(self._opening or self._conn)
        async with asyncio.timeout(self._config.cleanup_timeout.total_seconds()):
            async with self._lock:
                conn, self._conn = self._conn, None
                self._opening = None
                if conn is not None:
                    with contextlib.suppress(Exception):
                        await conn.close()


async def _healthz(
    health: HealthConnection,
    *,
    max_age_s: float,
    probe_timeout: timedelta | None = None,
) -> bytes:
    loop = asyncio.get_running_loop()
    timeout_seconds = (probe_timeout or QueueingConfig().probe_timeout).total_seconds()
    owner = asyncio.current_task()
    assert owner is not None
    probe = object()
    try:
        async with asyncio.timeout(None) as budget:
            def expire() -> None:
                health.expire(probe, owner)
                budget.reschedule(0)

            timer = loop.call_later(timeout_seconds, expire)
            try:
                age = await health.beat_age_seconds(probe=probe)
            finally:
                timer.cancel()
                health.finish_probe(probe)
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


async def _preview(
    dsn: str,
    *,
    set_role: str | None,
    body: dict[str, Any],
    config: QueueingConfig | None = None,
) -> bytes:
    try:
        organization_id = UUID(str(body["organization_id"]))
    except (KeyError, ValueError):
        return _response(400, {"error": "organization_id (uuid) é obrigatório"})
    event_type = str(body.get("event_type") or DEFAULT_EVENT)
    transcript = tuple(
        (str(author), str(text)) for author, text in (body.get("transcript") or ())
    )

    async with _connection(dsn, set_role, config=config) as conn:
        async with conn.transaction():
            await scope_to_organization(conn, organization_id)
            settings = await agent_repo.load_tenant_policy(conn, organization_id=organization_id)
            version = await agent_repo.load_active_version(conn, organization_id=organization_id)
            mission = await missions_repo.load_active_mission(conn, event_type=event_type)
            # DENTRO da transação, e isso não é preciosismo de estilo: a
            # conexão é `autocommit=True` e `scope_to_organization` grava com
            # `set_config(..., true)` — SET LOCAL, que morre no fim da
            # transação. Um load de momentos escrito uma linha abaixo do
            # `async with` cairia com `current_app_organization_id()` = NULL, a
            # policy de `commercial_moments` não casaria com nada e a query
            # voltaria ZERO LINHAS: sem erro, sem log, verde na suíte inteira,
            # e o preview dizendo "nenhum momento ativo" para sempre.
            active_moments = await moments_repo.load_active_moments(conn)

    if version is None:
        return _response(422, {"error": "a organização não tem versão de agente ativa"})

    resolved = (
        merge_mission(mission, None, agent_tools=version.config.enabled_tools)
        if mission is not None
        else None
    )
    if resolved is not None:
        # Item 45: os mesmos dois passos do turno (`responder.py`,
        # `toucher.py`) — a restrição do momento vigente soma ao `forbidden` da
        # missão e sai como as linhas `Não fazer:` do bloco MISSÃO. Sem isso, o
        # lojista via no preview uma missão sem as regras que a promoção do dia
        # impõe. (O destino recusado na época era `ChannelBlock.constraints`; o
        # item 60 apagou o campo por ser morto — a decisão continua valendo, o
        # que deixou de existir foi a alternativa recusada.)
        # Sem momento no ar, silêncio e nunca erro: `resolve_moments` devolve
        # EMPTY_VIEW para lista vazia e `apply_moment_restrictions` devolve a
        # missão intacta. Sem missão ativa, nem isso — o bloco MISSÃO já é um
        # fantasma declarado, que é o que `mode="preview"` existe para tolerar.
        resolved = apply_moment_restrictions(
            resolved,
            resolve_moments(active_moments, promote=resolved.promote_moment),
        )
    compiled = compile_prompt(
        # Item 45: o preview montava o bloco do agente à mão e ficou dois
        # commits atrás do turno — `presentation_mode` era o literal
        # "nome_funcao" e `adaptation` era `()`. O lojista via no preview a
        # linha de apresentação que não escolheu e nunca via os toggles de
        # adaptação. Agora é a mesma função que o turno chama.
        agent=agent_block(version, settings),
        mission=resolved,
        state=None,
        channel=ChannelBlock(
            channel=str(body.get("channel") or "whatsapp"),
            window_open=bool(body.get("window_open", True)),
        ),
        conversation=(
            ConversationBlock(conversation_id="preview", transcript=transcript)
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
    health: HealthConnection,
    preview_token: str | None = None,
    set_role: str | None = "worker_role",
    health_max_age_s: float = 180.0,
    config: QueueingConfig | None = None,
) -> asyncio.AbstractServer:
    """Sobe o listener e devolve o server (o chamador fecha no shutdown).

    `health` é obrigatório e vem de fora de propósito: quem constrói a conexão
    do healthz é quem a fecha (`__main__._serve`), e um default aqui deixaria um
    chamador futuro ganhar de volta, calado, a conexão por probe — ou uma
    conexão que ninguém fecha. `dsn` continua sendo pedido porque o `/preview`
    abre a sua por requisição, por `_connection`.
    """

    config = config or QueueingConfig()

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
                writer.write(
                    await _healthz(
                        health,
                        max_age_s=health_max_age_s,
                        probe_timeout=config.probe_timeout,
                    )
                )
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
                    writer.write(
                        await _preview(dsn, set_role=set_role, body=body, config=config)
                    )
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
