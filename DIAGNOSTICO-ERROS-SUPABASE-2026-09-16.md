# 🔥 Diagnóstico dos erros do Postgres — 16/09/2026

Análise de 20 erros do log do Supabase (janela 19:00–19:51, projeto `Worder CRM`
/ `rqpmoavktzvxfcfsdkcc`). Cada item foi confirmado contra o banco de produção,
não só contra o código.

**Resultado: 3 problemas reais e 1 falso alarme.**

| Código  | Qtd | Erro                                    | Veredito                                |
| ------- | --- | --------------------------------------- | --------------------------------------- |
| `57014` | 9   | statement timeout                       | 🔴 Crítico — seq scan em `contact_events` |
| `23502` | 2   | `notifications.user_id` null            | 🔴 Crítico — alertas jogados fora        |
| `42703` | 2   | `shopify_products.description` não existe | 🟡 Migração nunca aplicada              |
| `23505` | 7   | duplicate key                           | 🟢 Funcionando como projetado            |

---

## 1. 🔴 Timeouts: `contact_events` não tem índice em `store_id`

A tabela tem **64.789 linhas / 191 MB**. O `EXPLAIN ANALYZE` rodado em produção:

```
Seq Scan on contact_events  (actual rows=0)
  Filter: (event_source = ANY (...) AND store_id = ...)
  Rows Removed by Filter: 64789
Execution Time: 4071.695 ms
```

**4 segundos varrendo a tabela inteira para devolver zero linhas.** Não existe
nenhum índice com `store_id`. O `statement_timeout` é 2 min; com concorrência
essas queries se enfileiram e estouram — daí os 9 timeouts, alguns em pares
(19:23:36 + 19:23:53, 19:10:48 + 19:10:52).

Custo acumulado, do `pg_stat_statements`:

| Chamadas | Total       | Query                                     | Origem                                              |
| -------- | ----------- | ----------------------------------------- | --------------------------------------------------- |
| 12.292   | **29.583 s** | `store_id + event_source = ANY(...)`      | `src/app/api/integrations/shopify/status/route.ts:113` |
| 9.438    | **13.883 s** | `SELECT * ... event_type + occurred_at <` | `src/app/api/workers/abandoned-cart/route.ts:40`     |
| 5.027    | **10.707 s** | `store_id + event_source = $2`            | `src/app/api/integrations/shopify/status/route.ts:126` |

**~15 horas de CPU de banco** queimadas nessas três queries.

Dois agravantes:

- `src/app/(dashboard)/integrations/shopify/install-pixel/page.tsx:136` faz
  polling **a cada 4 s** por 3 minutos, e `tracking-debug/page.tsx:145` a cada
  5 s. Cada tick dispara um seq scan.
- O worker de abandoned-cart usa `SELECT *` (o JSONB `properties` pesa ~1,2 KB
  por linha) e filtra por `event_type + occurred_at`. O índice existente é
  `(organization_id, event_type, occurred_at)` — como a query **não** filtra por
  `organization_id`, a coluna líder não serve e o índice é inútil.

### SQL

⚠️ `CREATE INDEX CONCURRENTLY` **não roda dentro de transação**, e migração do
Supabase roda em transação. Rodar direto no SQL Editor, ou tirar o
`CONCURRENTLY` na migração aceitando o lock de escrita (com 64k linhas é rápido,
mas trava INSERT enquanto constrói).

```sql
-- Mata os dois seq scans de status/route.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_store_source
  ON public.contact_events (store_id, event_source);

-- Mata o seq scan do worker de abandoned-cart
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_type_occurred
  ON public.contact_events (event_type, occurred_at DESC);
```

Opcional, mais agressivo para o abandoned-cart (índice parcial só com as linhas
ainda não processadas — fica pequeno, mas quebra se o nome da flag mudar):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_abandoned_pendente
  ON public.contact_events (event_type, occurred_at)
  WHERE (properties->'abandoned_cart_processed') IS NULL
     OR (properties->>'abandoned_cart_processed') = 'false';
