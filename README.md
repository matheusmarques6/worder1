# Arquivos Modificados - Migração RLS

## Como usar:
1. Copie cada arquivo para o caminho correspondente no seu projeto
2. Mantenha a estrutura de pastas exatamente como está aqui
3. Execute `npm run build` para verificar se está tudo ok

---

## 📁 Arquivos NOVOS (Criar):

### src/lib/
- `supabase-admin.ts` - Cliente Supabase com SERVICE_ROLE (lazy loaded)
- `supabase-client.ts` - Cliente Supabase com ANON_KEY (para client-side)

### supabase/migrations/
- `001_enable_rls.sql` - Script SQL para habilitar RLS (JÁ EXECUTADO)

---

## 📝 Arquivos MODIFICADOS (Substituir):

### src/hooks/
- `index.ts`
- `useCRMRealtime.ts`
- `useWhatsAppRealtime.ts`

### src/lib/ai/
- `engine.ts`

### src/lib/whatsapp/
- `campaign-processor.ts`
- `template-manager.ts`

### src/lib/services/shopify/
- `webhook-processor.ts`
- `activity-tracker.ts`
- `contact-sync.ts`
- `deal-sync.ts`

### src/lib/services/shopify/jobs/
- `reconciliation.ts`
- `abandoned-cart.ts`

### src/app/api/workers/
- `automation/route.ts`
- `automation-step/route.ts`
- `campaign/route.ts`

### src/app/api/ai-agents/
- `route.ts`

### src/app/api/integrations/shopify/
- `webhook/route.ts`
- `auth/route.ts`
- `callback/route.ts`

### src/app/api/whatsapp/ (muitos arquivos)
- Ver estrutura de pastas abaixo

---

## O que foi alterado:

1. **Substituído** `createClient()` no module level por imports lazy de `supabase-admin.ts`
2. **Corrigido** erros de build causados por inicialização eager do Supabase
3. **Mantido** toda funcionalidade existente

---

## ⚠️ Importante:
- SERVICE_ROLE_KEY continua funcionando (bypassa RLS)
- O código atual não precisa de mais alterações
- RLS já está ativo no banco protegendo os dados
