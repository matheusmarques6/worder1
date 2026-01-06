# Correção do erro "s.reduce is not a function"

## Problema
O erro ocorre quando código tenta chamar `.reduce()`, `.filter()` ou `.map()` em algo que não é um array.

## Instruções

1. Extraia o ZIP
2. Copie a pasta `src` para a raiz do seu projeto, substituindo os arquivos existentes
3. Faça commit e deploy

## Arquivos Corrigidos

```
src/
├── app/
│   └── (dashboard)/
│       ├── crm/
│       │   └── page.tsx
│       └── whatsapp/
│           └── components/
│               └── AgentsTab.tsx
├── components/
│   ├── crm/
│   │   └── index.tsx
│   └── agents/
│       └── AIAgentList.tsx
└── hooks/
    ├── useAgents.ts
    └── useAgent.ts
```

## O que foi alterado

Adicionamos verificação de array antes de chamar métodos de array:

```typescript
// ANTES (pode falhar)
const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0)

// DEPOIS (seguro)
const safeDeals = Array.isArray(deals) ? deals : []
const totalValue = safeDeals.reduce((sum, deal) => sum + (deal.value || 0), 0)
```
