# 📊 AUDITORIA COMPLETA - MIGRAÇÃO RLS

> **Data:** Janeiro 2026  
> **Projeto:** Worder1-main  
> **Critério:** Rota migrada = usa `getAuthClient()` + NÃO usa SERVICE_ROLE

---

## 📈 RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| Total de rotas | 157 |
| Rotas user-facing (excl. webhook/worker/cron) | 139 |
| ✅ Rotas migradas (RLS real) | 42 |
| 🔴 Rotas com `getSupabaseClient()` | 36 |
| 🔴 Rotas com `supabaseAdmin` | 45 |
| 🔴 Total fora do padrão | ~80 |
| **% Migração Real** | **~30%** |

---

## ✅ ROTAS MIGRADAS CORRETAMENTE (42 rotas)

Estas rotas usam `getAuthClient()` E NÃO usam SERVICE_ROLE:

### AI (13 rotas) ✅
```
✅ src/app/api/ai/agents/[id]/actions/[actionId]/route.ts
✅ src/app/api/ai/agents/[id]/actions/route.ts
✅ src/app/api/ai/agents/[id]/integrations/[integrationId]/route.ts
✅ src/app/api/ai/agents/[id]/integrations/[integrationId]/sync/route.ts
✅ src/app/api/ai/agents/[id]/integrations/route.ts
✅ src/app/api/ai/agents/[id]/route.ts
✅ src/app/api/ai/agents/[id]/sources/[sourceId]/reprocess/route.ts
✅ src/app/api/ai/agents/[id]/sources/[sourceId]/route.ts
✅ src/app/api/ai/agents/[id]/sources/route.ts
✅ src/app/api/ai/agents/[id]/sources/upload/route.ts
✅ src/app/api/ai/agents/[id]/test/route.ts
✅ src/app/api/ai/agents/route.ts
✅ src/app/api/ai/process/document/route.ts
```

### Automations (8 rotas) ✅
```
✅ src/app/api/automations/logs/route.ts
✅ src/app/api/automations/rules/[id]/route.ts
✅ src/app/api/automations/rules/route.ts
✅ src/app/api/automations/runs/route.ts
✅ src/app/api/automations/simulate/route.ts
✅ src/app/api/automations/stats/route.ts
✅ src/app/api/automations/test-rules/route.ts
✅ src/app/api/automations/variables/route.ts
```

### Contacts (6 rotas) ✅
```
✅ src/app/api/contacts/[id]/route.ts
✅ src/app/api/contacts/[id]/timeline/route.ts
✅ src/app/api/contacts/bulk/route.ts
✅ src/app/api/contacts/import/route.ts
✅ src/app/api/contacts/merge/route.ts
✅ src/app/api/contacts/stats/route.ts
```

### Deals (2 rotas) ✅
```
✅ src/app/api/deals/[id]/history/route.ts
✅ src/app/api/deals/forecast/route.ts
```

### Integrations (4 rotas) ✅
```
✅ src/app/api/integrations/connected/route.ts
✅ src/app/api/integrations/health/logs/route.ts
✅ src/app/api/integrations/health/route.ts
```

### Pipelines (3 rotas) ✅
```
✅ src/app/api/pipelines/[id]/automations/[ruleId]/route.ts
✅ src/app/api/pipelines/[id]/automations/route.ts
✅ src/app/api/pipelines/[id]/transitions/route.ts
```

### Shopify (4 rotas) ✅
```
✅ src/app/api/shopify/check-connection/route.ts
✅ src/app/api/shopify/import-customers/route.ts
✅ src/app/api/shopify/pixel/route.ts
✅ src/app/api/shopify/verificar/route.ts
```

### Outros (2 rotas) ✅
```
✅ src/app/api/analytics/sales/route.ts
✅ src/app/api/custom-fields/route.ts
✅ src/app/api/notifications/route.ts
```

---

## 🔴 ROTAS COM `getSupabaseClient()` - PRECISAM MIGRAR (36 rotas)

Estas rotas usam SERVICE_ROLE via `getSupabaseClient()` e bypassam RLS:

### PRIORIDADE CRÍTICA (dados sensíveis)
```
🔴 src/app/api/contacts/route.ts              ← CRM principal!
🔴 src/app/api/contacts/export/route.ts       ← Exportação de dados!
🔴 src/app/api/deals/route.ts                 ← Negócios!
🔴 src/app/api/api-keys/route.ts              ← Chaves de API!
```

