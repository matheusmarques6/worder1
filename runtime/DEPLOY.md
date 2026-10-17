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
3. Provisionar os logins mínimos conforme a seção abaixo e preencher os segredos no Apply:
   - `AGENTS_WORKER_DB_URL` — **session pooler** (IPv4; a direta é IPv6),
     usuário `runtime_worker_login.<project-ref>`.
   - `AGENTS_SENDER_DB_URL` — mesmo banco, usuário `runtime_sender_login.<project-ref>`.
     (transaction pooler 6543 NÃO serve — `set role` e leases são por sessão)
   - `AGENTS_OPENROUTER_API_KEY` — chave da plataforma (Judge 1 + embeddings)
   - `ENCRYPTION_KEY` — o MESMO do app Next.js (senão as chaves BYO nem a
     credencial Meta por conta abrem — item 20 da auditoria)
   - `AGENTS_PREVIEW_TOKEN` — um segredo novo; o MESMO vai na Vercel
4. Apply. Quando o serviço estiver live: na **Vercel**, setar
   `AGENTS_RUNTIME_URL=https://<serviço>.onrender.com` e o mesmo
   `AGENTS_PREVIEW_TOKEN` — o preview de /moments passa a responder.
5. O processo sobe DORMANTE: filas vazias + rollout vazio = idle seguro. O
   cutover continua sendo o runbook do STATUS (seeds → ativar missões → org
   no `ai_runtime_rollout`).

Qualquer outra plataforma que rode container long-lived serve igualmente
(Railway/Fly/VPS com compose); não há estado no disco, tudo vive no Postgres.

## Provisionamento e rollout dos logins mínimos (SEC18)

1. Aplicar `20261017051724_runtime_minimum_login.sql` pelo processo aprovado de
   migrations. Ela cria `runtime_worker_login` e `runtime_sender_login` sem senha,
   com NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION.
   Cada login recebe somente seu role NOLOGIN correspondente, sem ADMIN OPTION.
   Nenhuma policy, função ou dado existente é removido.
2. Pelo canal administrativo seguro do banco, definir duas senhas diferentes.
   Em uma sessão psql administrativa com destino explicitamente conferido, usar
   `\password runtime_worker_login` e `\password runtime_sender_login`: prompts
   interativos evitam senha em argumento de shell, migration ou histórico SQL.
   As credenciais pertencem ao gerenciador de segredos da implantação. Não gravar
   DSNs reais neste repositório nem colar senhas em logs/comandos compartilhados.
3. Configurar as duas DSNs no serviço e manter `DEPLOY_ENV=production` (ou
   `staging` no QA). Retirar `SUPABASE_DB_URL` privilegiada do ambiente do runtime.
   Confirmar suporte aos usuários dedicados no session pooler do projeto; para
   conexão direta o nome de usuário não leva o sufixo do projeto.
4. Implantar e verificar health/heartbeat e uma operação de cada pool no QA.
   Antes de abrir HTTP, o processo verifica ambas as credenciais. Cada conexão
   nova repete a guarda: identidade real, cadeia completa de memberships,
   atributos administrativos, ownership, ADMIN OPTION e grants diretos ao login.
   Qualquer desvio falha fechado, sem imprimir a DSN.

As factories de responder/toucher recebem a DSN worker; o canal recebe a DSN
sender e usa a conexão sender já guardada para carregar a credencial da conta.
O processo único ainda possui os dois segredos e consegue definir o escopo de
tenant. Esta mudança limita a autoridade no banco após RCE; não elimina todo
impacto de RCE nem implementa isolamento criptográfico/KMS (decisão pendente).

Rollback: conservar as duas credenciais e seus roles, que são compatíveis com o
`SET ROLE` anterior; uma versão anterior com apenas uma DSN não atende ao novo
contrato e não deve ser usada com owner em produção. Se for preciso interromper
o rollout, parar o serviço e corrigir a configuração/provisionamento mantendo a
guarda. Revogar logins (`ALTER ROLE ... NOLOGIN`) e encerrar sessões existentes
somente em uma janela operacional aprovada. Não apagar roles ou dados como parte
do rollback desta migration. Os testes locais descartáveis podem continuar com
`DEPLOY_ENV=development` e a DSN legada; isso não é uma opção de deploy.

## Rodando no PC (bancada e piloto)

Dois modos no `docker-compose.yml` deste diretório, que coexistem:

| Modo | Sobe | Banco | Envia? | healthz |
|---|---|---|---|---|
| `bancada` | `db` + `runtime-bancada` | local (espelho de produção) | NÃO (sem canal) | `:10000` |
| `piloto` | `runtime-piloto` | nuvem (session pooler) | SIM (Meta) | `:10001` |

Setup: copiar `.env.bancada.example`→`.env.bancada` e `.env.piloto.example`→
`.env.piloto`, preencher os segredos (nunca commitar os reais). Se você já tem
um `.env.piloto` de antes do item 35 da auditoria, confira
`AGENTS_META_API_VERSION`: a v19.0 foi aposentada pela Meta em 21/mai/2026
(hoje é depois disso) — atualize para `v22.0` à mão, não é opcional.

**Bancada** (espelhar + subir):

    powershell -ExecutionPolicy Bypass -File scripts\mirror.ps1
    docker compose --profile bancada up -d --build

Provas: logs JSON sem exceção; `http://localhost:10000/healthz` = 200;
`select process_name, beat_at from internal.runtime_heartbeats order by beat_at desc`
no banco LOCAL (`docker compose exec db psql -U postgres`) mostrando
`runtime-pc-bancada` recente.

