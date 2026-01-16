# 📊 RELATÓRIO TÉCNICO COMPLETO - SISTEMA DE MÍDIA (IMAGENS/ÁUDIOS)

## 🎯 ESTADO ATUAL DO SISTEMA

### Resumo Executivo
O sistema **teoricamente está configurado** para processar mídia, mas na prática **não está funcionando** porque a **Evolution API não envia a URL diretamente** no webhook. A mídia vem como **base64** ou precisa ser **baixada separadamente**.

---

## 🔬 ANÁLISE TÉCNICA DETALHADA

### 1. FLUXO ATUAL DO SISTEMA

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐    ┌──────────┐
│ Cliente envia   │───▶│ Evolution    │───▶│ Webhook     │───▶│ Supabase │───▶│ Frontend │
│ imagem/áudio    │    │ API          │    │ /webhook    │    │ (banco)  │    │ InboxTab │
└─────────────────┘    └──────────────┘    └─────────────┘    └──────────┘    └──────────┘
```

### 2. O QUE CADA COMPONENTE FAZ

#### 📥 **WEBHOOK** (`/api/whatsapp/webhook/route.ts`)

**Status: ✅ CÓDIGO CORRIGIDO**

```javascript
// Linhas 257-304: Extração de mídia
let mediaUrl = null
let mediaMimeType = null

if (message?.imageMessage) {
  messageType = 'image'
  content = content || '[Imagem]'
  mediaUrl = message.imageMessage.url       // ← TENTA extrair URL
  mediaMimeType = message.imageMessage.mimetype
}
// ... igual para audio, video, document

// Linhas 403-404: Salva no banco
media_url: mediaUrl,         // ← SALVA (mas pode ser null!)
media_mime_type: mediaMimeType,
```

#### 🗄️ **BANCO DE DADOS** (`whatsapp_messages`)

**Status: ✅ TEM AS COLUNAS**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `media_url` | TEXT | URL da mídia |
| `media_mime_type` | TEXT | Tipo MIME (image/jpeg, audio/ogg) |
| `message_type` | VARCHAR | image, audio, video, document, text |

#### 🔌 **API GET** (`/api/whatsapp/inbox/conversations/[id]/messages`)

**Status: ✅ RETORNA CORRETAMENTE**

```javascript
// Linha 35-36
const messages = (data || []).map(msg => ({
  // ...
  media_url: msg.media_url,      // ← Retorna do banco
  message_type: msg.message_type,
}))
```

#### 🖥️ **FRONTEND** (`InboxTab.tsx`)

**Status: ✅ RENDERIZA SE TIVER DADOS**

```jsx
// Linhas 1090-1097
{msg.media_url && msg.message_type === 'image' && (
  <img src={msg.media_url} alt="" className="rounded-lg mb-2 max-w-full" />
)}
{msg.media_url && msg.message_type === 'audio' && (
  <audio controls src={msg.media_url} className="max-w-full mb-2" />
)}
```

---

## ❌ ONDE ESTÁ O PROBLEMA REAL

### O payload da Evolution API **NÃO** contém `url` diretamente!

A Evolution API envia mídia de **3 formas diferentes**:

#### Forma 1: Base64 (mais comum)
```json
{
  "message": {
    "imageMessage": {
      "mimetype": "image/jpeg",
      "caption": "foto",
      "jpegThumbnail": "BASE64_DO_THUMBNAIL",
      "mediaKey": "chave_criptografia",
      "fileEncSha256": "hash",
      "directPath": "/v/t62.7161-24/...",
      "mediaKeyTimestamp": "1234567890",
      "url": null  // ← URL NÃO VEM AQUI!
    }
  }
}
```

#### Forma 2: Com URL temporária (raro)
```json
{
  "message": {
    "imageMessage": {
      "url": "https://mmg.whatsapp.net/..."  // ← URL temporária (expira em ~5 min)
    }
  }
}
```

#### Forma 3: Precisa fazer download via API
Você precisa chamar endpoint da Evolution:
```
GET /chat/getBase64FromMediaMessage/{instance}
POST body: { key: { remoteJid, id } }
```

---

## 🔧 SOLUÇÃO COMPLETA

### Opção A: Baixar mídia via API no Webhook (RECOMENDADO)

Modificar o webhook para **baixar a mídia** quando receber:

```javascript
// No webhook, após detectar mídia:
if (message?.imageMessage || message?.audioMessage || message?.videoMessage) {
  // Tentar URL direta primeiro
  mediaUrl = message.imageMessage?.url || 
             message.audioMessage?.url || 
             message.videoMessage?.url

  // Se não tem URL, baixar via API
  if (!mediaUrl && key?.id) {
    try {
      const downloadResponse = await fetch(
        `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance.unique_id}`,
        {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: { key },
            convertToMp4: false
          })
        }
      )
      
      const mediaData = await downloadResponse.json()
      
      if (mediaData.base64) {
        // Converter base64 para URL de dados
        mediaUrl = `data:${mediaMimeType};base64,${mediaData.base64}`
      }
    } catch (error) {
      console.error('[Webhook] Erro ao baixar mídia:', error)
    }
  }
}
```

### Opção B: Armazenar em Storage (melhor para produção)

1. Baixar mídia como base64
2. Fazer upload para Supabase Storage
3. Salvar URL pública do Storage

```javascript
// 1. Baixar mídia
const mediaData = await downloadMedia(instance, key)

