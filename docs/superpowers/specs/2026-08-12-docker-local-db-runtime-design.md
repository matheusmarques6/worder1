# Docker local: banco + runtime (bancada e piloto) — Design

**Data:** 2026-08-12
**Branch:** `claude/debug-console-error-FWrLE`
**Status:** aprovado pelo usuário (4 seções) em 2026-08-12

## Objetivo

Um `docker compose` em `runtime/` que comporta **banco de dados e runtime** no PC
do usuário, em dois modos que não se misturam:

- **Bancada** — Postgres local com **espelho de produção** + runtime **mudo**
  (sem canal Meta). Para desenvolver e validar sobre dados reais sem risco de
  enviar nada.
- **Piloto** — runtime apontando ao **Supabase da nuvem** (session pooler) com
  **envio real**. O PC atua como host temporário do runtime de produção.

Decisão de arquitetura registrada: piloto **nunca** roda contra o espelho
local — mensagens novas de clientes chegam via webhook (Vercel → nuvem), então
um runtime enviando de verdade a partir do espelho reprocessaria filas velhas
e nunca veria conversas novas.

## Contexto do repo (o que já existe)

- `runtime/Dockerfile` — multi-stage, non-root, SIGTERM gracioso. **Intocado.**
- `runtime/docker-compose.yml` — só o serviço `runtime`, DSN default
  `host.docker.internal:54322`, sem porta exposta e sem
  `ENCRYPTION_KEY`/`AGENTS_PREVIEW_TOKEN`/`AGENTS_HTTP_PORT`.
- `supabase/config.toml` — convenciona a porta local 54322 do banco.
- `supabase/migrations/` — 21 migrations da era do runtime; a produção tem
  schema legado além delas, por isso o espelho é **dump**, não migrations.
- Segredos: o usuário tem todos em mãos (senha do banco, `ENCRYPTION_KEY` da
  Vercel, chave OpenRouter, token Meta, `AGENTS_PREVIEW_TOKEN`). Nenhum
  `.env` real existe no repo — serão criados localmente, fora do git.

## Seção 1 — Arquitetura geral

Tudo em `runtime/`. Um único `docker-compose.yml` com **perfis**:

| Perfil | Serviços | Banco | Envio |
|---|---|---|---|
| `bancada` | `db` + `runtime-bancada` | local (espelho) | mudo |
| `piloto` | `runtime-piloto` | nuvem (pooler) | real |

Os dois perfis podem coexistir (portas e `AGENTS_PROCESS_NAME` distintos).

Arquivos novos/alterados:

- `runtime/docker-compose.yml` — estendido (serviço `db`, dois serviços de
  runtime via âncora YAML, perfis).
- `runtime/.env.bancada.example` e `runtime/.env.piloto.example` — templates
  versionados; `.env.bancada`/`.env.piloto` reais entram no `.gitignore`.
- `runtime/scripts/mirror.ps1` — dump da nuvem → restore no local.
- `runtime/scripts/post-restore.sql` — salvaguardas pós-restore.
- `runtime/DEPLOY.md` — nova seção "Rodando no PC (bancada e piloto)".

## Seção 2 — Compose, portas e envs

**`db`** (perfil `bancada`):
- Imagem `supabase/postgres` major 17 (tag pinada na implementação) — traz
  `pgmq`, `pgvector` e o mundo `auth`/roles do Supabase que as
  functions/policies referenciam.
- `POSTGRES_PASSWORD=postgres`; porta host `54322` → 5432; volume nomeado
  persistente; healthcheck `pg_isready`.

**`runtime-bancada`** (perfil `bancada`):
- Build do `runtime/Dockerfile`; `env_file: .env.bancada`;
  `depends_on: db` com `condition: service_healthy`.
- `SUPABASE_DB_URL=postgresql://postgres:postgres@db:5432/postgres` (rede
  interna do compose, sem `host.docker.internal`).
- **Sem** `AGENTS_CHANNEL` e **sem** `AGENTS_META_ACCESS_TOKEN` → mudo.
- `AGENTS_PROCESS_NAME=runtime-pc-bancada`; `AGENTS_HTTP_PORT=10000`;
  porta host `10000`.

**`runtime-piloto`** (perfil `piloto`):
- Mesma imagem (âncora YAML); `env_file: .env.piloto`; sem `depends_on`.
- `SUPABASE_DB_URL` = session pooler da nuvem
  (`postgres.rqpmoavktzvxfcfsdkcc@aws-0-sa-east-1.pooler.supabase.com:5432`;
  transaction pooler 6543 não serve — `set role` e leases são por sessão).
