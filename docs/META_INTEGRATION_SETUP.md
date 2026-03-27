# Guia de Integracao WhatsApp e Instagram

Este documento descreve o passo a passo para configurar a integracao com a API oficial do WhatsApp Business e Instagram Messaging.

## Indice

1. [Pre-requisitos](#pre-requisitos)
2. [Criar App no Meta for Developers](#criar-app-no-meta-for-developers)
3. [Configurar WhatsApp Business API](#configurar-whatsapp-business-api)
4. [Configurar Instagram Messaging API](#configurar-instagram-messaging-api)
5. [Configurar Webhooks](#configurar-webhooks)
6. [Variaveis de Ambiente](#variaveis-de-ambiente)
7. [Testar a Integracao](#testar-a-integracao)

---

## Pre-requisitos

Antes de comecar, voce precisa de:

1. **Conta de negocio verificada no Meta Business Suite**
   - Acesse: https://business.facebook.com
   - Complete a verificacao da empresa

2. **Numero de telefone para WhatsApp** (nao pode estar registrado em outro WhatsApp)

3. **Conta Instagram Business** conectada a uma Pagina do Facebook

4. **Servidor com HTTPS** para receber webhooks (localhost nao funciona)

---

## Criar App no Meta for Developers

### Passo 1: Acessar o Meta for Developers

1. Acesse https://developers.facebook.com
2. Faca login com sua conta do Facebook
3. Clique em "My Apps" no canto superior direito

### Passo 2: Criar Novo App

1. Clique em "Create App"
2. Selecione "Business" como tipo de app
3. Preencha:
   - **App Name**: Nome do seu app (ex: "Meu CRM WhatsApp")
   - **Contact Email**: Seu email
   - **Business Account**: Selecione sua conta de negocio verificada
4. Clique em "Create App"

### Passo 3: Adicionar Produtos

No painel do app, adicione os seguintes produtos:

1. **WhatsApp** - Clique em "Set up" no card do WhatsApp
2. **Instagram** - Clique em "Set up" no card do Instagram

---

## Configurar WhatsApp Business API

### Passo 1: Configurar Numero de Telefone

1. No menu lateral, va em **WhatsApp > Getting Started**
2. Siga o wizard para:
   - Criar ou conectar uma conta WhatsApp Business (WABA)
   - Adicionar um numero de telefone
   - Verificar o numero via SMS ou ligacao

### Passo 2: Obter Credenciais

Apos configurar, voce tera:

- **Phone Number ID**: ID unico do seu numero (ex: `123456789012345`)
- **WhatsApp Business Account ID (WABA ID)**: ID da conta business (ex: `987654321098765`)

### Passo 3: Gerar Access Token

1. Va em **WhatsApp > API Setup**
2. Na secao "Temporary Access Token", clique em "Generate"
3. Copie o token (ele expira em 24h)

**Para token permanente (recomendado para producao):**

1. Va em **Settings > Basic** e pegue o **App Secret**
2. Va em **Business Settings > System Users**
3. Crie um System User com permissao de Admin
4. Gere um token permanente para este System User
5. Adicione a permissao `whatsapp_business_messaging`

### Passo 4: Configurar Templates (Opcional)

Para enviar mensagens proativas (fora da janela de 24h):

1. Va em **WhatsApp > Message Templates**
2. Crie templates e aguarde aprovacao (pode levar ate 24h)
3. Categorias disponiveis:
   - **UTILITY**: Atualizacoes de pedidos, notificacoes
   - **MARKETING**: Promocoes, ofertas
   - **AUTHENTICATION**: Codigos de verificacao

---

## Configurar Instagram Messaging API

### Passo 1: Conectar Conta Instagram

1. No menu lateral, va em **Instagram > API Setup**
2. Clique em "Add or Remove Instagram Accounts"
3. Faca login com a conta Instagram Business
4. Autorize o app

**Requisitos da conta Instagram:**
- Deve ser uma conta Business ou Creator
- Deve estar conectada a uma Pagina do Facebook
- A Pagina deve estar vinculada ao seu Business Manager

### Passo 2: Obter Credenciais

Apos conectar:

- **Instagram User ID**: ID unico da conta (ex: `17841400000000000`)
- **Page ID**: ID da pagina do Facebook conectada

### Passo 3: Gerar Access Token

O token do Instagram e obtido atraves da Pagina do Facebook conectada:

1. Va em **Settings > Access Tokens**
2. Selecione a Pagina conectada ao Instagram
3. Gere um token com as permissoes:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_messaging`
   - `pages_read_engagement`

---

## Configurar Webhooks

### Passo 1: Webhook do WhatsApp

1. Va em **WhatsApp > Configuration**
2. Na secao "Webhook", clique em "Edit"
3. Preencha:
   - **Callback URL**: `https://seu-dominio.com/api/whatsapp/cloud/webhook`
   - **Verify Token**: Crie um token seguro (ex: `meu_token_secreto_123`)
4. Clique em "Verify and Save"

5. Em "Webhook Fields", inscreva-se em:
   - `messages` - Receber mensagens
   - `message_status` - Status de entrega
   - `message_template_status_update` - Status de templates

### Passo 2: Webhook do Instagram

1. Va em **Instagram > Webhooks**
2. Clique em "Add Subscription"
3. Preencha:
   - **Callback URL**: `https://seu-dominio.com/api/instagram/webhook`
   - **Verify Token**: Mesmo token ou um diferente
4. Clique em "Verify and Save"

5. Inscreva-se nos campos:
   - `messages` - Mensagens diretas
   - `messaging_postbacks` - Cliques em botoes
   - `messaging_optins` - Opt-ins

### Passo 3: Verificar Conexao

Apos configurar, o Meta enviara uma requisicao GET para verificar seu webhook.
Seu servidor deve responder com o `hub.challenge` recebido.

---

## Variaveis de Ambiente

Adicione estas variaveis ao seu arquivo `.env`:

```env
# ===========================================
# META APP CONFIGURATION
# ===========================================

# App IDs (encontre em App Settings > Basic)
META_APP_ID=your_app_id_here
META_APP_SECRET=your_app_secret_here

# ===========================================
# WHATSAPP BUSINESS API
# ===========================================

# ID do numero de telefone (WhatsApp > API Setup)
WHATSAPP_PHONE_NUMBER_ID=123456789012345

# ID da conta WhatsApp Business
WHATSAPP_WABA_ID=987654321098765

# Access Token permanente
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxx...

# Token de verificacao do webhook (voce define)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=seu_token_secreto_whatsapp

# ===========================================
# INSTAGRAM MESSAGING API
# ===========================================

# ID da conta Instagram Business
INSTAGRAM_USER_ID=17841400000000000

# Access Token da pagina/instagram
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxx...

# Token de verificacao do webhook (voce define)
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=seu_token_secreto_instagram

# ===========================================
# OPTIONAL: GLOBAL WEBHOOK TOKEN
# ===========================================

# Se quiser usar o mesmo token para todos os webhooks
WEBHOOK_VERIFY_TOKEN=token_global_opcional
```

---

## Testar a Integracao

### Testar WhatsApp

1. **Enviar mensagem de teste:**

```bash
curl -X POST "https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5511999999999",
    "type": "template",
    "template": {
      "name": "hello_world",
      "language": { "code": "en_US" }
    }
  }'
```

2. **Verificar webhook:**
   - Envie uma mensagem para seu numero WhatsApp Business
   - Verifique os logs do seu servidor

### Testar Instagram

1. **Enviar mensagem de teste:**

```bash
curl -X POST "https://graph.facebook.com/v21.0/IG_USER_ID/messages" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": { "id": "RECIPIENT_ID" },
    "message": { "text": "Ola! Esta e uma mensagem de teste." }
  }'
```

2. **Verificar webhook:**
   - Envie um DM para sua conta Instagram Business
   - Verifique os logs do seu servidor

---

## Limites e Boas Praticas

### WhatsApp

| Tier | Mensagens/segundo | Mensagens/dia |
|------|------------------|---------------|
| Nao verificado | 10 | 250 |
| Tier 1 | 40 | 2.000 |
| Tier 2 | 60 | 10.000 |
| Tier 3 | 80 | 100.000 |
| Unlimited | 500 | Ilimitado |

**Boas praticas:**
- Use templates aprovados para mensagens proativas
- Responda dentro da janela de 24h para mensagens "session"
- Implemente retry com exponential backoff
- Monitore a qualidade do numero (Green, Yellow, Red)

### Instagram

| Limite | Valor |
|--------|-------|
| Janela de resposta | 7 dias |
| Mensagens por requisicao | 1 |
| Ice Breakers | Maximo 4 |
| Quick Replies | Maximo 13 |
| Botoes por template | Maximo 3 |

**Boas praticas:**
- Responda rapidamente para manter engajamento
- Use Quick Replies para facilitar interacao
- Nao envie mensagens em massa nao solicitadas
- Respeite as politicas de spam do Instagram

---

## Troubleshooting

### Erro 190: Token Expirado

O token de acesso expirou. Gere um novo token permanente usando System User.

### Erro 100: Parametro Invalido

Verifique se o numero de telefone esta no formato correto (codigo pais + numero, sem espacos ou caracteres especiais).

### Erro 131047: Janela Expirada

A janela de 24h (WhatsApp) ou 7 dias (Instagram) expirou. Use um template aprovado.

### Webhook nao recebe eventos

1. Verifique se a URL esta acessivel externamente (HTTPS obrigatorio)
2. Confirme que o Verify Token esta correto
3. Verifique se voce se inscreveu nos campos corretos
4. Cheque os logs do Meta Developer Dashboard

---

## Suporte

- **Documentacao WhatsApp**: https://developers.facebook.com/docs/whatsapp/cloud-api
- **Documentacao Instagram**: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
- **Meta Developer Support**: https://developers.facebook.com/support

---

*Ultima atualizacao: Marco 2026 - API v21.0*
