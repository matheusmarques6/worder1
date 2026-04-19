# Webhooks de Saída (Outbound) — Spec de Design

**Status:** Aprovado (brainstorming)
**Data:** 2026-04-19
**Responsável:** Matheus Marques
**Código relacionado:** `src/lib/events.ts`, `src/app/api/webhooks/shopify/route.ts`

---

## 1. Problema

O Worder recebe webhooks de várias plataformas (Shopify, WhatsApp Cloud/Evolution, Resend, Klaviyo, flows custom) mas **não tem mecanismo de saída** para sistemas externos se inscreverem em eventos do Worder. Clientes integrando ERPs, BIs, apps de fulfillment ou automações internas não têm contrato padrão pra escutar "pedido pago", "rastreio criado", "browse abandonado" etc.

Esse spec define o sistema de webhooks de saída v1: contrato de eventos normalizado, assinaturas por loja, entrega assinada com retries, e UI para gerenciar inscrições e inspecionar logs de entrega.

## 2. Objetivos e Não-Objetivos

### Objetivos
- Permitir que clientes inscrevam sistemas externos em eventos do Worder via webhooks HTTP configuráveis.
- Fornecer contrato de evento estável e normalizado, desacoplado dos provedores upstream (trocar Shopify por outro motor de e-commerce não quebra integradores).
- Entregar com confiabilidade (at-least-once, retry exponencial, persistência crash-safe).
- Expor UI para gestão de assinaturas, logs de entrega, reenvio manual e teste ao vivo.
- Cobrir 10 eventos de alto valor pro cenário de e-commerce BR (pedidos, pagamentos, envio, browse abandonment).
- Seguro por padrão: sem SSRF, sem segredos em texto puro no banco, RLS em todas as tabelas com PII, retenção LGPD-aware.

### Não-Objetivos (v1)
- Sem UI formal de Dead Letter Queue (entregas que falham todos os retries simplesmente ficam em `failed`; reenvio manual existe).
- Sem assinatura multi-loja num único registro (assinatura é estritamente por loja).
- Sem versionamento além do flag `version: "1"` (mudanças quebradoras vão exigir um spec v2).
- Sem inscrições em eventos internos (`automation.triggered`, etc.); só os 10 eventos listados.
- Sem propagação automática de exclusão LGPD nas entregas históricas. A retenção é a rede de segurança (ver §7).

## 3. Catálogo de Eventos (v1)

10 tipos de eventos normalizados:

| Evento | Origem | Observações |
|---|---|---|
| `order.created` | Webhook Shopify (`orders/create`) | Já emitido via EventBus |
| `order.paid` | Webhook Shopify (`orders/paid`) | Já emitido via EventBus |
| `order.fulfilled` | Webhook Shopify (`orders/fulfilled`) | Já emitido via EventBus |
| `order.cancelled` | Webhook Shopify (`orders/cancelled`) | Já emitido via EventBus |
| `checkout.abandoned` | Cron `abandoned-cart.ts` | Precisa instrumentar com `EventBus.emit` |
| `customer.created` | Webhook Shopify + criação de contato | Precisa de emit explícito na primeira criação |
| `shipment.tracking_created` | Shopify `fulfillments/create` (`processFulfillmentEvent` em `route.ts:1081`) | Precisa de emit no EventBus (hoje só grava CDP event) |
| `payment.pix.abandoned` | Cron `abandoned-cart.ts`, filtrado por `payment_gateway` | Caminho de emit novo |
| `payment.boleto.abandoned` | Cron `abandoned-cart.ts`, filtrado por `payment_gateway` | Caminho de emit novo |
| `browse.abandoned` | **Detector cron novo** | Detecta `viewed_product` sem `added_to_cart`/`placed_order` subsequente, na janela 30min–4h |

## 4. Arquitetura

O dispatcher usa um **outbox transacional** pra garantir que nenhum evento seja perdido se o processo morrer entre a emissão no EventBus e o enqueue do QStash.