### PRIORIDADE ALTA
```
🔴 src/app/api/analytics/route.ts
🔴 src/app/api/analytics/email/route.ts
🔴 src/app/api/analytics/shopify/route.ts
🔴 src/app/api/dashboard/metrics/route.ts
🔴 src/app/api/contact-activities/route.ts
🔴 src/app/api/stores/route.ts
```

### Shopify (8 rotas)
```
🔴 src/app/api/shopify/configure/route.ts
🔴 src/app/api/shopify/connect/route.ts
🔴 src/app/api/shopify/route.ts
🔴 src/app/api/shopify/store/route.ts
🔴 src/app/api/shopify/sync/route.ts
🔴 src/app/api/shopify/test/route.ts
🔴 src/app/api/shopify/toggle/route.ts
🔴 src/app/api/shopify/debug/route.ts         ← DEBUG!
```

### Integrations (8 rotas)
```
🔴 src/app/api/integrations/categories/route.ts
🔴 src/app/api/integrations/google/callback/route.ts
🔴 src/app/api/integrations/google/route.ts
🔴 src/app/api/integrations/installed/[id]/route.ts
🔴 src/app/api/integrations/installed/route.ts
🔴 src/app/api/integrations/route.ts
🔴 src/app/api/integrations/status/route.ts
🔴 src/app/api/integrations/tiktok/route.ts
```

### WhatsApp (5 rotas)
```
🔴 src/app/api/whatsapp/route.ts
🔴 src/app/api/whatsapp/conversations/route.ts
🔴 src/app/api/whatsapp/numbers/route.ts
🔴 src/app/api/whatsapp/agents/permissions/route.ts
🔴 src/app/api/whatsapp/agents/status/route.ts
```

### Outros
```
🔴 src/app/api/ai/models/route.ts
🔴 src/app/api/automations/[id]/test/route.ts
🔴 src/app/api/automations/route.ts
🔴 src/app/api/debug/route.ts                 ← DEBUG!
🔴 src/app/api/klaviyo/route.ts
```

---

## 🔴 ROTAS COM `supabaseAdmin` - PRECISAM MIGRAR (45 rotas)

Estas rotas usam SERVICE_ROLE via `supabaseAdmin` e bypassam RLS:

### WhatsApp Inbox (13 rotas) - MAIOR BURACO
```
🔴 src/app/api/whatsapp/inbox/contacts/[id]/activities/route.ts
🔴 src/app/api/whatsapp/inbox/contacts/[id]/block/route.ts
🔴 src/app/api/whatsapp/inbox/contacts/[id]/deals/route.ts
🔴 src/app/api/whatsapp/inbox/contacts/[id]/notes/route.ts
🔴 src/app/api/whatsapp/inbox/contacts/[id]/route.ts
🔴 src/app/api/whatsapp/inbox/contacts/[id]/tags/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/bot/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/close/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/read/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/[id]/route.ts
🔴 src/app/api/whatsapp/inbox/conversations/route.ts
🔴 src/app/api/whatsapp/inbox/quick-replies/[id]/route.ts
🔴 src/app/api/whatsapp/inbox/quick-replies/route.ts
```

### WhatsApp Campaigns (8 rotas)
```
🔴 src/app/api/whatsapp/campaigns/[id]/cancel/route.ts
🔴 src/app/api/whatsapp/campaigns/[id]/duplicate/route.ts
🔴 src/app/api/whatsapp/campaigns/[id]/pause/route.ts
🔴 src/app/api/whatsapp/campaigns/[id]/resume/route.ts
🔴 src/app/api/whatsapp/campaigns/[id]/route.ts
🔴 src/app/api/whatsapp/campaigns/[id]/schedule/route.ts
🔴 src/app/api/whatsapp/campaigns/route.ts
```

### WhatsApp Cloud/Evolution (6 rotas)
```
🔴 src/app/api/whatsapp/cloud/accounts/route.ts
🔴 src/app/api/whatsapp/cloud/conversations/route.ts
🔴 src/app/api/whatsapp/cloud/messages/route.ts
🔴 src/app/api/whatsapp/cloud/templates/route.ts
🔴 src/app/api/whatsapp/evolution/instances/route.ts
🔴 src/app/api/whatsapp/evolution/messages/route.ts
```

