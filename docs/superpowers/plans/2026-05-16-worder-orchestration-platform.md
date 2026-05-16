# Worder como Plataforma de Orquestração — Plano Detalhado

**Data:** 16 de maio de 2026
**Branch base:** `claude/analyze-code-structure-KcDoN`
**Status:** proposta

## 0. Contexto

Hoje a Orion roda em cima de:

- **Yampi** como fonte de eventos de e-commerce (pedido criado, pix gerado, carrinho abandonado, etc).
- **n8n** com 3 fluxos principais (CONVERSA, PIX TOQUES, CHECKOUT TOQUES) e sub-workflows (SALVA CONTATO, CHAMAR HUMANO).
- **WhatsApp Cloud API** (oficial Meta) para envio e recebimento.
- **Supabase** como banco (`customers`, `webhook_events`, `webhook_responses`, `documents` pgvector, `prompts`, `n8n_chat_histories`, `n8n_eval_scores`).
- **OpenRouter / OpenAI / Cohere / Gemini** para LLM, embeddings, rerank, transcrição e visão.
- **Redis** para buffer de mensagens e estado de atendimento.

O objetivo deste plano é **substituir o n8n + os serviços auxiliares pelo próprio Worder**, mantendo Yampi como fonte de evento e o WhatsApp Cloud oficial como único canal de envio. Toda a orquestração, IA, toques e configuração passam a viver dentro do Worder, com **tudo explicitamente configurável por loja**.

### Princípios inegociáveis

1. **WhatsApp Cloud API oficial** sempre. Nenhuma rota Evolution / API não oficial nos fluxos novos.
2. **Multi-tenant por `store_id`**. Toda tabela nova tem `store_id` e RLS no Postgres.
3. **Tudo configurável**. Nada de delay, template, prompt, tool, LLM, gate ou keyword hardcoded — tudo é linha de tabela `*_config` editável por loja.
4. **Idempotência**. Todo evento entrante tem `dedup_key`. Toques usam `claim` atômico (`FOR UPDATE SKIP LOCKED`).
5. **Observabilidade**. Toda execução vira linha em `*_executions` com status, latência, erro, payload.
6. **Substituibilidade de providers**. LLM, embedding, transcrição, rerank são plug-ins atrás de uma interface.
7. **Versionamento**. Prompts, templates de toque, sequências têm `version` e `activated_at`.

---

## 1. Arquitetura alvo

```
                    Yampi (ou outra fonte e-commerce)
                              │ webhook HTTPS
                              ▼
   ┌─────────────────────────────────────────────────────┐
   │  [A] INGESTION                                       │
   │     /api/inbound/{source}/event  (rota genérica)     │
   │     normaliza → inbound_events                       │
   └─────────────────────────────────────────────────────┘
                              │
                              ▼
                    inbound_events (DB, store-scoped)
                              │
                              │ cron 1min
                              ▼
   ┌─────────────────────────────────────────────────────┐
   │  [B] TOUCH ENGINE                                    │
   │     touch_sequences (config) → touch_runs (execs)   │
   │     gate de elegibilidade + claim atômico            │
   │     enfileira QStash para envio                      │
   └─────────────────────────────────────────────────────┘
                              │
                              ▼
   ┌─────────────────────────────────────────────────────┐
   │  [C] WHATSAPP CLOUD (oficial)                        │
   │     sender de template / mensagem livre              │
   │     receiver via /api/whatsapp/meta/webhook          │
   │     sync de templates Meta                           │
   └─────────────────────────────────────────────────────┘
        envia │                       │ recebe
              ▼                       ▼
       cliente final              [H] BUFFER inbound (Redis+QStash)
                                     debounce 10s configurável
                                     │
                                     ▼
                            ┌──────────────────────────┐
                            │  [E] AI AGENT             │
                            │     LLM + memória + RAG  │
                            │     + tools configuráveis │
                            └──────────────────────────┘
                                     │ resposta
                                     ▼
                              [C] WhatsApp send
                                     │
                              ┌──────────────┐
                              │ [I] TOGGLE   │
                              │ pause / human │
                              └──────────────┘

   [D] customers / contacts: agent_status, messages_off,
       automation_blocked_until, contadores RFM, tags

   [F] Multi-tenant: RLS por store_id em TODAS as tabelas
   [G] Observabilidade: logs, metrics, retries, replay
```

---

## 2. Pirâmide de prioridades

```
                              P3 — futuro
                          ┌────────────────┐
                          │ Eval LLM-judge │
                          │ A/B de prompts │
                          │ Dead letter UI │
                          └────────────────┘
                       P2 — melhorias
                ┌──────────────────────────────┐
                │ Humanizer  Multimodal completo│
                │ Observabilidade rica          │
                │ Sentiment / intent extraction │
                └──────────────────────────────┘
                P1 — completude operacional
        ┌────────────────────────────────────────────┐
        │ Toggle bot UI    UI de toques              │
        │ UI de tools      Sync de templates UI      │
        │ Replay de evento Notas com anexo           │
        └────────────────────────────────────────────┘
                  P0 — MVP para desligar n8n
   ┌──────────────────────────────────────────────────────────┐
   │ A. Ingestão genérica Yampi                                │
   │ C. WhatsApp Cloud send/receive + sync templates           │
   │ D. Schema customers expandido                             │
   │ B. Motor de toques configurável                           │
   │ H. Buffer inbound                                         │
   │ E. Agente IA: LLM + memória + RAG + 2 tools (RAG, escala) │
   │ F. Multi-tenant RLS em tudo                                │
   │ J. Sistema de configuração por loja (camada transversal)  │
   └──────────────────────────────────────────────────────────┘
```

---

## 3. Camada transversal — Sistema de configuração (J)

Antes de descer em cada setor, definimos o padrão que **todos os setores seguem** para serem configuráveis.

### 3.1 Tabela base de configuração

Cada setor terá sua própria tabela `*_config`. Em comum:

```sql
-- Padrão para qualquer tabela de config
CREATE TABLE <feature>_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  agent_id         uuid NULL REFERENCES ai_agents(id) ON DELETE CASCADE, -- quando aplicável
  key              text NOT NULL,
  value            jsonb NOT NULL,
  description      text NULL,
  is_secret        boolean NOT NULL DEFAULT false,
  version          int NOT NULL DEFAULT 1,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
);

CREATE INDEX ix_<feature>_config_store ON <feature>_config (store_id, active);
ALTER TABLE <feature>_config ENABLE ROW LEVEL SECURITY;
```

Onde `is_secret = true` o valor é criptografado em repouso (AES-256-GCM, reuso do que já existe em `src/lib/webhooks/encryption.ts`).

### 3.2 Acessor unificado

```ts
// src/lib/config/store-config.ts
export async function getConfig<T>(
  storeId: string,
  key: string,
  opts?: { agentId?: string; defaultValue?: T }
): Promise<T> { ... }

export async function setConfig(
  storeId: string,
  key: string,
  value: unknown,
  opts?: { agentId?: string; isSecret?: boolean; description?: string }
): Promise<void> { ... }
```

