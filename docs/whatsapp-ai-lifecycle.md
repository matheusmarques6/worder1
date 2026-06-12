# Ciclo de vida da IA no WhatsApp Cloud (Onda 13)

Mapa de como a auto-resposta da IA liga, desliga e religa — e o runbook de
diagnóstico quando "o bot não responde". Escrito a partir do incidente de
11-12/06/2026 (InnovaBay): subscription de webhook morta por 12 dias +
QStash em região errada + chave em tabela errada + conversa auto-disabled
sem nenhum aviso na UI.

## Fluxo inbound → resposta

```
Meta webhook
  └─ POST /api/whatsapp/cloud/webhook        (HMAC, persiste whatsapp_webhook_events)
       └─ QStash → /api/workers/whatsapp-webhook
            └─ processWebhookPayload          (salva msg, counters, RuleEngine)
                 └─ se texto + ai_enabled !== false:
                      marca ai_pending=true, ai_debounce_until=now+8s
                      enfileira /api/workers/whatsapp-ai-respond (delay 8s)
                           └─ claim atômico de ai_pending (anti double-send)
                           └─ cloud-runner (guards abaixo)
                                └─ engine (LLM, tool-loop, schedule)
                                └─ cloud-sender (janela 24h, opt-out, bolhas humanizadas)
```

Redes de segurança:
- QStash off/perdido → cron `reprocess-whatsapp-pending` (1min) re-enfileira
  webhooks pendentes e IA órfã (`pending_whatsapp_ai_responses_for_reprocess`).
- Meta parou de enviar TUDO → cron `whatsapp-webhook-heartbeat` (30min)
  alerta `webhook_dead` quando `last_webhook_at` > 2h.
- Eventos que chegaram e morreram → cron `whatsapp-dead-alert` (15min).

## Guards (ordem real de execução)

| # | Guard | Onde | Resultado quando bloqueia |
|---|---|---|---|
| 1 | `ai_enabled !== false` | webhook-processor (agenda) e worker (re-checa) | nem agenda / skip |
| 2 | debounce ainda aberto | worker | skip (job mais novo cobre) |
| 3 | claim atômico `ai_pending` | worker | skip (outro job já consumiu) |
| 4 | texto não-vazio / não-self | cloud-runner | skip |
| 5 | agente ativo pro canal | RPC `get_active_agent_for_conversation` | skip `no_active_agent` |
| 6 | cooldown desde último outbound da IA | cloud-runner | skip `cooldown` |
| 7 | `max_messages_per_conversation` | cloud-runner | skip `max_messages` |
| 8 | `stop_on_human` (`sender='human'` na conversa) | cloud-runner | skip `stop_on_human` |
| 9 | chave do provider em `organization_api_keys` | cloud-runner | **auto-disable** `no_valid_api_key` |
| 10 | budget mensal | engine | **auto-disable** `budget_exceeded` |
| 11 | horário de funcionamento | engine `checkSchedule` | skip (sem retry, sem disable) |
| 12 | janela 24h aberta | cloud-sender | skip `window_closed` |
| 13 | opt-out (`requireOptIn`) | cloud-sender | skip terminal `opted_out` (sem retry) |

## `ai_disabled_reason` — vocabulário canônico

Fonte: `src/lib/ai/disabled-reasons.ts` (labels PT-BR + normalização de legados).

| Reason | Quem seta | Religa em massa? | Como religa |
|---|---|---|---|
| `manual` | Botão Bot Ativo/Off do chat (atendente) | **NUNCA** | só o botão da própria conversa |
| `transferred_to_human` | Tool de transferência da IA | **NUNCA** | só o botão da conversa |
| `no_valid_api_key` | cloud-runner (provider sem chave ativa) | sim | banner do Inbox ou botão |
| `budget_exceeded` | cloud-runner/engine (orçamento mensal) | sim | banner ou botão |
| `ai_permanent_error` | cloud-runner (erro permanente do provider) | sim | banner ou botão |

Legados normalizados na leitura: `'Desativado manualmente'` e `'manual_pause'`
→ `manual`.

