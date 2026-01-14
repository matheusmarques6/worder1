# 🔍 Diagnóstico Shopify Analytics

## O Problema

Há uma diferença significativa entre os valores da Shopify e da Worder:

| Métrica | Shopify | Worder | Diferença |
|---------|---------|--------|-----------|
| Vendas brutas | R$ 62.868,60 | R$ 53.257,76 | -R$ 9.610 |
| Pedidos | 339 | 289 | -50 |

## Como Usar a API de Diagnóstico

### 1. Deploy

Extraia o ZIP e faça deploy no Vercel.

### 2. Acesse a API

```
https://seu-site.vercel.app/api/analytics/shopify/diagnostico?storeId=XXX
```

### 3. O que a API retorna

A API faz uma análise completa de todos os pedidos e retorna:

```json
{
  "diagnostico": {
    "periodo": {
      "solicitado": "2026-01-07 a 2026-01-13",
      "startISO": "...",
      "endISO": "..."
    },
    
    "contagem": {
      "total": 339,           // Total de pedidos
      "teste": 0,             // Pedidos de teste
      "cancelados": 50,       // Pedidos cancelados
      "validos": 289,         // Não teste e não cancelados
      
      "shopifyDeveMostrar": {
        "pedidos": 339,       // Shopify mostra: total - teste
        "nota": "Shopify inclui cancelados, pending, unpaid. Exclui apenas test."
      }
    },
    
    "vendasBrutas": {
      "metodo1_totalLineItemsPrice": {
        "todos": "R$ 65.000,00",
        "semTeste": "R$ 62.868,60",           // ← ESTE é o valor correto
        "semTesteNemCancelado": "R$ 53.257,76" // ← ESTE é o que Worder calcula hoje
      },
      
      "conclusao": {
        "valorCorretoParaShopify": "R$ 62.868,60",
        "nota": "Shopify Gross Sales = total_line_items_price de pedidos não-teste (inclui cancelados)"
      }
    },
    
    "porStatus": {
      "financial": {
        "paid": { "count": 280, "value": 50000 },
        "pending": { "count": 20, "value": 5000 },
        "refunded": { "count": 39, "value": 7868.60 }
      }
    },
    
    "pedidosCancelados": [
      { "id": 123, "name": "#1001", "total_line_items_price": "R$ 200,00" }
    ]
  },
  
  "comparativo": {
    "shopifyEsperado": {
      "vendasBrutas": "R$ 62.868,60",
      "pedidos": 339
    },
    "worderCalculado": {
      "vendasBrutas_metodoAtual": "R$ 53.257,76",      // Errado
      "vendasBrutas_metodoCorreto": "R$ 62.868,60",    // Correto
      "pedidos_metodoAtual": 289,                       // Errado
      "pedidos_metodoCorreto": 339                      // Correto
    }
  }
}
```

## O Que Descobrimos

### Definição Oficial da Shopify

> **Gross Sales** = product price × quantity (before taxes, shipping, discounts, and returns).
> 
> **Canceled, pending, and unpaid orders are INCLUDED.**
> 
> Test and deleted orders are NOT included.

### O Erro da Worder

A Worder estava **excluindo pedidos cancelados** das vendas brutas e da contagem de pedidos.

### A Correção

```typescript
// ERRADO (o que Worder fazia)
const validOrders = orders.filter(o => !o.test && !o.cancelled_at);
vendasBrutas = soma de validOrders; // Exclui cancelados

// CORRETO (como Shopify faz)
const allNonTestOrders = orders.filter(o => !o.test);
vendasBrutas = soma de allNonTestOrders; // Inclui cancelados
```

## Próximos Passos

1. Execute a API de diagnóstico
2. Compare os valores com a Shopify
3. Se `vendasBrutas.metodo1_totalLineItemsPrice.semTeste` bater com a Shopify, a correção está correta
4. Aplique a correção na API principal

## Contato

Se os valores ainda não baterem após a correção, verifique:
1. Se o período está correto (timezone)
2. Se há pedidos de teste sendo contados
3. Se há algum filtro adicional na query
