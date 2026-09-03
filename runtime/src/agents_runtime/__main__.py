"""Process entrypoint — what `python -m agents_runtime` (the image's CMD) runs.

Deliberately thin: read the environment, turn SIGTERM into "stop", hand over
to `agents_runtime.app.run`. Everything worth testing lives below this line,
where the pipeline suite drives it against a real database.

The channel comes from `AGENTS_CHANNEL`, a `module:callable` factory that
receives the DSN. Unset means no sender task at all — explicit, instead of a
sender inventing outcomes against a channel that does not exist. The real
adapters land at the end of E1; the pipeline suite points this at its fake.
"""

import asyncio
import importlib
import logging
import os
import signal
import sys

from agents_runtime import server
from agents_runtime.app import _connect, run
from agents_runtime.channels.port import ChannelPort
from agents_runtime.config import config_from_env
from agents_runtime.obs import configure_logfire, configure_logging, configure_telemetry
from agents_runtime.repository.scope import WORKER_ROLE

DSN_VARIABLE = "SUPABASE_DB_URL"

#: The responder factory. Required, unlike the channel — see below.
RESPONDER_VARIABLE = "AGENTS_RESPONDER"


def _factory_from_env(variable: str, dsn: str, *, required: bool = False):
    """module:callable, called with the DSN. Broken specs die at startup —
    absent and broken are different states (see tests/unit/test_channel_env).

    `required` exists because the two seams fail in opposite directions. An
    absent CHANNEL means no sender task: nothing is sent, which is safe. An
    absent RESPONDER means `app.run` falls back to `fixed_responder`, and the
    constant reply of E1 is the one answer that reaches a customer without
    passing Judge 1 — against the invariant that has no exceptions. So the
    responder refuses to be absent, the way a channel refuses to be configured
    without a token (decisão 67): loud at startup, where a human is watching,
    instead of silently correct-looking in front of customers.
    """
    spec = os.environ.get(variable)
    if not spec or not spec.strip():
        if required:
            raise RuntimeError(
                f"{variable} is not set. The process will not start without a real "
                "responder: falling back to the constant reply would answer customers "
                "without passing Judge 1, and CLAUDE.md allows no exception to that."
            )
        return None
    module_name, _, attribute = spec.partition(":")
    factory = getattr(importlib.import_module(module_name), attribute)
    return factory(dsn)


def _channel_from_env(dsn: str) -> ChannelPort | None:
    return _factory_from_env("AGENTS_CHANNEL", dsn)


def _stop_on_shutdown_signals(stop: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    for received in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(received, stop.set)
        except NotImplementedError:  # Windows has no add_signal_handler
            signal.signal(received, lambda *_: stop.set())


async def _serve(dsn: str) -> None:
    stop = asyncio.Event()
    _stop_on_shutdown_signals(stop)

    # O listener HTTP (healthz + preview) é opt-in por porta: a suíte pipeline
    # roda `app.run` sem ele, e um processo sem porta configurada continua
    # sendo só o laço.
    http_server = None
    health = None
    port_spec = os.environ.get("AGENTS_HTTP_PORT", "").strip()
    # O `try` abre ANTES da montagem do listener, e não só em volta do `run`:
    # entre abrir o preflight e o `serve` devolver há duas linhas onde uma falha
    # (porta ocupada, por exemplo) deixaria a conexão do healthz aberta e sem
    # dono. É sujeira de partida — o processo morre logo atrás —, mas é uma
    # sessão pendurada no pooler a cada tentativa de subir.
    try:
        if port_spec:
            # Preflight ANTES do primeiro socket: o listener abre conexão própria e
            # atende requisições antes de qualquer `_connect`, então sem isto um
            # processo com a env de role errada (ou sem env) subia e servia — o
            # preview escopando uma conexão do dono do DSN. Morrer na partida é a
            # única resposta útil; servir 503 para sempre não é.
            preflight = await _connect(dsn, os.environ.get("AGENTS_WORKER_SET_ROLE"), WORKER_ROLE)

            # Item 48: o preflight deixa de ser jogado fora e vira A conexão do
            # `/healthz`. Não é economia de handshake — é UM por deploy —, é que ela
            # já nasce guardada: `_connect` aplica o `set role`, cobra
            # `assert_rls_enforced` e ainda passa `application_name`, que o listener
            # não passava. A partir daqui o processo é dono dela: o `finally` abaixo
            # fecha, depois do listener, para nenhum probe em voo achar conexão
            # fechada.
            health = server.HealthConnection(
                dsn, os.environ.get("AGENTS_WORKER_SET_ROLE"), preflight
            )
            http_server = await server.serve(
                dsn,
                port=int(port_spec),
                health=health,
                preview_token=os.environ.get("AGENTS_PREVIEW_TOKEN") or None,
                set_role=os.environ.get("AGENTS_WORKER_SET_ROLE"),
            )
        await run(
            dsn,
            stop=stop,
            config=config_from_env(dict(os.environ)),
            channel=_channel_from_env(dsn),
            # The responder seam, reachable from outside the process: cenário 4
            # holds a REAL subprocess inside FASE 2 through this.
            respond=_factory_from_env(RESPONDER_VARIABLE, dsn, required=True),
            # O toucher segue a regra do canal, não a do responder: ausente =
            # toque de andaime (nada chega a cliente sem o nó emitir E a org
            # estar no rollout). Produção aponta para
            # agents_runtime.agent_core.toucher:agent_toucher (DEPLOY.md).
            touch=_factory_from_env("AGENTS_TOUCHER", dsn),
            process_name=os.environ.get("AGENTS_PROCESS_NAME", "agents-runtime"),
            worker_set_role=os.environ.get("AGENTS_WORKER_SET_ROLE"),
            sender_set_role=os.environ.get("AGENTS_SENDER_SET_ROLE"),
        )
    finally:
        if http_server is not None:
            http_server.close()
            await http_server.wait_closed()
        # Só depois que o listener parou de aceitar: fechar antes deixaria um
        # probe em voo lendo de uma conexão fechada e respondendo 503 no
        # caminho de saída — mentira sobre um processo que está só desligando.
        if health is not None:
            await health.aclose()


def main() -> None:
    # psycopg's async connections need a selector loop; Windows defaults to
    # proactor (decisão 24, now at the entrypoint). Production is Linux, where
    # the selector already is the default and this line changes nothing.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    configure_logging(os.environ.get("AGENTS_LOG_LEVEL"))
    configure_telemetry()
    enabled = configure_logfire()
    if enabled:
        logging.getLogger("agents_runtime").info(
            "logfire ligado", extra={"instrumented": list(enabled)}
        )

    dsn = os.environ.get(DSN_VARIABLE)
    if not dsn:
        raise SystemExit(
            f"agents-runtime: {DSN_VARIABLE} is not set; there is nothing to connect to."
        )
    asyncio.run(_serve(dsn))


if __name__ == "__main__":
    main()