Bulk re-enable: `POST /api/whatsapp/inbox/conversations/reactivate-ai`
(whitelist hard-coded = só as 3 automáticas). Banner `ReactivateAiBanner`
aparece no Inbox quando `GET` do mesmo endpoint retorna `count > 0`.

## Níveis de controle

| Controle | Escopo | Religa sozinho? |
|---|---|---|
| Botão **Bot Ativo/Off** (chat) | 1 conversa | nunca |
| Auto-disable do sistema | 1 conversa por vez | só via banner/botão (ação humana) |
| Chip **Ativo** do agente | todas as conversas dos canais dele | n/a |

Ativação do agente tem preflight (`provider-key-check.ts`): `is_active=true`
sem chave ativa do provider → `400 provider_key_missing`.

## Prioridade de agente

`get_active_agent_for_conversation` casa canal (`all_channels` ou
`channel_ids` contém o `account.id`) e retorna **o agente mais antigo**
(`created_at ASC, LIMIT 1`). Não há score de prioridade — com 2+ agentes
ativos no mesmo canal, o primeiro criado ganha.

## Runbook — "o bot não responde"

Query consolidada (ajuste os IDs):

```sql
SELECT 'agente.provider' AS item, provider AS valor
  FROM ai_agents WHERE id = '<AGENT_ID>'
UNION ALL SELECT 'agente.model', model FROM ai_agents WHERE id = '<AGENT_ID>'
UNION ALL SELECT 'agente.is_active', is_active::text FROM ai_agents WHERE id = '<AGENT_ID>'
UNION ALL SELECT 'chave.' || provider, CASE WHEN is_active THEN 'ativa' ELSE 'INATIVA' END
  FROM organization_api_keys WHERE organization_id = '<ORG_ID>'
UNION ALL SELECT 'conversa.ai_enabled', ai_enabled::text
  FROM whatsapp_cloud_conversations WHERE id = '<CONV_ID>'
UNION ALL SELECT 'conversa.disabled_reason', COALESCE(ai_disabled_reason, '—')
  FROM whatsapp_cloud_conversations WHERE id = '<CONV_ID>'
UNION ALL SELECT 'conversa.ai_pending', ai_pending::text
  FROM whatsapp_cloud_conversations WHERE id = '<CONV_ID>'
UNION ALL SELECT 'traces.do.agente', count(*)::text
  FROM agent_traces WHERE conversation_id = '<CONV_ID>'
UNION ALL SELECT 'respostas.do.bot', count(*)::text
  FROM whatsapp_cloud_messages
  WHERE conversation_id = '<CONV_ID>' AND direction='outbound' AND sent_by_bot=true
UNION ALL SELECT 'webhooks.orfaos', count(*)::text
  FROM whatsapp_webhook_events WHERE status IN ('pending','failed');
```

Leitura:

| Sinal | Causa provável | Ação |
|---|---|---|
| `webhooks.orfaos > 0` e crescendo | QStash off / `QSTASH_URL` região errada | conferir envs QStash; cron reprocess deveria zerar |
| `last_webhook_at` parado há horas | subscription da Meta morta | heartbeat alerta; re-subscribe (`POST /{WABA_ID}/subscribed_apps`) |
| `conversa.ai_enabled=false` + reason automática | causa sistêmica | resolver causa → banner "Religar IA" no Inbox |
| `conversa.ai_enabled=false` + reason `manual` | atendente desligou | é escolha — só o botão religa |
| `ai_pending=true` velho + traces 0 | worker de IA não rodou | QStash/envs; sweep do cron cobre em 2min |
| traces ≥1 e respostas 0 | LLM rodou, envio falhou | ver `agent_traces.output` + reason do sender (janela? opt-out?) |
| `chave.<provider>` ausente/INATIVA | provider do agente sem chave | cadastrar em Agentes IA → API Keys |

Envs críticas do pipeline: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
`QSTASH_NEXT_SIGNING_KEY`, `QSTASH_URL` (região! ex.
`https://qstash-us-east-1.upstash.io/v2`), `NEXT_PUBLIC_APP_URL`,
`ENABLE_ASYNC_WEBHOOK`, `META_APP_SECRET`, `CRON_SECRET`.
