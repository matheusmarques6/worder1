# Arquitetura de Integrações - WORDER CRM

## Visão Geral

O sistema de integrações do WORDER foi projetado para sincronizar contatos e leads em tempo real de múltiplas plataformas. A arquitetura é baseada em webhooks como mecanismo primário de entrega, com processamento assíncrono e deduplicação inteligente.

## Plataformas Suportadas

### E-commerce
- **Shopify** - Clientes, pedidos, carrinhos abandonados

### Comunicação
- **WhatsApp Cloud API** - API oficial da Meta
- **Evolution API** - Conexão via QR Code (não-oficial)
- **WhatsApp Business** (legado)

### Formulários
- **Google Forms** - Respostas de formulários
- **Typeform** - Respostas com hidden fields
- **Web Form** - Formulário próprio

### Planilhas
- **Google Sheets** - Novas linhas

### Marketing
- **Facebook Lead Ads** - Leads de anúncios
- **Instagram Lead Ads** - Leads de anúncios

---

## Fluxo de Processamento de Webhook

```
[Plataforma Externa] 
       │
       ▼
[POST /api/webhooks/{token}]
       │
       ▼
[Verificar Token] ─────────────► [404 se inválido]
       │
       ▼
[Verificar Assinatura HMAC] ───► [401 se inválido]
       │
       ▼
[Verificar Idempotência] ──────► [200 skip se duplicado]
       │
       ▼
[Detectar Tipo de Evento]
       │
       ▼
[Normalizar Dados] ────────────► [Formato Unificado]
       │
       ▼
[Deduplicar Contato]
       │
       ├── External ID (100%)
       ├── Email (95%)
       ├── WhatsApp JID (90%)
       └── Telefone (85%)
       │
       ▼
[Criar/Atualizar Contato]
       │
       ▼
[Criar Deal (se configurado)]
       │
       ▼
[200 OK]
```

---

## Estrutura de Banco de Dados

### Tabelas Principais

```sql
-- Catálogo de integrações
integrations
├── id (UUID)
├── slug (TEXT) - identificador único
├── name (TEXT)
├── auth_type (oauth2 | api_key | webhook | none)
├── supported_webhooks (TEXT[])
└── is_active (BOOLEAN)

-- Integrações instaladas por organização
installed_integrations
├── id (UUID)
├── organization_id (UUID) → organizations
├── integration_id (UUID) → integrations
├── status (pending | configuring | active | paused | error)
├── webhook_token (TEXT) - token único de 64 chars
├── field_mapping (JSONB) - mapeamento customizado
├── default_pipeline_id (UUID) → pipelines
├── default_stage_id (UUID) → pipeline_stages
├── auto_tags (TEXT[])
├── credentials_encrypted (JSONB)
└── last_sync_at (TIMESTAMPTZ)

-- Mapeamentos de IDs externos (deduplicação)
contact_external_mappings
├── id (UUID)
├── contact_id (UUID) → contacts
├── installed_integration_id (UUID)
├── external_id (TEXT)
├── external_platform (TEXT)
└── external_data (JSONB)

-- Eventos de webhook
webhook_events
├── id (UUID)
├── webhook_token (TEXT)
├── event_type (TEXT)
├── payload (JSONB)
├── status (pending | processing | completed | failed)
├── idempotency_key (TEXT)
└── lead_id (UUID) → contacts
```

### Instâncias WhatsApp

```sql
whatsapp_instances
├── id (UUID)
├── provider (evolution | cloud_api | baileys)
├── instance_name (TEXT)
├── phone_number (TEXT)
├── status (disconnected | connecting | qr_pending | connected)
├── qr_code (TEXT) - base64 do QR
├── settings (JSONB)
└── webhook_events (TEXT[])

whatsapp_conversations
├── id (UUID)
├── instance_id (UUID) → whatsapp_instances
├── contact_id (UUID) → contacts
├── chat_id (TEXT) - remote_jid
├── status (open | pending | resolved)
├── unread_count (INTEGER)
└── chatbot_enabled (BOOLEAN)

whatsapp_messages
├── id (UUID)
├── conversation_id (UUID)
├── message_id (TEXT) - ID do WhatsApp
├── direction (inbound | outbound)
├── message_type (text | image | video | audio | document)
├── content (JSONB)
└── status (pending | sent | delivered | read)
```

---

## Normalização de Dados

### Formato Unificado (UnifiedContact)

```typescript
interface UnifiedContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailNormalized?: string;    // lowercase + trim
  phone?: string;
  phoneNormalized?: string;    // formato E.164
  whatsappJid?: string;        // número@s.whatsapp.net
  company?: string;
  position?: string;
  source: string;              // ex: 'shopify_customer'
  platform: string;            // ex: 'shopify'
  externalId?: string;         // ID na plataforma original
  tags: string[];
  customFields: Record<string, any>;
  rawPayload?: Record<string, any>;
}
```

### Normalização de Telefone

```typescript
// Entrada → Saída
'+55 11 99999-9999' → '+5511999999999'
'(11) 99999-9999'   → '+5511999999999'
'011999999999'      → '+5511999999999'
'5511999999999'     → '+5511999999999'
```

### Normalização de Email

```typescript
// Entrada → Saída
' João@Email.COM ' → 'joao@email.com'
```

---