### 3.3 UI base

Página `/settings/configuration` lista todas as chaves agrupadas por setor. Cada setor tem sua própria página dedicada com formulários tipados, mas o "raw view" sempre existe pra debug.

---

## 4. Setor A — Ingestão de eventos externos

### 4.1 Objetivo
Receber webhooks de Yampi (e futuramente Shopify, Cartpanda, custom) e gravar em uma tabela única `inbound_events`, normalizada, com `dedup_key` e RLS.

### 4.2 Estado atual no Worder
- Existe `/api/shopify/webhooks/*` parcial (oficial Shopify).
- Não existe rota genérica `/api/inbound/{source}/event`.
- Não existe tabela unificada `inbound_events`.

### 4.3 DDL

```sql
CREATE TABLE inbound_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source                text NOT NULL,             -- 'yampi' | 'shopify_custom' | 'manual' | 'worder_internal'
  event_type            text NOT NULL,             -- 'order.created' | 'cart.reminder' | 'payment.pix.waiting' | ...
  status_alias          text NULL,                 -- 'waiting_payment' | 'cart.reminder' | 'paid' | 'cancelled'
  event_time            timestamptz NULL,          -- timestamp do evento no source
  received_at           timestamptz NOT NULL DEFAULT now(),

  resource_id           text NULL,                 -- id do pedido / cart no source
  customer_id           uuid NULL REFERENCES contacts(id) ON DELETE SET NULL,
  customer_phone_full   text NULL,
  customer_email        text NULL,
  customer_name         text NULL,
  customer_cpf          text NULL,

  value_total           numeric(12,2) NULL,
  payment_method        text NULL,
  shipping_service      text NULL,
  delivery_date         timestamptz NULL,
  pix_qr_code           text NULL,
  reorder_url           text NULL,
  simulate_url          text NULL,
  billet_url            text NULL,
  items                 jsonb NULL,
  raw_payload           jsonb NOT NULL,

  abandoned_step        text NULL,                 -- 'address' | 'shipping' | 'payment' (cart abandonment granular)
  templates_sent        int NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'cancelled' | 'error'

  dedup_key             text NOT NULL,             -- hash(source, resource_id, status_alias) ou similar
  processed_by_runs     uuid[] DEFAULT '{}',       -- ids de touch_runs que já processaram

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inbound_events_dedup UNIQUE (store_id, dedup_key)
);

CREATE INDEX ix_inbound_events_store_type ON inbound_events (store_id, event_type, status, templates_sent);
CREATE INDEX ix_inbound_events_status_alias ON inbound_events (store_id, status_alias) WHERE status_alias IS NOT NULL;
CREATE INDEX ix_inbound_events_received ON inbound_events (received_at DESC);
CREATE INDEX ix_inbound_events_customer_phone ON inbound_events (store_id, customer_phone_full);

ALTER TABLE inbound_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbound_events
  USING (store_id IN (SELECT id FROM stores WHERE organization_id = current_org_id()));
```

### 4.4 APIs

| Método | Rota | Função |
|---|---|---|
| POST | `/api/inbound/{source}/event` | Recebe webhook do source; valida assinatura; normaliza; grava |
| POST | `/api/inbound/manual` | Cria evento manualmente (dashboard ou debug) |
| GET  | `/api/inbound/events` | Lista paginada (RLS aplica) |
| POST | `/api/inbound/events/{id}/replay` | Reprocessa (re-enfileira nos toques) |
| POST | `/api/inbound/events/{id}/cancel` | Marca `status='cancelled'`, cancela toques futuros |

### 4.5 Configurabilidade — `inbound_source_config`

```sql
CREATE TABLE inbound_source_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL,
  source              text NOT NULL,                 -- 'yampi' | 'shopify_custom' | ...
  enabled             boolean NOT NULL DEFAULT true,
  webhook_secret_enc  text NULL,                     -- secret de assinatura, criptografado
  signature_method    text NOT NULL DEFAULT 'hmac_sha256',  -- 'hmac_sha256' | 'shopify' | 'none'
  signature_header    text NULL,                     -- ex: 'X-Yampi-Hmac-Sha256'
  event_mapping       jsonb NOT NULL DEFAULT '{}',   -- mapa source.event → event_type canônico
  field_mapping       jsonb NOT NULL DEFAULT '{}',   -- mapa de campos do payload → colunas
  rate_limit_per_min  int NOT NULL DEFAULT 600,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, source)
);
```

**Exemplo de `event_mapping` para Yampi:**
```json
{
  "order.created": "order.created",
  "order.paid": "order.paid",
  "cart.reminder": "cart.reminder",
  "transaction.waiting_payment": "payment.pix.waiting",
  "transaction.cancelled": "order.cancelled"
}
```

**Exemplo de `field_mapping`:**
```json
{
  "customer_phone_full": "$.customer.phone.full_number",
  "customer_email":      "$.customer.email",
  "customer_name":       "$.customer.first_name",
  "value_total":         "$.totalizers.total",
  "payment_method":      "$.transaction.payment.method",
  "reorder_url":         "$.recover_url",
  "items":               "$.items[*]"
}
```

JSONPath simples (`$.path`) ou jq-style — ambos suportados.

### 4.6 UI

Página `/settings/integrations/inbound`:
- Lista de sources (Yampi, Shopify Custom, Manual).
- Por source: toggle enabled, campo de secret, campo de mapping (JSON editor), botão "testar webhook" que envia evento mock.
- URL do webhook copiada com `?store=<id>` (assinada ou via secret no header).

### 4.7 Steps de implementação

1. Migration `inbound_events` + `inbound_source_config` + RLS + índices.
2. `src/lib/inbound/normalize.ts` — aplica `field_mapping` JSONPath.
3. `src/lib/inbound/signature.ts` — valida assinatura por método configurado.
4. `src/lib/inbound/dedup.ts` — calcula `dedup_key` determinístico.
5. `src/lib/inbound/customer-resolver.ts` — upsert em `contacts` por `phone_full` (cria se não existe).
6. `src/app/api/inbound/[source]/route.ts` — handler genérico.
7. UI em `(dashboard)/settings/integrations/inbound/page.tsx`.
8. Testes: 5 cenários por source (sucesso, dedup, assinatura inválida, payload malformado, mapping ausente).

### 4.8 Dependências
Nenhuma. Pode começar paralelo a tudo.

---

## 5. Setor C — WhatsApp Cloud API oficial

### 5.1 Objetivo
- Receber mensagens via `/api/whatsapp/meta/webhook` (já existe — auditar).
- Enviar templates e mensagens livres via Meta Graph API.
- Sincronizar lista de templates aprovados do Meta.
- Tudo per-store (cada loja tem sua WABA, seu phone_number_id, seu access_token).

