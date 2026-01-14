# 🔧 Correção Shopify Analytics - Revisado pelo Senior

**Data:** 14 de Janeiro de 2026  
**Status:** Aprovado para Deploy

---

## 📋 Resumo das Correções

### 1. Taxa de Clientes Recorrentes

**Solução:** ShopifyQL via GraphQL API

```typescript
// Query usando formato correto
const query = `FROM sales SHOW new_customers, returning_customers SINCE ${daysBack} days ago UNTIL today`;
```

**Fallback:** Se ShopifyQL falhar (falta de scopes), usa cálculo baseado em `orders_count`.

### 2. Total de Vendas por Produto

**Solução:** Usar `discount_allocations` para calcular NET sales

```typescript
// Cálculo correto
const grossAmount = price * quantity;

let discountAmount = 0;
for (const alloc of item.discount_allocations) {
  discountAmount += alloc.amount;
}

const netAmount = grossAmount - discountAmount;  // ✅ Valor correto
```

---

## 📁 Arquivos Incluídos

```
src/
├── app/
│   └── api/
│       ├── analytics/
│       │   └── shopify/
│       │       ├── route.ts                    # API principal (969 linhas)
│       │       └── diagnostico-produtos/
│       │           └── route.ts                # Endpoint de debug
│       └── shopify/
│           └── lojas/
│               └── route.ts                    # Lista lojas/IDs
```

---

## 🚀 Instruções de Deploy

### Passo 1: Substituir Arquivos

Copie os arquivos para as respectivas pastas no projeto, substituindo os existentes.

### Passo 2: Verificar Scopes do App Shopify

Para ShopifyQL funcionar, o app precisa dos scopes:
- `read_reports`
- `read_analytics`

Se não tiver, as lojas precisarão re-autorizar o app.

### Passo 3: Deploy

```bash
git add .
git commit -m "fix: correção taxa recorrentes e vendas por produto"
git push
```

### Passo 4: Testar

1. Acesse `/api/shopify/lojas` para pegar o `storeId`
2. Acesse `/api/analytics/shopify/diagnostico-produtos?storeId=XXX&periodo=yesterday`
3. Compare os valores com o dashboard Shopify

---

## 📊 Logs de Debug

A API agora inclui logs detalhados:

```
[ShopifyQL] Query: FROM sales SHOW new_customers, returning_customers SINCE 7 days ago UNTIL today
[ShopifyQL] Columns: [...]
[ShopifyQL] Rows: [...]
[ShopifyQL] Final Results: { newCustomers: 110, returningCustomers: 70, rate: 38.89 }

[Analytics] Products debug - Total unique products: 45
[Analytics] Top product: { nome: "Kalib™", receita_bruta: 450.33, descontos: 70.97, receita_liquida: 379.36 }
```

---

## ⚠️ Possíveis Problemas

### ShopifyQL retorna null

**Causa:** App não tem scopes `read_reports` / `read_analytics`

**Solução:** 
1. Adicionar scopes no Partner Dashboard
2. Pedir para lojistas re-autorizar o app

### Valores ainda diferentes

**Causa:** Cache do browser ou período diferente

**Solução:**
1. Limpar cache (Ctrl+Shift+R)
2. Verificar período selecionado (Ontem vs 7 dias)
3. Checar logs no Vercel/servidor

---

## ✅ Checklist de Validação

- [ ] API deployada com sucesso
- [ ] Logs de ShopifyQL aparecem no servidor
- [ ] Taxa de recorrentes bate com Shopify
- [ ] Vendas por produto batem com Shopify
- [ ] Todos os períodos testados (Hoje, Ontem, 7d, 30d)

---

## 📞 Suporte

Se os valores continuarem diferentes após o deploy:

1. Verifique os logs do servidor
2. Execute o endpoint de diagnóstico
3. Compare com dashboard Shopify no mesmo período
4. Reporte com screenshots de ambos os dashboards
