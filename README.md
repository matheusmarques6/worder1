# Shopify Integration - Pacote Completo de Correções

## 📦 O que está incluído

Este pacote contém **TODAS as correções** para a integração Shopify, incluindo:

### 1. Correções de Schema (campos corretos)
- `contact-sync.ts` → usa `first_name`, `last_name`, `shopify_customer_id`, `custom_fields`
- `deal-sync.ts` → usa `custom_fields` (não `metadata`), `full_name` do contato
- Compatível com a tabela `contacts` do seu schema

### 2. Correção de URL do Webhook
- `connect/route.ts` → webhook agora aponta para `/api/webhooks/shopify` (URL correta)

### 3. Enriquecimento de Dados do Cliente
- Novos campos: RFM scores, produtos favoritos, última compra
- Tracking automático de atividades
- Timeline completa do cliente

---

## 📁 Estrutura de Arquivos

```
deploy-complete/
├── src/
│   ├── lib/services/shopify/
│   │   ├── contact-sync.ts      ← CORRIGIDO: campos corretos
│   │   ├── deal-sync.ts         ← CORRIGIDO: campos corretos
│   │   ├── activity-tracker.ts  ← NOVO: tracking de atividades
│   │   └── index.ts             ← ATUALIZADO: exporta activity-tracker
│   │
│   ├── app/api/
│   │   ├── shopify/
│   │   │   ├── connect/route.ts           ← CORRIGIDO: URL webhook
│   │   │   └── webhooks/register/route.ts ← OK (já estava correto)
│   │   │
│   │   ├── webhooks/shopify/route.ts      ← ATUALIZADO: tracking
│   │   │
│   │   └── contacts/[id]/timeline/route.ts ← NOVO: API timeline
│   │
│   ├── components/crm/
│   │   └── ContactDrawer.tsx    ← ATUALIZADO: mostra dados enriquecidos
│   │
│   └── types/
│       └── index.ts             ← ATUALIZADO: novos campos Contact
│
└── supabase/migrations/
    └── shopify-enrichment.sql   ← NOVO: campos e tabelas
```

---

## 🔧 Correções Detalhadas

### contact-sync.ts (CRÍTICO)

**Antes (ERRADO):**
```typescript
.insert({
  name: data.name,           // ❌ Campo não existe
  type: data.contactType,    // ❌ Campo não existe
  metadata: {...},           // ❌ Campo não existe
})
```

**Depois (CORRETO):**
```typescript
.insert({
  first_name: data.firstName,        // ✅
  last_name: data.lastName,          // ✅
  shopify_customer_id: customer.id,  // ✅
  total_orders: customer.orders_count, // ✅
  total_spent: customer.total_spent,   // ✅
  custom_fields: {...},              // ✅
})
```

### deal-sync.ts

**Antes:**
```typescript
.select('name')  // ❌ Campo não existe
metadata: {...}  // ❌ Campo não existe
```

**Depois:**
```typescript
.select('first_name, last_name, full_name')  // ✅
custom_fields: {...}  // ✅
```

### connect/route.ts

**Antes:**
```typescript
address: `${appUrl}/api/shopify/webhooks`  // ❌ URL errada
```

**Depois:**
```typescript
address: `${appUrl}/api/webhooks/shopify`  // ✅ URL correta
```

---

## 🚀 Passos para Deploy

### 1. Executar Migration no Supabase

```sql
-- Execute o arquivo: supabase/migrations/shopify-enrichment.sql
-- Pode rodar diretamente no SQL Editor do Supabase
```

### 2. Copiar arquivos para o projeto

```bash
# Copiar toda a pasta src/ para seu projeto
cp -r deploy-complete/src/* /seu-projeto/src/

# Ou copiar arquivo por arquivo:
cp deploy-complete/src/lib/services/shopify/*.ts /seu-projeto/src/lib/services/shopify/
cp deploy-complete/src/app/api/shopify/connect/route.ts /seu-projeto/src/app/api/shopify/connect/
cp deploy-complete/src/app/api/webhooks/shopify/route.ts /seu-projeto/src/app/api/webhooks/shopify/
# ... etc
```

### 3. Deploy

```bash
git add .
git commit -m "fix: Shopify integration complete fix + enrichment"
git push
```

### 4. Re-registrar Webhooks (IMPORTANTE!)

Após o deploy, chame a API para corrigir webhooks existentes:

```bash
curl -X POST https://seudominio.com/api/shopify/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "seu-org-id"}'
```

Ou via interface, se tiver um botão para isso.

### 5. Calcular RFM (Opcional)

```sql
-- No Supabase SQL Editor:
SELECT calculate_contact_rfm('seu-organization-id');
```

---

## ✅ Checklist Pós-Deploy

- [ ] Migration executada no Supabase
- [ ] Arquivos copiados para o projeto
- [ ] Deploy realizado
- [ ] Webhooks re-registrados
- [ ] Testado criando um pedido de teste no Shopify
- [ ] Verificado se contato foi criado com campos corretos
- [ ] Verificado se atividades estão sendo registradas

---

## 🆕 Novas Funcionalidades

### UI do ContactDrawer

Agora mostra:

```
┌─────────────────────────────────────┐
│  👤 João Silva                      │
├─────────────────────────────────────┤
│  🏆 CAMPEÃO   [R:5] [F:4] [M:5]    │  ← Badge RFM
│  Última compra: 3 dias atrás        │
├─────────────────────────────────────┤
│  📦 Última Compra #1234  R$ 450    │
│  ├ Camiseta Vintage (2x)           │
│  └ Calça Jeans (1x)                │
├─────────────────────────────────────┤
│  ❤️ Produtos Favoritos (5)         │
│  #1 Camiseta Básica - 8x           │
│  #2 Tênis Runner - 3x              │
├─────────────────────────────────────┤
│  📋 Atividades                      │
│  📦 Fez pedido #1234     [Shopify] │
│  💳 Pagamento confirmado [Shopify] │
│  📝 Nota adicionada                 │
└─────────────────────────────────────┘
```

### Segmentos RFM

| Segmento | Descrição |
|----------|-----------|
| champion | VIP - compra frequente, alto valor |
| loyal | Cliente frequente |
| potential_loyal | Recente com potencial |
| new_customer | Primeira compra recente |
| promising | Recente, valor médio |
| need_attention | Era bom, esfriando |
| about_to_sleep | Cada vez menos ativo |
| at_risk | Era bom, sumiu |
| hibernating | Inativo há muito tempo |
| lost | Sem atividade significativa |

---

## ⚠️ Problemas Conhecidos

1. **Contatos existentes com dados errados**: Se você já tem contatos criados com o código antigo, eles podem ter campos vazios. Recomendo rodar um script de correção ou re-sincronizar do Shopify.

2. **Webhooks antigos**: A API de register vai deletar webhooks com URL errada e criar novos com URL correta.

---

## 📞 Suporte

Se tiver problemas:
1. Verificar logs do Vercel/servidor
2. Verificar se a migration rodou corretamente
3. Testar webhook manualmente com `curl`
