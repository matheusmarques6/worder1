# 📱 Guia de Conexão WhatsApp Business

## Dados Necessários do Cliente

Para conectar o WhatsApp Business API, o cliente precisa fornecer **3 informações**:

| Campo | Obrigatório | Onde Encontrar |
|-------|-------------|----------------|
| **Phone Number ID** | ✅ Sim | Meta for Developers → WhatsApp → API Setup |
| **WABA ID** | ⚪ Opcional | Meta Business Suite → Configurações → Contas do WhatsApp |
| **Access Token** | ✅ Sim | System User Token (permanente) |

---

## 🔑 Passo a Passo para o Cliente

### 1. Acessar o Meta for Developers

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Faça login com a conta do Facebook vinculada ao negócio
3. Vá em **My Apps** → Selecione o app com WhatsApp
4. No menu lateral, clique em **WhatsApp → API Setup**

### 2. Copiar Phone Number ID

Na página de API Setup, você verá:
- **Phone Number ID**: Um número como `123456789012345`
- **WhatsApp Business Account ID**: Outro número similar

⚠️ **Importante**: Copie o **Phone Number ID**, não o número de telefone!

### 3. Gerar Access Token Permanente

O token temporário expira em 24h. Para produção, crie um **System User Token**:

1. Acesse [business.facebook.com/settings](https://business.facebook.com/settings)
2. Vá em **Users → System Users**
3. Clique em **Add** para criar um System User
4. Configure:
   - **Nome**: Ex: "Worder API"
   - **Role**: Admin
5. Clique em **Add Assets**:
   - Selecione seu **App** → Full Control
   - Selecione seu **WABA** → Full Control
6. Clique em **Generate New Token**
7. Selecione as permissões:
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`
8. Copie o token (aparece **apenas uma vez**!)

---

## 🔗 Configurando no Worder

1. Acesse **Configurações → Integrações**
2. Na seção **Mensagens**, clique em **Conectar WhatsApp**
3. Preencha os campos:
   - **Phone Number ID**: Cole o ID copiado
   - **WABA ID** (opcional): Cole se tiver
   - **Access Token**: Cole o token permanente
4. Clique em **Conectar**

---

## ⚙️ Configurar Webhook (Importante!)

Após conectar, você precisa configurar o webhook no Meta:

1. No Meta for Developers, vá em **WhatsApp → Configuration**
2. Em **Webhook**, clique em **Edit**
3. Configure:
   - **Callback URL**: Use a URL mostrada no Worder
   - **Verify Token**: Use o token mostrado no Worder
4. Clique em **Verify and Save**
5. Em **Webhook Fields**, ative:
   - ✅ `messages`
   - ✅ `message_template_status_update` (opcional)

---

## ❓ Problemas Comuns

### "Access Token inválido"
- Verifique se copiou o token completo (começa com `EAAG...`)
- O token temporário pode ter expirado (24h)
- Gere um novo System User Token

### "Phone Number ID inválido"
- Certifique-se que copiou o **Phone Number ID**, não o número de telefone
- O ID é um número longo como `123456789012345`

### "Permissões insuficientes"
- O System User precisa de role **Admin**
- Verifique se adicionou o App e WABA como assets
- O token precisa das permissões `whatsapp_business_messaging` e `whatsapp_business_management`

### "Webhook não verificado"
- Certifique-se que o domínio tem HTTPS válido
- O Verify Token deve ser exatamente igual
- A URL de callback deve responder em menos de 5 segundos

---

## 📊 Requisitos de Verificação

| Situação | Limite de Mensagens |
|----------|---------------------|
| Sem verificação | 250/dia |
| Com verificação | 1.000/dia (Tier 1) |
| Tier 2 | 10.000/dia |
| Tier 3 | 100.000/dia |
| Unlimited | Ilimitado |

Para aumentar o limite, complete a **Verificação do Negócio** no Meta Business Suite.

---

## 🆘 Suporte

- [Documentação Meta WhatsApp Business](https://developers.facebook.com/docs/whatsapp)
- [Meta Business Help Center](https://www.facebook.com/business/help)