// 2. Upload para Supabase Storage
const fileName = `${conversationId}/${messageId}.${extension}`
const { data: uploadData } = await supabase.storage
  .from('whatsapp-media')
  .upload(fileName, Buffer.from(mediaData.base64, 'base64'), {
    contentType: mediaMimeType
  })

// 3. Obter URL pública
const { data: { publicUrl } } = supabase.storage
  .from('whatsapp-media')
  .getPublicUrl(fileName)

mediaUrl = publicUrl  // ← URL permanente!
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Para fazer funcionar AGORA:

- [ ] 1. Criar função `downloadMediaFromEvolution()`
- [ ] 2. Modificar webhook para chamar função quando detectar mídia
- [ ] 3. Salvar base64 como data URL ou fazer upload para Storage
- [ ] 4. Testar com imagem real

### Arquivos a modificar:

| Arquivo | Mudança |
|---------|---------|
| `/api/whatsapp/webhook/route.ts` | Adicionar download de mídia |
| Opcional: Criar bucket no Supabase Storage | Para URLs permanentes |

---

## 🔍 COMO VERIFICAR SE ESTÁ FUNCIONANDO

### 1. Verificar logs do webhook:
```
[Webhook] 📩 Tipo: image | Media URL: SIM  ← Deve mostrar SIM
```

### 2. Verificar no banco de dados:
```sql
SELECT id, message_type, media_url, created_at 
FROM whatsapp_messages 
WHERE message_type != 'text' 
ORDER BY created_at DESC 
LIMIT 10;
```

Se `media_url` estiver **NULL** para mensagens de imagem/áudio → o download não está funcionando.

### 3. Verificar no Console do navegador:
```javascript
// Na aba Network, verificar resposta de /messages
// Deve ter media_url preenchido para mensagens de mídia
```

---

## 📊 DIAGNÓSTICO RÁPIDO

Execute esta query no Supabase para ver o estado atual:

```sql
-- Ver mensagens de mídia recentes
SELECT 
  id,
  message_type,
  CASE WHEN media_url IS NULL THEN '❌ SEM URL' ELSE '✅ TEM URL' END as status_midia,
  LEFT(content::text, 50) as conteudo,
  created_at
FROM whatsapp_messages
WHERE message_type IN ('image', 'audio', 'video', 'document')
ORDER BY created_at DESC
LIMIT 20;
```

Se mostrar "❌ SEM URL" para todas → **Confirma que o problema é o download da mídia**.

---

## 🎯 CONCLUSÃO

| Componente | Status | Problema |
|------------|--------|----------|
| Webhook - Detectar tipo | ✅ OK | - |
| Webhook - Extrair URL | ⚠️ Parcial | URL não vem no payload |
| Webhook - Download mídia | ❌ FALTA | Precisa implementar |
| Banco de dados | ✅ OK | Tem as colunas |
| API GET messages | ✅ OK | Retorna media_url |
| Frontend renderizar | ✅ OK | Renderiza se tiver URL |

**Causa raiz:** A Evolution API não envia URL direta da mídia no webhook. Precisa fazer download via endpoint específico.
