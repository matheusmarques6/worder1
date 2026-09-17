# 📱 Worder WhatsApp CRM - Documentação Completa

## 📋 Sumário
1. [Visão Geral](#visão-geral)
2. [Instalação e Configuração](#instalação-e-configuração)
3. [Estrutura de Arquivos](#estrutura-de-arquivos)
4. [APIs Backend](#apis-backend)
5. [Banco de Dados](#banco-de-dados)
6. [Frontend e Componentes](#frontend-e-componentes)
7. [Webhooks e Integrações](#webhooks-e-integrações)
8. [Deploy](#deploy)

---

## 🎯 Visão Geral

O módulo WhatsApp CRM do Worder oferece:

- **Chat em Tempo Real**: Conversas com clientes via WhatsApp Business API
- **Chatbot com Flow Builder**: Automação visual de atendimento
- **Campanhas em Massa**: Disparo de templates aprovados para listas de contatos
- **Gestão de Agentes**: Atribuição de chats, fila de atendimento
- **Phonebooks**: Listas de contatos com importação CSV
- **Tags e Organização**: Classificação de conversas

---

## ⚙️ Instalação e Configuração

### 1. Variáveis de Ambiente

Adicione ao seu `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# WhatsApp Business API
WHATSAPP_VERIFY_TOKEN=worder-whatsapp-verify

# Worker (para campanhas)
CRON_SECRET=worder-cron-secret
```

### 2. Configurar WhatsApp Business API

1. Acesse [Meta Business Suite](https://business.facebook.com)
2. Crie um app em "Meta for Developers"
3. Adicione o produto "WhatsApp"
4. Configure o webhook: `https://seudominio.com/api/whatsapp/webhook`
5. Copie as credenciais:
   - Phone Number ID
   - Business Account ID
   - Access Token (permanente)

### 3. Executar Schema do Banco

Execute o arquivo `supabase/whatsapp-schema.sql` no SQL Editor do Supabase.

### 4. Configurar no Sistema

1. Acesse Configurações > Integrações > WhatsApp
2. Insira as credenciais da Meta
3. Teste a conexão

---

## 📁 Estrutura de Arquivos

```
src/
├── app/
│   ├── api/whatsapp/
│   │   ├── conversations/route.ts   # CRUD de conversas
│   │   ├── messages/route.ts        # Envio/recebimento de mensagens
│   │   ├── templates/route.ts       # Templates Meta
│   │   ├── campaigns/route.ts       # Campanhas em massa
│   │   ├── flows/route.ts           # Flow Builder
│   │   ├── phonebooks/route.ts      # Listas de contatos
│   │   ├── tags/route.ts            # Tags de conversas
│   │   ├── agents/route.ts          # Agentes de atendimento
│   │   └── webhook/route.ts         # Webhook Meta
│   │
│   └── (dashboard)/whatsapp/
│       ├── page.tsx                 # Chat principal
│       ├── campaigns/page.tsx       # Gerenciar campanhas
│       ├── flows/page.tsx           # Flow Builder
│       └── phonebooks/page.tsx      # Listas de contatos
│
├── hooks/
│   └── useWhatsApp.ts               # Hooks customizados
│
└── stores/
    └── index.ts                     # Zustand stores (inclui WhatsApp)
```

---

## 🔌 APIs Backend

### Conversas (`/api/whatsapp/conversations`)

| Método | Parâmetros | Descrição |
|--------|------------|-----------|
| GET | `?status=open&search=João` | Lista conversas com filtros |
| POST | `{ phone_number, contact_name }` | Cria nova conversa |
| PATCH | `{ id, status, assigned_agent_id }` | Atualiza conversa |
| DELETE | `?id=xxx&action=archive` | Arquiva/deleta conversa |

### Mensagens (`/api/whatsapp/messages`)

| Método | Parâmetros | Descrição |
|--------|------------|-----------|
| GET | `?conversation_id=xxx` | Lista mensagens da conversa |
| POST | `{ conversation_id, content, type }` | Envia mensagem |

**Tipos de mensagem suportados:**
- `text`: Texto simples
- `image`: Imagem com caption
- `video`: Vídeo
- `audio`: Áudio
- `document`: Documento/PDF
- `template`: Template aprovado

### Campanhas (`/api/whatsapp/campaigns`)

| Método | Parâmetros | Descrição |
|--------|------------|-----------|
| GET | `?status=RUNNING` | Lista campanhas |
| POST | `{ title, template_name, phonebook_id }` | Cria campanha |
| PATCH | `{ id, action: 'start' }` | Controla campanha (start/pause/cancel) |
| DELETE | `?id=xxx` | Remove campanha |

### Phonebooks (`/api/whatsapp/phonebooks`)

| Método | Parâmetros | Descrição |
|--------|------------|-----------|
| GET | `?phonebook_id=xxx` | Lista phonebooks ou contatos |
| POST | `{ action: 'create_phonebook', name }` | Cria phonebook |
| POST | `{ action: 'add_contacts', contacts }` | Adiciona contatos |
| POST | `{ action: 'import_csv', csv_data }` | Importa CSV |

### Flows (`/api/whatsapp/flows`)

| Método | Parâmetros | Descrição |
|--------|------------|-----------|
| GET | `?id=xxx` | Lista ou busca flow |
| POST | `{ name, nodes, edges }` | Cria flow |
| PATCH | `{ id, nodes, edges, is_active }` | Atualiza flow |
| DELETE | `?id=xxx` | Remove flow |

---

## 🗄️ Banco de Dados

### Tabelas Principais

```sql
-- Instâncias/Conexões WhatsApp
whatsapp_instances

-- Conversas
whatsapp_conversations

-- Mensagens
whatsapp_messages

-- Templates (cache local)
whatsapp_templates

-- Flows (automação)
whatsapp_flows

-- Sessões de Flow
whatsapp_flow_sessions

-- Chatbots
whatsapp_chatbots

-- Campanhas
whatsapp_campaigns

-- Logs de Campanha
whatsapp_campaign_logs

-- Phonebooks
phonebooks, phonebook_contacts

-- Tags
whatsapp_chat_tags, whatsapp_conversation_tags

-- Agentes
whatsapp_agents, whatsapp_agent_assignments
```

### Row Level Security (RLS)

Todas as tabelas implementam RLS por `organization_id` usando a função:

```sql
user_belongs_to_org(org_id UUID)
```

---

## 🎨 Frontend e Componentes

### Hooks Disponíveis (`useWhatsApp.ts`)

```typescript
// Conversas
const { conversations, fetchConversations, createConversation } = useWhatsAppConversations()

// Mensagens
const { messages, sendMessage } = useWhatsAppMessages(conversationId)

// Campanhas
const { campaigns, createCampaign, controlCampaign } = useWhatsAppCampaigns()

// Flows
const { flows, createFlow, updateFlow } = useWhatsAppFlows()

// Phonebooks
const { phonebooks, createPhonebook, importCSV } = useWhatsAppPhonebooks()

// Tags
const { tags, createTag, assignTag } = useWhatsAppTags()

// Agentes
const { agents, assignChat, resolveChat } = useWhatsAppAgents()

// Templates
const { templates, fetchTemplates } = useWhatsAppTemplates()
```

### Páginas

- `/whatsapp` - Chat principal com lista de conversas
- `/whatsapp/campaigns` - Criar e gerenciar campanhas
- `/whatsapp/flows` - Editor visual de chatbots
- `/whatsapp/phonebooks` - Listas de contatos

---

## 🔗 Webhooks e Integrações

### Configurar Webhook Meta

1. URL: `https://seudominio.com/api/whatsapp/webhook`
2. Token de verificação: `WHATSAPP_VERIFY_TOKEN` do .env
3. Eventos para assinar:
   - `messages`
   - `message_deliveries`
   - `message_reads`

### Processar Campanhas (Cron Job)

Configure um cron job para chamar periodicamente:

```bash
# ATENÇÃO: /api/workers/campaign foi aposentado (responde 410).
# O envio passa por WhatsAppCampaignProcessor (fila + lotes).
curl -X POST https://seudominio.com/api/workers/campaign \
  -H "Authorization: Bearer $CRON_SECRET"
```

Intervalo recomendado: 1 minuto

### Exemplo com Vercel Cron

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/workers/campaign",
      "schedule": "* * * * *"
    }
  ]
}
```

---

## 🚀 Deploy

### 1. Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 2. Configurar Variáveis

No dashboard da Vercel, adicione todas as variáveis de ambiente.

### 3. Configurar Domínio Customizado

1. Adicione seu domínio na Vercel
2. Configure DNS
3. Atualize URL do webhook na Meta

### 4. Testar Integração

1. Envie uma mensagem para o número do WhatsApp Business
2. Verifique se aparece no dashboard
3. Responda pelo sistema
4. Confirme que a resposta chegou no WhatsApp

---

## 📊 Monitoramento

### Logs Importantes

- Console do Supabase: Logs de funções
- Vercel Logs: Requisições API
- Meta Business: Status de mensagens

### Métricas Recomendadas

- Taxa de entrega de mensagens
- Tempo médio de resposta
- Conversas por dia
- Taxa de sucesso de campanhas

---

## 🆘 Troubleshooting

### Mensagens não chegam

1. Verifique se o webhook está configurado corretamente
2. Confirme que o `access_token` é válido
3. Verifique logs do webhook

### Erro 131030 (Rate limit)

- Reduza o `send_interval_ms` das campanhas
- Verifique limites da sua conta Meta

### Templates rejeitados

- Siga as [diretrizes da Meta](https://developers.facebook.com/docs/whatsapp/message-templates/guidelines)
- Evite URLs não verificados
- Use linguagem clara e profissional

---

## 📝 Próximos Passos

1. [ ] Implementar notificações push
2. [ ] Adicionar suporte a áudio/vídeo
3. [ ] Integrar com CRM (deals automáticos)
4. [ ] Dashboard de analytics
5. [ ] Multi-atendentes em tempo real
6. [ ] Integração com IA (GPT)

---

**Desenvolvido para Worder** | Documentação v1.0 | Dezembro 2024
