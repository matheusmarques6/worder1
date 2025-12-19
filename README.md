# 🔌 ZAP ZAP - WhatsApp Connection System

Sistema de conexão WhatsApp via QR Code usando Evolution API.

## 📦 Arquivos Incluídos

```
src/
├── app/
│   ├── (dashboard)/whatsapp/components/
│   │   └── InboxTab.tsx                    # Tab principal do inbox (ATUALIZADO)
│   └── api/whatsapp/
│       ├── instances/route.ts              # API de instâncias (ATUALIZADO)
│       └── webhook/route.ts                # Webhook receiver (ATUALIZADO)
├── components/whatsapp/
│   ├── WhatsAppConnectUnified.tsx          # Modal de conexão
│   └── inbox/
│       └── WhatsAppConnectionManager.tsx   # Seletor de instâncias
└── hooks/
    └── useWhatsAppConnectionManager.ts     # Hook de gerenciamento

supabase/migrations/
└── whatsapp-migration-fix.sql              # SQL para migração
```

## 🚀 Como Instalar

### 1. Extrair arquivos
```bash
unzip zapzap-whatsapp-connection-v6.zip -d ./seu-projeto/
```

### 2. Configurar variáveis de ambiente

Adicione ao seu `.env.local` ou nas variáveis do Vercel:

```env
EVOLUTION_API_URL=https://n8n-evolution-api.1fpac5.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
NEXT_PUBLIC_APP_URL=https://worder1.vercel.app
```

### 3. Executar migração SQL

No Supabase Dashboard → SQL Editor, execute o conteúdo de:
`supabase/migrations/whatsapp-migration-fix.sql`

### 4. Deploy
```bash
git add .
git commit -m "Add WhatsApp QR Code connection"
git push
```

## 📱 Como Usar

1. Acesse `/whatsapp` na sua aplicação
2. Clique em **"Conectar WhatsApp"**
3. Selecione **"Via QR Code"**
4. Escaneie o QR Code com seu WhatsApp
5. Pronto! Mensagens chegam em tempo real.

## 🔗 Webhook

O webhook é configurado automaticamente em:
```
https://worder1.vercel.app/api/whatsapp/webhook
```

### Eventos recebidos:
- `MESSAGES_UPSERT` - Novas mensagens
- `MESSAGES_UPDATE` - Status de entrega
- `CONNECTION_UPDATE` - Status da conexão
- `QRCODE_UPDATED` - Novo QR Code

## 🤖 Integração com IA

Quando uma mensagem chega e o bot está ativo:
1. Webhook recebe a mensagem
2. Processa contexto e histórico
3. Chama `/api/ai/chat` para resposta
4. Envia resposta via Evolution API
5. Salva no banco de dados

## ⚠️ Troubleshooting

### QR Code não aparece
- Verifique se `EVOLUTION_API_URL` está correto
- Verifique se a API Key está válida
- Verifique os logs do Vercel

### Mensagens não chegam
- Verifique se o webhook foi configurado na Evolution API
- Verifique se a URL está acessível publicamente
- Veja os logs em `https://n8n-evolution-api.1fpac5.easypanel.host/manager`

### Conexão desconecta
- Isso é normal após ~14 dias sem atividade
- Basta reconectar escaneando novo QR Code

## 📊 Estrutura do Banco

### whatsapp_instances
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único |
| organization_id | UUID | FK para organizations |
| unique_id | VARCHAR | ID na Evolution API |
| status | VARCHAR | ACTIVE, INACTIVE, GENERATING, connected, disconnected |
| api_type | VARCHAR | EVOLUTION, META_CLOUD |
| phone_number | VARCHAR | Número conectado |
| qr_code | TEXT | QR Code em base64 |

## 🔒 Segurança

- API Keys nunca são expostas no frontend
- RLS habilitado em todas as tabelas
- Webhook valida origem das requisições
- Tokens de acesso armazenados apenas no servidor
