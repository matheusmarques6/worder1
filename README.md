# 🔧 Correção: Total de Vendas por Produto

## Problema

O "Total de vendas por produto" na Worder não batia com a Shopify.

## Causa

A Worder estava calculando **Gross Sales** (preço × quantidade):
```typescript
receita_total = price * quantity  // ❌ Errado
```

Mas a Shopify mostra **Net Sales** (preço × quantidade - descontos):
```typescript
receita_liquida = (price * quantity) - discount_allocations  // ✅ Correto
```

## O Que Mudou

### Antes (errado)
```typescript
p.receita_total += item.price * item.quantity;
```

### Depois (correto)
```typescript
// Calcular gross
const grossAmount = price * qty;

// Subtrair descontos alocados ao item
let discountAmount = 0;
if (Array.isArray(item.discount_allocations)) {
  for (const alloc of item.discount_allocations) {
    discountAmount += alloc.amount;
  }
}

// Net = Gross - Descontos
const netAmount = grossAmount - discountAmount;
p.receita_liquida += netAmount;
```

## Como a Shopify Distribui Descontos

Quando um cliente usa um cupom de desconto (ex: 10% OFF no pedido), a Shopify **distribui** esse desconto entre os produtos proporcionalmente.

Exemplo:
- Produto A: R$ 100
- Produto B: R$ 50
- Cupom: 10% OFF (R$ 15 total)

Distribuição:
- Produto A: R$ 100 - R$ 10 = R$ 90 (discount_allocation: 10)
- Produto B: R$ 50 - R$ 5 = R$ 45 (discount_allocation: 5)

## Dados Retornados Agora

```json
{
  "vendasPorProduto": [
    {
      "nome": "Óculos de Sol - Kalib™",
      "quantidade": 10,
      "vendas": 379.36,          // NET sales (o que Shopify mostra)
      "vendasBrutas": 450.00,    // Gross (para referência)
      "descontos": 70.64,        // Descontos aplicados
      "pedidos": 8
    }
  ]
}
```

## Resultado Esperado

| Produto | Worder (antes) | Worder (agora) | Shopify |
|---------|---------------|----------------|---------|
| Kalib™  | R$ 450,00     | R$ 379,36      | R$ 379,36 ✅ |