```
[Webhook Shopify]──┐                ┌────────────────────────────┐
                   │                │  outbound_dispatcher        │
[Webhook WhatsApp]─┼─► EventBus ───►│  (listener síncrono, bloqueia│
                   │  .emit(...)    │   o handler de inbound)     │
[Browse detector]──┘                │                             │
   (cron novo)                      │  1. deriva event_id         │
                                    │     determinístico (idemp.) │
                                    │  2. INSERT webhook_deliv.   │
                                    │     (status='pending') —    │
                                    │     UNIQUE(sub_id,event_id) │
                                    │     engole duplicatas       │
                                    │  3. enfileira job no QStash │
                                    │     usando delivery.id como │
                                    │     dedup key               │
                                    └──────────────┬──────────────┘
                                                   │
                  ┌────────────────────────────────┤
                  │ Sweeper de entregas presas      │
                  │ /api/cron/webhook-deliveries-   │
                  │ sweeper (a cada 5min)           │
                  │ Reenfileira linhas `pending`/   │
                  │ `retrying` sem atividade no     │
                  │ QStash nos últimos 5min (cobre  │
                  │ falha de enqueue entre INSERT   │
                  │ e POST)                         │
                  └─────────────────────────────────┘
                                                   ▼
                                    ┌────────────────────────────┐
                                    │  /api/workers/webhook-      │
                                    │  delivery (POST por job)    │
                                    │                             │
                                    │  - reivindica linha atomica.│
                                    │    UPDATE...SET status=     │
                                    │    'in_flight' WHERE id=$1  │
                                    │    AND status IN ('pending',│
                                    │    'retrying') RETURNING *  │
                                    │    (sem linha → outro worker│
                                    │    pegou, aborta)           │
                                    │  - assina HMAC SHA-256      │
                                    │  - POST pra URL do cliente  │
                                    │  - 2xx → delivered          │
                                    │  - 4xx (≠408/429) → failed  │
                                    │  - 5xx/timeout/429 →        │
                                    │    QStash retenta           │
                                    └────────────────────────────┘
```

**Invariantes de crash-safety:**
- O handler de webhook de inbound DEVE `await` em `outbound_dispatcher.dispatch(...)` antes de responder 200. O único passo assíncrono falível do dispatcher é o enqueue no QStash — se ele falhar, a linha já está em `pending` e o sweeper vai reenfileirar em até 5min.
- O detector de browse abandoned roda do cron (sem handler de inbound pra correr risco) e segue a mesma ordem INSERT-depois-enqueue.
- Dedup key da mensagem QStash = UUID do `delivery.id`, então reenfileiramentos do sweeper são seguros (QStash não vai entregar duplicado dentro da janela de dedup).

### Componentes Novos

| Caminho | Propósito |
|---|---|
| `src/lib/webhooks/outbound-dispatcher.ts` | Listener único do EventBus; deriva event_id determinístico, busca subscriptions ativas, faz INSERT das deliveries (UNIQUE engole dups), enfileira jobs |
| `src/lib/webhooks/event-id.ts` | Derivação determinística do `event_id`: `evt_` + base32(sha256(source + ":" + source_event_id + ":" + event_type)) |
| `src/lib/webhooks/payload-builder.ts` | Constrói payload normalizado por event_type (schema versionado); aplica limite de 256KB com truncamento (ver §7) |
| `src/lib/webhooks/signature.ts` | Assina HMAC SHA-256 (com secret primário + anterior durante rotação) + verify de tempo constante |
| `src/lib/webhooks/safe-fetch.ts` | Agent custom do undici com hook `connect` validando IP resolvido contra blocklist; `redirect: 'manual'` forçado |
| `src/lib/webhooks/secret-store.ts` | Cripta secrets com `pgsodium`/KMS no write; descripta só dentro do worker |
| `src/app/api/workers/webhook-delivery/route.ts` | Worker QStash: reivindica linha atomicamente, faz POST pra URL do cliente via safe-fetch, atualiza status |
| `src/app/api/cron/webhook-deliveries-sweeper/route.ts` | Reenfileira linhas `pending`/`retrying` presas |
| `src/lib/services/browse-abandoned/detector.ts` | Detector cron novo (cadência 15min); orgs processadas sequencialmente por tick |
| `src/app/api/cron/browse-abandoned/route.ts` | Entrypoint do cron |
| `src/app/(dashboard)/settings/webhooks/page.tsx` | UI da lista |
| `src/app/(dashboard)/settings/webhooks/new/page.tsx` | Form de criação |
| `src/app/(dashboard)/settings/webhooks/[id]/edit/page.tsx` | Form de edição |
| `src/app/(dashboard)/settings/webhooks/[id]/deliveries/page.tsx` | UI de log de entregas |
| `src/app/api/webhooks-admin/subscriptions/route.ts` (+`/[id]`) | API CRUD pras subscriptions |
| `src/app/api/webhooks-admin/deliveries/[id]/replay/route.ts` | Endpoint de reenvio manual |
| `src/app/api/webhooks-admin/subscriptions/[id]/test/route.ts` | Endpoint "Testar entrega" (manda payload fake) |

