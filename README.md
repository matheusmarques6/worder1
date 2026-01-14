# 📊 Métricas Avançadas Shopify - Worder

## 🎯 O que foi implementado

### API Unificada
`/api/shopify/analytics/advanced`

- **GET**: Busca dados de RFM e Cohort
  - Primeiro verifica se existem dados nas tabelas `shopify_rfm_scores` e `shopify_cohort_data`
  - Se não existirem, calcula automaticamente usando as funções existentes
  - Retorna dados formatados para o frontend

- **POST**: Força recálculo das métricas
  - Recalcula RFM e Cohort mesmo que já existam dados

### Componentes UI (estilo Worder)

1. **AdvancedMetricsSection** - Seção expansível no final da página
   - Botão discreto com gradiente laranja/amarelo
   - Expande para baixo ao clicar
   - Tabs para alternar entre RFM e Cohort

2. **RFMSection** - Visualização de segmentação RFM
   - Cards por segmento com cores Worder
   - KPIs de total de clientes, receita, média de pedidos
   - Cards de ação (Campeões, Em Risco, Potenciais)
   - Tabela com top 10 clientes

3. **CohortSection** - Análise de retenção
   - KPIs de retenção mês 1, mês 3, melhor/pior cohort
   - Gráfico de curva de retenção
   - Matriz de retenção colorida (laranja = alta, cinza = baixa)
   - Insights e dicas

## 📁 Arquivos

```
src/
├── app/
│   ├── api/
│   │   └── shopify/
│   │       └── analytics/
│   │           └── advanced/
│   │               └── route.ts          # API unificada
│   └── (dashboard)/
│       └── analytics/
│           └── shopify/
│               └── page.tsx              # Página atualizada
└── components/
    └── shopify/
        ├── index.ts                      # Exports
        ├── AdvancedMetricsSection.tsx    # Container expansível
        ├── RFMSection.tsx                # Visualização RFM
        └── CohortSection.tsx             # Matriz Cohort
```

## 🚀 Como usar

1. Extraia o ZIP na raiz do projeto (sobrescreve os arquivos existentes)
2. Faça commit e push
3. Acesse `/analytics/shopify`
4. Role até o final da página
5. Clique no botão "Métricas Avançadas"
6. A seção expande mostrando RFM e Cohort

## 🎨 Cores utilizadas

- Primary: `#f97316` (orange-500)
- Accent: `#eab308` (yellow-500)
- Gradient: `from-primary-500/10 to-accent-500/10`
- Background: `dark-800/40`, `dark-700/30`
- Border: `dark-700/50`, `primary-500/20`

## ⚠️ Importante

- Remova a pasta `/src/app/(dashboard)/analytics/shopify/advanced/` se existir (versão antiga com página separada)
- As tabelas `shopify_rfm_scores`, `shopify_rfm_summary` e `shopify_cohort_data` devem existir no Supabase
- Se não existirem dados, a API calcula automaticamente na primeira chamada

## 🔄 Fluxo de dados

```
1. Usuário abre página de analytics
2. Rola até final e clica em "Métricas Avançadas"
3. Seção expande
4. Componente chama GET /api/shopify/analytics/advanced?storeId=xxx
5. API verifica se existem dados nas tabelas
6. Se sim: retorna dados
7. Se não: calcula usando funções existentes e retorna
8. Componente renderiza RFM e Cohort
```
