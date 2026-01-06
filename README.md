# Correção Completa: Multi-Tenant para TUDO

## 🎯 O que foi corrigido

**TUDO agora é separado por loja!**

Quando você selecionar San Martin, verá apenas dados de San Martin.
Quando selecionar Oak Vintage, verá apenas dados de Oak Vintage.

---

## ✅ Correções Incluídas

### 1. Configurações / Integrações
- Facebook Ads → por loja
- Google Ads → por loja
- TikTok Ads → por loja
- Shopify → por loja (já era)
- Klaviyo → por loja
- WhatsApp → por loja

### 2. Analytics
- Analytics de Vendas → por loja
- Analytics Shopify → por loja
- Analytics CRM → por loja

### 3. CRM
- Pipelines → por loja
- Deals → por loja
- Contatos → por loja

### 4. Agentes WhatsApp
- Agentes → por loja

---

## 📦 Arquivos Incluídos

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── settings/
│   │   │   └── page.tsx                  ✅ Filtrar integrações por loja
│   │   ├── analytics/
│   │   │   ├── sales/page.tsx            ✅ Filtrar por loja
│   │   │   └── shopify/page.tsx          ✅ Filtrar por loja
│   │   ├── crm/
│   │   │   ├── analytics/page.tsx        ✅ Filtrar por loja
│   │   │   └── page.tsx                  ✅ Filtrar por loja
│   │   └── whatsapp/components/
│   │       └── AgentsTab.tsx             ✅ Filtrar por loja
│   └── api/
│       ├── integrations/status/
│       │   └── route.ts                  ✅ Filtrar TODAS integrações
│       ├── analytics/
│       │   ├── sales/route.ts            ✅ Filtrar por storeId
│       │   └── shopify/route.ts          ✅ Filtrar por storeId
│       └── whatsapp/agents/
│           └── route.ts                  ✅ Filtrar por storeId
├── components/
│   ├── crm/index.tsx                     ✅ Proteção array
│   └── agents/
│       ├── CreateAgentWizard.tsx         ✅ store_id
│       └── AIAgentList.tsx               ✅ Proteção array
└── hooks/
    ├── useAgents.ts                      ✅ Filtrar por loja
    └── useAgent.ts                       ✅ Proteção array

MIGRACAO-INTEGRACOES.sql                  SQL para adicionar store_id
```

---

## 🚀 Instalação

### Passo 1: Execute o SQL no Supabase

Copie e execute no SQL Editor do Supabase:

```sql
-- KLAVIYO
ALTER TABLE klaviyo_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- FACEBOOK
ALTER TABLE meta_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- GOOGLE
ALTER TABLE google_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- TIKTOK
ALTER TABLE tiktok_ad_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- WHATSAPP
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- AGENTES
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);

-- MIGRAR DADOS PARA OAK VINTAGE
UPDATE klaviyo_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE meta_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE google_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE tiktok_ad_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_configs SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_accounts SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
UPDATE whatsapp_agents SET store_id = 'b90b4c4b-e940-41f2-889b-e3dc2235cd0a' WHERE store_id IS NULL;
```

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para o seu projeto.

### Passo 3: Deploy

```bash
git add .
git commit -m "fix: separar TUDO por loja"
git push
```

---

## ✅ Resultado Final

| Loja Selecionada | O que vê |
|------------------|----------|
| **Oak Vintage** | Apenas integrações, dados, agentes de Oak Vintage |
| **San Martin** | Apenas integrações, dados, agentes de San Martin |
| **Nova Loja** | Começa vazia, sem dados de outras lojas |
