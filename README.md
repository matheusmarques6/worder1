# Correção Multi-Org (Agência)

## Arquivo para substituir:
- `src/lib/api-utils.ts` → SUBSTITUIR

## Alteração manual necessária:

Em **`src/app/api/deals/route.ts`** (linha ~26), mudar:

```typescript
// ANTES:
const storeValidation = await validateStoreAccess(supabase, organizationId, storeId);

// DEPOIS (adicionar user.id):
const storeValidation = await validateStoreAccess(supabase, organizationId, storeId, user.id);
```

## Como encontrar outros lugares para corrigir:

```bash
grep -rn "validateStoreAccess" src/app/api
```

Em cada lugar, adicionar `user.id` como 4º parâmetro.

## Testar:
1. Deploy
2. Logar como matheus@convertfy.me
3. Selecionar loja "San Martin"
4. Ir para CRM > Deals
5. Deve carregar sem erro 403
