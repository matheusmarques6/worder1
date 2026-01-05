# Instruções para Atualizar o Frontend

## O que precisa mudar no frontend

Todas as páginas que buscam dados precisam passar o `storeId` da loja selecionada:

### 1. Página de Contatos (`src/app/(dashboard)/crm/contacts/page.tsx`)

Onde tiver:
```typescript
const response = await fetch('/api/contacts');
```

Mudar para:
```typescript
const response = await fetch(`/api/contacts?storeId=${currentStore?.id || ''}`);
```

### 2. Buscar Stats

Onde tiver:
```typescript
const statsRes = await fetch('/api/contacts/stats');
```

Mudar para:
```typescript
const statsRes = await fetch(`/api/contacts/stats?storeId=${currentStore?.id || ''}`);
```

### 3. Deals/Pipeline

```typescript
const response = await fetch(`/api/deals?storeId=${currentStore?.id || ''}`);
```

### 4. Criar novo contato

Quando criar contato, passar o store_id:
```typescript
await fetch('/api/contacts', {
  method: 'POST',
  body: JSON.stringify({
    ...contactData,
    store_id: currentStore?.id
  })
});
```

## Dica: Usar um hook customizado

Criar um hook para sempre incluir o storeId:

```typescript
// src/hooks/useStoreApi.ts
import { useStoreStore } from '@/stores';

export function useStoreApi() {
  const { currentStore } = useStoreStore();
  
  const fetchWithStore = async (url: string, options?: RequestInit) => {
    const separator = url.includes('?') ? '&' : '?';
    const urlWithStore = currentStore?.id 
      ? `${url}${separator}storeId=${currentStore.id}`
      : url;
    return fetch(urlWithStore, options);
  };
  
  return { fetchWithStore, storeId: currentStore?.id };
}
```

Uso:
```typescript
const { fetchWithStore } = useStoreApi();
const response = await fetchWithStore('/api/contacts');
```
