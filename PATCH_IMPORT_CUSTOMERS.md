# Patch para Import Customers

No arquivo `src/app/api/shopify/import-customers/route.ts`, onde cria o objeto do contato para inserir, adicionar o `store_id`:

## Encontrar este trecho (aproximadamente linha 200-250):

```typescript
const contactData = {
  organization_id: organizationId,
  email: normalizeEmail(customer.email),
  phone: normalizePhone(customer.phone),
  first_name: sanitizeString(customer.first_name),
  last_name: sanitizeString(customer.last_name),
  // ...
};
```

## Mudar para:

```typescript
const contactData = {
  organization_id: organizationId,
  store_id: storeId, // ✅ ADICIONAR ESTA LINHA
  email: normalizeEmail(customer.email),
  phone: normalizePhone(customer.phone),
  first_name: sanitizeString(customer.first_name),
  last_name: sanitizeString(customer.last_name),
  // ...
};
```

## Onde pegar o storeId:

No início da função POST, adicionar:

```typescript
const { storeId } = body; // Receber do frontend

// Ou buscar pelo shop_domain:
const { data: store } = await supabase
  .from('shopify_stores')
  .select('id')
  .eq('shop_domain', shopDomain)
  .single();

const storeId = store?.id;
```
