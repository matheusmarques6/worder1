# WORDER V45 - Arquivos de Automação

## 📁 Estrutura

```
src/
├── lib/
│   ├── events.ts          ✨ NOVO - EventBus (sistema de eventos)
│   └── queue.ts           ✨ NOVO - Integração QStash (filas)
│
├── app/api/
│   ├── webhooks/
│   │   ├── shopify/route.ts    ✨ NOVO - Webhook Shopify
│   │   ├── klaviyo/route.ts    ✨ NOVO - Webhook Klaviyo
│   │   └── custom/[id]/route.ts ✨ NOVO - Webhooks customizados
│   │
│   ├── workers/
│   │   ├── automation/route.ts      ✨ NOVO - Worker principal
│   │   └── automation-step/route.ts ✨ NOVO - Worker de delays
│   │
│   ├── deals/route.ts      📝 MODIFICADO - Emite eventos de pipeline
│   └── contacts/route.ts   📝 MODIFICADO - Emite eventos de contatos
│
└── components/
    └── automation/index.tsx 📝 MODIFICADO - Novos triggers/actions

supabase/
└── automations-migration.sql ✨ NOVO - SQL para executar no Supabase
```

## 🚀 Como usar

1. **Faça upload desses arquivos** no GitHub mantendo a estrutura de pastas
2. **Execute o SQL** `automations-migration.sql` no Supabase SQL Editor
3. **Adicione as variáveis** no Vercel:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`
   - `NEXT_PUBLIC_APP_URL`

## ✨ Novos Triggers de Pipeline

- Deal Criado
- Deal Mudou Estágio
- Deal Ganho
- Deal Perdido

## ✨ Novas Actions de Pipeline

- Criar Deal
- Mover Deal
- Atribuir Deal
