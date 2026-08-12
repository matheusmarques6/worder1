# Docker local (banco espelho + runtime, bancada/piloto) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um `docker compose` em `runtime/` com perfil `bancada` (Postgres local espelhado de produção + runtime mudo) e perfil `piloto` (runtime → Supabase nuvem, envio real).

**Architecture:** Serviço `db` (`supabase/postgres:17.6.1.160`) + dois serviços de runtime a partir do mesmo Dockerfile via âncora YAML, separados por perfis do compose e por env-files. Espelho via `pg_dump`/`pg_restore` executados DENTRO do container `db` (o dump nunca toca o disco do host); filas pgmq ficam fora do dump e são recriadas vazias (salvaguarda por construção).

**Tech Stack:** Docker Compose (profiles, anchors), supabase/postgres 17 (pgmq, pgvector, schema auth embutidos), PowerShell 5.1 (script do espelho), psql/pg_dump/pg_restore 17.

**Spec:** `docs/superpowers/specs/2026-08-12-docker-local-db-runtime-design.md`

## Global Constraints

- Worktree: `D:/worder1-fwrle`, branch `claude/debug-console-error-FWrLE`. Todos os paths abaixo são relativos a essa raiz.
- `runtime/Dockerfile` é INTOCÁVEL.
- Imagem do banco pinada: `supabase/postgres:17.6.1.160`.
- Portas: banco local `54322` (host) → 5432; bancada healthz `10000:10000`; piloto healthz `10001:10000`.
- Nomes de processo: `runtime-pc-bancada` / `runtime-pc-piloto`.
- `.env.bancada` e `.env.piloto` reais NUNCA são commitados; só os `.example`.
- Bancada é MUDA por contrato: `.env.bancada` jamais contém `AGENTS_CHANNEL`/`AGENTS_META_ACCESS_TOKEN`.
- Session pooler da nuvem (`aws-0-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.rqpmoavktzvxfcfsdkcc`); transaction pooler 6543 NÃO serve (`set role`/leases são por sessão).
- Env names exatos (verificados no código): `SUPABASE_DB_URL`, `AGENTS_RESPONDER`, `AGENTS_TOUCHER`, `AGENTS_WORKER_SET_ROLE`, `AGENTS_SENDER_SET_ROLE`, `AGENTS_OPENROUTER_API_KEY`, `ENCRYPTION_KEY`, `AGENTS_PREVIEW_TOKEN`, `AGENTS_HTTP_PORT`, `AGENTS_PROCESS_NAME`, `AGENTS_LOG_LEVEL`, `AGENTS_CHANNEL`, `AGENTS_META_ACCESS_TOKEN`, `AGENTS_META_API_VERSION`, `DEPLOY_ENV`.
- Comandos `docker compose` rodam com cwd `runtime/`.

---

### Task 1: Serviço `db` no compose + gitignore dos envs

**Files:**
- Modify: `runtime/docker-compose.yml` (substituição completa — ver Task 2; nesta task entra a parte do `db`)
- Modify: `.gitignore` (raiz)

**Interfaces:**
- Produces: serviço compose `db` (profile `bancada`), Postgres em `localhost:54322`, senha `postgres`, volume `db_data`. Tasks 3–5 dependem dele.

- [ ] **Step 1: Adicionar ignores dos envs reais**

No `.gitignore` da raiz, logo após a linha `.env.production.local`, adicionar:

```gitignore
.env.bancada
.env.piloto
```

- [ ] **Step 2: Escrever o compose com o serviço `db`**

Substituir `runtime/docker-compose.yml` inteiro pelo conteúdo abaixo (já inclui a âncora e os dois runtimes da Task 2 — as duas tasks alteram o mesmo arquivo; esta escreve, a próxima valida a parte dos runtimes):

