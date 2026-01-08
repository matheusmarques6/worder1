# FLOW BUILDER V3 - BACKEND & EXECUÇÃO

## Visão Geral

O sistema de execução de automações funciona através de um pipeline de eventos:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SQL Trigger   │────▶│   Event Logs    │────▶│  Event Processor│
│  (no Supabase)  │     │   (tabela)      │     │  (Node.js)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ Automation Run  │◀────│  Find Matching  │
                        │   (execução)    │     │  Automations    │
                        └─────────────────┘     └─────────────────┘
                                │
                        ┌───────┴───────┐
                        ▼               ▼
               ┌─────────────┐  ┌─────────────┐
               │   QStash    │  │   Direto    │
               │  (com delay)│  │ (fallback)  │
               └─────────────┘  └─────────────┘
                        │               │
                        └───────┬───────┘
                                ▼
                        ┌─────────────────┐
                        │  Worker API     │
                        │ /api/workers/   │
                        │   automation    │
                        └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │ Execution Engine│
                        │ (node-by-node)  │
                        └─────────────────┘
```

## Componentes

### 1. SQL Triggers (Supabase)

**Arquivo:** `supabase/migrations/20260108_automation_triggers.sql`

Triggers que disparam automaticamente quando dados mudam:

| Trigger | Evento | Descrição |
|---------|--------|-----------|
| `on_contact_created` | `contact.created` | Novo contato criado |
| `on_tag_added` | `tag.added` | Tag adicionada a contato |
| `on_deal_created` | `deal.created` | Deal criado |
| `on_deal_stage_changed` | `deal.stage_changed` | Deal mudou de estágio |
| `on_deal_won` | `deal.won` | Deal marcado como ganho |
| `on_deal_lost` | `deal.lost` | Deal marcado como perdido |

### 2. Event Logs (Tabela)

Armazena todos os eventos para processamento:

```sql
CREATE TABLE event_logs (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  contact_id UUID,
  deal_id UUID,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ
);
```

### 3. EventBus (Node.js)

**Arquivo:** `src/lib/events.ts`

Sistema central de eventos que:
- Recebe eventos de webhooks externos (Shopify, etc.)
- Registra eventos no log
- Encontra automações correspondentes
- Cria automation_runs

### 4. Event Processor

**Arquivo:** `src/lib/automation/event-processor.ts`

Processa eventos pendentes:
- Busca eventos não processados
- Encontra automações que correspondem
- Cria runs e enfileira para execução

### 5. Workers

| Worker | Endpoint | Descrição |
|--------|----------|-----------|
| Automation | `/api/workers/automation` | Executa automações completas |
| Step | `/api/workers/automation-step` | Executa steps após delays |
| Process Events | `/api/workers/process-events` | Processa eventos pendentes |

### 6. Execution Engine

**Arquivo:** `src/lib/automation/execution-engine.ts`

Motor que executa os nós da automação:
- Percorre o grafo de nós
- Executa cada nó (ação/condição)
- Gerencia contexto e variáveis
- Suporta delays e condições

## Fluxo de Execução

### 1. Evento Ocorre

```typescript
// Via SQL Trigger (automático)
// Quando um deal muda de estágio, o trigger dispara:
PERFORM emit_automation_event(
  NEW.organization_id,
  'deal.stage_changed',
  NEW.contact_id,
  NEW.id,
  jsonb_build_object(...)
);

// Via EventBus (manual/webhook)
await EventBus.emit(EventType.ORDER_PAID, {
  organization_id: storeConfig.organization_id,
  contact_id: contact.id,
  data: orderData,
});
```

### 2. Evento é Processado

O cron job (Vercel Cron) ou QStash chama `/api/workers/process-events`:

```typescript
// Buscar eventos pendentes
const events = await supabase
  .from('event_logs')
  .select('id')
  .eq('processed', false)
  .limit(100);

