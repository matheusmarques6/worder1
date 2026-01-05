# Instruções para Aplicar o Patch de Filtro por Loja

## 1. Arquivos Atualizados

- `src/app/api/contacts/route.ts` - API de contatos com filtro por storeId
- `src/app/api/contacts/stats/route.ts` - API de stats com filtro por storeId  
- `src/app/api/deals/route.ts` - API de deals com filtro por storeId
- `src/hooks/useStoreApi.ts` - Hook helper para o frontend

## 2. Como Usar no Frontend

### Opção A: Usar o hook `useStoreApi` (RECOMENDADO)

```tsx
import { useStoreApi } from '@/hooks/useStoreApi';

function ContactsPage() {
  const { fetchWithStore, postWithStore, storeId } = useStoreApi();
  
  // GET - Buscar contatos da loja selecionada
  const loadContacts = async () => {
    const response = await fetchWithStore('/api/contacts');
    const data = await response.json();
    // ...
  };
  
  // POST - Criar contato na loja selecionada
  const createContact = async (contactData) => {
    const response = await postWithStore('/api/contacts', contactData);
    // ...
  };
}
```

### Opção B: Passar storeId manualmente

```tsx
import { useStoreStore } from '@/stores';

function ContactsPage() {
  const { currentStore } = useStoreStore();
  
  // GET
  const loadContacts = async () => {
    const response = await fetch(`/api/contacts?storeId=${currentStore?.id}`);
    // ...
  };
  
  // POST
  const createContact = async (contactData) => {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({
        ...contactData,
        store_id: currentStore?.id
      })
    });
  };
}
```

## 3. Páginas que Precisam ser Atualizadas

### CRM > Contatos (`src/app/(dashboard)/crm/contacts/page.tsx`)
- Adicionar storeId ao carregar contatos
- Adicionar store_id ao criar contato

### CRM > Deals (`src/app/(dashboard)/crm/page.tsx`)
- Adicionar storeId ao carregar deals e pipelines
- Adicionar store_id ao criar deal

### Dashboard (`src/app/(dashboard)/dashboard/page.tsx`)
- Se mostrar stats de contatos, adicionar storeId

## 4. Comportamento

- Se `storeId` for passado: retorna apenas dados daquela loja
- Se `storeId` NÃO for passado: retorna dados de todas as lojas da organização
- Útil para views de "todas as lojas" vs "loja específica"