### Por que listener único no EventBus (vs. chamada inline em cada handler)

Centralizar no `outbound_dispatcher` garante:
- Adicionar event type novo é **um lugar só**, não N handlers.
- Features futuras de automação (eventos de deal, eventos de segmento) viram webhook-able de graça.
- Handlers ficam focados na lógica do domínio deles.

O custo: uma auditoria pequena pra garantir que todo evento que a gente quer expor realmente emite no EventBus hoje (~4 handlers — ver §8).

## 5. Modelo de Dados

### `webhook_subscriptions`

```sql
CREATE TABLE webhook_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id                 uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  url                      text NOT NULL,

  -- Criptografado em repouso via pgsodium (ou KMS app-level se pgsodium indisponível).
  -- Texto puro só existe na memória do worker durante o POST.
  secret_encrypted         bytea NOT NULL,
  secret_previous_encrypted bytea,                     -- período de graça da rotação
  secret_previous_expires_at timestamptz,              -- quando o secret antigo para de ser assinado

  events                   text[] NOT NULL,
  status                   text NOT NULL DEFAULT 'active',
  description              text,
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0),
  CONSTRAINT status_valid CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT events_in_catalog CHECK (
    events <@ ARRAY[
      'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
      'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
      'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
    ]::text[]
  ),
  CONSTRAINT secret_rotation_consistent CHECK (
    (secret_previous_encrypted IS NULL) = (secret_previous_expires_at IS NULL)
  )
);

CREATE INDEX idx_webhook_subs_lookup ON webhook_subscriptions(store_id, status)
  WHERE status = 'active';
CREATE INDEX idx_webhook_subs_org ON webhook_subscriptions(organization_id);
```

**Rotação de secret:** quando o usuário clica "Regenerar", o secret novo vira `secret_encrypted`, o antigo vai pra `secret_previous_encrypted` com `secret_previous_expires_at = now() + 24h`. Durante o período de graça, as entregas incluem **duas assinaturas** (`X-Worder-Signature: sha256=<novo>, sha256=<antigo>`) pros receivers terem tempo de trocar. Após expirar, o antigo é apagado.

**RLS:** SELECT/INSERT/UPDATE/DELETE permitidos só quando `auth.jwt() ->> 'organization_id' = organization_id::text` (segue padrão existente do repo). As colunas `secret_encrypted` e `secret_previous_encrypted` são excluídas das views expostas pela API — só o dispatcher (service role) lê elas.

### `webhook_deliveries`

```sql
CREATE TABLE webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  event_id         text NOT NULL,                    -- determinístico, ver §4
  payload          jsonb NOT NULL,
  url              text NOT NULL,

  status           text NOT NULL DEFAULT 'pending',
  attempt_count    int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,
  in_flight_until  timestamptz,                      -- lease da reivindicação (TTL 10s); liberado ao concluir ou expirar

  response_code    int,
  response_body    text,                             -- truncado em 2KB
  error_message    text,

  next_retry_at    timestamptz,
  delivered_at     timestamptz,
  last_attempt_at  timestamptz,                      -- pro check do sweeper "sem atividade nos últimos 5min"
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed', 'retrying')),
  CONSTRAINT event_type_in_catalog CHECK (event_type IN (
    'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
    'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
    'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
  )),
  -- Idempotência: mesmo evento de origem → mesma linha de delivery por subscription.
  -- INSERT do dispatcher usa ON CONFLICT DO NOTHING.
  CONSTRAINT unique_delivery_per_event UNIQUE (subscription_id, event_id)
);

CREATE INDEX idx_webhook_deliv_sub ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX idx_webhook_deliv_status ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliv_org ON webhook_deliveries(organization_id, created_at DESC);
-- Índice do sweeper: linhas presas com lease expirada ou nunca enfileiradas
CREATE INDEX idx_webhook_deliv_stuck ON webhook_deliveries(last_attempt_at NULLS FIRST)
  WHERE status IN ('pending', 'retrying', 'in_flight');
```

