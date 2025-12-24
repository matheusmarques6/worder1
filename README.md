# 🛒 Shopify Integration - COMPLETO

## ✅ O que está implementado:

### 1. Registro automático de webhooks
Quando o cliente conecta a loja, os webhooks são registrados automaticamente.

### 2. Criação automática de contatos
Quando um cliente é criado ou faz um pedido no Shopify:
- ✅ Contato é criado/atualizado no CRM
- ✅ Tags automáticas são adicionadas
- ✅ Estatísticas são atualizadas (pedidos, valor total)

### 3. Criação automática de deals na pipeline
Quando um pedido é feito:
- ✅ Deal é criado na pipeline configurada
- ✅ Deal é movido entre estágios conforme status do pedido
- ✅ Deal é marcado como ganho quando pago
- ✅ Deal é marcado como perdido quando cancelado

### 4. Monitoramento de webhooks
A cada 6 horas:
- ✅ Verifica se webhooks existem
- ✅ Corrige URLs erradas
- ✅ Recria webhooks deletados
- ✅ Notifica se teve correções

## 📁 Arquivos

```
src/
├── app/api/
│   ├── integrations/shopify/callback/route.ts  ← OAuth + registro webhooks
│   ├── webhooks/shopify/route.ts               ← Handler principal (NOVO!)
│   ├── cron/shopify/route.ts                   ← Jobs agendados
│   └── shopify/
│       ├── debug/route.ts                      ← Diagnóstico
│       └── webhooks/register/route.ts          ← Registro manual
│
└── lib/services/shopify/jobs/
    └── reconciliation.ts                       ← Health check + auto-fix
```

## 🔄 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CLIENTE FAZ PEDIDO                              │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Shopify envia webhook → /api/webhooks/shopify                       │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│  1. Valida assinatura HMAC                                           │
│  2. Verifica idempotência (não processar duplicado)                  │
│  3. Cria/atualiza CONTATO                                            │
│  4. Cria/atualiza DEAL na pipeline                                   │
│  5. Emite evento para AUTOMAÇÕES                                     │
│  6. Cria NOTIFICAÇÃO                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## 🚀 Como instalar

### 1. Extraia o ZIP na raiz do projeto

### 2. Configure a pipeline na interface
Vá em `/integrations` → Shopify → Configurar:
- Selecione o **Pipeline padrão**
- Selecione o **Estágio inicial**
- Habilite os eventos desejados

### 3. Corrija os webhooks existentes (única vez)
```
/api/cron/shopify?job=health
```

### 4. Configure o cron (vercel.json)
```json
{
  "crons": [
    {
      "path": "/api/cron/shopify?job=health",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/shopify?job=abandoned",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

## 📊 Eventos processados

| Evento | O que faz |
|--------|-----------|
| `customers/create` | Cria contato + deal (se pipeline configurado) |
| `customers/update` | Atualiza contato |
| `orders/create` | Cria contato + deal + salva pedido + notificação |
| `orders/paid` | Move deal para estágio "pago" ou marca como ganho |
| `orders/fulfilled` | Move deal para estágio "enviado" |
| `orders/cancelled` | Marca deal como perdido |
| `checkouts/create` | Salva checkout (para detectar abandono) |
| `app/uninstalled` | Desativa integração |

## 🔍 Diagnóstico

Para ver o status completo:
```
/api/shopify/debug?organizationId=SEU_ORG_ID
```

## ⚠️ Requisitos

1. **Pipeline configurado** - Sem pipeline, deals não são criados
2. **NEXT_PUBLIC_APP_URL** - URL pública para webhooks
3. **Em localhost** - Use ngrok ou similar

## 📝 Notas

- Webhooks são registrados automaticamente na conexão
- Se alguém deletar um webhook, ele é recriado em até 6 horas
- Notificações são criadas para novos clientes e pedidos
- O sistema é idempotente (não processa eventos duplicados)
