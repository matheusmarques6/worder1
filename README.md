# 🚀 Sprint 3 - CRM Avançado (tipo edrone)

## 📦 O que está incluído

### 1. Event Tracking
- **API de eventos** (`/api/tracking/events`) - Captura comportamento do cliente
- **Webhook do Shopify** (`/api/tracking/shopify-webhook`) - Eventos automáticos
- **Script de tracking** (`public/tracking.js`) - Pixel para sites

### 2. Segmentação RFM
- **Scores R/F/M** (1-5) calculados automaticamente
- **9 segmentos** pré-definidos: Champions, Loyal, At Risk, Lost, etc.
- **API de analytics** (`/api/analytics/rfm`)

### 3. Segmentos Dinâmicos
- **Estáticos**: Lista manual de contatos
- **Dinâmicos**: Regras com AND/OR (ex: "total_spent > 500")
- **RFM**: Baseado em segmentos RFM (ex: "at_risk" + "cant_lose")

### 4. Playbooks de Automação
- **5 templates prontos**:
  - Carrinho Abandonado
  - Winback (Reativação)
  - Boas-vindas
  - Pós-compra
  - Aniversário
- **Triggers**: Evento, Schedule, Entrada em segmento
- **Steps**: Wait, Send WhatsApp, Condition, etc.

---

## 🗄️ SQL Migration

Execute o arquivo `migration.sql` no **Supabase SQL Editor**.

Cria as tabelas:
- `customer_events` - Eventos de comportamento
- `customer_rfm_scores` - Scores RFM por contato
- `customer_segments` - Segmentos de clientes
- `segment_members` - Membros de segmentos estáticos
- `automation_playbooks` - Playbooks de automação
- `playbook_runs` - Execuções de playbooks
- `revenue_attribution` - Atribuição de receita

---

## 📁 Estrutura de Arquivos

```
sprint3-crm-avancado/
├── migration.sql                              # SQL das tabelas
├── public/
│   └── tracking.js                            # Script de tracking
└── src/
    ├── types/
    │   └── crm.ts                             # Tipos TypeScript
    └── app/api/
        ├── tracking/
        │   ├── events/route.ts                # POST/GET eventos
        │   └── shopify-webhook/route.ts       # Webhook Shopify
        ├── segments/route.ts                  # CRUD segmentos
        ├── playbooks/route.ts                 # CRUD playbooks
        └── analytics/
            └── rfm/route.ts                   # RFM analytics
```

---

## 🔌 Integrações

### Tracking Pixel (sites)

Adicione no `<head>` do site:

```html
<script>
  window.worderConfig = { 
    organizationId: 'SEU_ORG_ID',
    apiUrl: 'https://worder1.vercel.app'
  };
</script>
<script src="https://worder1.vercel.app/tracking.js" async></script>
```

Uso:
```javascript
// Identificar usuário
worder.identify({ email: 'cliente@email.com', phone: '+5511999999999' });

// Visualização de produto
worder.productView({ id: '123', name: 'Camiseta', price: 99.90 });

// Adicionar ao carrinho
worder.addToCart({ id: '123', name: 'Camiseta', price: 99.90, quantity: 1 });

// Compra
worder.purchase({ id: 'order_456', total: 199.80, email: 'cliente@email.com' });
```

### Webhook do Shopify

Configure no Shopify Admin:
1. Settings → Notifications → Webhooks
2. Adicione webhook para:
   - `checkouts/create`
   - `orders/create`
   - `orders/paid`
   - `carts/update`
3. URL: `https://worder1.vercel.app/api/tracking/shopify-webhook`

---

## 📊 APIs

### Event Tracking

```bash
# Registrar evento
POST /api/tracking/events
{
  "organization_id": "xxx",
  "event_type": "product_view",
  "product_id": "123",
  "product_name": "Camiseta",
  "product_price": 99.90,
  "customer_email": "cliente@email.com"
}

# Listar eventos
GET /api/tracking/events?organization_id=xxx&contact_id=yyy
```

### Segmentos

```bash
# Criar segmento dinâmico
POST /api/segments
{
  "organization_id": "xxx",
  "name": "Big Spenders",
  "segment_type": "dynamic",
  "rules": [
    { "field": "total_spent", "operator": "greater_than", "value": 1000 }
  ]
}

# Criar segmento RFM
POST /api/segments
{
  "organization_id": "xxx",
  "name": "Clientes em Risco",
  "segment_type": "rfm",
  "rfm_segments": ["at_risk", "cant_lose"]
}
```

### RFM Analytics

```bash
# Resumo por segmento
GET /api/analytics/rfm?organization_id=xxx&view=summary

# Recalcular scores
POST /api/analytics/rfm
{ "organization_id": "xxx", "period_days": 365 }
```

### Playbooks

```bash
# Listar templates
GET /api/playbooks?templates=true

# Clonar template para organização
POST /api/playbooks
{
  "organization_id": "xxx",
  "template_id": "playbook-abandoned-cart"
}

# Ativar playbook
PATCH /api/playbooks
{ "id": "xxx", "is_active": true }
```

---

## 🎯 Segmentos RFM

| Segmento | R | F | M | Descrição |
|----------|---|---|---|-----------|
| Champions | 4-5 | 4-5 | 4-5 | Melhores clientes |
| Loyal | 3-5 | 3-5 | 3-5 | Clientes fiéis |
| Potential Loyal | 3-5 | 3-5 | 1-2 | Potencial para crescer |
| New Customers | 4-5 | 1-2 | * | Compraram recentemente |
| At Risk | 1-2 | 3-5 | * | Compravam, mas sumiram |
| Can't Lose | 1-2 | 4-5 | 4-5 | Grandes clientes sumindo |
| Hibernating | 1-3 | 1-2 | * | Inativos há muito tempo |
| Lost | 1-2 | 1-2 | 1-2 | Perdidos |

---

## 🔄 Fluxo de Automação

```
[Evento] → [Trigger] → [Playbook Run] → [Steps] → [Conversão]
    ↓           ↓            ↓              ↓           ↓
checkout    abandoned    criar run     wait 1h      atribuir
started       cart       para         send msg     receita
            playbook    contato      condition
```

---

## ⚙️ Próximos Passos

1. **Executar migration.sql** no Supabase
2. **Copiar arquivos** para o projeto
3. **Configurar webhooks** do Shopify
4. **Instalar tracking pixel** nos sites

---

## 🧪 Testes

```bash
# Testar tracking
curl -X POST https://worder1.vercel.app/api/tracking/events \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"xxx","event_type":"page_view"}'

# Testar RFM
curl "https://worder1.vercel.app/api/analytics/rfm?organization_id=xxx&view=summary"
```
