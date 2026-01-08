# FLOW BUILDER V3 - INTEGRAÇÕES

## ✅ O QUE FOI IMPLEMENTADO

### 1. API de Conexões Unificada
**Arquivo:** `/src/app/api/automations/connections/route.ts`

Busca conexões de todas as tabelas existentes:
- `evolution_instances` - WhatsApp Evolution API
- `whatsapp_configs` - WhatsApp Cloud API  
- `email_configs` - Email (Resend/SendGrid)
- `shopify_stores` - Shopify
- `woocommerce_stores` - WooCommerce
- `klaviyo_accounts` - Klaviyo
- `credentials` - HTTP Auth (Bearer/Basic/API Key)

### 2. CredentialSelector (estilo n8n)
**Arquivo:** `/src/components/flow-builder/panels/CredentialSelector.tsx`

Novo componente visual que:
- Lista todas conexões já configuradas no banco
- Mostra ícone e cor por tipo de integração
- Campo de busca para filtrar conexões
- Indicador de status (ativo/inativo)
- Botão "+ Criar nova credencial" que abre /settings/integrations
- Design igual ao n8n

### 3. PropertiesPanel Atualizado
**Arquivo:** `/src/components/flow-builder/panels/PropertiesPanel.tsx`

Configurações para cada tipo de nó:
- **action_email** - Seleciona conta de email configurada
- **action_whatsapp** - Seleciona instância WhatsApp conectada
- **action_webhook** - Seleciona credencial HTTP para autenticação
- **trigger_webhook** - Configura URL de webhook para receber dados externos

### 4. API de Webhooks de Automação
**Arquivo:** `/src/app/api/automations/webhooks/route.ts`

- **GET** - Listar webhooks por automação ou buscar por ID
- **POST** - Criar novo webhook (gera token e secret automaticamente)
- **PUT** - Atualizar webhook (nome, status, regenerar secret)
- **DELETE** - Excluir webhook

### 5. WebhookConfig Component
**Arquivo:** `/src/components/flow-builder/panels/WebhookConfig.tsx`

- Interface visual para configurar trigger_webhook
- Geração automática de URL única
- Exibição de secret para validação HMAC
- Estatísticas de webhooks recebidos

---

## 🔗 TIPOS DE CONEXÃO DISPONÍVEIS

| Tipo | Fonte | Campos Exibidos |
|------|-------|-----------------|
| whatsapp_evolution | evolution_instances | instance_name, phone_number |
| whatsapp_cloud | whatsapp_configs | business_name, phone_number |
| email_resend | email_configs | name, from_email |
| email_sendgrid | email_configs | name, from_email |
| shopify | shopify_stores | shop_name, shop_domain |
| woocommerce | woocommerce_stores | store_name, store_url |
| klaviyo | klaviyo_accounts | account_name |
| http | credentials | name, type |

---

## 📁 ARQUIVOS MODIFICADOS/CRIADOS

```
/src/app/api/automations/connections/route.ts   [NOVO]
/src/app/api/automations/webhooks/route.ts      [NOVO]
/src/components/flow-builder/panels/
  ├── CredentialSelector.tsx                    [REESCRITO]
  ├── WebhookConfig.tsx                         [NOVO]
  ├── PropertiesPanel.tsx                       [ATUALIZADO]
  └── index.ts                                  [ATUALIZADO]
/src/components/flow-builder/index.tsx          [ATUALIZADO]
/supabase/migrations/20260108_flow_webhooks.sql [NOVO]
```

---

## 🎯 COMO FUNCIONA

### Seleção de Credenciais
1. Usuário abre painel de propriedades de um nó (ex: action_whatsapp)
2. CredentialSelector carrega `/api/automations/connections?type=whatsapp`
3. API busca em `evolution_instances` e `whatsapp_configs`
4. Dropdown mostra todas as conexões disponíveis
5. Usuário seleciona ou clica em "Criar nova credencial"

### Webhook Trigger
1. Usuário adiciona nó "Webhook Recebido"
2. Abre painel de propriedades
3. Clica em "Gerar URL" 
4. API cria registro em `flow_webhooks` com token único
5. URL fica disponível para copiar

---

## 🗃️ SQL NECESSÁRIO

Execute no Supabase apenas se as tabelas não existirem:

```sql
-- Se precisar criar tabela de webhooks
CREATE TABLE IF NOT EXISTS flow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_id TEXT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  secret TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  received_count INTEGER DEFAULT 0,
  last_received_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Se precisar criar tabela de credentials HTTP
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