```yaml
# Compose local do runtime — dois modos que não se misturam (ver
# docs/superpowers/specs/2026-08-12-docker-local-db-runtime-design.md):
#
#   bancada  →  db local (espelho de produção via scripts/mirror.ps1) +
#               runtime MUDO (sem canal). docker compose --profile bancada up -d
#   piloto   →  só o runtime, apontando ao Supabase da NUVEM, envio REAL.
#               docker compose --profile piloto up -d
#
# Os perfis coexistem (portas e process names distintos). Os .env reais
# (.env.bancada / .env.piloto) ficam fora do git — templates em *.example.

x-runtime-base: &runtime-base
  build:
    context: .
    dockerfile: Dockerfile
  init: true
  restart: unless-stopped
  healthcheck:
    test:
      [
        "CMD",
        "python",
        "-c",
        "import os, psycopg; psycopg.connect(os.environ['SUPABASE_DB_URL'], connect_timeout=5).close()",
      ]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 20s

services:
  db:
    profiles: ["bancada"]
    image: supabase/postgres:17.6.1.160
    environment:
      POSTGRES_PASSWORD: postgres
    ports:
      - "54322:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  runtime-bancada:
    <<: *runtime-base
    profiles: ["bancada"]
    env_file: .env.bancada
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "10000:10000"

  runtime-piloto:
    <<: *runtime-base
    profiles: ["piloto"]
    env_file: .env.piloto
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "10001:10000"

volumes:
  db_data:
```

- [ ] **Step 3: Validar a sintaxe do compose (sem env files ainda)**

```powershell
cd D:\worder1-fwrle\runtime
New-Item -ItemType File .env.bancada -ErrorAction SilentlyContinue; New-Item -ItemType File .env.piloto -ErrorAction SilentlyContinue
docker compose --profile bancada --profile piloto config --quiet
```

Expected: exit 0, sem erros de parse. (Os `.env` vazios são placeholders temporários para o `config` não reclamar; serão preenchidos na Task 4.)

- [ ] **Step 4: Subir o `db` e verificar saúde + extensões**

```powershell
docker compose --profile bancada up -d db
# aguardar healthy (repetir até "healthy"):
docker inspect -f "{{.State.Health.Status}}" runtime-db-1
docker compose exec -T db psql -U postgres -c "select version();"
docker compose exec -T db psql -U postgres -c "select name from pg_available_extensions where name in ('pgmq','vector') order by 1;"
```

Expected: `healthy`; `PostgreSQL 17.x`; as DUAS linhas `pgmq` e `vector` presentes. Se `pgmq` não aparecer, a tag da imagem está errada — parar e reportar.

- [ ] **Step 5: Verificar que os envs reais estão ignorados e commitar**

```powershell
cd D:\worder1-fwrle
git check-ignore runtime/.env.bancada runtime/.env.piloto
git add .gitignore runtime/docker-compose.yml
git commit -m "feat(runtime): compose com db local supabase/postgres 17 + perfis bancada/piloto"
```

Expected: `git check-ignore` imprime os dois paths (ignorados); commit criado SEM os `.env`.

---

### Task 2: Templates de env (.env.bancada.example / .env.piloto.example)

**Files:**
- Create: `runtime/.env.bancada.example`
- Create: `runtime/.env.piloto.example`

**Interfaces:**
- Consumes: serviços `runtime-bancada`/`runtime-piloto` da Task 1 (leem `.env.bancada`/`.env.piloto` via `env_file`).
- Produces: templates que a Task 4 copia para os `.env` reais.

- [ ] **Step 1: Criar `runtime/.env.bancada.example`**