### WhatsApp Outros (8 rotas)
```
🔴 src/app/api/whatsapp/agents/route.ts
🔴 src/app/api/whatsapp/agents/reset-password/route.ts
🔴 src/app/api/whatsapp/ai/analytics/route.ts
🔴 src/app/api/whatsapp/ai/route.ts
🔴 src/app/api/whatsapp/analytics/route.ts
🔴 src/app/api/whatsapp/connect/route.ts
🔴 src/app/api/whatsapp/debug/route.ts        ← DEBUG!
🔴 src/app/api/whatsapp/instances/route.ts
🔴 src/app/api/whatsapp/quality/route.ts
🔴 src/app/api/whatsapp/templates/route.ts
```

### Integrations/OAuth (6 rotas)
```
🔴 src/app/api/integrations/meta/callback/route.ts
🔴 src/app/api/integrations/meta/route.ts
🔴 src/app/api/integrations/shopify/auth/route.ts
🔴 src/app/api/integrations/shopify/callback/route.ts
🔴 src/app/api/integrations/tiktok/callback/route.ts
🔴 src/app/api/shopify/track/route.ts
```

### Outros
```
🔴 src/app/api/ai-agents/route.ts
```

---

## 🔥 VULNERABILIDADES CRÍTICAS

### 1. Webhooks WhatsApp SEM Autenticação

| Arquivo | Status | Risco |
|---------|--------|-------|
| `whatsapp/webhook/route.ts` | ❌ SEM verificação | CRÍTICO |
| `whatsapp/evolution/webhook/route.ts` | ❌ SEM verificação | CRÍTICO |
| `whatsapp/cloud/webhook/route.ts` | ⚠️ Tem x-hub-signature | OK |

**Impacto:** Atacante pode injetar eventos falsos, criar mensagens, poluir dados.

### 2. Debug Routes Expostas

| Arquivo | Status |
|---------|--------|
| `api/debug/route.ts` | ⚠️ Sem guard |
| `shopify/debug/route.ts` | ⚠️ Sem guard |
| `whatsapp/debug/route.ts` | ⚠️ Sem guard |

**Impacto:** Vazamento de informações sensíveis em produção.

---

## 📋 PLANO DE AÇÃO PRIORIZADO

### 🔴 SPRINT 1 - CRÍTICO (Esta Semana)

| # | Tarefa | Arquivos | Esforço |
|---|--------|----------|---------|
| 1 | Adicionar HMAC aos webhooks WhatsApp | 2 | 2h |
| 2 | Proteger/remover debug routes | 3 | 1h |
| 3 | Migrar `contacts/route.ts` | 1 | 1h |
| 4 | Migrar `deals/route.ts` | 1 | 1h |
| 5 | Migrar `api-keys/route.ts` | 1 | 1h |

### 🟡 SPRINT 2 - ALTO (Próxima Semana)

| # | Tarefa | Arquivos | Esforço |
|---|--------|----------|---------|
| 6 | Migrar analytics | 3 | 2h |
| 7 | Migrar shopify user APIs | 8 | 4h |
| 8 | Migrar integrations | 8 | 4h |

### 🟢 SPRINT 3 - MÉDIO (2 Semanas)

| # | Tarefa | Arquivos | Esforço |
|---|--------|----------|---------|
| 9 | Migrar WhatsApp inbox | 15 | 8h |
| 10 | Migrar WhatsApp campaigns | 8 | 4h |
| 11 | Migrar WhatsApp outros | 15 | 6h |

---

## 📊 PROGRESSO POR MÓDULO

| Módulo | Total | Migrado | % |
|--------|-------|---------|---|
| AI | 14 | 13 | 93% ✅ |
| Automations | 10 | 8 | 80% ✅ |
| Contacts | 8 | 6 | 75% ⚠️ |
| Deals | 3 | 2 | 67% ⚠️ |
| Pipelines | 3 | 3 | 100% ✅ |
| Shopify | 14 | 4 | 29% 🔴 |
| Integrations | 19 | 3 | 16% 🔴 |
| WhatsApp | 53 | 0 | 0% 🔴 |
| Analytics | 4 | 1 | 25% 🔴 |
| Outros | 11 | 2 | 18% 🔴 |

---

## 🛠️ COMO MIGRAR UMA ROTA

### Antes (SERVICE_ROLE)
```typescript
import { getSupabaseClient } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const organizationId = request.nextUrl.searchParams.get('organizationId');
  
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId); // ← filtro manual!
  
  return NextResponse.json(data);
}
```

