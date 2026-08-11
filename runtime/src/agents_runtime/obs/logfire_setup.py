"""Logfire (D13/9.1) — ligado por token, com o conteúdo GenAI DESLIGADO.

Três linhas de defesa de PII, na ordem em que o dado as encontra:

  1. o cinto de `SAFE_ATTRIBUTES` (telemetry.py) — atributo de domínio fora do
     vocabulário nem chega a um span nosso;
  2. as instrumentações escolhidas — httpx (sem corpo), psycopg (statement
     parametrizado, sem valores) e métricas de sistema. `instrument_openai`/
     `instrument_anthropic` NÃO são chamadas: a captura de prompt/completion
     delas é exatamente o que D13 proíbe, e os adapters daqui são httpx puro
     (não há SDK para instrumentar) — divergência registrada no STATUS, fecha
     se/quando os adapters migrarem para SDK com captura desligada;
  3. o scrubbing do próprio Logfire, com padrões extras para vocabulário de
     conteúdo — se algo com cara de mensagem escapar das duas primeiras,
     chega ao exporter como [Scrubbed].

Sem `AGENTS_LOGFIRE_TOKEN`, nada disto existe: custo zero, import nenhum.
"""

import logging
import os

logger = logging.getLogger(__name__)

TOKEN_VARIABLE = "AGENTS_LOGFIRE_TOKEN"

SERVICE_NAME = "worder-runtime"

#: A 3ª linha (D13): valores de atributos cujo NOME parecer conteúdo de
#: conversa saem como [Scrubbed] antes de qualquer exporter.
CONTENT_SCRUB_PATTERNS = (
    "prompt",
    "completion",
    "gen_ai",
    "message",
    "content",
    "body",
    "transcript",
)


def _import_logfire():
    """Isolado para o teste trocar; devolve o módulo ou None."""
    try:
        import logfire
    except ImportError:
        return None
    return logfire


def configure_logfire() -> tuple[str, ...]:
    """Liga o Logfire se (e só se) houver token E pacote. Devolve o que ligou,
    na ordem: ("logfire", <instrumentações>...) — vazio significa dormente."""
    token = os.environ.get(TOKEN_VARIABLE, "").strip()
    if not token:
        return ()

    logfire = _import_logfire()
    if logfire is None:
        logger.warning(
            "%s definido mas o pacote logfire não está instalado — "
            "telemetria Logfire segue desligada",
            TOKEN_VARIABLE,
        )
        return ()

    logfire.configure(
        token=token,
        service_name=SERVICE_NAME,
        environment=os.environ.get("DEPLOY_ENV", "dev"),
        console=False,
        scrubbing=logfire.ScrubbingOptions(extra_patterns=list(CONTENT_SCRUB_PATTERNS)),
    )

    enabled = ["logfire"]
    for name in ("httpx", "psycopg", "system_metrics"):
        try:
            getattr(logfire, f"instrument_{name}")()
        except Exception:
            # Instrumentação sem a dependência dela (ou quebrada) não pode
            # derrubar o boot: telemetria é acessório, nunca dependência.
            logger.warning("instrument_%s falhou — seguindo sem", name, exc_info=True)
            continue
        enabled.append(name)
    return tuple(enabled)