```bash
# BANCADA — banco local espelhado, runtime MUDO.
# Copie para .env.bancada e preencha os 3 segredos. NUNCA commitar o arquivo real.
#
# CONTRATO: este modo NÃO tem AGENTS_CHANNEL nem AGENTS_META_ACCESS_TOKEN.
# Sem canal o runtime pensa e grava, mas não envia nada — é o que torna
# seguro rodar sobre dados reais de clientes. Não adicione essas linhas aqui.

SUPABASE_DB_URL=postgresql://postgres:postgres@db:5432/postgres

# Fábricas reais (o processo recusa largar sem elas)
AGENTS_RESPONDER=agents_runtime.agent_core.responder:agent_responder
AGENTS_TOUCHER=agents_runtime.agent_core.toucher:agent_toucher
AGENTS_WORKER_SET_ROLE=worker_role
AGENTS_SENDER_SET_ROLE=sender_role

# --- segredos (preencher) ---
# openrouter.ai → Keys (Judge 1 + embeddings)
AGENTS_OPENROUTER_API_KEY=sk-or-SUA_CHAVE
# O MESMO da Vercel (worder1 → Settings → Environment Variables) — abre as chaves BYO
ENCRYPTION_KEY=O_MESMO_DA_VERCEL
# Token do preview de prompts (o do chat / o mesmo da Vercel)
AGENTS_PREVIEW_TOKEN=O_TOKEN_DO_CHAT

AGENTS_HTTP_PORT=10000
AGENTS_PROCESS_NAME=runtime-pc-bancada
AGENTS_LOG_LEVEL=INFO
DEPLOY_ENV=dev
```

- [ ] **Step 2: Criar `runtime/.env.piloto.example`**

```bash
# PILOTO — runtime apontando ao Supabase da NUVEM, envio REAL via Meta.
# Copie para .env.piloto e preencha. NUNCA commitar o arquivo real.
#
# ATENÇÃO: com este arquivo preenchido o runtime ENVIA MENSAGENS DE VERDADE.
# Session pooler (5432) obrigatório; transaction pooler (6543) NÃO serve —
# set role e leases são por sessão.

SUPABASE_DB_URL=postgresql://postgres.rqpmoavktzvxfcfsdkcc:SENHA_DO_BANCO@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

AGENTS_RESPONDER=agents_runtime.agent_core.responder:agent_responder
AGENTS_TOUCHER=agents_runtime.agent_core.toucher:agent_toucher
AGENTS_WORKER_SET_ROLE=worker_role
AGENTS_SENDER_SET_ROLE=sender_role

# --- segredos (preencher) ---
AGENTS_OPENROUTER_API_KEY=sk-or-SUA_CHAVE
ENCRYPTION_KEY=O_MESMO_DA_VERCEL
AGENTS_PREVIEW_TOKEN=O_TOKEN_DO_CHAT

# --- canal real (o que faz o piloto ENVIAR) ---
AGENTS_CHANNEL=agents_runtime.channels.cloud_api:from_env
AGENTS_META_ACCESS_TOKEN=SEU_TOKEN_META
AGENTS_META_API_VERSION=v19.0

# Porta INTERNA do container (o host publica em 10001 via compose)
AGENTS_HTTP_PORT=10000
AGENTS_PROCESS_NAME=runtime-pc-piloto
AGENTS_LOG_LEVEL=INFO
DEPLOY_ENV=production
```

- [ ] **Step 3: Validar interpolação do compose com os templates**

```powershell
cd D:\worder1-fwrle\runtime
Copy-Item .env.bancada.example .env.bancada -Force
Copy-Item .env.piloto.example .env.piloto -Force
docker compose --profile bancada config | Select-String "AGENTS_PROCESS_NAME|SUPABASE_DB_URL|10000"
docker compose --profile piloto config | Select-String "AGENTS_PROCESS_NAME|AGENTS_CHANNEL|10001"
```

Expected: bancada mostra `runtime-pc-bancada`, DSN `@db:5432` e porta `10000:10000`; piloto mostra `runtime-pc-piloto`, `AGENTS_CHANNEL=...cloud_api:from_env` e `10001:10000`. Os `.env` reais continuam com placeholders — Task 4 preenche.

- [ ] **Step 4: Commit**