- `AGENTS_CHANNEL=agents_runtime.channels.cloud_api:from_env` +
  `AGENTS_META_ACCESS_TOKEN` → envio real.
- `AGENTS_PROCESS_NAME=runtime-pc-piloto`; porta host `10001` → 10000.

Envs comuns aos dois (vindas do respectivo `.env`): `AGENTS_RESPONDER`,
`AGENTS_TOUCHER`, `AGENTS_WORKER_SET_ROLE=worker_role`,
`AGENTS_SENDER_SET_ROLE=sender_role`, `AGENTS_OPENROUTER_API_KEY`,
`ENCRYPTION_KEY` (o MESMO da Vercel — abre as chaves BYO nos dois modos),
`AGENTS_PREVIEW_TOKEN`, `AGENTS_LOG_LEVEL=INFO`.

O compose atual não mapeia `ENCRYPTION_KEY`, `AGENTS_PREVIEW_TOKEN` nem
`AGENTS_HTTP_PORT` para o container e não expõe porta — a extensão corrige.

Comandos:

```powershell
docker compose --profile bancada up -d --build   # bancada
docker compose --profile piloto  up -d --build   # piloto
```

## Seção 3 — Espelho de produção (dump/restore + salvaguardas)

`runtime/scripts/mirror.ps1`, repetível (re-espelha por cima):

1. **Dump** — `pg_dump` rodando **dentro de um container** (mesma imagem do
   `db`; nada a instalar no Windows), contra o session pooler da nuvem,
   formato custom (`-Fc`), schemas `public`, `internal`, `pgmq`, `auth`,
   `--no-owner --no-acl`. A DSN da nuvem é lida do `.env.piloto` (única fonte
   da senha).
2. **Restore** — `pg_restore --clean --if-exists --no-owner --no-acl` no `db`
   local (serviço do compose já de pé).
3. **`post-restore.sql`**:
   - Garante roles `worker_role`/`sender_role` + grants de `set role` para
     `postgres` (espelho da migration `…0002_runtime_roles_and_internal.sql`).
   - **Purga todas as filas pgmq** herdadas do dump — impede o runtime de
     processar jobs antigos apontando para clientes reais.
   - Limpa `internal.runtime_heartbeats` e leases/locks pendentes.

**Risco conhecido:** restaurar `auth` por cima do schema que a imagem
inicializa pode conflitar. Mitigação: `--clean --if-exists` + validação de
fidelidade (contagem de linhas por tabela local × nuvem para as tabelas que o
runtime lê) antes de declarar o espelho pronto. Se o conflito se provar
intratável, o fallback é excluir `auth` do dump e satisfazer as FKs para
`auth.users` com inserts mínimos — decisão tomada na implementação, com o
resultado registrado.

## Seção 4 — Validação e tratamento de erros

**Bancada (3 provas):**
1. `docker logs` — linhas JSON sem exceção, depois silêncio (dormante).
2. `http://localhost:10000/healthz` → ok.
3. No banco **local**: `select process_name, beat_at from
   internal.runtime_heartbeats order by beat_at desc` → `runtime-pc-bancada`
   com `beat_at` recente.

**Piloto:** mesmas provas com porta `10001` e a query no Supabase da
**nuvem** (sonda 8.4 do STATUS).

**Doc de erros** (na seção nova do `DEPLOY.md`): tabela
sintoma → causa → correção cobrindo `password authentication failed`,
`Tenant or user not found` (usuário sem sufixo do projeto), `could not
translate host name`, env obrigatória ausente, `port is already allocated`
(54322/10000/10001) e container em loop de restart.

**Segurança:** `.env.bancada`/`.env.piloto` nunca commitados (gitignore +
templates `.example`); o espelho local contém dados reais de clientes — o doc
avisa que o volume `db` é dado sensível e como destruí-lo
(`docker compose --profile bancada down -v`).

## Fora de escopo

- App Next.js local apontando ao espelho (o espelho serve ao runtime).
- Supabase Studio/API local (se precisar de UI, a abordagem B — Supabase CLI —
  fica disponível sem retrabalho; o script de espelho serve igual).
- Produção definitiva no PC: continua valendo a decisão do STATUS (Render/VPS);
  o piloto no PC é temporário.
