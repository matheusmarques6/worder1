# Deploy do runtime — VPS/Railway/Render (um processo, uma imagem)

O runtime é UM processo asyncio (ADR-1): coalescer + N workers + sender +
heartbeat + listener HTTP, tudo dentro de `python -m agents_runtime`. A imagem
é o `Dockerfile` deste diretório (multi-stage, non-root, SIGTERM gracioso);
o `docker-compose.yml` é o espelho local dela.

## Caminho rápido: Render Blueprint (render.yaml na raiz do repo)

1. Render Dashboard → **New → Blueprint** → conectar este repo (branch com o
   `render.yaml`).
2. O Render lê o blueprint: web service Docker de `runtime/`, health check em
   `/healthz`, envs não-secretas já preenchidas.
3. Preencher os 5 segredos no Apply:
   - `SUPABASE_DB_URL` — **session pooler** (IPv4; a direta é IPv6):
     `postgresql://postgres.rqpmoavktzvxfcfsdkcc:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
     (transaction pooler 6543 NÃO serve — `set role` e leases são por sessão)
   - `AGENTS_OPENROUTER_API_KEY` — chave da plataforma (Judge 1 + embeddings)
   - `ENCRYPTION_KEY` — o MESMO do app Next.js (senão as chaves BYO não abrem)
   - `AGENTS_META_ACCESS_TOKEN` — token de sistema Meta
   - `AGENTS_PREVIEW_TOKEN` — um segredo novo; o MESMO vai na Vercel
4. Apply. Quando o serviço estiver live: na **Vercel**, setar
   `AGENTS_RUNTIME_URL=https://<serviço>.onrender.com` e o mesmo
   `AGENTS_PREVIEW_TOKEN` — o preview de /moments passa a responder.
5. O processo sobe DORMANTE: filas vazias + rollout vazio = idle seguro. O
   cutover continua sendo o runbook do STATUS (seeds → ativar missões → org
   no `ai_runtime_rollout`).

Qualquer outra plataforma que rode container long-lived serve igualmente
(Railway/Fly/VPS com compose); não há estado no disco, tudo vive no Postgres.

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

## Variáveis de ambiente

### Obrigatórias

| Variável | O que é |
|---|---|
| `SUPABASE_DB_URL` | DSN Postgres (session pooler ou conexão direta; o processo abre ~N_workers+3 conexões longas — transaction pooler NÃO serve, o engine usa `set role` e leases por sessão) |
| `AGENTS_RESPONDER` | `agents_runtime.agent_core.responder:agent_responder` (a fábrica real; o processo recusa largar sem ela) |
| `AGENTS_TOUCHER` | `agents_runtime.agent_core.toucher:agent_toucher` — o toque de missão real (F1). Ausente = toque de andaime; obrigatório em produção |
| `AGENTS_WORKER_SET_ROLE` | `worker_role` (RLS de runtime; sem isso o processo roda como o dono do DSN) |
| `AGENTS_SENDER_SET_ROLE` | `sender_role` |
| `AGENTS_OPENROUTER_API_KEY` | Chave da PLATAFORMA (Judge 1 + embeddings — D4). A resposta do agente usa as chaves BYO da org (`organization_api_keys`) |
| `ENCRYPTION_KEY` | O mesmo secret do app Next.js — o secret_box (scrypt+AES-GCM) descriptografa as chaves BYO com ele |

### Canal (sem ela: worker roda, nada é enviado)

| Variável | O que é |
|---|---|
| `AGENTS_CHANNEL` | `agents_runtime.channels.cloud_api:from_env` |
| `AGENTS_META_ACCESS_TOKEN` | Token de sistema Meta (fallback quando a conta Cloud da org não tem token próprio) |
| `AGENTS_META_API_VERSION` | `v19.0` (default) |

### Observabilidade e API interna (opt-in)

| Variável | O que é |
|---|---|
| `AGENTS_HTTP_PORT` | Porta do listener (`/healthz` + `POST /internal/preview-prompt`). Ausente = sem listener |
| `AGENTS_PREVIEW_TOKEN` | Token de serviço do preview. Ausente = endpoint de preview não existe (healthz continua) |
| `AGENTS_LOG_LEVEL` | `INFO` default; logs saem em JSON por linha no stdout |
| `AGENTS_LOGFIRE_TOKEN` | Token de write do Logfire (D13/9.1). Presente = `logfire.configure` + instrument httpx/psycopg/system_metrics, com captura de conteúdo GenAI desligada e scrubbing extra. Ausente = Logfire dormente, custo zero |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Cópia OTLP opcional (Alloy sidecar ou gateway). Ausente = telemetria OTLP no-op. O SDK OTel já vem na imagem (dependência do logfire) |
| `DEPLOY_ENV` | `dev`/`staging`/`production` — vira `deployment.environment` nos spans |
| `AGENTS_PROCESS_NAME` | Nome no heartbeat (`internal.runtime_heartbeats`); default `agents-runtime` |

### Tuning (defaults sensatos; a suíte pipeline roda com eles apertados)

`AGENTS_WORKERS`, `AGENTS_VT_MS`, `AGENTS_LEASE_MS`, `AGENTS_WORK_HEARTBEAT_MS`,
`AGENTS_COALESCER_TICK_MS`, `AGENTS_SENDER_POLL_MS`, `AGENTS_SEND_LEASE_MS`,
`AGENTS_REVIEW_MS`, `AGENTS_BACKOFF_BASE_MS`, `AGENTS_BACKOFF_CAP_MS`,
`AGENTS_PROCESS_HEARTBEAT_MS` — ver `config.py`.

## Checklist de subida

1. Migrations aplicadas no projeto Supabase (todas em `supabase/migrations/`;
   hoje aplicadas via MCP — ver STATUS).
2. Roles `worker_role`/`sender_role` existem e o usuário do DSN pode `set role`
   para eles (a migration 0002 faz o grant para `postgres`).
3. `ENCRYPTION_KEY` idêntico ao do app (senão as chaves BYO não abrem: o
   processo alerta `no_org_llm_key` e o agente não responde).
4. Sonda externa apontada para `GET :$AGENTS_HTTP_PORT/healthz` (Grafana
   Synthetics/UptimeRobot). 503 = heartbeat parado ≥3 min.
5. Rollout: `ai_runtime_rollout` continua sendo o interruptor por org — deploy
   do processo NÃO liga nada; o webhook só desvia para o runtime quem estiver
   na tabela.

## O que o processo NÃO faz

Ingestão (webhook Next.js chama `public.ingest_inbound_message`), status de
entrega (webhook chama `public.correlate_channel_status`), UI. O runtime só
drena filas, pensa e enfileira/envia — morrer e voltar é sempre seguro
(cenários 4/7/10 da suíte pipeline provam).
