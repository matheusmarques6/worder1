# 📊 Shopify Analytics - CORREÇÃO v4

## ⚠️ PROBLEMA PRINCIPAL CORRIGIDO

**A Shopify INCLUI pedidos cancelados** nas métricas de:
- Vendas brutas
- Contagem de pedidos
- Descontos

A Worder estava **excluindo** esses pedidos, causando diferenças significativas.

---

## 🔧 Correções nesta versão

### 1. Pedidos cancelados incluídos
```typescript
// ANTES (errado)
const validOrders = orders.filter(o => !o.test && !o.cancelled_at);
for (const o of validOrders) {
  vendasBrutas += o.total_line_items_price; // Excluía cancelados
}

// DEPOIS (correto)
const allNonTestOrders = orders.filter(o => !o.test);
for (const o of allNonTestOrders) {
  vendasBrutas += o.total_line_items_price; // Inclui cancelados
}
```

### 2. Contagem de pedidos
```typescript
// ANTES
pedidosTotal = validOrders.length; // Excluía cancelados

// DEPOIS  
pedidosTotal = allNonTestOrders.length; // Inclui cancelados
```

### 3. API de Debug (nova)
Acesse: `/api/analytics/shopify/debug?storeId=XXX`

Retorna análise detalhada:
- Quantos pedidos total
- Quantos são teste
- Quantos são cancelados
- Vendas com/sem cancelados
- Por status financeiro
- Por canal de venda

---

## 📁 Arquivos (11 arquivos)

```
src/
├── app/
│   ├── api/
│   │   ├── analytics/
│   │   │   └── shopify/
│   │   │       ├── route.ts          # ⭐ API PRINCIPAL (v4)
│   │   │       └── debug/
│   │   │           └── route.ts      # 🆕 API DEBUG
│   │   └── shopify/
│   │       └── analytics/
│   │           └── advanced/
│   │               └── route.ts
│   └── (dashboard)/
│       └── analytics/
│           └── shopify/
│               └── page.tsx
├── components/
│   └── shopify/
│       ├── index.ts
│       ├── AdvancedMetricsSection.tsx
│       ├── RFMSection.tsx
│       └── CohortSection.tsx
└── lib/
    └── services/
        └── shopify/
            └── analytics/
                ├── rfm.ts
                └── cohort.ts
```

---

## 🚀 Como usar

1. **Extraia o ZIP** na raiz do projeto
2. **Deploy** para Vercel
3. **Teste a API de debug** primeiro:
   ```
   https://seu-site.vercel.app/api/analytics/shopify/debug?storeId=XXX
   ```
4. Compare os números com a Shopify

---

## 🔍 Usando a API de Debug

A API de debug retorna:

```json
{
  "debug": {
    "periodo": {
      "solicitado": "2026-01-07 a 2026-01-13"
    },
    "pedidos": {
      "total": 339,
      "teste": 0,
      "cancelados": 69,
      "validos": 270
    },
    "vendas": {
      "comTudo": "62868.60",
      "semCancelados": "50500.85",
      "semTesteNemCancelados": "50500.85"
    }
  }
}
```

Se `comTudo` bater com a Shopify, a correção está funcionando!

---

## ✅ Resultado esperado

| Métrica | Shopify | Worder (antes) | Worder (depois) |
|---------|---------|----------------|-----------------|
| Vendas brutas | R$ 62.868,60 | R$ 50.500,85 | R$ 62.868,60 |
| Pedidos | 339 | 270 | 339 |

---

## ⚠️ Se ainda não bater

Se depois desta correção os valores ainda não baterem, pode ser:

1. **Timezone diferente** - verificar se o período está correto na API de debug
2. **Pedidos de teste** - a Shopify pode estar incluindo ou excluindo
3. **Status financeiro** - alguns status podem ser tratados diferente

Use a API de debug para investigar!
