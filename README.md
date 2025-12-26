# 🚀 Pipeline Automation System - Pacote Completo Final

Sistema completo de automações por pipeline que permite configurar quais eventos de cada integração (Shopify, WhatsApp, etc) criam deals automaticamente em pipelines específicas.

---

## 📊 Visão Geral

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│    SHOPIFY          WHATSAPP          HOTMART         WEBHOOK        │
│       │                │                 │               │           │
│       └────────────────┴─────────────────┴───────────────┘           │
│                                │                                     │
│                         ┌──────▼──────┐                              │
│                         │ RULE ENGINE │                              │
│                         └──────┬──────┘                              │
│                                │                                     │
│           ┌────────────────────┼────────────────────┐                │
│           │                    │                    │                │
│     ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐          │
│     │ Pipeline  │        │ Pipeline  │        │ Pipeline  │          │
│     │  Vendas   │        │ Abandono  │        │   Leads   │          │
│     └───────────┘        └───────────┘        └───────────┘          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Estrutura do Pacote

```
deploy-automation-final/
│
├── supabase/migrations/
│   └── pipeline-automation-rules.sql     # Tabelas + Funções + RLS
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── pipelines/[id]/
│   │   │   │   ├── automations/
│   │   │   │   │   ├── route.ts          # GET/POST regras
│   │   │   │   │   └── [ruleId]/
│   │   │   │   │       └── route.ts      # GET/PUT/DELETE regra
│   │   │   │   └── transitions/
│   │   │   │       └── route.ts          # CRUD transições
│   │   │   │
│   │   │   ├── integrations/
│   │   │   │   └── connected/
│   │   │   │       └── route.ts          # Lista integrações ativas
│   │   │   │
│   │   │   └── whatsapp/cloud/webhook/
│   │   │       └── route.ts              # Webhook WhatsApp + RuleEngine
│   │   │
│   │   └── (dashboard)/crm/pipelines/
│   │       └── page.tsx                  # Página com badges e modal
│   │
│   ├── lib/services/
│   │   ├── automation/
│   │   │   ├── rule-engine.ts            # Motor de processamento
│   │   │   └── index.ts
│   │   └── shopify/
│   │       └── webhook-processor.ts      # Webhook Shopify + RuleEngine
│   │
│   └── components/crm/automation/
│       ├── PipelineAutomationBadges.tsx  # Badges de integração
│       ├── PipelineAutomationConfig.tsx  # Modal de configuração
│       └── index.ts
│
└── README.md
```

---

## 🔧 Instalação

### Passo 1: Executar SQL no Supabase

Abra o **SQL Editor** no Supabase e execute o conteúdo de:
```
supabase/migrations/pipeline-automation-rules.sql
```

Isso cria:
- ✅ Tabela `pipeline_automation_rules`
- ✅ Tabela `pipeline_stage_transitions`
- ✅ Tabela `automation_logs`
- ✅ Funções RPC para buscar regras
- ✅ Triggers para contadores automáticos
- ✅ Políticas RLS de segurança

### Passo 2: Copiar arquivos

```bash
# Extrair
unzip pipeline-automation-final.zip

# Copiar tudo para seu projeto
cp -r deploy-automation-final/src/* seu-projeto/src/
```

### Passo 3: Atualizar exports do CRM

No arquivo `src/components/crm/index.tsx`, adicione no início:
```typescript
// Export automation components
export { PipelineAutomationBadges, PipelineAutomationConfig } from './automation'
```

### Passo 4: Deploy

```bash
cd seu-projeto
git add .
git commit -m "feat: Pipeline automation system"
git push
```

---

## 📝 Eventos Suportados

### 🛒 Shopify

| Evento | Trigger | Descrição |
|--------|---------|-----------|
| Pedido Criado | `order_created` | Novo pedido feito |
| Pedido Pago | `order_paid` | Pagamento confirmado |
| Pedido Enviado | `order_fulfilled` | Saiu para entrega |
| Pedido Entregue | `order_delivered` | Cliente recebeu |
| Pedido Cancelado | `order_cancelled` | Pedido cancelado |
| Carrinho Abandonado | `checkout_abandoned` | Checkout não finalizado |
| Novo Cliente | `customer_created` | Primeiro cadastro |