```powershell
cd D:\worder1-fwrle
git add runtime/.env.bancada.example runtime/.env.piloto.example
git commit -m "feat(runtime): templates de env bancada (mudo) e piloto (envio real)"
```

---

### Task 3: Scripts do espelho (pre-restore.sql, post-restore.sql, mirror.ps1)

**Files:**
- Create: `runtime/scripts/pre-restore.sql`
- Create: `runtime/scripts/post-restore.sql`
- Create: `runtime/scripts/mirror.ps1`

**Interfaces:**
- Consumes: serviço `db` (Task 1); `.env.piloto` real (Task 4) — fonte única da DSN da nuvem.
- Produces: `mirror.ps1` idempotente que re-espelha produção no `db` local. Task 4 o executa.

**Decisões desta task (registradas no spec §3):**
- Dump: schemas `public`, `internal`, `auth`; formato custom; `--no-owner` e **COM ACLs** (grants de `worker_role`/`sender_role` vêm no dump; por isso os roles nascem ANTES do restore).
- `pgmq` fica FORA do dump; as 8 filas são recriadas vazias no post-restore (purga por construção) e purgadas de novo a cada re-espelho.
- Dump escrito em `/tmp` DENTRO do container (dados sensíveis não tocam o disco do host).

- [ ] **Step 1: Criar `runtime/scripts/pre-restore.sql`**

```sql
-- Antes do pg_restore: roles e extensões que o dump referencia.
-- Roles primeiro — policies e ACLs restauradas apontam para eles.
do $$ begin
  create role worker_role nologin nobypassrls;
exception when duplicate_object then null; end $$;
do $$ begin
  create role sender_role nologin nobypassrls;
exception when duplicate_object then null; end $$;
grant worker_role, sender_role to postgres;

-- Extensões (tipos/defaults usados pelas tabelas dumpadas). Na nuvem vivem
-- no schema extensions; if not exists tolera o que a imagem já criou.
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists vector    with schema extensions;
create extension if not exists pgmq;
```

- [ ] **Step 2: Criar `runtime/scripts/post-restore.sql`**

```sql
-- Depois do pg_restore: filas vazias + estado de runtime zerado.
-- As filas ficam FORA do dump de propósito: nascer vazia é a salvaguarda
-- contra reprocessar jobs de produção apontando para clientes reais.
select pgmq.create(q)
from unnest(array[
  'q_inbound','q_domain_events','q_scheduled','q_evals',
  'q_inbound_dlq','q_domain_events_dlq','q_scheduled_dlq','q_evals_dlq'
]) as q;

-- Re-espelho por cima de bancada usada: purga o que a rodada anterior enfileirou.
select pgmq.purge_queue(queue_name) from pgmq.meta;

-- Grants do 0002 sobre o mundo pgmq local (o dump não os traz — pgmq está fora dele).
grant usage on schema pgmq to worker_role;
grant select on pgmq.meta to worker_role;
grant select, insert, update, delete on all tables in schema pgmq to worker_role;
grant usage, select on all sequences in schema pgmq to worker_role;

-- Heartbeats são do processo, não dos dados.
truncate internal.runtime_heartbeats;
```

- [ ] **Step 3: Criar `runtime/scripts/mirror.ps1`**

