# Deploy do runtime — VPS/Railway/Render (um processo, uma imagem)

O runtime é UM processo asyncio (ADR-1): coalescer + N workers + sender +
heartbeat + listener HTTP, tudo dentro de `python -m agents_runtime`. A imagem
é o `Dockerfile` deste diretório (multi-stage, non-root, SIGTERM gracioso);
o `docker-compose.yml` é o espelho local dela.

Status: **ainda não deployado** — bloqueia o cutover da Etapa 7. Qualquer
plataforma que rode um container long-lived serve (Railway/Render/VPS com
compose); não há estado no disco, tudo vive no Postgres.

## Variáveis de ambiente

### Obrigatórias

| Variável | O que é |
|---|---|
| `SUPABASE_DB_URL` | DSN Postgres (session pooler ou conexão direta; o processo abre ~N_workers+3 conexões longas — transaction pooler NÃO serve, o engine usa `set role` e leases por sessão) |
| `AGENTS_RESPONDER` | `agents_runtime.agent_core.responder:agent_responder` (a fábrica real; o processo recusa largar sem ela) |
| `AGENTS_WORKER_SET_ROLE` | `worker_role` (RLS de runtime; sem isso o processo roda como o dono do DSN) |
| `AGENTS_SENDER_SET_ROLE` | `sender_role` |
| `AGENTS_OPENROUTER_API_KEY` | Chave da PLATAFORMA (Judge 1 + embeddings — D4). A resposta do agente usa as chaves BYO da org (`organization_api_keys`) |
| `ENCRYPTION_KEY` | O mesmo secret do app Next.js — o secret_box (scrypt+AES-GCM) descriptografa as chaves BYO com ele |

### Canal (sem ela: worker roda, nada é enviado)

| Variável | O que é |
|---|---|
| `AGENTS_CHANNEL` | `agents_runtime.channels.cloud_api:cloud_channel` |
| `AGENTS_META_ACCESS_TOKEN` | Token de sistema Meta (fallback quando a conta Cloud da org não tem token próprio) |
| `AGENTS_META_API_VERSION` | `v19.0` (default) |

### Observabilidade e API interna (opt-in)

| Variável | O que é |
|---|---|
| `AGENTS_HTTP_PORT` | Porta do listener (`/healthz` + `POST /internal/preview-prompt`). Ausente = sem listener |
| `AGENTS_PREVIEW_TOKEN` | Token de serviço do preview. Ausente = endpoint de preview não existe (healthz continua) |
| `AGENTS_LOG_LEVEL` | `INFO` default; logs saem em JSON por linha no stdout |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Endpoint OTLP (Alloy sidecar ou gateway). Ausente = telemetria no-op. Exige SDK OTel instalado na imagem (não é dependência do lockfile — adicionar quando o stack Logfire/Grafana entrar) |
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