// Processar cada um
for (const event of events) {
  await EventProcessor.processEvent(event.id);
}
```

### 3. Automações São Encontradas

```sql
-- Função SQL que encontra automações correspondentes
SELECT * FROM find_matching_automations(
  p_organization_id,
  p_event_type,
  p_payload
);
```

### 4. Run é Criado e Enfileirado

```typescript
// Criar run no banco
const run = await supabase
  .from('automation_runs')
  .insert({
    automation_id: automationId,
    status: 'pending',
    metadata: { trigger_data, contact_id, ... }
  });

// Enfileirar via QStash (ou direto)
await enqueueAutomationRun(run.id);
```

### 5. Worker Executa

O worker busca o run e executa:

```typescript
// Buscar run com automação
const { data: run } = await supabase
  .from('automation_runs')
  .select('*, automations(*)')
  .eq('id', runId)
  .single();

// Executar workflow
const result = await executeWorkflow(workflow, {
  triggerData: run.metadata.trigger_data,
  contactId: run.contact_id,
});
```

## Delays (Esperas)

Quando um nó de delay é encontrado:

1. **Run entra em status 'waiting'**
2. **QStash agenda o próximo step**
3. **Cron verifica runs em waiting**
4. **Quando o tempo passa, run é retomado**

```typescript
// Agendar delay de 2 horas
await enqueueAutomationStep(
  runId,
  nextNodeId,
  context,
  2 * 60 * 60 // segundos
);

// Atualizar run
await supabase
  .from('automation_runs')
  .update({
    status: 'waiting',
    waiting_until: new Date(Date.now() + 2 * 60 * 60 * 1000)
  });
```

## Cron Jobs

Configurados no `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/workers/process-events",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/check-delayed-runs",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

| Job | Frequência | Descrição |
|-----|------------|-----------|
| process-events | A cada minuto | Processa eventos pendentes |
| check-delayed-runs | A cada 5 min | Retoma runs em espera |

## Variáveis de Ambiente

```env
# QStash (Upstash) - Para filas e delays
QSTASH_TOKEN=xxx
QSTASH_CURRENT_SIGNING_KEY=xxx
QSTASH_NEXT_SIGNING_KEY=xxx

# Cron Secret (Vercel)
CRON_SECRET=xxx

# App URL
NEXT_PUBLIC_APP_URL=https://app.worder.com.br
```

## APIs

### Histórico de Execuções

```
GET /api/automations/runs
GET /api/automations/runs?automationId=xxx
GET /api/automations/runs?runId=xxx&includeSteps=true
```

### Retry/Cancel

```
POST /api/automations/runs
{
  "action": "rerun",
  "runId": "xxx"
}
```

## Mapeamento de Eventos

| Event Type | Trigger Type |
|------------|--------------|
| `contact.created` | `trigger_signup` |
| `tag.added` | `trigger_tag` |
| `deal.created` | `trigger_deal_created` |
| `deal.stage_changed` | `trigger_deal_stage` |
| `deal.won` | `trigger_deal_won` |
| `deal.lost` | `trigger_deal_lost` |
| `order.created` | `trigger_order` |
| `order.paid` | `trigger_order_paid` |
| `webhook.received` | `trigger_webhook` |

## Debugging

### Ver logs de eventos

```sql
SELECT * FROM event_logs
ORDER BY created_at DESC
LIMIT 50;
```

### Ver runs pendentes

```sql
SELECT 
  r.id,
  r.status,
  r.started_at,
  r.waiting_until,
  a.name as automation_name
FROM automation_runs r
JOIN automations a ON a.id = r.automation_id
WHERE r.status IN ('pending', 'running', 'waiting')
ORDER BY r.started_at DESC;
```

### Reprocessar evento manualmente

```bash
curl -X POST https://app.worder.com.br/api/workers/process-events \
  -H "Content-Type: application/json" \
  -H "X-Internal-Request: true" \
  -d '{"eventId": "xxx"}'
```