O espelho contém dados reais de clientes: o volume `db_data` é dado sensível.
Destruir: `docker compose --profile bancada down -v`. A bancada é MUDA por
contrato — nunca adicionar `AGENTS_CHANNEL` ao `.env.bancada`; para envio real
existe o piloto.

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
| `AGENTS_WORKER_DB_URL` | DSN do `runtime_worker_login`; worker, heartbeat, replay, responder, toucher, HTTP e health. Obrigatória em production/staging. Session pooler ou conexão direta; transaction pooler NÃO serve. |
| `AGENTS_SENDER_DB_URL` | DSN do `runtime_sender_login`; sender, housekeeping e fábrica do canal. Obrigatória em production/staging. |
| `SUPABASE_DB_URL` | Compatibilidade para desenvolvimento/banco descartável quando as DSNs específicas estão ausentes. Nunca usada como fallback em production/staging. |
| `AGENTS_RESPONDER` | `agents_runtime.agent_core.responder:agent_responder` (a fábrica real; o processo recusa largar sem ela) |
| `AGENTS_TOUCHER` | `agents_runtime.agent_core.toucher:agent_toucher` — o toque de missão real (F1). Ausente = toque de andaime; obrigatório em produção |
| `AGENTS_WORKER_SET_ROLE` | `worker_role`, NOLOGIN. O login mínimo só pode assumir este role. A guarda valida também `session_user`: `SET ROLE` a partir de postgres não satisfaz o contrato em production/staging. |
| `AGENTS_SENDER_SET_ROLE` | `sender_role` — mesma regra, mesma recusa na partida. As duas NÃO são intercambiáveis: cada pool cobra o seu role por constante do código, então trocá-las de lugar também mata a partida. Com `AGENTS_HTTP_PORT` definida a checagem acontece ANTES de o listener abrir a porta |
| `AGENTS_OPENROUTER_API_KEY` | Chave da PLATAFORMA (Judge 1 + embeddings — D4). A resposta do agente usa as chaves BYO da org (`organization_api_keys`) |
| `ENCRYPTION_KEY` | O mesmo secret do app Next.js — o secret_box (scrypt+AES-GCM) descriptografa as chaves BYO E, desde o item 20 da auditoria, a credencial Meta por conta (`whatsapp_business_accounts.access_token_encrypted`) |

### Canal (sem ela: worker roda, nada é enviado)

| Variável | O que é |
|---|---|
| `AGENTS_CHANNEL` | `agents_runtime.channels.cloud_api:from_env` |
| `AGENTS_META_API_VERSION` | `v22.0` (default, item 35 da auditoria). **Se seu `.env.piloto` local ainda tem `v19.0`, atualize agora**: a Meta aposentou a v19.0 em 21/mai/2026 (verificado em 02/set/2026) — não é mais uma questão de "quando der", o piloto pode já estar apontando para uma versão que a Meta recusa |

Item 20 da auditoria: não existe mais um `AGENTS_META_ACCESS_TOKEN` global —
cada envio lê a credencial da conta Cloud ATIVA da própria org
(`internal.active_whatsapp_business_account`, SECURITY DEFINER que recusa
qualquer org que não seja a da sessão), a mesma que o app Next.js já grava em
`whatsapp_business_accounts`. Uma org sem conta ativa faz o envio falhar
(permanente) — não há fallback para uma credencial de sistema.

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

- `AGENTS_WORKERS` (lida desde 2026-10-15 — `docs/alteracoes/2026-10-15-02-agents-workers.md`; padrão 2, inteiro ≥ 1, inválido mata a partida), `AGENTS_VT_MS`, `AGENTS_LEASE_MS`, `AGENTS_WORK_HEARTBEAT_MS`, `AGENTS_COALESCER_TICK_MS`, `AGENTS_SENDER_POLL_MS`, `AGENTS_SEND_LEASE_MS`, `AGENTS_REVIEW_MS`, `AGENTS_BACKOFF_BASE_MS`, `AGENTS_BACKOFF_CAP_MS`, `AGENTS_PROCESS_HEARTBEAT_MS`, `AGENTS_BUSY_RETRY_MS`, `AGENTS_IDLE_PAUSE_MS` — ver `config.py`. Os 12 `*_MS` vêm de `config_from_env`, que existe para UM consumidor e diz isso na própria docstring: a suíte `-m pipeline`. Produção não seta nenhum e fica com a tabela do `CLAUDE.md` — por isso nenhum deles entra em `.env.bancada.example` / `.env.piloto.example`.
- `AGENTS_HUMANIZE_DELAYS` — o 13º knob de `config_from_env`, booleano e não `_MS`: opt-**out** do ritmo de digitação, default LIGADO. **Só `off`, `0` e `false` desligam** — vazio, `no` ou `nao` deixam ligado, em silêncio. Consumido em produção pelo sender, ANDado com a preferência por org.
- `AGENTS_TURN_LLM_CALL_LIMIT` — teto de chamadas de LLM por turno; default 8 em `metering.DEFAULT_TURN_LLM_CALL_LIMIT`, lido por `default_turn_llm_call_limit` (`responder.py`). Knob de **custo**, não de fila, e estava ausente daqui, do `render.yaml` e de todo `.env.*.example`.
- `AGENTS_RUBRICS_DIR` — diretório de rubricas; ausente = as que vieram no pacote instalado (`default_rubrics_directory`, `responder.py`, que **honra o override quando a env existe**). Raramente setada em produção, mas **tem efeito**: o juiz de pré-envio lê as rubricas desse diretório.

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