```powershell
# Espelha o banco de produção (Supabase nuvem) no db local do compose.
# Repetível: rodar de novo re-espelha por cima. O dump vive só em /tmp do
# container — dados sensíveis não tocam o disco do host.
# Uso:  cd runtime; powershell -ExecutionPolicy Bypass -File scripts\mirror.ps1
$ErrorActionPreference = 'Stop'
$runtimeDir = Split-Path -Parent $PSScriptRoot
Set-Location $runtimeDir

# 1. DSN da nuvem — fonte única: .env.piloto
$envFile = Join-Path $runtimeDir '.env.piloto'
if (-not (Test-Path $envFile)) { throw "Crie runtime/.env.piloto a partir do .env.piloto.example antes de espelhar." }
$dsnLine = (Select-String -Path $envFile -Pattern '^SUPABASE_DB_URL=').Line
if (-not $dsnLine) { throw "SUPABASE_DB_URL ausente no .env.piloto." }
$cloudDsn = $dsnLine.Substring('SUPABASE_DB_URL='.Length).Trim()
if ($cloudDsn -match 'SENHA_DO_BANCO') { throw "Preencha a senha real no .env.piloto (ainda esta com placeholder)." }

# 2. db de pé e saudável
docker compose --profile bancada up -d db
if ($LASTEXITCODE -ne 0) { throw "docker compose up db falhou." }
$deadline = (Get-Date).AddMinutes(3)
do {
  $health = docker inspect -f '{{.State.Health.Status}}' runtime-db-1
  if ($health -eq 'healthy') { break }
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)
if ($health -ne 'healthy') { throw "db nao ficou healthy em 3 min (status: $health). Veja: docker logs runtime-db-1" }

# 3. runtime-bancada parado durante o restore (conexoes abertas travam DROPs)
docker compose --profile bancada stop runtime-bancada

# 4. dump da nuvem, dentro do container (pg_dump 17 da propria imagem)
Write-Host ">> pg_dump (public, internal, auth) da nuvem..."
docker compose exec -T db pg_dump "$cloudDsn" -Fc -n public -n internal -n auth --no-owner -f /tmp/mirror.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou — confira a senha/DSN do .env.piloto (session pooler 5432)." }

# 5. pre-restore: roles + extensoes
docker compose cp scripts/pre-restore.sql db:/tmp/pre-restore.sql
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/pre-restore.sql
if ($LASTEXITCODE -ne 0) { throw "pre-restore.sql falhou." }

# 6. restore (avisos sao esperados na 1a carga do schema auth; erro real para no passo 8)
Write-Host ">> pg_restore no db local..."
docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/mirror.dump
Write-Host ">> pg_restore terminou (exit $LASTEXITCODE; avisos tolerados, validacao decide)."

# 7. post-restore: filas vazias + heartbeats zerados + grants pgmq
docker compose cp scripts/post-restore.sql db:/tmp/post-restore.sql
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/post-restore.sql
if ($LASTEXITCODE -ne 0) { throw "post-restore.sql falhou." }
docker compose exec -T db rm -f /tmp/mirror.dump /tmp/pre-restore.sql /tmp/post-restore.sql

# 8. validacao de fidelidade: contagens local x nuvem nas tabelas que o runtime le
$checkSql = "select 'organizations', count(*) from public.organizations union all select 'contacts', count(*) from public.contacts union all select 'organization_api_keys', count(*) from public.organization_api_keys order by 1;"
Write-Host "`n== NUVEM =="
docker compose exec -T db psql "$cloudDsn" -t -c "$checkSql"
Write-Host "== LOCAL =="
docker compose exec -T db psql -U postgres -d postgres -t -c "$checkSql"
Write-Host "== filas (esperado 8) e heartbeats (esperado 0) =="
docker compose exec -T db psql -U postgres -d postgres -t -c "select count(*) from pgmq.meta; select count(*) from internal.runtime_heartbeats;"

