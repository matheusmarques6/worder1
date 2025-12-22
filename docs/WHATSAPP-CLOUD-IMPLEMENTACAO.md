# WhatsApp Cloud API - Guia de Implementação

## 📁 Arquivos Criados

```
src/
├── lib/
│   └── whatsapp/
│       └── cloud-api.ts              # Cliente completo da API
├── app/
│   └── api/
│       └── whatsapp/
│           └── cloud/
│               ├── accounts/
│               │   └── route.ts      # CRUD de contas WABA
│               ├── webhook/
│               │   └── route.ts      # Receptor de webhooks
│               ├── messages/
│               │   └── route.ts      # Envio de mensagens
│               ├── conversations/
│               │   └── route.ts      # Gerenciar conversas
│               └── templates/
│                   └── route.ts      # Gerenciar templates
└── components/
    └── integrations/
        └── whatsapp/
            └── WhatsAppCloudConnect.tsx  # Componente de conexão
```

## 🚀 Passos para Implementar

### 1. Executar SQL
Execute o SQL das tabelas no Supabase:
- `whatsapp_business_accounts`
- `whatsapp_templates`
- `whatsapp_cloud_conversations`
- `whatsapp_cloud_messages`

### 2. Variáveis de Ambiente
Adicione ao `.env.local`:

```env
# Meta / WhatsApp
META_APP_SECRET=seu_app_secret_do_meta
WHATSAPP_WEBHOOK_VERIFY_TOKEN=token_global_opcional

# URL do app (para webhook)
NEXT_PUBLIC_APP_URL=https://app.worder.com.br
```

### 3. Obter Credenciais no Meta

1. Acesse https://developers.facebook.com/
2. Crie ou acesse seu App
3. Adicione o produto "WhatsApp"
4. Em **API Setup**:
   - Anote o **Phone Number ID**
   - Anote o **WhatsApp Business Account ID** (WABA ID)
5. Em **System Users** (Business Settings):
   - Crie um System User
   - Gere um **Token Permanente** com permissão `whatsapp_business_messaging`

### 4. Configurar Webhook no Meta

Após conectar a conta no sistema:

1. Vá para seu App > WhatsApp > Configuration
2. Em **Webhook**, clique "Edit"
3. **Callback URL**: `https://app.worder.com.br/api/whatsapp/cloud/webhook`
4. **Verify Token**: use o token mostrado após conectar
5. Clique "Verify and Save"
6. Inscreva-se nos campos:
   - `messages`
   - `message_template_status_update`

## 📡 API Endpoints

### Accounts (Contas)

```
GET    /api/whatsapp/cloud/accounts          # Listar contas
POST   /api/whatsapp/cloud/accounts          # Conectar conta
DELETE /api/whatsapp/cloud/accounts?id=xxx   # Desconectar
```

### Messages (Mensagens)

```
GET  /api/whatsapp/cloud/messages?conversationId=xxx  # Listar mensagens
POST /api/whatsapp/cloud/messages                      # Enviar mensagem
```

**Enviar texto:**
```json
{
  "accountId": "uuid",
  "to": "5511999999999",
  "type": "text",
  "content": "Olá!"
}
```

**Enviar template:**
```json
{
  "accountId": "uuid",
  "to": "5511999999999",
  "type": "template",
  "templateName": "hello_world",
  "templateLanguage": "pt_BR",
  "templateComponents": []
}
```

**Enviar imagem:**
```json
{
  "accountId": "uuid",
  "to": "5511999999999",
  "type": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Descrição da imagem"
}
```

**Enviar botões:**
```json
{
  "accountId": "uuid",
  "to": "5511999999999",
  "type": "buttons",
  "content": "Escolha uma opção:",
  "buttons": [
    { "id": "opt1", "title": "Opção 1" },
    { "id": "opt2", "title": "Opção 2" }
  ]
}
```

### Conversations (Conversas)

```
GET   /api/whatsapp/cloud/conversations              # Listar conversas
POST  /api/whatsapp/cloud/conversations              # Criar conversa
PATCH /api/whatsapp/cloud/conversations              # Atualizar conversa
```

**Criar conversa:**
```json
{
  "accountId": "uuid",
  "phoneNumber": "5511999999999",
  "contactName": "João Silva"
}
```

**Marcar como lido:**
```json
{
  "conversationId": "uuid",
  "markAsRead": true
}
```

### Templates

```
GET    /api/whatsapp/cloud/templates?accountId=xxx&sync=true  # Listar (sync da Meta)
POST   /api/whatsapp/cloud/templates                           # Criar template
DELETE /api/whatsapp/cloud/templates?id=xxx&accountId=xxx     # Deletar
```

### Webhook

```
GET  /api/whatsapp/cloud/webhook   # Verificação do Meta
POST /api/whatsapp/cloud/webhook   # Receber eventos
```

## 🔑 Regras de Negócio Importantes

### Janela de 24 Horas
- Mensagens de texto/mídia só podem ser enviadas dentro de 24h após a última mensagem do cliente
- Fora da janela, apenas **Templates** podem ser enviados
- O sistema verifica automaticamente e retorna erro `WINDOW_EXPIRED`

### Templates
- Templates precisam ser aprovados pela Meta (até 24h)
- Categorias: MARKETING, UTILITY, AUTHENTICATION
- Nome deve conter apenas letras minúsculas e underscore

### Qualidade da Conta
- **GREEN**: Boa qualidade
- **YELLOW**: Atenção - pode haver restrições
- **RED**: Baixa qualidade - risco de bloqueio

## 🧪 Testando

### 1. Conectar conta
Use o componente `WhatsAppCloudConnect` ou chame diretamente:

```typescript
const response = await fetch('/api/whatsapp/cloud/accounts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    wabaId: '123456789',
    phoneNumberId: '987654321',
    accessToken: 'EAAxxxxxxxx...',
  }),
});
```

### 2. Enviar mensagem de teste
```typescript
const response = await fetch('/api/whatsapp/cloud/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    accountId: 'uuid-da-conta',
    to: '5511999999999',
    type: 'template',
    templateName: 'hello_world',
  }),
});
```

### 3. Verificar webhook
O Meta fará uma requisição GET com:
- `hub.mode=subscribe`
- `hub.verify_token=seu_token`
- `hub.challenge=random_string`

O sistema verifica e retorna o challenge.

## 🐛 Troubleshooting

### Erro: "Conversation window expired"
- Solução: Envie um template primeiro para reabrir a janela

### Erro: "Invalid credentials"
- Verifique se o token está correto
- Verifique se tem permissão `whatsapp_business_messaging`

### Webhook não funciona
- Verifique se a URL está correta
- Verifique se o verify token está certo
- Confira se inscreveu nos campos `messages`

### Template não aparece
- Use `sync=true` na query para sincronizar da Meta
- Verifique se foi aprovado no Business Manager

## 📊 Monitoramento

Os seguintes campos são atualizados automaticamente:
- `messages_sent_today`
- `messages_received_today`
- `total_messages_sent`
- `total_messages_received`
- `last_message_at`
- `last_webhook_at`

Use para dashboards e alertas.
