# ruff: noqa: T201
"""Verificação do piloto: ambiente, saúde e smoke, sem console e sem achismo.

Três subcomandos, cada um respondendo a um ponto cego real do Apply de 12/08
(STATUS, passo 8.1): a env que ninguém conferia, o processo que não batia
heartbeat e o smoke conferido tabela a tabela na mão.
"""

from collections.abc import Mapping
from urllib.parse import urlsplit

REQUIRED = (
    "SUPABASE_DB_URL",
    "ENCRYPTION_KEY",
    "AGENTS_PREVIEW_TOKEN",
    "AGENTS_OPENROUTER_API_KEY",
    "AGENTS_WORKER_SET_ROLE",
    "AGENTS_SENDER_SET_ROLE",
)


def validate_env(
    env: Mapping[str, str], *, app_encryption_key: str | None = None
) -> list[str]:
    """Os problemas do ambiente, em texto, na ordem em que doem.

    Pura de propósito: o valor de conferir isto é poder rodar antes de existir
    servidor, banco ou credencial.
    """
    problems: list[str] = []

    for name in REQUIRED:
        if not (env.get(name) or "").strip():
            problems.append(f"{name} ausente ou vazia")

    dsn = (env.get("SUPABASE_DB_URL") or "").strip()
    if dsn:
        try:
            parsed = urlsplit(dsn)
            hostname = parsed.hostname
            port = parsed.port
        except ValueError:
            hostname = None
            port = None

        if not hostname:
            problems.append("SUPABASE_DB_URL ilegível: não é uma URL de conexão válida")
        elif port == 6543:
            problems.append(
                "SUPABASE_DB_URL aponta para a porta 6543 (transaction pooler): "
                "`set role` e lease são por sessão, use o session pooler na 5432"
            )
        elif not hostname.endswith("pooler.supabase.com"):
            problems.append(
                "SUPABASE_DB_URL não é o session pooler (host pooler.supabase.com): "
                "a conexão direta é IPv6 e o Render não alcança"
            )

    channel = (env.get("AGENTS_CHANNEL") or "").strip()
    if channel and channel != "cloud_api":
        problems.append(f"AGENTS_CHANNEL={channel!r}; o piloto fala cloud_api")

    key = (env.get("ENCRYPTION_KEY") or "").strip()
    if app_encryption_key is not None and key and key != app_encryption_key.strip():
        problems.append(
            "ENCRYPTION_KEY difere da chave do app: chave BYO e credencial Meta "
            "não abrem com chave diferente"
        )

    return problems


# --- health ------------------------------------------------------------------

# Espelha o default de `server.serve(health_max_age_s=...)`: o /healthz real
# usa 180s, não os 90s do rascunho original desta sonda. O servidor manda.
DEFAULT_STALE_AFTER = 180.0


def describe_health(
    age_seconds: float | None,
    depths: Mapping[str, int],
    *,
    stale_after: float = DEFAULT_STALE_AFTER,
) -> tuple[bool, list[str]]:
    """Saúde do laço em texto. `stale_after` espelha a régua do /healthz.

    Fila `dead_letter` cheia não derruba `healthy`: o processo pode estar
    perfeitamente vivo com jobs presos ali — mas é exatamente o número que
    quem está olhando o relatório quer ver de cara, então ela sempre aparece
    nas linhas junto das demais filas.
    """
    lines: list[str] = []
    if age_seconds is None:
        lines.append("heartbeat: nunca bateu — o processo não chegou ao banco")
        healthy = False
    else:
        healthy = age_seconds <= stale_after
        if healthy:
            # heartbeat e o laço de workers são tasks independentes sob o mesmo
            # gather (app.py): um worker travado não impede o heartbeat de bater.
            # Beat fresco prova processo vivo, não fila drenando — a linha não
            # pode dizer mais do que isso prova.
            lines.append(
                f"heartbeat: {age_seconds:.0f}s desde o último beat — processo vivo "
                "(não prova fila drenando)"
            )
        else:
            lines.append(f"heartbeat: {age_seconds:.0f}s desde o último beat")
            lines.append(f"heartbeat parado há mais de {stale_after:.0f}s")

    for name in sorted(depths):
        lines.append(f"fila {name}={depths[name]}")

    return healthy, lines


async def _probe(dsn: str, *, stale_after: float) -> tuple[bool, list[str]]:
    """A sonda de fato: se o banco não responde, isso é um resultado — não um
    traceback. Ferramenta que existe porque o egress bloqueava o host não pode
    quebrar ela mesma no cenário de "banco inalcançável"."""
    import psycopg

    from agents_runtime.repository import engine as engine_repo

    try:
        conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except Exception as exc:
        return False, [f"banco inalcançável: {exc}"]

    try:
        age = await engine_repo.heartbeat_age_seconds(conn)
        depths = await engine_repo.queue_depths(conn)
    except Exception as exc:
        return False, [f"banco inalcançável: {exc}"]
    finally:
        await conn.close()

    return describe_health(age, depths, stale_after=stale_after)


def _main(argv: list[str] | None = None) -> int:
    import argparse
    import asyncio
    import os

    parser = argparse.ArgumentParser(prog="piloto_check")
    sub = parser.add_subparsers(dest="command", required=True)
    env_cmd = sub.add_parser("env", help="valida o contrato do DEPLOY.md")
    env_cmd.add_argument("--app-encryption-key", default=None)
    probe_cmd = sub.add_parser("probe", help="lê heartbeat e filas pelo banco")
    probe_cmd.add_argument("--stale-after", type=float, default=DEFAULT_STALE_AFTER)
    args = parser.parse_args(argv)

    if args.command == "env":
        problems = validate_env(os.environ, app_encryption_key=args.app_encryption_key)
        for problem in problems:
            print(f"- {problem}")
        print("ambiente ok" if not problems else f"{len(problems)} problema(s)")
        return 1 if problems else 0

    if args.command == "probe":
        healthy, lines = asyncio.run(
            _probe(os.environ["SUPABASE_DB_URL"], stale_after=args.stale_after)
        )
        for line in lines:
            print(f"- {line}")
        return 0 if healthy else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
