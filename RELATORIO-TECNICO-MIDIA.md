# 📊 RELATÓRIO TÉCNICO - PROBLEMA DE MÍDIA (IMAGENS/ÁUDIOS)

## 🔍 DIAGNÓSTICO

### O que funciona ✅
1. **Frontend (InboxTab.tsx)** - Já está preparado para exibir mídia
2. **API de mensagens** - Já retorna `media_url` do banco
3. **Tabela whatsapp_messages** - Tem coluna `media_url`

### O que NÃO funciona ❌
**O webhook principal (`/api/whatsapp/webhook/route.ts`) NÃO salva a URL da mídia**

---

## 🔬 ANÁLISE TÉCNICA DETALHADA

### 1. Webhook Principal (COM BUG)
**Arquivo:** `src/app/api/whatsapp/webhook/route.ts`

```javascript
// Linha 257-263: Detecta tipo mas NÃO extrai URL
if (message?.imageMessage) content = '[Imagem]'
else if (message?.audioMessage) content = '[Áudio]'
else if (message?.videoMessage) content = '[Vídeo]'
else if (message?.documentMessage) content = message?.documentMessage?.fileName || '[Documento]'

// Linha 366-378: Salva SEM media_url
const { data: savedMsg, error: msgError } = await supabase
  .from('whatsapp_messages')
  .insert({
    organization_id: orgId,
    instance_id: instance.id,
    conversation_id: conversation.id,
    message_id: messageId,
    direction: 'inbound',
    message_type: messageType,
    content: { text: content },      // ← Só salva "[Imagem]"
    text_body: content,              // ← Só salva "[Imagem]"
    from_number: phoneNumber,
    status: 'received',
    timestamp: new Date().toISOString(),
    // ❌ FALTA: media_url, media_mime_type
  })
```

### 2. Webhook Evolution (CORRETO - para referência)
**Arquivo:** `src/app/api/whatsapp/evolution/webhook/route.ts`

```javascript
// Extrai URL corretamente
if (message?.imageMessage) {
  messageType = 'image';
  content = content || '[Imagem]';
  mediaUrl = message.imageMessage.url;        // ✅ Extrai URL
  mediaMimeType = message.imageMessage.mimetype;
}

// Salva COM media_url
const { data: savedMessage } = await supabase
  .from('whatsapp_messages')
  .insert({
    // ... outros campos
    media_url: mediaUrl,              // ✅ Salva URL
    media_mime_type: mediaMimeType,   // ✅ Salva tipo
  })
```

### 3. Frontend (PRONTO)
**Arquivo:** `src/app/(dashboard)/whatsapp/components/InboxTab.tsx`

```jsx
// Linha 1090-1098: Já renderiza mídia
{msg.media_url && msg.message_type === 'image' && (
  <img src={msg.media_url} alt="" className="rounded-lg mb-2 max-w-full" />
)}
{msg.media_url && msg.message_type === 'audio' && (
  <audio controls src={msg.media_url} className="max-w-full mb-2" />
)}
{msg.media_url && msg.message_type === 'document' && (
  <a href={msg.media_url} target="_blank" className="...">
    <FileText /> Download
  </a>
)}
```

### 4. API de Mensagens (PRONTO)
**Arquivo:** `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts`

```javascript
// Linha 29-40: Já retorna media_url
const messages = (data || []).map(msg => ({
  id: msg.id,
  message_type: msg.message_type || 'text',
  content: ...,
  media_url: msg.media_url,         // ✅ Retorna do banco
  media_filename: msg.media_filename,
}))
```

---

## 🔧 FLUXO DO PROBLEMA

```
Evolution API → Webhook → Banco de Dados → API → Frontend

1. Evolution API envia:
   {
     message: {
       imageMessage: {
         url: "https://..../image.jpg",    ← URL da imagem
         mimetype: "image/jpeg"
       }
     }
   }

2. Webhook RECEBE mas NÃO EXTRAI a URL:
   message_type = 'image'  ✅
   media_url = undefined   ❌ (não extrai)

3. Banco de Dados SALVA sem URL:
   {
     message_type: 'image',
     content: '[Imagem]',
     media_url: NULL        ❌
   }

4. API retorna:
   {
     message_type: 'image',
     content: '[Imagem]',
     media_url: null        ❌
   }

5. Frontend verifica:
   msg.media_url && msg.message_type === 'image'
   null && 'image' = false  → NÃO RENDERIZA
```