**RLS:** idêntica à `webhook_subscriptions` (escopada por org). O dashboard lê essa tabela direto; sem RLS, qualquer usuário autenticado conseguiria ler payloads de entrega de outras orgs (que contêm PII de pedidos).

```sql
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros da org leem suas entregas" ON webhook_deliveries
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);
-- INSERT/UPDATE só via service role (dispatcher/worker); sem write client-side.
```

**Retenção (LGPD-aware):** entregas `delivered`/`failed` com mais de **30 dias** são purgadas por cron diário (`/api/cron/webhook-deliveries-prune`). Essa é a rede de segurança LGPD — clientes deletados podem aparecer no histórico de entrega por até 30 dias, o que está documentado no termo do integrador. O purge também controla o crescimento de payload de pedidos grandes.

**Por que desnormalizar `organization_id` e `store_id`:** queries do dashboard não podem exigir join (e as FKs garantem integridade).

**Por que armazenar `url` e `payload`:** snapshots sobrevivem a edições da subscription (mudança de URL não pode reescrever histórico) e são necessários pra renderizar a UI de reenvio.

### `browse_abandoned_emissions`

Tabela dedicada pra controlar emissões de browse-abandoned — mantém a tabela `contact_events` limpa (sem markers sintéticos) e fornece idempotência O(1).

```sql
CREATE TABLE browse_abandoned_emissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       uuid NOT NULL,
  product_id       text NOT NULL,
  view_event_id    uuid NOT NULL,                   -- referencia contact_events.id
  emitted_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_browse_abandoned_emission
    UNIQUE (contact_id, product_id, view_event_id)
);

CREATE INDEX idx_browse_aband_org_emitted ON browse_abandoned_emissions(organization_id, emitted_at DESC);
```

Retenção: purgada em 7 dias (a gente nunca precisa deduplicar além da janela de detecção de 4h, mas mantém um buffer).

## 6. Contrato de Payload

```json
{
  "id": "evt_01HQABC123...",
  "event": "order.created",
  "version": "1",
  "created_at": "2026-04-19T16:23:45.123Z",
  "organization_id": "org_uuid",
  "store_id": "store_uuid",
  "store": {
    "id": "store_uuid",
    "shop_domain": "minhaloja.myshopify.com",
    "name": "Minha Loja"
  },
  "data": { /* schema específico do evento */ }
}
```

### Headers

```
Content-Type: application/json
X-Worder-Event: order.created
X-Worder-Event-Id: evt_01HQABC123...
X-Worder-Signature: sha256=<hmac_hex_primario>[, sha256=<hmac_hex_anterior>]
X-Worder-Timestamp: 1745086425
X-Worder-Delivery-Id: <uuid da delivery>
User-Agent: Worder-Webhooks/1.0
```

### Assinatura

`HMAC_SHA256(subscription.secret, X-Worder-Timestamp + "." + raw_request_body)` — mesma construção do Stripe.

Durante o período de graça de 24h da rotação de secret, o header inclui **duas** assinaturas separadas por vírgula (primária + anterior) pros receivers conseguirem fazer rollover sem downtime.

Os receivers DEVEM:
1. Rejeitar se `|now - X-Worder-Timestamp| > 5 min` (proteção contra replay).
2. Recomputar o HMAC e fazer comparação de tempo constante contra **qualquer** valor `sha256=` no header `X-Worder-Signature` (split por vírgula, trim, retira o prefixo `sha256=`). Match em qualquer → aceita.

### Idempotência

