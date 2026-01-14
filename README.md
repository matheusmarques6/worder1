# 🔧 Correção Taxa de Clientes Recorrentes - v6

## O Problema

| Métrica | Worder (antes) | Shopify |
|---------|----------------|---------|
| Taxa recorrentes | 52.78% | 38.89% |

A Worder estava usando a **data de criação do cliente**, mas a Shopify usa outra lógica.

---

## Nova Lógica (Correta)

**Definição Shopify:**
- **Novo** = cliente cujo PRIMEIRO pedido foi feito DURANTE o período
- **Recorrente** = cliente que já tinha pedidos ANTES do período

**Cálculo:**
```typescript
// Para cada cliente no período:
totalOrdersCount = orders_count do cliente (total histórico)
ordersInPeriod = pedidos do cliente no período atual
ordersBeforePeriod = totalOrdersCount - ordersInPeriod

if (ordersBeforePeriod > 0) {
  // Tinha pedidos antes → RECORRENTE
} else {
  // Todos os pedidos são do período → NOVO
}
```

**Exemplo:**
- Cliente A: orders_count=5, pedidos_no_periodo=1 → 5-1=4 antes → **Recorrente**
- Cliente B: orders_count=2, pedidos_no_periodo=2 → 2-2=0 antes → **Novo**
- Cliente C: orders_count=1, pedidos_no_periodo=1 → 1-1=0 antes → **Novo**

---

## O Que Estava Errado Antes

**v5 (errada):** Usava data de criação do cliente
```typescript
// Se cliente foi criado antes do período = recorrente
if (customerCreatedAt < periodStart) → recorrente
```
Problema: Um cliente pode ter sido criado há 1 ano e nunca ter comprado. Quando faz a primeira compra, deveria ser "novo", não "recorrente".

**v6 (correta):** Usa histórico de pedidos
```typescript
// Se cliente tinha pedidos antes do período = recorrente
if (ordersBeforePeriod > 0) → recorrente
```

---

## Arquivos

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
│               └── page.tsx          # Frontend
```

---

## Resultado Esperado

| Métrica | v5 (errado) | v6 (correto) | Shopify |
|---------|-------------|--------------|---------|
| Taxa recorrentes | 52.78% | ~38.89% | 38.89% ✅ |
