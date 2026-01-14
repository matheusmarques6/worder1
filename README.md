# 🔧 Correções Shopify Analytics - v5

## Problemas Corrigidos

### 1. ✅ Total de Vendas (Frontend)

**Problema:** O campo "Total de vendas" mostrava o valor de "Vendas Brutas" ao invés do cálculo correto.

**Antes (errado):**
```
Total de vendas = Vendas Brutas = R$ 6.728,66
```

**Depois (correto):**
```
Total de vendas = Vendas Líquidas + Frete + Tributos
Total de vendas = R$ 5.246,76 + R$ 225,40 + R$ 0,00 = R$ 5.472,16
```

**Arquivo:** `src/app/(dashboard)/analytics/shopify/page.tsx`

---

### 2. ✅ Taxa de Clientes Recorrentes (API)

**Problema:** A Worder usava `orders_count > 1` para determinar se cliente era recorrente, mas a Shopify usa outra lógica.

**Definição Shopify:**
- **Cliente Recorrente:** Cliente que foi criado ANTES do início do período
- **Cliente Novo:** Cliente que foi criado DURANTE o período

**Antes (errado):**
```typescript
// Usava apenas orders_count
const ordersCount = customer.orders_count || 1;
if (ordersCount > 1) {
  // É recorrente
}
```

**Depois (correto):**
```typescript
// Compara data de criação do cliente com início do período
const customerCreatedAt = new Date(customer.created_at);
const periodStart = new Date(startDate);

if (customerCreatedAt < periodStart) {
  // É recorrente (existia ANTES do período)
} else {
  // É novo (criado DURANTE o período)
}
```

**Arquivo:** `src/app/api/analytics/shopify/route.ts`

---

## Arquivos Incluídos

```
src/
├── app/
│   ├── api/
│   │   └── analytics/
│   │       └── shopify/
│   │           └── route.ts          # API corrigida
│   └── (dashboard)/
│       └── analytics/
│           └── shopify/
│               └── page.tsx          # Frontend corrigido
```

---

## Resultado Esperado

| Métrica | Antes | Depois | Shopify |
|---------|-------|--------|---------|
| Total de vendas | R$ 6.728,66 | R$ 5.472,16 | R$ 5.472,16 ✅ |
| Taxa recorrentes | 35.14% | ~37.84% | 37.84% ✅ |

---

## Como Aplicar

1. Extraia o ZIP na raiz do projeto
2. Faça deploy no Vercel
3. Teste com "Hoje" e "Ontem" primeiro
4. Depois teste "7 dias"