Write-Host "`nCompare as contagens acima. Se baterem: docker compose --profile bancada up -d  (religa o runtime)"
```

- [ ] **Step 4: Smoke-test dos SQLs num banco limpo (sem nuvem)**

```powershell
cd D:\worder1-fwrle\runtime
docker compose cp scripts/pre-restore.sql db:/tmp/pre-restore.sql
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/pre-restore.sql
docker compose exec -T db psql -U postgres -d postgres -c "select rolname from pg_roles where rolname in ('worker_role','sender_role');"
docker compose exec -T db psql -U postgres -d postgres -c "select extname from pg_extension where extname in ('pgmq','vector');"
```

Expected: os dois roles listados; `pgmq` e `vector` instalados. (O `post-restore.sql` só roda inteiro após um restore — `internal.runtime_heartbeats` ainda não existe; ele é exercitado na Task 4.)

- [ ] **Step 5: Commit**

```powershell
cd D:\worder1-fwrle
git add runtime/scripts/pre-restore.sql runtime/scripts/post-restore.sql runtime/scripts/mirror.ps1
git commit -m "feat(runtime): espelho de producao — mirror.ps1 + pre/post-restore com filas nascendo vazias"
```

---

### Task 4: Espelhar produção e subir a BANCADA (3 provas)

> Esta task usa segredos reais do usuário. Executar com o usuário presente; os
> valores entram só nos `.env` locais (gitignorados), nunca no chat/commits.

**Files:**
- Create (local, fora do git): `runtime/.env.bancada`, `runtime/.env.piloto`

**Interfaces:**
- Consumes: `mirror.ps1` (Task 3), compose (Task 1), templates (Task 2).
- Produces: banco local espelhado + `runtime-pc-bancada` batendo heartbeat local. Critério de pronto da bancada.

- [ ] **Step 1: Preencher os .env reais**

Usuário copia os `.example` e preenche (senha do banco, OpenRouter, ENCRYPTION_KEY, preview token no `.env.bancada`; os mesmos + token Meta no `.env.piloto`):

```powershell
cd D:\worder1-fwrle\runtime
notepad .env.bancada   # a partir do .env.bancada.example
notepad .env.piloto    # a partir do .env.piloto.example (a DSN daqui alimenta o espelho)
```

- [ ] **Step 2: Rodar o espelho**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mirror.ps1
```

Expected: contagens NUVEM × LOCAL iguais para `organizations`, `contacts`, `organization_api_keys`; filas = 8; heartbeats = 0. Se o restore do schema `auth` conflitar com o da imagem (erro real, não aviso), aplicar o fallback do spec §3: acrescentar `-N auth` no passo de dump do `mirror.ps1` e satisfazer FKs para `auth.users` com inserts mínimos — registrar a decisão no commit.

- [ ] **Step 3: Subir a bancada completa**

```powershell
docker compose --profile bancada up -d --build
docker compose logs -f runtime-bancada
```

Expected (prova 1): linhas JSON sem exceção, depois silêncio (dormante). `Ctrl+C` sai dos logs.

- [ ] **Step 4: Prova 2 — healthz**

```powershell
Invoke-WebRequest http://localhost:10000/healthz -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

Expected: `200`.

- [ ] **Step 5: Prova 3 — heartbeat no banco LOCAL**

```powershell
docker compose exec -T db psql -U postgres -d postgres -c "select process_name, beat_at from internal.runtime_heartbeats order by beat_at desc limit 3;"
```

Expected: `runtime-pc-bancada` com `beat_at` recente (< 2 min). Bancada validada.

---

### Task 5: Documentação (DEPLOY.md) e push

**Files:**
- Modify: `runtime/DEPLOY.md` (nova seção após "## Caminho rápido: Render Blueprint")

**Interfaces:**
- Consumes: tudo acima.
- Produces: runbook de bancada/piloto para qualquer máquina.

- [ ] **Step 1: Adicionar a seção ao DEPLOY.md**

Inserir após o bloco do Render Blueprint:

```markdown
## Rodando no PC (bancada e piloto)

Dois modos no `docker-compose.yml` deste diretório, que coexistem:

| Modo | Sobe | Banco | Envia? | healthz |
|---|---|---|---|---|
| `bancada` | `db` + `runtime-bancada` | local (espelho de produção) | NÃO (sem canal) | `:10000` |
| `piloto` | `runtime-piloto` | nuvem (session pooler) | SIM (Meta) | `:10001` |

Setup: copiar `.env.bancada.example`→`.env.bancada` e `.env.piloto.example`→
`.env.piloto`, preencher os segredos (nunca commitar os reais).

