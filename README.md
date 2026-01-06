# Correção Multi-Tenant: Analytics + Agentes

## 🎯 Problema
Os dados de Analytics estão misturados entre lojas. San Martin mostra dados de Oak Vintage.

## ✅ O que foi corrigido

### 1. Analytics de Vendas (`/analytics/sales`)
- **API**: Agora filtra pipelines e deals por `store_id`
- **Página**: Passa `storeId` da loja atual para a API
- **Recarrega**: Automaticamente quando troca de loja

### 2. Analytics do CRM (`/crm/analytics`)
- **Página**: Passa `storeId` para a API
- **Recarrega**: Automaticamente quando troca de loja

### 3. Analytics Shopify (`/analytics/shopify`)
- **API**: Agora busca dados apenas da loja selecionada
- **Página**: Passa `storeId` para a API
- **Recarrega**: Automaticamente quando troca de loja

### 4. Agentes WhatsApp
- **API**: Filtra agentes por `store_id`
- **Hook**: Passa `storeId` nas requisições
- **Criação**: Novos agentes salvos com `store_id` correto

### 5. Proteções de Array
- Todas as funções com `.reduce()`, `.map()`, `.filter()` protegidas
- Evita erro "Application error" durante carregamento

---

## 📦 Arquivos Incluídos

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── analytics/
│   │   │   ├── sales/page.tsx          ✅ Filtro por loja
│   │   │   └── shopify/page.tsx        ✅ Filtro por loja
│   │   ├── crm/
│   │   │   ├── analytics/page.tsx      ✅ Filtro por loja
│   │   │   └── page.tsx                ✅ Proteção array
│   │   └── whatsapp/components/
│   │       └── AgentsTab.tsx           ✅ Filtro por loja
│   └── api/
│       ├── analytics/
│       │   ├── sales/route.ts          ✅ Filtro por storeId
│       │   └── shopify/route.ts        ✅ Filtro por storeId
│       └── whatsapp/agents/route.ts    ✅ Filtro por storeId
├── components/
│   ├── crm/index.tsx                   ✅ Proteção array
│   └── agents/
│       ├── CreateAgentWizard.tsx       ✅ store_id
│       └── AIAgentList.tsx             ✅ Proteção array
└── hooks/
    ├── useAgents.ts                    ✅ Filtro por loja
    └── useAgent.ts                     ✅ Proteção array

MIGRACAO-AGENTES.sql                    SQL para adicionar store_id
```

---

## 🚀 Instalação

### Passo 1: Execute o SQL (se ainda não fez)

```sql
-- Adicionar store_id nas tabelas de agentes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_agents_store_id ON agents(store_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_store_id ON whatsapp_agents(store_id);

-- Migrar dados para Oak Vintage (substitua pelo ID correto)
UPDATE agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
```

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para o seu projeto, substituindo os arquivos existentes.

### Passo 3: Deploy

```bash
git add .
git commit -m "fix: separar analytics e agentes por loja"
git push
```

---

## ✅ Resultado Esperado

| Loja | Vê apenas |
|------|-----------|
| **Oak Vintage** | Dados de Oak Vintage |
| **San Martin** | Dados de San Martin |

- Analytics recarrega ao trocar de loja
- Sem mais dados misturados
- Sem mais erros de "Application error"