```

### No código

- `status/route.ts:113` e `:126` usam `count: 'exact'` mas só checam `> 0`.
  Trocar por `head: true` + `.limit(1)` — não precisa contar 64 mil linhas para
  saber se existe pelo menos uma.
- `install-pixel/page.tsx:136`: subir o intervalo de 4 s para algo como 15 s.

---

## 2. 🔴 `notifications`: nenhum alerta jamais foi gravado

Schema real: `user_id` é `NOT NULL` e `organization_id` é `NOT NULL`.

A prova do estrago, de `pg_stat_user_tables`:

```
notifications → n_live_tup = 0
```

**Zero linhas. Nunca entrou uma.**

Todos os inserts auditados:

| Arquivo                                          | `user_id` | `organization_id` |
| ------------------------------------------------ | --------- | ----------------- |
| `src/app/api/cron/whatsapp-dead-alert/route.ts:81`       | ❌ | ❌ |
| `src/app/api/cron/whatsapp-webhook-heartbeat/route.ts:91` | ❌ | ✅ |
| `src/app/api/workers/whatsapp-ai-respond/route.ts:266`    | ❌ | ✅ |
| `src/lib/ai/cloud-runner.ts:71`                           | ❌ | ✅ |
| `src/lib/ai/cloud-runner.ts:231`                          | ❌ | ✅ |

### O que os 2 erros do log contam

Às 19:00:36 e 19:30:36 — cadência de 30 min, que é o cron `*/30` do
`whatsapp-webhook-heartbeat` — sempre o mesmo par, com ~190 ms de intervalo:

1. `.479` → `23505` em `idx_whatsapp_alerts_dedup` (já existe alerta aberto, o
   dedup funcionando)
2. `.668` → `23502` no insert de `notifications`
   (`whatsapp-webhook-heartbeat/route.ts:91`)

Ou seja: **uma conta de WhatsApp está há horas sem receber webhooks, o sistema
detectou corretamente, e a notificação para o lojista é descartada a cada 30
minutos.** Silenciosamente — o código faz `if (notifErr) wlog.warn(...)` e segue.
O sistema de alerta está morto justamente quando tem algo para alertar.

### Cuidado ao corrigir: tornar `user_id` nullable NÃO resolve sozinho

O caminho de leitura em `src/app/api/notifications/route.ts:38-42` filtra
estrito:

```ts
.eq('user_id', userId)
.eq('organization_id', organizationId)
```

Uma notificação com `user_id` null nunca apareceria para ninguém — o sino
continuaria vazio. Duas saídas:

**Opção A (recomendada) — fan-out por usuário.** Mantém o schema e o caminho de
leitura como estão. Já existe precedente no código:
`src/lib/automation/node-executors.ts:1859` e
`src/app/api/whatsapp/inbox/contacts/[id]/comments/route.ts:229` já fazem
`.insert(array)`.

```ts
const { data: membros } = await supabaseAdmin
  .from('profiles')
  .select('id')
  .eq('organization_id', organizationId)
  .in('role', ['owner', 'admin'])

