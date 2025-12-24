# 📦 Shopify Backend - Arquivos Criados/Modificados

## 📁 Estrutura de Arquivos

```
src/
├── lib/
│   ├── queue.ts                              ← MODIFICADO (adicionado enqueueShopifyWebhook)
│   │
│   └── services/
│       └── shopify/
│           ├── index.ts                      ← CRIADO (exportações)
│           ├── types.ts                      ← CRIADO (tipos TypeScript)
│           ├── contact-sync.ts               ← CRIADO (sincronização de contatos)
│           ├── deal-sync.ts                  ← CRIADO (sincronização de deals)
│           ├── webhook-processor.ts          ← CRIADO (processador de webhooks)
│           │
│           └── jobs/
│               ├── abandoned-cart.ts         ← CRIADO (detecção de carrinhos abandonados)
│               └── reconciliation.ts         ← CRIADO (reconciliação de dados)
│
└── app/
    └── api/
        ├── integrations/
        │   └── shopify/
        │       └── webhook/
        │           └── route.ts              ← MODIFICADO (agora enfileira)
        │
        ├── workers/
        │   └── shopify-webhook/
        │       └── route.ts                  ← CRIADO (processa fila)
        │
        └── cron/
            └── shopify/
                └── route.ts                  ← CRIADO (jobs agendados)
```

## 📋 Descrição de Cada Arquivo

### 1. `src/lib/queue.ts` (MODIFICADO)
- **O que mudou:** Adicionada função `enqueueShopifyWebhook()` e tipo `ShopifyWebhookJob`
- **Função:** Enfileira webhooks do Shopify para processamento assíncrono via QStash

### 2. `src/lib/services/shopify/types.ts` (CRIADO)
- **Função:** Define todos os tipos TypeScript para a integração
- **Conteúdo:** `ShopifyStoreConfig`, `ShopifyCustomer`, `ShopifyOrder`, `ShopifyCheckout`, etc.

### 3. `src/lib/services/shopify/contact-sync.ts` (CRIADO)
- **Função:** Sincroniza clientes do Shopify com contatos do CRM
- **Features:**
  - Cria ou atualiza contatos por email/telefone
  - Determina tipo (lead/customer) baseado na configuração
  - Converte lead → customer quando compra
  - Normaliza telefones para formato brasileiro

### 4. `src/lib/services/shopify/deal-sync.ts` (CRIADO)
- **Função:** Cria e gerencia deals no pipeline
- **Features:**
  - Cria deals para novos pedidos
  - Move deals entre estágios baseado em eventos
  - Marca deals como ganhos/perdidos
  - Cria deals para carrinhos abandonados

### 5. `src/lib/services/shopify/webhook-processor.ts` (CRIADO)
- **Função:** Processa webhooks recebidos da fila
- **Eventos tratados:**
  - `customers/create`, `customers/update`
  - `orders/create`, `orders/paid`, `orders/fulfilled`, `orders/cancelled`
  - `checkouts/create`, `checkouts/update`
  - `app/uninstalled`

### 6. `src/lib/services/shopify/index.ts` (CRIADO)
- **Função:** Arquivo de exportação central

### 7. `src/lib/services/shopify/jobs/abandoned-cart.ts` (CRIADO)
- **Função:** Job que detecta carrinhos abandonados
- **Lógica:** Checkouts pendentes há mais de 1 hora sem pedido = abandonado
- **Frequência recomendada:** A cada 30 minutos

### 8. `src/lib/services/shopify/jobs/reconciliation.ts` (CRIADO)
- **Função:** Sincroniza dados que podem ter sido perdidos
- **Features:**
  - Busca clientes/pedidos atualizados desde última sync
  - Verifica saúde dos webhooks
  - Re-registra webhooks deletados
- **Frequência recomendada:** A cada 1 hora

### 9. `src/app/api/integrations/shopify/webhook/route.ts` (MODIFICADO)
- **O que mudou:** Agora enfileira no QStash em vez de processar direto
- **Função:** Recebe webhooks do Shopify e responde em < 1 segundo
- **Segurança:** Valida HMAC, verifica duplicatas (idempotência)

### 10. `src/app/api/workers/shopify-webhook/route.ts` (CRIADO)
- **Função:** Worker que processa webhooks da fila
- **Chamado por:** QStash (assíncrono)
- **Timeout:** 60 segundos (tempo suficiente para processar)

### 11. `src/app/api/cron/shopify/route.ts` (CRIADO)
- **Função:** Endpoint para jobs agendados
- **Jobs disponíveis:**
  - `?job=abandoned` - Detectar carrinhos abandonados
  - `?job=reconcile` - Reconciliar dados
  - `?job=health` - Verificar webhooks
  - `?job=cleanup` - Limpar eventos antigos

## 🚀 Como Instalar

1. Extraia o ZIP na raiz do seu projeto
2. Os arquivos vão para as pastas corretas automaticamente
3. Reinicie o servidor

## ⚙️ Configuração Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/shopify?job=abandoned",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/shopify?job=reconcile", 
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/shopify?job=health",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/shopify?job=cleanup",
      "schedule": "0 3 * * *"
    }
  ]
}
```