### 5.2 Estado atual
- Webhook inbound existe (`src/app/api/whatsapp/meta/webhook/`).
- Sender existe parcial (`src/lib/whatsapp/`).
- **Não tem** sync de templates Meta.
- **Não tem** UI de credenciais por loja com cripto.
- Tem suporte Evolution misturado — precisa isolar.

### 5.3 DDL

```sql
CREATE TABLE whatsapp_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL UNIQUE,
  waba_id             text NOT NULL,
  phone_number_id     text NOT NULL,
  display_phone       text NULL,
  business_name       text NULL,
  access_token_enc    text NOT NULL,                 -- AES-256-GCM
  app_secret_enc      text NOT NULL,                 -- pra HMAC do webhook
  webhook_verify_token text NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_whatsapp_accounts_phone_number_id ON whatsapp_accounts (phone_number_id);

CREATE TABLE whatsapp_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            uuid NOT NULL,
  meta_template_id    text NULL,                     -- id no Meta após aprovação
  name                text NOT NULL,                 -- ex: 'v0_orion_checkout_tq1'
  language            text NOT NULL,                 -- 'pt_BR'
  category            text NOT NULL,                 -- 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status              text NOT NULL DEFAULT 'PENDING', -- 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED'
  components          jsonb NOT NULL,                -- estrutura completa Meta (HEADER, BODY, FOOTER, BUTTONS)
  parameter_names     text[] DEFAULT '{}',           -- nomes amigáveis: ['customer_name','discount_value']
  last_synced_at      timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name, language)
);

CREATE INDEX ix_whatsapp_templates_status ON whatsapp_templates (store_id, status);
```

`whatsapp_messages` já existe no Worder — adicionar colunas:
```sql
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS template_name text NULL,
  ADD COLUMN IF NOT EXISTS template_parameters jsonb NULL,
  ADD COLUMN IF NOT EXISTS triggered_by_event_id uuid NULL REFERENCES inbound_events(id),
  ADD COLUMN IF NOT EXISTS triggered_by_run_id uuid NULL,
  ADD COLUMN IF NOT EXISTS meta_status text NULL;   -- 'sent' | 'delivered' | 'read' | 'failed'
```

### 5.4 APIs

| Método | Rota | Função |
|---|---|---|
| POST | `/api/whatsapp/send/template` | `{ store_id, to, template_name, language, parameters }` |
| POST | `/api/whatsapp/send/text` | mensagem free-form (gate de 24h aplica) |
| POST | `/api/whatsapp/send/media` | imagem/áudio/doc/vídeo |
| POST | `/api/whatsapp/templates/sync` | puxa do Meta `GET /v20.0/{WABA}/message_templates` |
| GET  | `/api/whatsapp/templates` | lista templates da loja |
| GET  | `/api/whatsapp/meta/webhook` | verify (challenge do Meta) |
| POST | `/api/whatsapp/meta/webhook` | recebe mensagens e status |

### 5.5 Configurabilidade — `whatsapp_send_config`

```sql
CREATE TABLE whatsapp_send_config (
  store_id              uuid PRIMARY KEY,
  enforce_service_window boolean NOT NULL DEFAULT true,   -- bloqueia free-form fora de 24h
  default_language      text NOT NULL DEFAULT 'pt_BR',
  retry_max_attempts    int NOT NULL DEFAULT 3,
  retry_backoff_seconds int[] NOT NULL DEFAULT '{30,120,600}',
  rate_limit_per_second int NOT NULL DEFAULT 80,         -- WABA tier-based
  log_full_payload      boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

### 5.6 UI

`/settings/whatsapp`:
- Aba **Conta**: WABA ID, phone_number_id, access_token (mascarado, edição abre modal), app_secret, verify_token. Botão "validar credenciais" chama Meta `/me`.
- Aba **Templates**: lista com filtro por status; botão "sincronizar do Meta"; visual de cada template (header/body/footer/buttons) + mapeamento de parâmetros nomeados.
- Aba **Envio**: knobs de `whatsapp_send_config` editáveis.

### 5.7 Steps

1. Migration `whatsapp_accounts` + `whatsapp_templates` + alters em `whatsapp_messages` + RLS.
2. Migration `whatsapp_send_config`.
3. `src/lib/whatsapp/meta-client.ts` — wrapper Graph API (templates, send, get).
4. Sender de template com substituição de parâmetros nomeados.
5. Sync de templates: rota + cron `/api/cron/whatsapp/sync-templates` diário.
6. Auditoria + remoção de qualquer chamada Evolution nas rotas novas (lib continua existindo para legacy, mas isolada).
7. Webhook receiver: validar HMAC com `app_secret_enc`, parsear `messages[]` e `statuses[]`, gravar em `whatsapp_messages`.
8. UI por loja.

### 5.8 Dependências
- Setor A (`inbound_events` para vincular `triggered_by_event_id`).
- Setor F (RLS).

---

## 6. Setor D — Schema customers / contacts expandido

### 6.1 Objetivo
Estender `contacts` (ou criar `contact_marketing_state` se preferir desacoplar) com as colunas que o Orion usa para gate de automação e contadores RFM.

### 6.2 DDL

Opção A — colunas direto em `contacts` (mais simples):
```sql
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phone_full              text NULL,
  ADD COLUMN IF NOT EXISTS agent_status            text NOT NULL DEFAULT 'auto',
    -- 'auto' (IA pode atuar) | 'human' (atendente assumiu) | 'paused'
  ADD COLUMN IF NOT EXISTS agent_name              text NULL,
  ADD COLUMN IF NOT EXISTS messages_off            text NULL,
    -- NULL = recebe / 'stop' = opt-out total / 'marketing' = só transacional
  ADD COLUMN IF NOT EXISTS automation_blocked_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS interesse_duvida        text NULL,
  ADD COLUMN IF NOT EXISTS status_geral            text NULL DEFAULT 'novo',
    -- 'novo' | 'recorrente' | 'vip' | 'inativo' | (customizável por loja)
  ADD COLUMN IF NOT EXISTS recorrencia             text NULL,
  ADD COLUMN IF NOT EXISTS total_compras           int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gasto             numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS primeira_compra_em      timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ultima_compra_em        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS total_msgs_enviadas     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_msgs_respondidas  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recuperacoes      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_interacao_em     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ultima_resposta_texto   text NULL,
  ADD COLUMN IF NOT EXISTS ultima_resposta_em      timestamptz NULL;