`event_id` é **determinístico**: derivado como `evt_` + base32(sha256(`source` + `:` + `source_event_id` + `:` + `event_type`)). Por exemplo, um `orders/create` da Shopify pro pedido `5678901234` sempre produz o mesmo `event_id`, então re-disparar o webhook de inbound (Shopify retentando) resulta em no-op no `INSERT ... ON CONFLICT DO NOTHING` do dispatcher. Receivers podem adicionalmente deduplicar pelo `X-Worder-Event-Id`.

Nota: at-least-once também significa que o worker pode legitimamente retentar uma delivery por falha transitória — receivers DEVEM ser idempotentes no `X-Worder-Event-Id`.

### Schemas do `data` (v1)

Interfaces TypeScript por evento ficam em `src/lib/webhooks/event-schemas.ts`. Os formatos espelham os tipos internos existentes quando possível (ex: `order.*` espelha `PlacedOrderProperties` de `src/lib/shopify/event-types.ts`) mais um campo `payment_method` em eventos de order/checkout/payment.

## 7. Semântica de Entrega

- **At-least-once** via QStash. Receivers DEVEM ser idempotentes (usar `X-Worder-Event-Id` como dedup key).
- **Schedule de retry:** 1min → 5min → 30min → 2h → 6h (configurado nas opções do job QStash). Máximo 5 tentativas.
- **Transições de status:**
  - `pending` → `in_flight` (worker reivindica com `UPDATE ... SET status='in_flight', in_flight_until=now()+10s WHERE id=$1 AND status IN ('pending','retrying') RETURNING *` — sem linha retornada significa que outro worker pegou; aborta)
  - `in_flight` → `delivered` (2xx recebido)
  - `in_flight` → `failed` (4xx ≠ 408/429, OU max attempts atingido)
  - `in_flight` → `retrying` (5xx, 408, 429, timeout, erro de rede; `next_retry_at` setado; QStash agenda retry)
  - `in_flight` → `pending` (sweeper, se `in_flight_until < now()` e o worker nunca registrou outcome — lease da reivindicação expirou)
- **Concorrência:** a reivindicação atômica acima é a fonte de verdade. `UPDATE ... RETURNING` com o guard de status é single-statement atômico no Postgres e impede dois workers de ambos fazerem POST. O QStash dá best-effort de single-delivery por mensagem, mas a reivindicação é a garantia durável.
- **Timeout:** 10s por requisição (bate com o lease `in_flight_until`).
- **Truncamento de body:** `response_body` truncado em 2KB.
- **Limite de tamanho de payload:** 256KB máximo (limite default do QStash). O `payload-builder` aplica isso. Estratégia quando excede:
  - Pra `order.*` com muitos `items[]`: trunca pros primeiros 100 itens e adiciona marker `_truncated: { items: true, original_count: N }` no payload.
  - Pros outros eventos: emite payload enxuto só com IDs e flag `_truncated: true`; integrador pode buscar dados completos via API do Worder. Logado como warning.
- **Sweeper de entregas presas:** `/api/cron/webhook-deliveries-sweeper` roda a cada 5min. Reenfileira linhas onde `status IN ('pending','retrying','in_flight')` AND (`last_attempt_at IS NULL` OR `last_attempt_at < now() - interval '5 min'`) AND (`in_flight_until IS NULL` OR `in_flight_until < now()`). Cobre o caso raro do dispatcher conseguir INSERT mas o enqueue do QStash falhar.
- **Purge (LGPD):** `/api/cron/webhook-deliveries-prune` roda diário, deleta linhas em `delivered`/`failed` com mais de 30 dias.

## 8. Auditoria de Handlers (instrumentação no EventBus)

| Handler | Hoje | Mudança v1 |
|---|---|---|
| `shopify/route.ts` — `processOrderCreated/Paid/Fulfilled/Cancelled` | Emite no EventBus | Adicionar emit de `customer.created` na primeira criação de contato em `syncContactFromShopify` |
| `shopify/route.ts` — `processFulfillmentEvent` (linha 1081) | Só grava CDP event | Adicionar `EventBus.emit(SHIPMENT_TRACKING_CREATED, ...)` quando `tracking_number` presente |
| `abandoned-cart.ts:35` — `detectAbandonedCarts` | Só grava CDP event | Adicionar `EventBus.emit(CHECKOUT_ABANDONED, ...)` sempre; condicionalmente emitir `PAYMENT_PIX_ABANDONED` ou `PAYMENT_BOLETO_ABANDONED` baseado no `payment_gateway` armazenado |
| `browse-abandoned/detector.ts` (novo) | n/a | Emite `BROWSE_ABANDONED` |

