# Correção Completa: Multi-Tenant + Erros de Array

## Problemas Corrigidos

### 1. Agentes WhatsApp misturados entre lojas
Os agentes estavam aparecendo em todas as lojas porque só filtravam por `organization_id`.

### 2. Erro "Application error: a client-side exception has occurred"
Ocorria em várias páginas quando arrays estavam `undefined` durante carregamento.

### 3. Páginas Afetadas
- `/analytics/sales` - Página de Analytics de Vendas
- `/crm/analytics` - Analytics do CRM
- `/crm` - Kanban do CRM
- `/whatsapp` - Agentes do WhatsApp

---

## Instruções de Instalação

### Passo 1: Execute o SQL no Supabase

```sql
-- Adicionar coluna store_id nas tabelas de agentes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_agents_store_id ON agents(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_store_id ON whatsapp_agents(store_id);

-- Migrar dados existentes para Oak Vintage
UPDATE agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
```

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para a raiz do seu projeto.

### Passo 3: Deploy

```bash
git add .
git commit -m "fix: corrigir erros de array e separar agentes por loja"
git push
```

---

## Arquivos Modificados

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── analytics/
│   │   │   └── sales/
│   │   │       └── page.tsx          # Proteções de array
│   │   ├── crm/
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx          # Proteções de array
│   │   │   └── page.tsx              # Proteções de array
│   │   └── whatsapp/
│   │       └── components/
│   │           └── AgentsTab.tsx     # Filtrar por storeId
│   └── api/
│       └── whatsapp/
│           └── agents/
│               └── route.ts          # Filtrar por storeId
├── components/
│   ├── crm/
│   │   └── index.tsx                 # Proteções de array
│   └── agents/
│       ├── CreateAgentWizard.tsx     # Incluir store_id
│       └── AIAgentList.tsx           # Proteções de array
└── hooks/
    ├── useAgents.ts                  # Filtrar por storeId
    └── useAgent.ts                   # Proteções de array

MIGRACAO-AGENTES.sql                  # SQL para adicionar store_id
```

---

## O que foi corrigido

### Proteções de Array
Antes:
```typescript
const total = data.reduce((sum, d) => sum + d.value, 0)
```

Depois:
```typescript
const safeData = Array.isArray(data) ? data : []
const total = safeData.reduce((sum, d) => sum + (d.value || 0), 0)
```

### Separação de Agentes por Loja
- API agora filtra por `storeId`
- Hook `useAgents` passa `storeId` nas requisições
- Novos agentes são criados com `store_id` correto