### 💬 WhatsApp

| Evento | Trigger | Descrição |
|--------|---------|-----------|
| Nova Conversa | `conversation_started` | Cliente inicia conversa |
| Mensagem Recebida | `message_received` | Qualquer mensagem |
| Contato Criado | `contact_created` | Novo contato no CRM |

---

## 🎯 Filtros Disponíveis

### Shopify
```json
{
  "min_value": 100,         // Valor mínimo do pedido
  "max_value": 1000,        // Valor máximo
  "customer_tags": ["vip"], // Cliente deve ter tag
  "exclude_tags": ["teste"] // Excluir clientes com tag
}
```

### WhatsApp
```json
{
  "keywords": ["preço", "orçamento"],  // Palavras na mensagem
  "business_hours_only": true          // 8h-18h apenas
}
```

---

## 🔌 APIs

### Listar Integrações Conectadas
```bash
GET /api/integrations/connected?organizationId=xxx
```

### Listar Regras de uma Pipeline
```bash
GET /api/pipelines/{id}/automations?organizationId=xxx
```

### Criar Regra
```bash
POST /api/pipelines/{id}/automations
Content-Type: application/json

{
  "organizationId": "xxx",
  "name": "Pedidos VIP",
  "sourceType": "shopify",
  "triggerEvent": "order_paid",
  "filters": { "min_value": 500 },
  "initialStageId": "stage-xxx",
  "isEnabled": true
}
```

### Toggle Regra On/Off
```bash
PUT /api/pipelines/{id}/automations/{ruleId}
Content-Type: application/json

{
  "organizationId": "xxx",
  "isEnabled": false
}
```

### Deletar Regra
```bash
DELETE /api/pipelines/{id}/automations/{ruleId}?organizationId=xxx
```

---

## 🎨 Interface

### Página de Pipelines

- Cada pipeline mostra badges coloridos das integrações ativas
- Botão ⚡ para abrir configuração de automações
- Contador de regras ativas

### Modal de Configuração

- Lista todas integrações conectadas
- Mostra regras agrupadas por fonte
- Toggle on/off para cada regra
- Criar/editar/deletar regras
- Filtros visuais específicos por integração

---

## 🔄 Retrocompatibilidade

O sistema é 100% retrocompatível:

| Situação | Comportamento |
|----------|---------------|
| Sem regras configuradas | Usa lógica anterior (pipeline padrão) |
| Com regras configuradas | RuleEngine processa todas as regras |
| Regra desabilitada | Ignora a regra, outras continuam |

---

## 📈 Monitoramento

### Ver Logs de Automação
```sql
SELECT 
  action_type,
  source_type,
  trigger_event,
  success,
  error_message,
  created_at
FROM automation_logs 
WHERE organization_id = 'xxx'
ORDER BY created_at DESC
LIMIT 20;
```

### Estatísticas das Regras
```sql
SELECT 
  name,
  source_type,
  trigger_event,
  deals_created_count,
  last_triggered_at,
  is_enabled
FROM pipeline_automation_rules
WHERE organization_id = 'xxx';
```

---

## ✅ Checklist de Deploy

- [ ] SQL executado no Supabase
- [ ] Arquivos copiados para o projeto
- [ ] Exports adicionados no index.tsx
- [ ] Deploy realizado
- [ ] Testar /api/integrations/connected
- [ ] Criar regra de teste
- [ ] Testar webhook com pedido real
- [ ] Verificar deal criado na pipeline correta

---

## 🧪 Teste Rápido

1. Acesse `/crm/pipelines`
2. Verifique se as pipelines aparecem
3. Clique no ⚡ de uma pipeline
4. Crie uma regra: "Shopify - Pedido Pago - Sem filtros"
5. Faça um pedido teste no Shopify
6. Verifique se o deal foi criado na pipeline configurada

---

## 🎉 Sistema Completo!

| Fase | Descrição | Status |
|------|-----------|--------|
| 1️⃣ | SQL Migration | ✅ |
| 2️⃣ | APIs | ✅ |
| 3️⃣ | Webhooks | ✅ |
| 4️⃣ | Interface UI | ✅ |

O sistema está pronto para uso em produção!