## Hierarquia de Deduplicação

A deduplicação segue uma hierarquia de confiança:

| Prioridade | Critério | Confiança |
|------------|----------|-----------|
| 1 | External ID (mapeamento existente) | 100% |
| 2 | Email normalizado | 95% |
| 3 | WhatsApp JID | 90% |
| 4 | Telefone normalizado | 85% |

---

## Verificação de Assinaturas

### Shopify
```
Header: x-shopify-hmac-sha256
Algoritmo: HMAC-SHA256
Formato: Base64
```

### HubSpot
```
Header: x-hubspot-signature
Algoritmo: SHA256(client_secret + body)
Formato: Hex
```

### Typeform
```
Header: typeform-signature
Algoritmo: HMAC-SHA256
Formato: sha256=Base64
```

### WhatsApp Cloud API
```
Header: x-hub-signature-256
Algoritmo: HMAC-SHA256
Formato: sha256=Hex
Verificação: GET com hub.verify_token
```

---

## Configuração por Plataforma

### Shopify

1. No Admin do Shopify, vá em Settings → Notifications
2. Role até Webhooks e clique em "Create webhook"
3. Selecione os eventos:
   - `customers/create`
   - `orders/create`
   - `checkouts/create`
4. Cole a URL do webhook: `https://seu-app.com/api/webhooks/{token}`
5. Formato: JSON
6. Copie o "Webhook signing secret" para as credenciais

### WhatsApp Cloud API

1. Crie um app no Meta for Developers
2. Adicione o produto WhatsApp
3. Configure o webhook:
   - URL: `https://seu-app.com/api/webhooks/{token}`
   - Verify token: token da instalação
   - Campos: `messages`
4. Gere um System User Access Token permanente

### Evolution API

1. Configure a instância Evolution com webhook:
```json
{
  "url": "https://seu-app.com/api/webhooks/{token}",
  "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
}
```

### Facebook Lead Ads

1. Configure o webhook na página do Facebook
2. Subscribe para eventos `leadgen`
3. Ao receber webhook, busque dados completos via Graph API:
```
GET /{lead_id}?access_token={TOKEN}
```

---

## Extensão do Sistema

### Adicionando Nova Plataforma

1. **Adicionar tipo no enum**
```typescript
// src/lib/integrations/types.ts
export type PlatformType = 
  | 'shopify_customer' 
  | 'nova_plataforma' // Adicionar aqui
  | ...
```

2. **Criar normalizador**
```typescript
// src/lib/integrations/normalizers.ts
export function normalizeNovaPlataforma(payload: any): UnifiedContact {
  return {
    name: payload.nome,
    email: payload.email,
    phone: payload.telefone,
    source: 'nova_plataforma',
    platform: 'nova',
    externalId: payload.id,
    tags: ['nova-plataforma'],
    customFields: payload,
    rawPayload: payload,
  };
}
```

3. **Registrar no switch**
```typescript
// normalizers.ts - função normalizeWebhookPayload
case 'nova_plataforma':
  contact = normalizeNovaPlataforma(payload);
  break;
```

4. **Adicionar processador na rota**
```typescript
// api/webhooks/[token]/route.ts
case 'nova-plataforma':
  lead = await processNovaPlataformaWebhook(supabase, installation, body)
  break
```

5. **Inserir no catálogo**
```sql
INSERT INTO integrations (slug, name, ...) 
VALUES ('nova-plataforma', 'Nova Plataforma', ...);
```

---

## Arquivos do Sistema

```
src/
├── lib/
│   └── integrations/
│       ├── index.ts           # Exportações
│       ├── types.ts           # Tipos e interfaces
│       ├── normalizers.ts     # Normalizadores por plataforma
│       └── webhook-processor.ts # Engine de processamento
│
├── app/
│   └── api/
│       └── webhooks/
│           └── [token]/
│               └── route.ts   # Endpoint de webhook
│
public/
└── integrations/
    ├── shopify.svg
    ├── whatsapp.svg
    ├── facebook.svg
    ├── instagram.svg
    ├── evolution.svg
    ├── google-forms.svg
    ├── google-sheets.svg
    ├── typeform.svg
    └── web-form.svg

supabase/
└── integrations-v2-complete.sql  # Schema completo
```

---

## Boas Práticas

### Performance
- Responder webhook em < 5 segundos
- Para processamento pesado, usar fila (BullMQ + Redis)
- Índices em `webhook_token`, `idempotency_key`

### Segurança
- Sempre verificar assinatura HMAC
- Usar timing-safe comparison
- Armazenar secrets criptografados
- Validar IP de origem (quando possível)

### Confiabilidade
- Idempotência via tracking de event IDs
- Retry com backoff exponencial
- Dead Letter Queue para eventos falhados
- Logs detalhados de processamento

### Deduplicação
- Normalizar campos antes de comparar
- Manter mapeamento de external IDs
- Priorizar identificadores únicos (email > phone)
- Preservar dados existentes no merge

---

## Referências

- [Shopify Webhooks](https://shopify.dev/docs/api/webhooks)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Evolution API](https://doc.evolution-api.com)
- [Facebook Lead Ads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads)
- [Typeform Webhooks](https://www.typeform.com/developers/webhooks/)
- [Google Drive Push Notifications](https://developers.google.com/workspace/drive/api/guides/push)
