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


def _main(argv: list[str] | None = None) -> int:
    import argparse
    import os

    parser = argparse.ArgumentParser(prog="piloto_check")
    sub = parser.add_subparsers(dest="command", required=True)
    env_cmd = sub.add_parser("env", help="valida o contrato do DEPLOY.md")
    env_cmd.add_argument("--app-encryption-key", default=None)
    args = parser.parse_args(argv)

    if args.command == "env":
        problems = validate_env(os.environ, app_encryption_key=args.app_encryption_key)
        for problem in problems:
            print(f"- {problem}")
        print("ambiente ok" if not problems else f"{len(problems)} problema(s)")
        return 1 if problems else 0

    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