### Depois (RLS)
```typescript
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;
  
  const { data } = await supabase
    .from('contacts')
    .select('*');
    // ← SEM filtro! RLS faz isso automaticamente
  
  return NextResponse.json(data);
}
```

---

## ✅ CHECKLIST DE MIGRAÇÃO

Para cada rota:

- [ ] Trocar `getSupabaseClient()` por `getAuthClient()`
- [ ] Trocar `supabaseAdmin` por `auth.supabase`
- [ ] Remover `organizationId` do request/query
- [ ] Remover filtro manual `.eq('organization_id', ...)`
- [ ] Adicionar `if (!auth) return authError();`
- [ ] Testar: usuário A não vê dados de usuário B
- [ ] Build passa sem erros

---

## 📝 SQL NECESSÁRIO

```sql
-- Garantir RLS está habilitado
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- ... (já feito para maioria das tabelas)

-- Tabela para OAuth states (anti-replay)
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

---

**Gerado em:** Janeiro 2026  
**Versão:** worder1-main (42)

---

## ✅ CORREÇÕES APLICADAS NESTA SESSÃO

### 1. Webhooks WhatsApp Protegidos

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `whatsapp/webhook/route.ts` | ❌ Sem auth | ✅ Token + Rate Limit |
| `whatsapp/evolution/webhook/route.ts` | ❌ Sem auth | ✅ Token + Rate Limit |
| `whatsapp/cloud/webhook/route.ts` | ⚠️ Parcial | ✅ Já tinha x-hub-signature |

**Mecanismos adicionados:**
- Bearer token via header
- Global secret via `EVOLUTION_WEBHOOK_SECRET`
- Token por instância via `webhook_token`
- Rate limiting (100 req/min por IP)
- Logging estruturado

### 2. Debug Routes Protegidas

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `debug/route.ts` | ❌ Aberto | ✅ Bloqueado em prod |
| `shopify/debug/route.ts` | ❌ Aberto | ✅ Bloqueado em prod |
| `whatsapp/debug/route.ts` | ❌ Aberto | ✅ Bloqueado em prod |

**Mecanismo:**
- Em desenvolvimento: liberado
- Em produção: exige `DEBUG_ROUTE_SECRET` via header ou query

### 3. OAuth Callbacks Protegidos

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `meta/callback/route.ts` | ❌ State não validado | ✅ `consumeOAuthState()` |
| `tiktok/callback/route.ts` | ❌ State não validado | ✅ `consumeOAuthState()` |

**Mecanismo:**
- State assinado com HMAC
- Expiração de 10 minutos
- Uso único (invalidado após consumir)
- Proteção contra replay

### 4. Novos Arquivos de Segurança

| Arquivo | Função |
|---------|--------|
| `src/lib/webhook-security.ts` | HMAC, Rate Limit, Logging |
| `src/lib/oauth-security.ts` | State seguro para OAuth |
| `docs/PR_SECURITY_CHECKLIST.md` | Checklist obrigatório |
| `docs/AUDIT_RLS_MIGRATION.md` | Esta auditoria |

---

## 📋 ENV VARS NECESSÁRIAS

```bash
# Para debug routes em produção
DEBUG_ROUTE_SECRET=sua-chave-secreta-aqui

# Para webhooks WhatsApp
EVOLUTION_WEBHOOK_SECRET=sua-chave-secreta-aqui

# Para OAuth state (usa NEXTAUTH_SECRET se não configurado)
OAUTH_STATE_SECRET=sua-chave-secreta-aqui
```

---

## 🎯 PRÓXIMOS PASSOS (Por Prioridade)

### Sprint 1 - Esta Semana
1. [ ] Migrar `contacts/route.ts` → `getAuthClient()`
2. [ ] Migrar `deals/route.ts` → `getAuthClient()`
3. [ ] Migrar `api-keys/route.ts` → `getAuthClient()`
4. [ ] Configurar ENV vars em produção

### Sprint 2 - Próxima Semana
5. [ ] Migrar `analytics/*.ts` (3 arquivos)
6. [ ] Migrar `shopify/*.ts` (8 arquivos)
7. [ ] Migrar `integrations/*.ts` (8 arquivos)

### Sprint 3 - 2 Semanas
8. [ ] Migrar `whatsapp/inbox/*` (15 arquivos)
9. [ ] Migrar `whatsapp/campaigns/*` (8 arquivos)
10. [ ] Migrar `whatsapp/*` restante (15 arquivos)

---

**Atualizado em:** Janeiro 2026
**Build:** ✅ Passando
