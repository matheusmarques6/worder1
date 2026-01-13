# 🛒 Shopify Integration - Security Patch & Implementation (v2 HARDENED)

> **Versão corrigida** com os 4 ajustes de segurança paranóica:
> - ✅ A) UNIQUE(user_id) em organization_members
> - ✅ B) Todas rotas usam getAuthClient() centralizado
> - ✅ C) /api/shopify/sync exige storeId
> - ✅ D) Cron fail-closed (sem modo dev aberto)

## 📦 Conteúdo do Pacote

### SQL (Executar PRIMEIRO)

| Arquivo | Descrição |
|---------|-----------|
| `sql/SECURITY_PATCH_V3_SUPABASE.sql` | Patch de segurança multi-tenant |
| `sql/SHOPIFY_COMPLETE_TABLES_V3.sql` | Tabelas adicionais (checkouts, RFM, cohort, etc.) |
| `sql/FIX_ONE_ORG_PER_USER.sql` | **NOVO** - Garante 1 usuário = 1 org (UNIQUE constraint) |

### Services (`src/lib/services/shopify/`)

| Arquivo | Descrição |
|---------|-----------|
| `api-client.ts` | **NOVO** - Cliente API com rate limiting (40 req/min), paginação cursor-based |
| `full-sync.ts` | **NOVO** - Orquestrador de sync completo |
| `index.ts` | **ATUALIZADO** - Exports centralizados |
| `analytics/rfm.ts` | **NOVO** - Cálculo RFM com 11 segmentos |
| `analytics/cohort.ts` | **NOVO** - Análise de retenção por cohort |
| `analytics/index.ts` | **NOVO** - Exports do módulo analytics |

### API Routes (`src/app/api/shopify/`)

| Endpoint | Arquivo | Status |
|----------|---------|--------|
| `/api/shopify/sync` | `sync/route.ts` | 🔒 **CORRIGIDO** - Segurança |
| `/api/shopify/full-sync` | `full-sync/route.ts` | ✨ **NOVO** |
| `/api/shopify/analytics/rfm` | `analytics/rfm/route.ts` | ✨ **NOVO** |
| `/api/shopify/analytics/cohort` | `analytics/cohort/route.ts` | ✨ **NOVO** |
| `/api/shopify/toggle` | `toggle/route.ts` | 🔒 **CORRIGIDO** - Segurança |
| `/api/shopify/configure` | `configure/route.ts` | 🔒 **CORRIGIDO** - Segurança |
| `/api/cron/shopify` | `cron/shopify/route.ts` | 🔄 **ATUALIZADO** - RFM/Cohort |

---

## 🚀 Instruções de Instalação

### 1. Executar SQL no Supabase (ORDEM IMPORTANTE!)

```bash
# 1. Primeiro o patch de segurança
# Cole o conteúdo de sql/SECURITY_PATCH_V3_SUPABASE.sql no SQL Editor

# 2. Depois as tabelas adicionais
# Cole o conteúdo de sql/SHOPIFY_COMPLETE_TABLES_V3.sql no SQL Editor

# 3. Por último, garantir 1-org-por-user (CRÍTICO!)
# Cole o conteúdo de sql/FIX_ONE_ORG_PER_USER.sql no SQL Editor
```

### 2. Copiar Arquivos TypeScript

Copie os arquivos mantendo a estrutura de diretórios:

```
src/
├── lib/services/shopify/
│   ├── api-client.ts        (sobrescrever/criar)
│   ├── full-sync.ts         (sobrescrever/criar)
│   ├── index.ts             (sobrescrever)
│   └── analytics/
│       ├── rfm.ts           (criar)
│       ├── cohort.ts        (criar)
│       └── index.ts         (criar)
└── app/api/
    ├── shopify/
    │   ├── sync/route.ts        (sobrescrever)
    │   ├── full-sync/route.ts   (criar)
    │   ├── toggle/route.ts      (sobrescrever)
    │   ├── configure/route.ts   (sobrescrever)
    │   └── analytics/
    │       ├── rfm/route.ts     (criar)
    │       └── cohort/route.ts  (criar)
    └── cron/shopify/route.ts    (sobrescrever)
```

### 3. Verificar Compilação

```bash
npm run build
# ou
npx tsc --noEmit
```

---

## 🔒 Correções de Segurança Aplicadas

### Vulnerabilidades Corrigidas

