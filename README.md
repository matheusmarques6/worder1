# 📊 Shopify Analytics - CORREÇÃO COMPLETA v3

## ⚠️ PROBLEMAS CORRIGIDOS

### 1. Variações sempre +0%
**Antes:** Hardcoded `vendasBrutasChange: 0`
**Depois:** Busca período anterior e calcula variação real

### 2. Nomes de colunas errados (RFM/Cohort)
| Código buscava | Tabela tem |
|----------------|------------|
| `customer_id` | `customer_shopify_id` |
| `customer_email` | `email` |
| `created_at` | `shopify_created_at` |

### 3. Loop errado na API principal
**Antes:** `for (const o of orders)` (incluía cancelados 2x)
**Depois:** `for (const o of validOrders)` (pedidos filtrados)

### 4. Cálculo de período
**Antes:** `daysBack = 7` (8 dias)
**Depois:** `daysBack = 6` (7 dias corretos)

---

## 📁 Arquivos (10 arquivos)

```
src/
├── app/
│   ├── api/
│   │   ├── analytics/
│   │   │   └── shopify/
│   │   │       └── route.ts              # ⭐ API PRINCIPAL REESCRITA
│   │   └── shopify/
│   │       └── analytics/
│   │           └── advanced/
│   │               └── route.ts          # API métricas avançadas
│   └── (dashboard)/
│       └── analytics/
│           └── shopify/
│               └── page.tsx              # Página atualizada
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
                ├── rfm.ts                # ⭐ CORRIGIDO
                └── cohort.ts             # ⭐ CORRIGIDO
```

---

## 🔧 Principais mudanças na API principal

### Função `calcChange` (nova)
```typescript
const calcChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};
```

### Busca período anterior
```typescript
// Busca pedidos do período atual
const currentOrders = await fetchAllOrders(shop_domain, access_token, startISO, endISO);

// Busca pedidos do período anterior (mesmo tamanho)
const previousOrders = await fetchAllOrders(shop_domain, access_token, prevStartISO, prevEndISO);

// Calcula KPIs para ambos
const currentKPIs = calculateKPIsFromOrders(currentOrders, customerMap);
const previousKPIs = calculateKPIsFromOrders(previousOrders, prevCustomerMap);

// Calcula variações
const vendasBrutasChange = calcChange(currentKPIs.vendasBrutas, previousKPIs.vendasBrutas);
```

### Retorno com variações reais
```typescript
return NextResponse.json({
  data: {
    vendasBrutas: currentKPIs.vendasBrutas,
    vendasBrutasChange,  // Agora é calculado!
    
    pedidos: currentKPIs.pedidosTotal,
    pedidosChange,       // Agora é calculado!
    
    // ... etc
  }
});
```

---

## 🚀 Como usar

1. **Extraia o ZIP na raiz do projeto** (sobrescreve os arquivos existentes)
2. **Faça commit e push**
3. **Teste no navegador:**
   - Acesse `/analytics/shopify`
   - Verifique se os números batem com a Shopify
   - Verifique se as variações (%) aparecem corretamente
   - Role até o final e teste as "Métricas Avançadas"

---

## ✅ Resultado esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Variações | +0% sempre | Calculadas vs período anterior |
| RFM/Cohort | 0 clientes | Dados reais |
| Pedidos | Podiam estar errados | Filtrados corretamente |

---

## 🐛 Debug

A API agora retorna um objeto `debug` com informações úteis:

```json
{
  "debug": {
    "currentPeriodOrders": 337,
    "previousPeriodOrders": 295,
    "validOrders": 313,
    "customersFound": 221
  }
}
```

Acesse `https://seu-site.vercel.app/api/analytics/shopify?storeId=XXX&period=7d` para ver os dados brutos.