**Bancada** (espelhar + subir):

    powershell -ExecutionPolicy Bypass -File scripts\mirror.ps1
    docker compose --profile bancada up -d --build

Provas: logs JSON sem exceção; `http://localhost:10000/healthz` = 200;
`select process_name, beat_at from internal.runtime_heartbeats order by beat_at desc`
no banco LOCAL (`docker compose exec db psql -U postgres`) mostrando
`runtime-pc-bancada` recente.

O espelho contém dados reais de clientes: o volume `db_data` é dado sensível.
Destruir: `docker compose --profile bancada down -v`. A bancada é MUDA por
contrato — nunca adicionar `AGENTS_CHANNEL`/`AGENTS_META_ACCESS_TOKEN` ao
`.env.bancada`; para envio real existe o piloto.

**Piloto** (envio REAL — runtime de produção rodando no PC):

    docker compose --profile piloto up -d --build

Provas: healthz em `:10001`; heartbeat `runtime-pc-piloto` na NUVEM (SQL Editor
do Supabase). O rollout por org (`ai_runtime_rollout`) continua sendo o
interruptor — subir o piloto não liga org nenhuma.

**Erros comuns** (`docker compose logs runtime-bancada|runtime-piloto`):

| Sintoma no log | Causa | Correção |
|---|---|---|
| `password authentication failed` | senha errada na DSN | resetar em Settings → Database e atualizar o `.env` |
| `Tenant or user not found` | usuário sem sufixo do projeto | usar `postgres.rqpmoavktzvxfcfsdkcc` |
| `could not translate host name` | host errado | `aws-0-sa-east-1.pooler.supabase.com:5432` (piloto) / `db:5432` (bancada) |
| `AGENTS_... is not set` | linha faltando no `.env` | conferir contra o `.example` e `docker compose restart <serviço>` |
| `port is already allocated` | 54322/10000/10001 ocupadas | trocar a porta do HOST no compose (lado esquerdo do mapa) |
| container em loop de restart | qualquer uma acima | a última linha do log antes de morrer diz qual |
```

- [ ] **Step 2: Commit e push**

```powershell
cd D:\worder1-fwrle
git add runtime/DEPLOY.md
git commit -m "docs(runtime): runbook bancada/piloto no PC — espelho, provas de vida e erros comuns"
git push origin claude/debug-console-error-FWrLE
```

Expected: push aceito (branch já sincronizada).

---

### Task 6: PILOTO — envio real (SÓ com "vai" explícito do usuário)

> **GATE HUMANO:** este passo põe o runtime de produção para rodar do PC, com
> envio real via Meta. Não executar sem confirmação explícita do usuário
> nesta hora, mesmo que as tasks anteriores tenham passado.

**Files:** nenhum (operação).

**Interfaces:**
- Consumes: `.env.piloto` real (Task 4), compose (Task 1).
- Produces: `runtime-pc-piloto` batendo heartbeat na NUVEM (sonda 8.4 do STATUS).

- [ ] **Step 1: Confirmar com o usuário que o envio real deve subir agora**

- [ ] **Step 2: Subir o piloto**

```powershell
cd D:\worder1-fwrle\runtime
docker compose --profile piloto up -d --build
docker compose logs -f runtime-piloto
```

Expected: JSON sem exceção; dormante (filas da nuvem vazias até o rollout ligar orgs).

- [ ] **Step 3: Provas na nuvem**

```powershell
Invoke-WebRequest http://localhost:10001/healthz -UseBasicParsing | Select-Object -ExpandProperty StatusCode
```

Expected: `200`. E no SQL Editor do Supabase (nuvem):

```sql
select process_name, beat_at from internal.runtime_heartbeats order by beat_at desc;
```

Expected: `runtime-pc-piloto` com `beat_at` recente. Avisar o usuário para registrar a sonda 8.4 no STATUS.
```