Entradas novas no enum `EventType` em `src/lib/events.ts`:
- `SHIPMENT_TRACKING_CREATED = 'shipment.tracking_created'`
- `PAYMENT_PIX_ABANDONED = 'payment.pix.abandoned'`
- `PAYMENT_BOLETO_ABANDONED = 'payment.boleto.abandoned'`
- `BROWSE_ABANDONED = 'browse.abandoned'`

(O `CART_ABANDONED` existente é renomeado/aliasado pra `CHECKOUT_ABANDONED` no contrato de saída — o enum interno fica pra compat.)

## 9. Detector de Browse Abandoned

**Cadência do cron:** a cada 15 minutos via `/api/cron/browse-abandoned`.

**Concorrência:** orgs processadas **sequencialmente** dentro de um único tick. Budget por tick com 100 orgs ativas tá bem abaixo do timeout do cron. Se a carga crescer, migra pra fan-out por org via QStash (fora do escopo v1).

**Algoritmo (por org com pelo menos uma subscription ativa em `browse.abandoned`):**

```
1. Query contact_events WHERE
     event_type = 'viewed_product'
     AND created_at BETWEEN (now - 4h) AND (now - 30min)
     AND organization_id = $1
   (joined com LEFT pra filtrar contatos com add_to_cart/placed_order
    subsequente em uma só query — ver SQL abaixo)

2. Pra cada linha candidata, tenta:
     INSERT INTO browse_abandoned_emissions
       (organization_id, contact_id, product_id, view_event_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (contact_id, product_id, view_event_id) DO NOTHING
     RETURNING id
   Se retorna linha → primeira emissão, dispara EventBus.emit(BROWSE_ABANDONED, payload).
   Se NULL → já emitido, pula.

3. EventBus.emit aciona o outbound dispatcher no mesmo processo.
```

**Por que tabela dedicada (não markers em `contact_events`):**
- `INSERT ... ON CONFLICT DO NOTHING RETURNING` é o **gate atômico de emissão** — sem race condition mesmo se dois ticks sobreporem.
- Mantém `contact_events` limpa de markers sintéticos (queries de segmentação/automação não precisam filtrar isso).
- Lookup O(1) via constraint unique vs. scan O(N) em `contact_events`.

**Justificativa da janela:** abaixo de 30min é cedo demais (ainda navegando); acima de 4h é tarde demais pra retargeting. Ambos limites configuráveis via env vars (`BROWSE_ABANDONED_MIN_MIN`, `BROWSE_ABANDONED_MAX_HOURS`).

**Sketch da query de detecção (single bulk query):**
```sql
SELECT v.id, v.contact_id, v.payload->>'product_id' AS product_id, v.created_at
FROM contact_events v
WHERE v.organization_id = $1
  AND v.event_type = 'viewed_product'
  AND v.created_at BETWEEN now() - interval '4 hours' AND now() - interval '30 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM contact_events x
    WHERE x.contact_id = v.contact_id
      AND x.event_type IN ('added_to_cart', 'placed_order')
      AND x.created_at > v.created_at
      AND (x.event_type = 'placed_order' OR x.payload->>'product_id' = v.payload->>'product_id')
  );
```

## 10. UI

**Localização:** `src/app/(dashboard)/settings/webhooks/`

### Tela 1 — Lista (`/settings/webhooks`)

Tabela de subscriptions com: nome, loja, URL, contagem de eventos, status da última entrega (check verde / amarelo / X vermelho). Filtros: loja, status. Ação: `[+ Novo webhook]`.

### Tela 2 — Criar/Editar (`/settings/webhooks/new`, `/[id]/edit`)

