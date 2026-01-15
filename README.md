# ZAP ZAP 7 - Realtime Update

## 📁 Caminhos dos Arquivos

```
src/
├── hooks/
│   ├── useInboxRealtime.ts          ← NOVO (criar)
│   └── useWhatsAppConnectionManager.ts  ← SUBSTITUIR
├── app/
│   └── (dashboard)/
│       └── whatsapp/
│           └── components/
│               └── InboxTab.tsx     ← SUBSTITUIR
└── components/
    └── whatsapp/
        └── inbox/
            └── WhatsAppConnectionManager.tsx  ← SUBSTITUIR

supabase/
└── migrations/
    └── 20260114_enable_inbox_realtime.sql  ← RODAR NO SUPABASE
```

## 🚀 Instruções

### 1. Copiar os arquivos para o projeto
Substitua/crie os arquivos nos caminhos indicados acima.

### 2. Adicionar export no hooks/index.ts
Abra `src/hooks/index.ts` e adicione:
```typescript
// Re-export Inbox Realtime
export { useInboxRealtime } from './useInboxRealtime';
```

### 3. Rodar SQL no Supabase
Execute o conteúdo de `20260114_enable_inbox_realtime.sql` no SQL Editor do Supabase.

### 4. Testar
- Conecte um WhatsApp → status deve atualizar automaticamente
- Envie mensagem de outro celular → deve aparecer instantaneamente

## ✅ O que foi corrigido

1. **Conexão não atualizava** → Polling automático de status
2. **Mensagens não apareciam em tempo real** → Supabase Realtime via WebSocket