1. **RLS Policies com USING(true)** → Corrigido para `organization_id = get_user_org_id()`
2. **Rotas sem autenticação** → Adicionado `getAuthClient()` obrigatório
3. **Service role exposto** → Validação de ownership antes de usar admin
4. **Cross-org access** → FORCE ROW LEVEL SECURITY em todas as tabelas
5. **FK constraints faltando** → Adicionado com ON DELETE CASCADE

### Padrão de Segurança nas APIs

```typescript
// ✅ PADRÃO CORRETO
export async function POST(request: NextRequest) {
  // 1. Autenticar usuário
  const auth = await getAuthClient()
  if (!auth) return authError()
  
  // 2. Validar acesso à loja
  const validation = await validateStoreAccess(auth.supabase, auth.user.organization_id, storeId)
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 403 })
  
  // 3. Só então usar admin client
  const supabaseAdmin = getSupabaseClient()
  // ...
}
```

---

## 📊 Uso das APIs

### Full Sync
```bash
# Executar sync completo
curl -X POST http://localhost:3000/api/shopify/full-sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Ver status
curl http://localhost:3000/api/shopify/full-sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### RFM Analytics
```bash
# Calcular RFM
curl -X POST http://localhost:3000/api/shopify/analytics/rfm \
  -H "Authorization: Bearer YOUR_TOKEN"

# Ver resumo
curl http://localhost:3000/api/shopify/analytics/rfm \
  -H "Authorization: Bearer YOUR_TOKEN"

# Ver scores por segmento
curl "http://localhost:3000/api/shopify/analytics/rfm?view=scores&segment=champion" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Cohort Analytics
```bash
# Calcular cohorts
curl -X POST http://localhost:3000/api/shopify/analytics/cohort \
  -H "Authorization: Bearer YOUR_TOKEN"

# Ver matriz
curl http://localhost:3000/api/shopify/analytics/cohort \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Cron Jobs
```bash
# Jobs disponíveis: abandoned, reconcile, health, cleanup, rfm, cohort, analytics, all
curl "http://localhost:3000/api/cron/shopify?job=rfm" \
  -H "Authorization: Bearer CRON_SECRET"
```

---

## ⏰ Configuração de Cron (Vercel)

Adicione ao `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/shopify?job=abandoned",
      "schedule": "*/30 * * * *"
    },
    {
      "path": "/api/cron/shopify?job=reconcile",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/shopify?job=analytics",
      "schedule": "0 3 * * *"
    }
  ]
}
```

E adicione `CRON_SECRET` nas environment variables.

---

## 📈 RFM Segmentos

| Segmento | Cor | Descrição |
|----------|-----|-----------|
| champion | 🟢 | Compraram recentemente, frequentemente e muito |
| loyal | 🔵 | Gastam bem e compram frequentemente |
| potential_loyalist | 🟣 | Clientes recentes com boa frequência |
| recent | 🔵 | Compraram recentemente mas sem histórico |
| promising | 🟡 | Compradores recentes com potencial |
| need_attention | 🟠 | Clientes acima da média esfriando |
| about_to_sleep | 🟣 | Abaixo da média em recência e frequência |
| at_risk | 🔴 | Gastaram muito mas não compram há tempo |
| cant_lose | 🔴 | Grandes compradores inativos |
| hibernating | ⚫ | Última compra há muito tempo |
| lost | ⚫ | Menor recência, frequência e valor |

---

## ✅ Checklist de Implementação

- [ ] Executar `SECURITY_PATCH_V3_SUPABASE.sql`
- [ ] Executar `SHOPIFY_COMPLETE_TABLES_V3.sql`
- [ ] Copiar arquivos TypeScript
- [ ] Verificar build (`npm run build`)
- [ ] Testar endpoint `/api/shopify/full-sync`
- [ ] Testar endpoint `/api/shopify/analytics/rfm`
- [ ] Configurar cron jobs
- [ ] Adicionar `CRON_SECRET` nas env vars

---

## 🆘 Troubleshooting

### Erro: "permission denied for schema auth"
O SQL Editor do Supabase não permite criar funções no schema `auth`. O patch V3 já usa `public.get_user_org_id()` como workaround.

### Erro: "function auth.organization_id() does not exist"
Execute o patch V3 que cria a função alternativa `public.get_user_org_id()`.

### Erro: "column notification_count does not exist"
Execute `SHOPIFY_COMPLETE_TABLES_V3.sql` que adiciona colunas faltantes.

### Erro 401 nas APIs
Verifique se o token Bearer está sendo enviado corretamente no header Authorization.