CREATE INDEX IF NOT EXISTS ix_contacts_phone_full ON contacts (store_id, phone_full);
CREATE INDEX IF NOT EXISTS ix_contacts_status_geral ON contacts (store_id, status_geral);
CREATE INDEX IF NOT EXISTS ix_contacts_agent_status ON contacts (store_id, agent_status);
```

### 6.3 RPCs

```sql
CREATE OR REPLACE FUNCTION pause_automation(p_contact_id uuid, p_until timestamptz, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE contacts
     SET automation_blocked_until = p_until,
         updated_at = now()
   WHERE id = p_contact_id;
  INSERT INTO contact_audit_log (contact_id, action, payload)
    VALUES (p_contact_id, 'pause_automation',
            jsonb_build_object('until', p_until, 'reason', p_reason));
END $$;

CREATE OR REPLACE FUNCTION resume_automation(p_contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;

CREATE OR REPLACE FUNCTION mark_opt_out(p_contact_id uuid, p_level text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;

CREATE OR REPLACE FUNCTION handoff_to_human(p_contact_id uuid, p_agent_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;
```

### 6.4 Configurabilidade — `contact_state_config`

```sql
CREATE TABLE contact_state_config (
  store_id                       uuid PRIMARY KEY,
  default_handoff_duration_hours int NOT NULL DEFAULT 24,
  opt_out_keywords               text[] NOT NULL DEFAULT '{"PARAR","SAIR","STOP","CANCELAR"}',
  status_geral_values            text[] NOT NULL DEFAULT '{"novo","recorrente","vip","inativo"}',
  vip_threshold_total_gasto      numeric NOT NULL DEFAULT 1000,
  inativo_dias_sem_compra        int NOT NULL DEFAULT 180,
  updated_at                     timestamptz NOT NULL DEFAULT now()
);
```

Permite cada loja definir suas próprias keywords de opt-out, faixa de VIP, etc.

### 6.5 Triggers automáticos (opcional)

```sql
-- Quando customer manda STOP → marca opt-out
CREATE TRIGGER trg_auto_optout BEFORE INSERT ON whatsapp_messages
  FOR EACH ROW WHEN (NEW.direction = 'inbound' AND NEW.content_text IS NOT NULL)
  EXECUTE FUNCTION check_optout_keywords();

-- Quando inbound_event marca order.paid → recalcula RFM e status_geral
CREATE TRIGGER trg_recalc_rfm AFTER UPDATE ON inbound_events
  FOR EACH ROW WHEN (NEW.event_type = 'order.paid' AND NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION recalc_contact_rfm();
```

### 6.6 Steps

1. Migration de ALTER + índices.
2. RPCs.
3. Triggers (opcional, pode ser feito em código se preferir).
4. `contact_state_config` migration.
5. Atualizar UI `/contacts/[id]` para mostrar e editar esses campos.

### 6.7 Dependências
Nenhuma. Pode ir paralelo ao A.

---

## 7. Setor B — Motor de toques

### 7.1 Objetivo
Substituir os 6 cron jobs do n8n (T1/T2/T3 de PIX e CHECKOUT, e qualquer outro toque futuro) por um motor configurável onde cada loja define suas próprias **sequências de toques**.

### 7.2 DDL

```sql
CREATE TABLE touch_sequences (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid NOT NULL,
  name                     text NOT NULL,             -- 'PIX - recuperação' | 'Checkout abandonado'
  description              text NULL,
  trigger_event_type       text NOT NULL,             -- 'cart.reminder' | 'payment.pix.waiting'
  trigger_status_alias     text NULL,                 -- opcional, filtra adicional
  active                   boolean NOT NULL DEFAULT false,
  version                  int NOT NULL DEFAULT 1,
  activated_at             timestamptz NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE touch_steps (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id              uuid NOT NULL REFERENCES touch_sequences(id) ON DELETE CASCADE,
  position                 int NOT NULL,              -- 1, 2, 3...
  delay_seconds            int NOT NULL,              -- delay desde received_at do evento
  template_name            text NOT NULL,
  template_language        text NOT NULL DEFAULT 'pt_BR',
  parameter_mapping        jsonb NOT NULL DEFAULT '{}',
  -- ex: { "customer_name": "$.customer_name", "discount": "$.computed.discount_random_900_1600" }
  gate_rules               jsonb NOT NULL DEFAULT '{}',
  -- ex: { "agent_status": "auto", "messages_off_is_null": true, "blocked_until_in_past": true }
  on_send_actions          jsonb NOT NULL DEFAULT '[]',
  -- ex: [{ "type": "increment", "field": "templates_sent" }, { "type": "increment_contact", "field": "total_msgs_enviadas" }]
  is_terminal              boolean NOT NULL DEFAULT false,  -- se true, marca status='completed'
  UNIQUE (sequence_id, position)
);

CREATE TABLE touch_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid NOT NULL,
  sequence_id              uuid NOT NULL,
  step_id                  uuid NOT NULL,
  event_id                 uuid NOT NULL REFERENCES inbound_events(id),
  contact_id               uuid NOT NULL,
  scheduled_for            timestamptz NOT NULL,
  claimed_at               timestamptz NULL,
  claim_token              uuid NULL,
  status                   text NOT NULL DEFAULT 'scheduled',
    -- 'scheduled' | 'claimed' | 'sent' | 'skipped_gate' | 'failed' | 'cancelled'
  skipped_reason           text NULL,
  whatsapp_message_id      uuid NULL,
  error                    text NULL,
  attempts                 int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz NULL,
  UNIQUE (event_id, step_id)
);

CREATE INDEX ix_touch_runs_due ON touch_runs (store_id, status, scheduled_for)
  WHERE status IN ('scheduled','claimed');
```

### 7.3 RPC de claim atômico

```sql
CREATE OR REPLACE FUNCTION claim_due_touch_runs(p_store_id uuid, p_limit int)
RETURNS SETOF touch_runs LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE touch_runs
     SET claimed_at = now(),
         claim_token = gen_random_uuid(),
         status = 'claimed',
         attempts = attempts + 1
   WHERE id IN (
     SELECT id FROM touch_runs
      WHERE store_id = p_store_id
        AND status = 'scheduled'
        AND scheduled_for <= now()
      ORDER BY scheduled_for
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
   RETURNING *;
END $$;
```

### 7.4 Cron worker

`/api/cron/touch-engine` roda a cada 1 minuto:

```ts
// pseudo
for each active store {
  // 1. Programar novos runs para eventos novos
  for each active touch_sequence on store {
    for each new inbound_event matching trigger criteria {
      for each step in sequence {
        INSERT INTO touch_runs (...)
        scheduled_for = event.received_at + step.delay_seconds
      }
    }
  }

  // 2. Executar runs vencidos
  runs = claim_due_touch_runs(store_id, 100)
  for each run {
    contact = fetch contact
    if gate_rules failem → status = 'skipped_gate', skipped_reason = '...'
    else {
      sent = whatsapp.send_template(template, params)
      if sent ok → status = 'sent', execute on_send_actions
      else → status = 'failed', error = '...'
    }
  }
}
```

### 7.5 Configurabilidade explícita

Tudo da sequência está em DB. Para criar a sequência "PIX TOQUES" do Orion:

```json
{
  "name": "PIX - 3 toques recuperação",
  "trigger_event_type": "payment.pix.waiting",
  "trigger_status_alias": "waiting_payment",
  "steps": [
    {
      "position": 1,
      "delay_seconds": 180,
      "template_name": "v0_orion_pix_tq1",
      "parameter_mapping": {
        "1": "$.customer_name"
      },
      "gate_rules": {
        "contact.agent_status_in": ["auto"],
        "contact.messages_off_is_null": true,
        "contact.blocked_until_in_past_or_null": true
      },
      "on_send_actions": [
        { "type": "increment_event", "field": "templates_sent" },
        { "type": "increment_contact", "field": "total_msgs_enviadas" },
        { "type": "set_contact", "field": "ultima_interacao_em", "value": "now()" }
      ],
      "is_terminal": false
    },
    {
      "position": 2,
      "delay_seconds": 1980,
      "template_name": "v0_orion_pix_tq2",
      "parameter_mapping": { "1": "$.customer_name" },
      "gate_rules": "<mesmo>",
      "on_send_actions": "<mesmo + templates_sent++>",
      "is_terminal": false
    },
    {
      "position": 3,
      "delay_seconds": 14580,
      "template_name": "v0_orion_pix_tq3",
      "parameter_mapping": { "1": "$.customer_name" },
      "gate_rules": "<mesmo>",
      "on_send_actions": "<+ event.status = 'completed'>",
      "is_terminal": true
    }
  ]
}
```

**Importante:** sempre que `inbound_event.status` virar `'paid'`/`'cancelled'`/etc, **todos os `touch_runs` daquele event_id com `status='scheduled'` são cancelados**. Mecânica: trigger PG ou função chamada pelo cron.

### 7.6 Computed fields no parameter_mapping

Para reproduzir o "desconto random R$ 900-1600" do T2 checkout:

```json
"parameter_mapping": {
  "1": "$.customer_name",
  "2": "@random_int(900,1600)"
}
```

`@random_int`, `@random_choice`, `@now`, `@format_date`, `@format_currency` — helpers configuráveis no resolver.

### 7.7 UI

`/automations/touches`:
- Lista de sequências com toggle ativo/inativo, contagem de runs últimos 7 dias.
- Editor visual: trigger + steps (cards arrastáveis com delay + template + gates + actions).
- Preview de payload: cola um JSON de `inbound_events.raw_payload`, mostra resultado do `parameter_mapping`.
- Stats: enviados, skipped por motivo, falhados.

### 7.8 Steps de implementação

1. Migrations.
2. RPC `claim_due_touch_runs` + função `cancel_runs_for_event`.
3. Worker `/api/cron/touch-engine`.
4. Resolver de `parameter_mapping` (JSONPath + helpers `@`).
5. Avaliador de `gate_rules` (DSL simples).
6. Executor de `on_send_actions`.
7. UI editor.
8. Migração das 2 sequências do Orion (PIX, CHECKOUT) como seed.
9. Testes: relógio mockado para validar T1/T2/T3 nos timings exatos.

### 7.9 Dependências
A (eventos), C (envio), D (gates), J (config).

---

## 8. Setor H — Buffer inbound

### 8.1 Objetivo
Reproduzir o padrão Redis do Orion: cliente manda 3 mensagens em sequência, IA responde **uma vez** com tudo concatenado.

### 8.2 Mecânica

```
1. Webhook recebe mensagem do Meta.
2. Resolve store_id, agent_id, contact_id.
3. LPUSH em Redis `wa_buf:{store_id}:{agent_id}:{contact_id}` → JSON da mensagem.
   EXPIRE 5min.
4. Calcula bucket_ts = floor(now / wait_seconds).
5. Enfileira QStash com:
     - delay = wait_seconds (ex: 10s)
     - notBefore = (bucket_ts + 1) * wait_seconds
     - deduplicationId = `{store}:{agent}:{contact}:{bucket_ts}`
6. QStash deduplica: na janela só 1 job sobrevive.
7. Quando o job dispara:
     - LRANGE + DEL atômico (LUA script).
     - Junta `content` com '\n' separator.
     - Verifica se a última msg do buffer == última msg que disparou.
       Se não: morre (outro job mais novo vai processar).
     - Chama agente IA com mensagem concatenada.
```

### 8.3 Configurabilidade — `agent_buffer_config`

```sql
CREATE TABLE agent_buffer_config (
  agent_id                 uuid PRIMARY KEY REFERENCES ai_agents(id),
  enabled                  boolean NOT NULL DEFAULT true,
  wait_seconds             int NOT NULL DEFAULT 10,
  max_messages_per_bucket  int NOT NULL DEFAULT 20,
  separator                text NOT NULL DEFAULT E'\n',
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

### 8.4 Steps

1. Migration.
2. `src/lib/whatsapp/inbound-buffer.ts` (LPUSH/EXPIRE).
3. LUA script `LRANGE + DEL` atômico em `src/lib/redis/scripts/drain-buffer.lua`.
4. QStash producer com `deduplicationId`.
5. Job consumer em `/api/queue/process-buffer/route.ts`.
6. Branch no webhook inbound: se buffer habilitado, enfileira; senão chama agente direto.

### 8.5 Dependências
C (webhook), E (agente).

---

## 9. Setor E — Agente IA conversacional

### 9.1 Objetivo
Substituir o agente LangChain do n8n. Por loja, um ou mais agentes (`ai_agents`) com persona, prompt, tools, LLM, memória, RAG — **tudo configurável**.

### 9.2 Estado atual no Worder
- Tem `ai_agents` table parcial.
- Tem `agent_sources` (sources de conhecimento).
- Tem `src/lib/ai/ai-chatbot-service.ts` parcial.
- Tem 3 bugs críticos documentados em `docs/ANALISE-CODIGO-AI-AGENTS.md`: tipos duplicados, provider Groq referenciado mas não suportado, imports circulares nas tabs.
- **Não tem** embeddings + pgvector.
- **Não tem** RAG runtime.
- **Não tem** memória de sessão estruturada (poderia derivar de `whatsapp_messages`).
- **Não tem** sistema de tools plugáveis.

### 9.3 DDL

```sql
-- Extensão
CREATE EXTENSION IF NOT EXISTS vector;

-- Reforma a tabela ai_agents (ALTER se já existe)
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS store_id            uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_account_id uuid REFERENCES whatsapp_accounts(id),
  ADD COLUMN IF NOT EXISTS llm_provider        text NOT NULL DEFAULT 'openrouter',
  ADD COLUMN IF NOT EXISTS llm_model           text NOT NULL DEFAULT 'openai/gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS temperature         numeric(3,2) NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS max_tokens          int NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS embedding_provider  text NOT NULL DEFAULT 'cohere',
  ADD COLUMN IF NOT EXISTS embedding_model     text NOT NULL DEFAULT 'embed-multilingual-v3.0',
  ADD COLUMN IF NOT EXISTS rerank_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rerank_provider     text NULL DEFAULT 'cohere',
  ADD COLUMN IF NOT EXISTS rerank_model        text NULL DEFAULT 'rerank-multilingual-v3.0',
  ADD COLUMN IF NOT EXISTS rag_top_k           int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS rag_min_score       numeric(4,3) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS memory_window       int NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS persona_name        text NOT NULL DEFAULT 'Assistente',
  ADD COLUMN IF NOT EXISTS active              boolean NOT NULL DEFAULT true;

-- Knowledge base com pgvector (Cohere = 1024 dims)
CREATE TABLE agent_knowledge_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL,
  source_id       uuid NULL REFERENCES agent_sources(id) ON DELETE CASCADE,
  content         text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}',
  embedding       vector(1024) NOT NULL,
  token_count     int NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_agent_chunks_hnsw ON agent_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ix_agent_chunks_agent ON agent_knowledge_chunks (agent_id);

-- Prompts versionados por ocasião
CREATE TABLE agent_prompts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL,
  ocasiao         text NOT NULL,                -- 'novo' | 'recorrente' | 'vip' | 'default'
  system_prompt   text NOT NULL,
  version         int NOT NULL DEFAULT 1,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, ocasiao, version)
);

-- Memória de sessão
CREATE TABLE agent_conversation_memory (
  id              bigserial PRIMARY KEY,
  agent_id        uuid NOT NULL,
  store_id        uuid NOT NULL,
  session_id      text NOT NULL,                -- agent_id + ':' + contact_id
  role            text NOT NULL,                -- 'user' | 'assistant' | 'tool' | 'system'
  content         text NOT NULL,
  tool_calls      jsonb NULL,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_memory_session ON agent_conversation_memory (session_id, created_at DESC);

-- Tools por agente
CREATE TABLE agent_tools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL,
  name            text NOT NULL,                -- 'dados_loja' | 'produtos' | 'get_order' | 'rastreio' | 'salva_contato' | 'chamar_humano'
  type            text NOT NULL,                -- 'rag' | 'shopify_order' | 'shopify_product' | 'http' | 'rpc' | 'custom'
  description     text NOT NULL,                -- usado como toolDescription pro LLM
  config          jsonb NOT NULL DEFAULT '{}',
  enabled         boolean NOT NULL DEFAULT true,
  position        int NOT NULL DEFAULT 0,
  UNIQUE (agent_id, name)
);

-- Runs (observabilidade)
CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL,
  store_id        uuid NOT NULL,
  contact_id      uuid NULL,
  session_id      text NOT NULL,
  input_message   text NOT NULL,
  output_message  text NULL,
  ocasiao_used    text NULL,
  prompt_version  int NULL,
  tools_called    jsonb DEFAULT '[]',
  llm_provider    text NOT NULL,
  llm_model       text NOT NULL,
  tokens_input    int NULL,
  tokens_output   int NULL,
  cost_usd        numeric(10,6) NULL,
  latency_ms      int NULL,
  error           text NULL,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'success' | 'error' | 'handed_off'
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### 9.4 Pipeline runtime

```
1. Mensagem chega (depois do buffer setor H).
2. Resolve agent ativo da store.
3. Resolve contact por phone_full. Se não existe, cria.
4. Detecta multimodal: type ≠ text → transcreve/analisa via provider.
5. Lê `agent_prompts WHERE agent_id AND ocasiao = contact.status_geral AND active`.
   Fallback para `ocasiao = 'default'`.
6. Carrega memória: últimas `memory_window` linhas de `agent_conversation_memory`.
7. Carrega tools habilitadas de `agent_tools`.
8. Embed da query → busca top-K em `agent_knowledge_chunks` → rerank opcional.
   Mas isso é tool: o LLM decide se chama. (Padrão LangChain.)
9. Chama LLM com system + history + tools schema.
10. Loop ReAct: enquanto tool_calls não vazios, executa, anexa, re-chama.
11. Grava response em `agent_conversation_memory` e em `whatsapp_messages`.
12. Passa pelo **humanizer** (setor opcional) → divide em N msgs.
13. Envia cada msg via setor C com `wait` entre elas.
14. Grava `agent_runs` com tudo.
```

### 9.5 Configurabilidade explícita (consolidada)

Tabela | Knob
---|---
`ai_agents` | `llm_provider`, `llm_model`, `temperature`, `max_tokens`, `embedding_provider`, `embedding_model`, `rerank_enabled`, `rag_top_k`, `rag_min_score`, `memory_window`, `persona_name`, `active`
`agent_prompts` | system prompt por `ocasiao` versionado
`agent_tools` | quais tools habilitadas, configuração por tool, descrição apresentada ao LLM
`agent_buffer_config` | wait_seconds do buffer
`agent_humanizer_config` | enabled, min/max chars por bloco, delay entre blocos
`agent_multimodal_config` | provider de transcrição (whisper/gemini), provider de visão (gpt4o/gemini), tamanho max de arquivo
`agent_escalation_config` | webhook de notificação ao escalar, mensagem padrão pro cliente, duração padrão do pause

### 9.6 Tools mínimas (P0) e expandidas (P1+)

**P0 (essenciais para destrancar IA):**
- `rag_knowledge` (tipo `rag`): busca em `agent_knowledge_chunks` filtrado pelo agent_id.
- `chamar_humano` (tipo `rpc`): chama RPC `handoff_to_human` + grava em fila de atendimento humano + envia notificação.

**P1:**
- `salva_contato` (tipo `rpc`): atualiza colunas do contato (tags, interesse, status_geral, messages_off, automation_blocked_until).
- `get_order_shopify` (tipo `shopify_order`): conecta à Shopify Admin API com credenciais da loja.
- `get_products_shopify` (tipo `shopify_product`).
- `tracking_correios` (tipo `http`): chama API de rastreio externa.

**P2:**
- `custom_http`: tool genérica configurável que faz HTTP request com schema definido pelo usuário (super-poder para criar tools sem código).

### 9.7 Provider abstraction

```ts
// src/lib/ai/providers/llm.ts
export interface LLMProvider {
  chat(opts: { model, messages, tools?, temperature, maxTokens }): Promise<ChatResult>;
}

// implementações
src/lib/ai/providers/openrouter.ts
src/lib/ai/providers/openai.ts
src/lib/ai/providers/anthropic.ts
src/lib/ai/providers/gemini.ts
```

```ts
// src/lib/ai/providers/embeddings.ts
export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

// cohere, openai, voyage
```

```ts
// src/lib/ai/providers/rerank.ts
export interface RerankProvider {
  rerank(query: string, docs: string[]): Promise<Array<{ idx: number; score: number }>>;
}
```

```ts
// src/lib/ai/providers/transcribe.ts
// src/lib/ai/providers/vision.ts
```

### 9.8 UI

`/ai-agents/[id]`:
- Aba **Persona**: persona_name, system prompt (TipTap) + versão + ativar.
- Aba **Prompts por ocasião**: lista de ocasiões com prompts versionados.
- Aba **LLM**: provider, model, temperature, max_tokens, custos estimados.
- Aba **Knowledge base**: upload de docs → chunks → embeddings (com progress); busca de teste.
- Aba **Tools**: lista de tools com toggle e configuração por tool.
- Aba **Memory & RAG**: window, top_k, min_score, rerank toggle.
- Aba **Multimodal**: providers de audio/imagem/vídeo/doc.
- Aba **Buffer**: wait_seconds.
- Aba **Humanizer**: enabled + chars.
- Aba **Escalation**: webhook de notificação, msg padrão.
- Aba **Runs**: histórico de execuções com filtros, drill-down em cada run (input, output, tools chamadas, tokens, custo, latência).
- Aba **Test playground**: caixa de chat para testar agente sem WhatsApp.

### 9.9 Steps

1. Migrations (pgvector + tabelas).
2. Corrigir os 3 bugs documentados em `ANALISE-CODIGO-AI-AGENTS.md`.
3. Provider abstractions (LLM, Embedding, Rerank, Transcribe, Vision).
4. Knowledge pipeline (upload → chunk → embed → store).
5. RAG retriever (search + rerank).
6. Memory loader (últimas N).
7. Tool framework (registry, executor, schema generator pra LLM).
8. ReAct loop.
9. UI por aba.
10. Test playground.
11. Migração da persona Sophia + base de conhecimento Orion como seed.

### 9.10 Dependências
J (config), F (RLS), C (envio), H (buffer).

---

## 10. Setor F — Multi-tenant

### 10.1 Objetivo
Garantir isolamento completo entre lojas. Já é princípio do Worder, mas as **novas tabelas** precisam todas seguir.

### 10.2 Padrão obrigatório

Toda tabela nova:
1. Tem `store_id uuid NOT NULL`.
2. Tem `ENABLE ROW LEVEL SECURITY`.
3. Tem `POLICY tenant_isolation USING (store_id IN (SELECT id FROM stores WHERE organization_id = current_org_id()))`.
4. Tem índice composto em `store_id` + colunas mais filtradas.

### 10.3 Router por phone_number_id

O webhook inbound do Meta entrega para um `phone_number_id`. Mapeamento → `whatsapp_accounts.phone_number_id` → `store_id` → agente.

```ts
// no handler
const accountId = body.entry[0].changes[0].value.metadata.phone_number_id;
const account = await db.whatsapp_accounts.findUnique({ where: { phone_number_id: accountId } });
if (!account) return 404;
const storeId = account.store_id;
const agent = await db.ai_agents.findFirst({ where: { store_id: storeId, active: true } });
```

### 10.4 Credenciais criptografadas

Toda credencial sensível (Meta access_token, secrets de webhook, API keys de provider quando per-store) usa o mesmo padrão AES-256-GCM já existente em `src/lib/webhooks/encryption.ts` com `WEBHOOK_SECRET_KEY` env. Migrar essa lib para `src/lib/crypto/aes-gcm.ts` para reuso geral.

### 10.5 Steps
1. Auditoria de todas as novas migrations garantindo RLS.
2. Mover `encryption.ts` para `src/lib/crypto/`.
3. Helper `current_org_id()` PG (provavelmente já existe — confirmar).
4. Testes de isolamento entre 2 stores.

---

## 11. Setor I — Toggle bot / handoff

### 11.1 Objetivo
Pausar ou retomar a IA por contato, com várias fontes possíveis:
- Operador clica botão na inbox do Worder.
- IA decide escalar (tool `chamar_humano`).
- Cliente envia keyword opt-out.
- Admin pausa para todos via dashboard.

### 11.2 Estado atual
- Inbox do Worder tem botão "assumir conversa" parcial.
- Webhook inbound não checa keyword opt-out hoje.

### 11.3 Implementação

Fonte | Ação |
---|---|
Botão "assumir" na inbox | `agent_status='human'`, `automation_blocked_until=now()+default_handoff_duration`, gera event `handoff.manual` |
Tool `chamar_humano` | Mesma coisa + cria ticket na fila de atendimento + notifica via webhook configurável |
Keyword cliente (PARAR/STOP/...) | `messages_off='stop'`, cancela todos `touch_runs` futuros, envia confirmação opt-out |
Admin pausa massivo | Update em lote em `contacts` filtrados |

### 11.4 Limitação importante — toggle "entendi/seguimos"

O Orion usa "entendi"/"seguimos" via mensagem **do próprio número do business** (outbound). O Meta Cloud **não envia webhook quando o business manda mensagem via API** — então não dá pra detectar isso 1:1. Alternativas:

1. **Botão na inbox** (recomendado).
2. **Comando especial via Slack/dashboard.**
3. **Outro número do operador** que conversa com o bot via comando — requer cadastro do operador como contato especial.

A decisão fica no setor I. Recomendação: opção 1.

### 11.5 Configurabilidade

```sql
CREATE TABLE bot_toggle_config (
  store_id                       uuid PRIMARY KEY,
  default_handoff_duration_hours int NOT NULL DEFAULT 24,
  optout_keywords                text[] NOT NULL DEFAULT '{"PARAR","SAIR","STOP","CANCELAR"}',
  optout_confirmation_template   text NULL,            -- template a enviar após opt-out
  handoff_notification_webhook   text NULL,            -- URL pra notificar quando IA escala
  handoff_notification_template  text NULL,            -- msg pra cliente após escala
  updated_at                     timestamptz NOT NULL DEFAULT now()
);
```

---

## 12. Setor G — Observabilidade

### 12.1 Objetivo
Tudo que executa deixa rastro consultável.

### 12.2 Tabelas-fim

- `inbound_events` — histórico de eventos recebidos.
- `touch_runs` — toques agendados, claimed, sent, skipped, failed.
- `agent_runs` — execuções da IA com tokens/custo/latência.
- `whatsapp_messages` — envios e recebimentos + meta_status.

### 12.3 Dashboards

`/observability`:
- **Touch engine**: por sequência, taxa de envio, taxa de skip por motivo, taxa de erro, recuperação (% conversões depois de N toques).
- **AI**: runs por dia, modelo, custo total, latência p50/p95, tools mais usadas, handoff rate.
- **WhatsApp**: envios, falhas Meta por código, delivery rate, read rate, templates rejeitados.
- **Inbound**: eventos por source, deduplicação, payload errors.

### 12.4 Alertas

`alert_rules` simples baseado em SQL agendado:

```sql
CREATE TABLE alert_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL,
  name          text NOT NULL,
  query_sql     text NOT NULL,                    -- retorna count
  threshold     int NOT NULL,
  comparator    text NOT NULL,                    -- '>' | '<' | '=='
  channel       text NOT NULL,                    -- 'email' | 'webhook' | 'whatsapp'
  channel_target text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true
);
```

Exemplos out-of-the-box:
- Touch runs com `status='failed'` > 10 nos últimos 15 min.
- Agent runs com `error` not null > 5 na última hora.
- Meta template rejeitado.

---

## 13. Roadmap em sprints

Cada sprint assume **2 devs**. Ajustar conforme equipe.

### Sprint 0 — Fundação transversal (J + F) — 1 semana
- Camada de configuração `<feature>_config` padrão + acessor.
- Mover `encryption.ts` para `src/lib/crypto/`.
- Helper `current_org_id()` validado.
- Estrutura de pastas: `src/lib/{inbound,whatsapp,touches,ai,config,crypto}`.

### Sprint 1 — Ingestão + Schema customers (A + D) — 2 semanas
- Migrations A + D + J.
- Endpoint `/api/inbound/[source]` genérico.
- Resolver de customer (upsert por phone).
- UI `/settings/integrations/inbound`.
- Seed config Yampi.
- **Marco:** Worder grava eventos da Yampi em paralelo ao n8n.

### Sprint 2 — WhatsApp Cloud oficial (C) — 2 semanas
- Migrations C.
- Sender de template + sender de texto + webhook receiver com HMAC.
- Sync de templates do Meta.
- UI `/settings/whatsapp` completa.
- Auditoria removendo Evolution dos fluxos novos.
- **Marco:** Worder envia e recebe via Cloud oficial por loja.

### Sprint 3 — Motor de toques + Buffer (B + H) — 3 semanas
- Migrations B + H.
- RPC `claim_due_touch_runs`.
- Cron `/api/cron/touch-engine`.
- Resolver de `parameter_mapping` + gates + actions.
- Buffer Redis+QStash.
- UI editor de sequências.
- Seed das 2 sequências (PIX, CHECKOUT).
- **Marco:** desliga n8n PIX TOQUES e CHECKOUT TOQUES.

### Sprint 4 — Agente IA core (E P0) — 4 semanas
- Migrations E.
- Corrigir bugs de AI agents.
- Provider abstractions.
- Knowledge pipeline.
- RAG + memory.
- Tool framework + 2 tools P0 (rag, chamar_humano).
- ReAct loop.
- UI básica.
- **Marco:** IA responde no Worder com knowledge base. Desliga 80% do CONVERSA do n8n.

### Sprint 5 — IA expandida (E P1 + tools) — 3 semanas
- Tools P1: salva_contato, get_order, get_products, tracking.
- Multimodal (transcrição, visão).
- Prompts versionados por ocasião.
- UI completa (todas as abas).
- Test playground.
- **Marco:** desliga CONVERSA do n8n 100%.

### Sprint 6 — Toggle, humanizer, observabilidade (I + humanizer + G) — 2 semanas
- Botão "assumir conversa" robusto.
- Opt-out por keyword automático.
- Humanizer (segundo LLM divide resposta).
- Dashboards.
- Alertas.

### Sprint 7 — Polimento (P2 + P3) — 2 semanas
- Eval LLM-as-judge.
- A/B de prompts.
- Replay de evento.
- Tool `custom_http`.
- Cron monitoring UI.

**Total: ~17 semanas (4 meses) para paridade 1:1 + melhorias.**

Marco intermediário aos ~9 semanas (após Sprint 4) já permite **migração gradual com feature flag por loja**.

---

## 14. Riscos e decisões pendentes

| # | Decisão | Recomendação | Aguardando |
|---|---|---|---|
| 1 | OpenRouter vs OpenAI direto | OpenRouter (mantém Orion) com fallback para OpenAI | Confirmação |
| 2 | Cohere vs alternativas pra embed/rerank | Cohere (mantém Orion); alternativa Voyage | Confirmação |
| 3 | 3 tools Shopify do Orion estão disabled | Reabilitar como P1 | Confirmação |
| 4 | Toggle "entendi/seguimos" via msg outbound | **Não vai dar com Cloud oficial.** Botão na inbox | Aceite |
| 5 | Multi-WABA: cada loja tem sua própria? | Sim, modelo SaaS B2B padrão | Confirmação |
| 6 | Cutover seco vs paralelo | Paralelo com flag `use_worder_orchestration` por loja | Confirmação |
| 7 | Yampi continua como fonte? | Sim. Worder vira plataforma de orquestração, não de e-commerce | **Já confirmado** |
| 8 | Worder pode emitir eventos internos? | Sim — `source='worder_internal'` deixa porta aberta pra futuro e-commerce próprio | Confirmação |
| 9 | LGPD retention de raw_payload | 90 dias com cron prune (espelhar o de outbound webhooks) | Confirmação |
| 10 | Custos de IA — quem paga? | Plano cobra LLM tokens ou loja traz própria key? | Decisão de negócio |

---

## 15. Glossário

- **Loja / store**: unidade multi-tenant. Cada cliente Worder tem N stores.
- **Agente**: instância de IA configurada para uma store, conectada a uma WABA.
- **Toque**: envio único de template baseado em delay desde um evento.
- **Sequência de toques**: lista ordenada de toques para um trigger.
- **Run**: execução individual de toque ou IA, registrada com observabilidade.
- **Ocasião**: dimensão do contato que seleciona qual prompt usar (`novo`, `recorrente`, `vip`).
- **Gate**: condição que precisa ser true para envio acontecer.
- **Source**: origem de evento (Yampi, Shopify Custom, manual, interno).

---

## 16. Apêndice — checklist completo de configurabilidade

Para cada uma das responsabilidades abaixo existe linha de DB editável (P0):

- [ ] Source de evento (enabled, secret, signature method, event mapping, field mapping, rate limit)
- [ ] Credenciais WhatsApp (WABA, phone_number_id, access_token, app_secret, verify_token)
- [ ] Template WhatsApp (sincronizado do Meta, parameter_names amigáveis)
- [ ] Config de envio (service window, retry attempts, retry backoff, rate limit)
- [ ] Sequência de toques (trigger event/status, ativa, versão)
- [ ] Passo de toque (delay, template, parameter_mapping, gate_rules, on_send_actions, is_terminal)
- [ ] Computed helpers no mapping (`@random_int`, `@now`, `@format_*`)
- [ ] Buffer de mensagens (enabled, wait_seconds, separator, max_messages_per_bucket)
- [ ] Agente: LLM provider, model, temperature, max_tokens
- [ ] Agente: embedding provider, model
- [ ] Agente: rerank provider, model, enabled
- [ ] Agente: RAG top_k, min_score
- [ ] Agente: memory_window
- [ ] Agente: persona_name
- [ ] Prompt por ocasião (versionado)
- [ ] Tool (enabled, type, config, description)
- [ ] Multimodal: provider de transcrição / visão / análise de vídeo / análise de doc
- [ ] Humanizer (enabled, min/max chars, delay)
- [ ] Escalation (webhook, msg padrão, duração handoff)
- [ ] Opt-out keywords
- [ ] Status_geral values e thresholds (VIP, inativo)
- [ ] Alert rules (query SQL, threshold, comparator, channel)

Quando o checklist estiver todo coberto, **nenhuma lógica de negócio fica em código** — só motor + UI. Esse é o critério de sucesso da camada J.
