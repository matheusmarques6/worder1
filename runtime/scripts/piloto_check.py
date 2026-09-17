# ruff: noqa: T201
"""Verificação do piloto: ambiente, saúde e smoke, sem console e sem achismo.

Três subcomandos, cada um respondendo a um ponto cego real do Apply de 12/08
(STATUS, passo 8.1): a env que ninguém conferia, o processo que não batia
heartbeat e o smoke conferido tabela a tabela na mão.
"""

from collections.abc import Mapping, Sequence
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


def build_smoke_report(
    inbound: int,
    outbound: int,
    outbox: Mapping[str, int],
    mirrored: int,
    steps: Sequence[str],
) -> tuple[bool, list[str]]:
    """Uma linha por expectativa, na ordem do turno. Chip é adereço: relata,
    não reprova."""
    lines: list[str] = []
    checks: list[bool] = []

    def check(passed: bool, message: str) -> None:
        checks.append(passed)
        lines.append(("ok   " if passed else "falhou ") + message)

    check(inbound > 0, f"mensagem do cliente na canônica ({inbound})")
    check(outbound > 0, f"resposta do agente na canônica ({outbound})")

    sent = outbox.get("sent", 0)
    if sent > 0:
        check(True, f"outbox sent={sent}")
    else:
        resto = ", ".join(f"{k}={v}" for k, v in sorted(outbox.items())) or "vazio"
        check(False, f"outbox sem linha sent ({resto})")

    check(mirrored > 0, f"espelho do inbox ({mirrored})")

    lines.append(
        ("ok   " if steps else "aviso ")
        + f"chips de progresso: {', '.join(steps) if steps else 'nenhum'}"
    )

    return all(checks), lines


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


async def _smoke(
    dsn: str, *, organization_id: str, phone: str, minutes: int
) -> tuple[bool, list[str]]:
    """A evidência do turno completo, lida do banco. Consultas de operador, não
    de produto — por isso moram aqui e não em `repository/` (contrato de
    camadas em `pyproject.toml`: `root_packages = ["agents_runtime"]`; este
    script não é `agents_runtime`, então `lint-imports` nunca o vê).

    Banco inalcançável ou consulta que falha é resultado, não traceback —
    mesma regra do `_probe`."""
    import psycopg

    window = f"{minutes} minutes"
    try:
        conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    except Exception as exc:
        return False, [f"banco inalcançável: {exc}"]

    try:
        row = await (
            await conn.execute(
                """
                select c.id
                  from public.conversations c
                  join public.contacts ct on ct.id = c.contact_id
                 where c.organization_id = %s
                   and (ct.phone = %s or ct.whatsapp = %s
                        or ct.phone = %s or ct.whatsapp = %s)
                 order by c.last_inbound_at desc nulls last
                 limit 1
                """,
                (organization_id, phone, phone, phone.lstrip("+"), phone.lstrip("+")),
            )
        ).fetchone()
        if row is None:
            return False, ["falhou nenhuma conversa canônica para esse telefone"]
        conversation_id = row[0]

        counts = await (
            await conn.execute(
                f"""
                select
                  count(*) filter (where direction = 'inbound'),
                  count(*) filter (where direction = 'outbound')
                  from public.messages
                 where conversation_id = %s
                   and created_at > now() - interval '{window}'
                """,
                (conversation_id,),
            )
        ).fetchone()

        outbox_rows = await (
            await conn.execute(
                f"""
                select status, count(*)
                  from internal.message_outbox
                 where conversation_id = %s
                   and created_at > now() - interval '{window}'
                 group by status
                """,
                (conversation_id,),
            )
        ).fetchall()

        # Chips e espelho são gravados na conversa CLOUD (internal.emit_ai_run_step,
        # migration 20260817000002, grava `v_cloud` — não a canônica). Resolve
        # uma vez, por organização + wa_id tolerando o '+', e as duas consultas
        # abaixo bebem do mesmo id — sem isso o espelho, escopado só pela
        # organização, contaria a mensagem de QUALQUER conversa da loja e o
        # smoke sairia verde num turno que não teve resposta nenhuma.
        cloud_row = await (
            await conn.execute(
                """
                select wcc.id
                  from public.whatsapp_cloud_conversations wcc
                 where wcc.organization_id = %s
                   and (wcc.wa_id = %s or wcc.wa_id = %s)
                 order by wcc.last_message_at desc nulls last
                 limit 1
                """,
                (organization_id, phone, phone.lstrip("+")),
            )
        ).fetchone()
        cloud_conversation_id = cloud_row[0] if cloud_row is not None else None

        if cloud_conversation_id is None:
            mirrored: tuple[int] = (0,)
            steps: list[tuple[str]] = []
        else:
            mirrored = await (
                await conn.execute(
                    f"""
                    select count(*)
                      from public.whatsapp_cloud_messages wcm
                     where wcm.conversation_id = %s
                       and wcm.direction = 'outbound'
                       and wcm."timestamp" > now() - interval '{window}'
                    """,
                    (cloud_conversation_id,),
                )
            ).fetchone()

            steps = await (
                await conn.execute(
                    f"""
                    select step
                      from public.whatsapp_ai_run_steps
                     where conversation_id = %s
                       and created_at > now() - interval '{window}'
                     order by created_at
                    """,
                    (cloud_conversation_id,),
                )
            ).fetchall()
    except Exception as exc:
        return False, [f"banco inalcançável: {exc}"]
    finally:
        await conn.close()

    return build_smoke_report(
        inbound=counts[0],
        outbound=counts[1],
        outbox={status: total for status, total in outbox_rows},
        mirrored=mirrored[0],
        steps=[step for (step,) in steps],
    )


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
    smoke_cmd = sub.add_parser("smoke", help="conferência do turno completo, por veredito")
    smoke_cmd.add_argument("--organization", required=True)
    smoke_cmd.add_argument("--phone", required=True)
    smoke_cmd.add_argument("--minutes", type=int, default=15)
    args = parser.parse_args(argv)

    if args.command == "env":
        problems = validate_env(os.environ, app_encryption_key=args.app_encryption_key)
        for problem in problems:
            print(f"- {problem}")
        print("ambiente ok" if not problems else f"{len(problems)} problema(s)")
        return 1 if problems else 0

    if args.command == "probe":
        dsn = os.environ.get("SUPABASE_DB_URL")
        if not dsn:
            print("- SUPABASE_DB_URL não está definida")
            return 1
        healthy, lines = asyncio.run(_probe(dsn, stale_after=args.stale_after))
        for line in lines:
            print(f"- {line}")
        return 0 if healthy else 1

    if args.command == "smoke":
        dsn = os.environ.get("SUPABASE_DB_URL")
        if not dsn:
            print("- SUPABASE_DB_URL não está definida")
            return 1
        passed, lines = asyncio.run(
            _smoke(
                dsn,
                organization_id=args.organization,
                phone=args.phone,
                minutes=args.minutes,
            )
        )
        for line in lines:
            print(f"- {line}")
        return 0 if passed else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
