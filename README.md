# 📦 CRM Advanced Features

## O que está incluído

### ✅ Funcionalidades Implementadas

| Recurso | Descrição | Status |
|---------|-----------|--------|
| **Forecast de Vendas** | Dashboard com métricas de pipeline, win rate, velocity | ✅ Pronto |
| **Histórico de Stages** | Timeline de mudanças de estágio do deal | ✅ Pronto |
| **Custom Fields** | Gerenciador de campos personalizados | ✅ Pronto |
| **Merge de Contatos** | Detectar e mesclar duplicados | ✅ Pronto |
| **Import de Contatos** | Importação CSV com mapeamento | ✅ Pronto |

---

## 📁 Estrutura de Arquivos

```
src/
├── app/
│   ├── api/
│   │   ├── deals/
│   │   │   ├── [id]/history/route.ts    # API histórico de stages
│   │   │   └── forecast/route.ts        # API de forecast
│   │   ├── contacts/
│   │   │   ├── import/route.ts          # API importação CSV
│   │   │   ├── merge/route.ts           # API merge duplicados
│   │   │   └── stats/route.ts           # API estatísticas
│   │   └── custom-fields/route.ts       # API campos personalizados
│   └── (dashboard)/crm/
│       ├── forecast/page.tsx            # Página de forecast
│       ├── contacts/page.tsx            # Página de contatos (atualizada)
│       └── layout.tsx                   # Layout com nova aba
└── components/crm/
    ├── index.tsx                        # Exports atualizados
    ├── DealDrawer.tsx                   # Com timeline integrada
    ├── DealTimeline.tsx                 # Componente de timeline
    ├── MergeContactsModal.tsx           # Modal de merge
    ├── ImportContactsModal.tsx          # Modal de import
    └── CustomFieldsManager.tsx          # Gerenciador de campos

crm-advanced-features.sql                # Migration SQL
```

---

## 🚀 Como Instalar

### 1. Execute o SQL no Supabase

```sql
-- No SQL Editor do Supabase, execute:
-- crm-advanced-features.sql
```

Este SQL cria:
- Coluna `probability` nos stages
- Colunas de forecast nos deals
- Tabela `deal_stage_history` + trigger
- Tabela `custom_field_definitions`
- View e funções de forecast

### 2. Substitua os arquivos

Copie todos os arquivos para as pastas correspondentes no seu projeto.

### 3. Verifique as dependências

Todas as dependências já estão no projeto:
- framer-motion ✅
- lucide-react ✅

---

## 📊 Como Usar

### Forecast de Vendas

Acesse: **CRM → Forecast**

Mostra:
- Pipeline Total vs Ponderado
- Ganhos do período
- Win Rate
- Funil por estágio
- Velocidade de vendas
- Top deals

### Histórico de Stages

Abra qualquer deal → Role até "Histórico de Estágios"

Mostra:
- Todas as mudanças de estágio
- Tempo em cada estágio
- Quem fez a mudança

### Import de Contatos

Acesse: **CRM → Contatos → Importar**

1. Upload do CSV
2. Mapeamento de colunas
3. Configurar opções (duplicados, tags)
4. Importar

### Merge de Contatos

Acesse: **CRM → Contatos → Duplicados**

1. Sistema detecta duplicados automaticamente
2. Selecione o contato principal
3. Confirme a mesclagem

### Custom Fields

*(Para ativar, adicione um botão na página de Settings)*

---

## 🔧 Configurações Adicionais

### Probabilidade por Stage

Após rodar o SQL, edite cada stage para definir a probabilidade:
- Lead: 10%
- Qualificado: 25%
- Proposta: 50%
- Negociação: 75%
- Fechado Ganho: 100%
- Fechado Perdido: 0%

O sistema usa essas probabilidades para calcular o Weighted Pipeline.

---

## ❓ Troubleshooting

### "Tabela deal_stage_history não existe"
→ Execute o SQL no Supabase

### Forecast mostrando zero
→ Verifique se os stages têm `probability` definido

### Import não funciona
→ Verifique se o CSV tem separador correto (vírgula ou ponto-e-vírgula)

---

**Criado em:** Dezembro 2024