---

## ✅ SOLUÇÃO

Corrigir o webhook principal para extrair e salvar a URL da mídia.

**Mudanças necessárias no arquivo `src/app/api/whatsapp/webhook/route.ts`:**

### ANTES (linhas ~256-276):
```javascript
// Extrair conteúdo da mensagem
let content = message?.conversation || 
              message?.extendedTextMessage?.text || 
              message?.imageMessage?.caption ||
              message?.videoMessage?.caption ||
              messageData?.body ||
              ''
              
if (!content) {
  if (message?.imageMessage) content = '[Imagem]'
  else if (message?.audioMessage) content = '[Áudio]'
  else if (message?.videoMessage) content = '[Vídeo]'
  else if (message?.documentMessage) content = message?.documentMessage?.fileName || '[Documento]'
  // ...
}

// Determinar tipo de mensagem
let messageType = messageData?.messageType || 'text'
if (message?.imageMessage) messageType = 'image'
if (message?.audioMessage) messageType = 'audio'
if (message?.videoMessage) messageType = 'video'
if (message?.documentMessage) messageType = 'document'
```

### DEPOIS:
```javascript
// Extrair conteúdo da mensagem
let content = message?.conversation || 
              message?.extendedTextMessage?.text || 
              message?.imageMessage?.caption ||
              message?.videoMessage?.caption ||
              messageData?.body ||
              ''

// ✅ NOVO: Variáveis para mídia
let messageType = 'text'
let mediaUrl = null
let mediaMimeType = null

// ✅ NOVO: Extrair URL e tipo de cada tipo de mídia
if (message?.imageMessage) {
  messageType = 'image'
  content = content || '[Imagem]'
  mediaUrl = message.imageMessage.url
  mediaMimeType = message.imageMessage.mimetype
}
else if (message?.audioMessage) {
  messageType = 'audio'
  content = '[Áudio]'
  mediaUrl = message.audioMessage.url
  mediaMimeType = message.audioMessage.mimetype
}
else if (message?.videoMessage) {
  messageType = 'video'
  content = content || '[Vídeo]'
  mediaUrl = message.videoMessage.url
  mediaMimeType = message.videoMessage.mimetype
}
else if (message?.documentMessage) {
  messageType = 'document'
  content = message.documentMessage.fileName || '[Documento]'
  mediaUrl = message.documentMessage.url
  mediaMimeType = message.documentMessage.mimetype
}
else if (message?.stickerMessage) {
  messageType = 'sticker'
  content = '[Sticker]'
  mediaUrl = message.stickerMessage.url
}
else if (message?.locationMessage) {
  messageType = 'location'
  content = `[Localização: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]`
}
else if (message?.contactMessage) {
  messageType = 'contact'
  content = '[Contato]'
}
```

### E na parte de salvar (linha ~366):
```javascript
// 4. Salvar mensagem
const { data: savedMsg, error: msgError } = await supabase
  .from('whatsapp_messages')
  .insert({
    organization_id: orgId,
    instance_id: instance.id,
    conversation_id: conversation.id,
    message_id: messageId,
    direction: 'inbound',
    message_type: messageType,
    content: { text: content },
    text_body: content,
    from_number: phoneNumber,
    status: 'received',
    timestamp: new Date().toISOString(),
    // ✅ NOVO: Adicionar mídia
    media_url: mediaUrl,
    media_mime_type: mediaMimeType,
  })
```

---

## 📋 RESUMO

| Componente | Status | Problema |
|------------|--------|----------|
| Frontend (InboxTab) | ✅ Pronto | - |
| API GET /messages | ✅ Pronto | - |
| Tabela whatsapp_messages | ✅ Tem coluna | - |
| **Webhook principal** | ❌ **BUG** | **Não extrai/salva media_url** |

**Solução:** Corrigir webhook para extrair URL da mídia do payload da Evolution API.
