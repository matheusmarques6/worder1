# 📦 ZapZap v8 - WhatsApp Evolution API Integration

## 🎯 O que mudou nesta versão

### ✅ Webhook Automático
Agora quando você cria uma instância, o webhook é configurado **automaticamente** na Evolution API. O cliente **NÃO precisa fazer nada** além de escanear o QR Code!

### ✅ Logs Detalhados
Todos os eventos são logados com detalhes para facilitar debug:
- `📥 WEBHOOK RECEIVED` - Quando chega um evento
- `📨 Processing MESSAGES_UPSERT` - Quando processa mensagem
- `✅ Message saved` - Quando salva no banco
- etc.

### ✅ Endpoint de Debug
Novo endpoint `/api/whatsapp/debug` para diagnóstico:
- Verificar conexão com Evolution API
- Listar instâncias
- Verificar/configurar webhooks
- Sincronizar instâncias

---

## 📁 Arquivos para copiar

```
src/app/api/whatsapp/
├── instances/route.ts    # API de gerenciamento de instâncias
├── webhook/route.ts      # Receber eventos da Evolution
└── debug/route.ts        # Diagnóstico e debug
```

---

## 🚀 Deploy

### 1. Copiar arquivos para o projeto

Substitua os arquivos em `src/app/api/whatsapp/` pelos desta pasta.

### 2. Verificar variáveis de ambiente no Vercel

```env
EVOLUTION_API_URL=https://n8n-evolution-api.1fpac5.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
NEXT_PUBLIC_APP_URL=https://worder1.vercel.app
NEXT_PUBLIC_SUPABASE_URL=sua_url
SUPABASE_SERVICE_ROLE_KEY=sua_key
```

### 3. Deploy

```bash
git add .
git commit -m "v8: Webhook automático e melhorias"
git push
```

---

## 🔍 Debug

### Verificar se Evolution API está acessível:
```
GET https://worder1.vercel.app/api/whatsapp/debug?action=status
```

### Listar instâncias na Evolution:
```
GET https://worder1.vercel.app/api/whatsapp/debug?action=instances
```

### Verificar webhook de uma instância:
```
GET https://worder1.vercel.app/api/whatsapp/debug?action=webhook&instance=NOME_DA_INSTANCIA
```

### Configurar webhook manualmente:
```
GET https://worder1.vercel.app/api/whatsapp/debug?action=configure_webhook&instance=NOME_DA_INSTANCIA
```

### Diagnóstico completo:
```
GET https://worder1.vercel.app/api/whatsapp/debug?action=full
```

### Corrigir webhooks de todas as instâncias:
```bash
curl -X POST https://worder1.vercel.app/api/whatsapp/debug \
  -H "Content-Type: application/json" \
  -d '{"action": "fix_webhooks"}'
```

---

## 🧪 Testar Fluxo Completo

### 1. Criar nova instância
```bash
curl -X POST https://worder1.vercel.app/api/whatsapp/instances \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "organization_id": "SEU_ORG_ID",
    "title": "Teste"
  }'
```

Resposta esperada:
```json
{
  "instance": { ... },
  "qr": "data:image/png;base64,...",
  "webhook_configured": true,
  "webhook_url": "https://worder1.vercel.app/api/whatsapp/webhook"
}
```

### 2. Escanear QR Code

### 3. Verificar status
```bash
curl -X POST https://worder1.vercel.app/api/whatsapp/instances \
  -H "Content-Type: application/json" \
  -d '{
    "action": "status",
    "id": "ID_DA_INSTANCIA"
  }'
```

### 4. Enviar mensagem de teste para o número conectado

### 5. Verificar logs no Vercel
- Acesse: Vercel Dashboard → Projeto → Logs
- Procure por: `📥 WEBHOOK RECEIVED`

---

## 📋 Checklist de Problemas Comuns

### ❌ Webhook não está sendo chamado
1. Verificar se Evolution API está acessível
2. Verificar se webhook foi configurado: `/api/whatsapp/debug?action=webhook&instance=NOME`
3. Reconfigurar webhook: `/api/whatsapp/debug?action=configure_webhook&instance=NOME`

### ❌ Instância não conecta
1. Verificar versão da Evolution API (precisa ser v2.x com Baileys)
2. Verificar se número não está banido
3. Tentar recriar a instância

### ❌ Mensagens não aparecem no inbox
1. Verificar logs do Vercel para erros
2. Verificar se tabelas existem no Supabase:
   - `whatsapp_instances`
   - `whatsapp_contacts`
   - `whatsapp_conversations`
   - `whatsapp_messages`

### ❌ QR Code não aparece
1. Chamar endpoint de QR manualmente
2. Verificar se instância foi criada na Evolution

---

## 🔄 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CONEXÃO                             │
│                                                                 │
│  1. Cliente clica "Conectar"                                    │
│            ↓                                                    │
│  2. POST /api/whatsapp/instances {action: "create"}             │
│            ↓                                                    │
│  3. Backend:                                                    │
│     a) Cria instância na Evolution API                          │
│     b) Configura webhook AUTOMATICAMENTE ⭐                     │
│     c) Salva no Supabase                                        │
│            ↓                                                    │
│  4. Retorna QR Code para frontend                               │
│            ↓                                                    │
│  5. Cliente escaneia QR                                         │
│            ↓                                                    │
│  6. Evolution envia CONNECTION_UPDATE via webhook               │
│            ↓                                                    │
│  7. Webhook atualiza status no Supabase                         │
│            ↓                                                    │
│  8. Frontend detecta status = connected ✅                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   FLUXO DE MENSAGENS                            │
│                                                                 │
│  1. Cliente WhatsApp envia mensagem                             │
│            ↓                                                    │
│  2. Evolution recebe via Baileys                                │
│            ↓                                                    │
│  3. Evolution envia MESSAGES_UPSERT via webhook                 │
│            ↓                                                    │
│  4. POST /api/whatsapp/webhook recebe                           │
│            ↓                                                    │
│  5. Webhook handler:                                            │
│     a) Identifica instância pelo unique_id                      │
│     b) Cria/atualiza contato                                    │
│     c) Cria/atualiza conversa                                   │
│     d) Salva mensagem                                           │
│     e) Processa IA se ativo                                     │
│            ↓                                                    │
│  6. Frontend atualiza inbox (polling ou realtime)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do Vercel
2. Use o endpoint de debug
3. Verifique se as tabelas existem no Supabase