Campos do form:
- Nome (texto livre)
- **Loja** (dropdown obrigatório — subscriptions são estritamente por loja)
- URL (validada como https://)
- Eventos (checkboxes agrupados: Pedidos / Checkout & Pagamento / Cliente & Comportamento / Logística)
- Secret (gerado automaticamente na criação, copiável, botão de regenerar)
- Toggle de status (Ativo / Pausado)
- `[Testar entrega]` — manda payload sintético pra URL pra validar

### Tela 3 — Entregas (`/settings/webhooks/[id]/deliveries`)

Tabela das últimas 100 entregas com: ícone de status, event_type, timestamp, response_code, latência. Click numa linha → drawer com requisição completa (URL, headers, body) e response (code, body), lista de tentativas, botão `[Reenviar agora]`.

Ação no topo: `[Reenviar tudo]` (re-enfileira todas as entregas `failed`).

### Estados de empty/erro
- Sem subscriptions ainda → CTA card explicando o que são webhooks + `[Criar primeiro webhook]`.
- Subscription com 5+ falhas seguidas → banner de aviso na lista e detalhe.

## 11. Segurança

### Manuseio do secret
- **Geração:** 32 bytes criptograficamente aleatórios (`crypto.randomBytes(32)`), prefixado com `whsec_` e codificado em base64url.
- **Em repouso:** criptografado via `pgsodium` (preferencial — nativo do Supabase) ou wrapping KMS app-level se pgsodium indisponível. Nunca armazenado em texto puro.
- **Display:** texto puro mostrado **uma vez** na criação num toast one-time-view. UI subsequente mostra só os últimos 6 chars (`whsec_••••••XYZ`).
- **Rotação:** "Regenerar" cria um secret novo; antigo vira `secret_previous` com 24h de graça; header de assinatura inclui ambos durante a janela de graça. Após 24h, o antigo é purgado. UI confirma com "O secret antigo continuará funcionando por 24h pra permitir rollover."

### Validação de URL e defesa SSRF
Validação de URL roda no **create time** E dentro do `safe-fetch` no **delivery time** (defesa contra DNS rebinding — TOCTOU-safe via hook `connect` do Agent do `undici`).

- **Scheme:** só `https://`. (`http://localhost:*` permitido quando `NODE_ENV !== 'production'` pra teste.)
- **Ranges IPv4 bloqueados:** `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (link-local + metadata AWS/GCP/Azure em `169.254.169.254`), `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0/4` (multicast), `240.0.0.0/4` (reservado).
- **Ranges IPv6 bloqueados:** `::1/128` (loopback), `fc00::/7` (unique local), `fe80::/10` (link-local), `::ffff:0:0/96` equivalentes IPv4-mapped privados, `2001:db8::/32` (documentação).
- **Hostnames bloqueados:** `metadata.google.internal`, `metadata.aws.internal`, `metadata.azure.com` (defesa em profundidade — a maioria é pega pelo block de IP, mas DNS pode resolver eles diferente).
- **Implementação:** `safe-fetch.ts` constrói um `Agent` do `undici` com callback `connect` custom que resolve o hostname, valida cada IP retornado contra a blocklist, e rejeita antes de abrir o socket. **Redirects desabilitados** (`redirect: 'manual'`) — se a URL do cliente responder com 3xx, o worker trata como falha não-retentável e expõe o Location do redirect em `error_message`.
- **Nota sobre `fetch` do Node:** o `fetch` built-in do Node não expõe resultados de DNS antes do connect, motivo pelo qual usamos `undici` direto com a opção `dispatcher`.

### Outros
- **RLS:** aplicada em `webhook_subscriptions` E `webhook_deliveries` E `browse_abandoned_emissions` (todas escopadas por org). Service-role só usado pelo dispatcher e worker.
- **Proteção de replay:** janela de 5 minutos de timestamp aplicada do lado do receiver; documentada no guia de integração.
- **Autorização do endpoint de replay:** reenvio manual exige que o usuário seja membro da org dona da subscription (check server-side do JWT do usuário vs. `organization_id` da delivery).
- **Rate limit no endpoint de teste:** 10 entregas de teste por subscription por hora.
- **PII / LGPD:** payloads de `customer.created` e `order.*` contêm PII (nome, email, telefone, possivelmente CPF no endereço de envio). Esse é o propósito explícito da integração. Mitigações:
  - Admins da org devem aceitar consentimento "Payloads de webhook contêm PII" na primeira criação de webhook (modal one-time, registrado em `audit_logs`).
  - Retenção de 30 dias do payload de delivery (§7) é a rede de segurança pra apagamento.
  - Documentação fala explicitamente que o endpoint do integrador é responsável pela conformidade LGPD do lado de quem recebe.

## 12. Testes

### Testes unit
- `outbound-dispatcher.test.ts` — N subscriptions matching → N deliveries inseridas; eventos não-matching ignorados; **mesmo evento de origem disparado 2x → ON CONFLICT DO NOTHING engole duplicata (uma linha por sub)**
- `event-id.test.ts` — derivação determinística; mesma (source, source_event_id, event_type) → mesmo `event_id`
- `signature.test.ts` — HMAC bate com vetores de referência; verify de tempo constante; rejeita body adulterado; **header dual-signature durante rotação aceita ambos**
- `payload-builder.test.ts` — todo event_type produz payload conforme schema; **>256KB dispara estratégia de truncamento corretamente**
- `safe-fetch.test.ts` — bloqueia ranges IPv4 privados, ranges IPv6 privados, hostnames de metadata cloud; tentativas de redirect aparecem como falha
- `secret-store.test.ts` — round-trip encrypt → decrypt; fluxo de rotação (primário/anterior/expiry) avança certo
- `browse-abandoned/detector.test.ts` — bordas da janela, exclusão por add_to_cart, exclusão por order; **ON CONFLICT em `browse_abandoned_emissions` impede emissão dupla em ticks que sobrepõem**
- `worker.test.ts` — reivindicação atômica funciona (dois workers concorrentes, só um processa); 2xx → delivered; 4xx → failed; 5xx → retrying com `next_retry_at`; 4xx 408/429 tratados como retentáveis; lease in_flight expirado liberado pelo sweeper

### Testes de integração
- Endpoint de teste de subscription postando pra mock server (`webhook.site` ou in-process) — confirma que assinatura valida e response 2xx transiciona delivery pra `delivered`
- Idempotência: mesma linha de delivery processada 2x nunca faz POST 2x (check de status no worker)

### Smoke manual
- Criar subscription via UI apontando pra `https://webhook.site/<id>`
- Disparar pedido teste na dev store da Shopify
- Verificar payload recebido, assinatura válida, linha de delivery marcada `delivered`
- Pausar subscription, disparar outro evento, verificar que nenhuma delivery foi criada
- Disparar evento com URL deliberadamente falha (retorna 500), verificar sequência de retry

## 13. Plano de Rollout

| Fase | Escopo | Estimativa |
|---|---|---|
| 1. Fundação | Migrations, dispatcher, worker, HMAC, testes unit | 2-3 dias |
| 2. Cobertura de eventos | Instrumentar 4 handlers (auditoria §8), adicionar entradas novas no EventType | 1-2 dias |
| 3. UI | Lista, criar/editar, log de entregas, drawer, replay, endpoint de teste | 2-3 dias |
| 4. Browse abandoned | Detector + cron + testes | 1-2 dias |
| 5. Docs | Guia público pro integrador (referência de payload, validação HMAC em Node/PHP/Python) | 0.5 dia |

**Total:** ~9-12 dias de trabalho focado.

## 14. Perguntas em Aberto / Trabalho Futuro (pós-v1)

- UI formal de DLQ com reenvio em massa e filtros de data
- Estratégia de versionamento quando schema v2 for necessário
- Inscrições em eventos internos (`automation.triggered`, `deal.stage_changed`, etc.)
- Templates de webhook pras integrações populares (Slack, Discord, Make, n8n) — URL pré-preenchida + eventos selecionados
- Customização de payload por evento (subset de fields)
- Entrega em batch (múltiplos eventos num só POST) — pra integradores de alto volume
- Dashboard de métricas: taxa de sucesso de entrega por subscription, latência p50/p95, top URLs com falha
- Sharding do cron de browse-abandoned por org via QStash fan-out (quando a contagem de orgs exceder o budget de single-tick)
- Propagação ativa de apagamento LGPD (hoje: best-effort via purge de retenção de 30 dias)