if (membros?.length) {
  await supabaseAdmin.from('notifications').insert(
    membros.map((m) => ({
      organization_id: organizationId,
      user_id: m.id,
      type: 'whatsapp_webhook_dead',
      title: '...',
      message: '...',
    }))
  )
}
```

**Opção B — `user_id` nullable + ajustar a leitura.** Menos linhas gravadas por
alerta, mas exige mexer nos dois lados:

```sql
ALTER TABLE public.notifications ALTER COLUMN user_id DROP NOT NULL;
```

```ts
// notifications/route.ts — passa a aceitar notificação de sistema (sem dono)
.or(`user_id.eq.${userId},user_id.is.null`)
```

### Já verificado, não precisa mexer

- `action_url` e `action_label` **existem** na tabela (usados no
  `heartbeat/route.ts:96`) — corrigir `user_id` não vai revelar um segundo erro.
- O CHECK de `type` **já aceita** todos os tipos de sistema:
  `whatsapp_campaign_worker_stalled`, `whatsapp_webhook_dead`,
  `whatsapp_dead_events`, `whatsapp_ai_disabled`, `whatsapp_ai_gave_up`,
  `whatsapp_ai_media_handoff`. O bloqueio é só o `user_id`.

---

## 3. 🟡 `shopify_products.description`: migração na pasta errada

A migração existe em
`supabase/migrations-archive/20260508_shopify_products_description.sql` — em
**`migrations-archive/`, não em `migrations/`**, então nunca rodou. Confirmado no
banco: `description`, `body_html` e `collections` não existem.

`src/lib/cdp/enrich-shopify-event.ts:272` pede essas colunas via `COLUNAS_NOVAS`
e *tem* fallback (linha ~322), mas o flag `colunasNovasDisponiveis` é
**module-level, ou seja, por processo**. Na Vercel cada cold start reseta para
`true` — por isso os 2 erros a 12 ms de distância: dois lambdas frios tentando ao
mesmo tempo. O fallback funciona, mas toda instância nova paga um erro antes de
aprender.

**Impacto:** degradação silenciosa — e-mails de recuperação de carrinho perdem
descrição e categoria do produto.

**Correção:** mover o arquivo para `supabase/migrations/` (renomeando com
timestamp coerente com a sequência atual, que já está em `20260910xxxxxx`) e
aplicar. O conteúdo já é idempotente (`ADD COLUMN IF NOT EXISTS`) e já dá
`NOTIFY pgrst, 'reload schema'` no fim.

Depois de aplicar, o fallback em `enrich-shopify-event.ts` pode continuar — não
atrapalha e protege banco de dev que não recebeu a migração.

---

## 4. 🟢 Os 7 `23505` não são bug

Os três constraints são guardas de corrida e **os três já estão tratados**:

| Constraint                          | Qtd | Tratamento                                                        |
| ----------------------------------- | --- | ----------------------------------------------------------------- |
| `uq_email_sends_dedupe_key`         | 2   | `src/lib/email/send-campaign-email.ts:198` → retorna `skipped: true` |
| `contact_events_idempotency_key_key` | 3   | `src/app/api/tracking/shopify-webhook/route.ts:235` → evita double-count de receita |
| `idx_whatsapp_alerts_dedup`         | 2   | `src/lib/whatsapp/alerts.ts:48` → retorna silenciosamente          |

São retries do Shopify e execuções concorrentes batendo na trava — exatamente o
comportamento desejado. O Postgres loga mesmo assim.

**Não corrigir a lógica.** O único custo é ruído que esconde erro de verdade. Se
incomodar, dá para silenciar trocando o `insert` por
`upsert(..., { onConflict: '...', ignoreDuplicates: true })`, que não gera o erro
no log. Baixa prioridade.

---

## 5. 🟡 Bônus: índices duplicados em `contact_events`

Achado no caminho. **Todos** os índices estão duplicados, e o de
`idempotency_key` está **triplicado**:

| Manter                          | Dropar                                  | Tamanho cada |
| ------------------------------- | --------------------------------------- | ------------ |
| `contact_events_idempotency_key_key` (UNIQUE) | `idx_ce_idempotency` + `idx_contact_events_idempotency` | 9,3 MB |
| `idx_ce_type`                   | `idx_contact_events_type`               | 6,8 MB       |
| `idx_ce_org_occurred`           | `idx_contact_events_org_occurred`       | 4,4 MB       |
| `idx_ce_contact`                | `idx_contact_events_contact`            | 3,5 MB       |
| `idx_ce_anon`                   | `idx_contact_events_anonymous`          | 2,6 MB       |
| `idx_ce_session`                | `idx_contact_events_session`            | 2,3 MB       |
| `idx_ce_shopify`                | `idx_contact_events_shopify_resource`   | 0,9 MB       |

Mantive o padrão `idx_ce_*` porque os dois índices mais novos (`idx_ce_visitor`,
`idx_ce_fingerprint`) só existem nesse formato — é a convenção atual.

Os dois índices simples de `idempotency_key` são redundantes com o UNIQUE, que já
atende busca por essa coluna.

**Ganho:** ~35 MB dos 70 MB de índice, e todo INSERT passa a escrever 10 índices
em vez de 18.

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_ce_idempotency;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_idempotency;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_type;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_org_occurred;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_contact;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_anonymous;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_session;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_contact_events_shopify_resource;
```

---

## ✅ Checklist de implementação

Sugestão de ordem — 1 e 2 são os que estão causando dano agora.

- [ ] **1.** Criar `idx_ce_store_source` e `idx_ce_type_occurred` (seção 1)
- [ ] **2.** Corrigir `user_id` nos 5 inserts de `notifications` (seção 2, opção A ou B)
- [ ] **3.** Dropar os 8 índices duplicados (seção 5)
- [ ] **4.** Mover a migração de `description` para `supabase/migrations/` e aplicar (seção 3)
- [ ] **5.** Trocar `count: 'exact'` por `head + limit(1)` em `status/route.ts:113` e `:126` (seção 1)
- [ ] **6.** Subir o polling de 4 s em `install-pixel/page.tsx:136` (seção 1)
- [ ] **7.** *(opcional, baixa)* Silenciar os `23505` com `upsert + ignoreDuplicates` (seção 4)

### Como verificar que 1 funcionou

```sql
-- Antes: Seq Scan, ~4000 ms. Depois: Index Scan, poucos ms.
EXPLAIN ANALYZE
SELECT count(*) FROM contact_events
WHERE store_id = '<uuid>' AND event_source = ANY(ARRAY['worder_pixel','shopify_pixel','pixel']);

-- Zerar a contagem e reobservar o custo acumulado depois de algumas horas
SELECT pg_stat_statements_reset();
```

### Como verificar que 2 funcionou

```sql
-- Hoje retorna 0. Depois da correção tem que crescer a cada alerta.
SELECT count(*) FROM notifications;
```
