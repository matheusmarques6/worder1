# 🔥 CORREÇÃO: Vazamento de Dados entre Organizações

## O Problema

Quando você troca de loja no dropdown (ex: "San Martin"), as conversas WhatsApp e deals continuam mostrando dados da organização anterior porque o `organization_id` vinha FIXO do usuário logado.

## A Solução

1. A API agora retorna `organization_id` de cada loja
2. O hook `useStore` salva esse campo
3. O Inbox usa o `organization_id` da loja selecionada

---

## 📦 Arquivos para Substituir

```
src/
├── app/api/shopify/connect/route.ts   ← SUBSTITUIR
└── hooks/useStore.ts                   ← SUBSTITUIR
```

---

## 🛠️ Alterações Manuais Necessárias

### 1. Atualizar Interface ShopifyStore

Em `src/stores/index.ts`, encontre a interface `ShopifyStore` e **adicione**:

```typescript
export interface ShopifyStore {
  id: string
  name: string
  domain: string
  email?: string
  currency?: string
  isActive: boolean
  totalOrders?: number
  totalRevenue?: number
  lastSyncAt?: string
  organization_id?: string        // ✅ ADICIONAR
  organization_name?: string      // ✅ ADICIONAR
}
```

### 2. Corrigir a Página do Inbox

Em `src/app/(dashboard)/whatsapp/inbox/page.tsx`:

**Adicionar import:**
```typescript
import { useStoreStore } from '@/stores'
```

**Modificar o início da função (linha ~37-41):**

```typescript
// ❌ ANTES:
export default function InboxPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || 'default-org'

// ✅ DEPOIS:
export default function InboxPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  
  // Usar organization_id da LOJA SELECIONADA
  const organizationId = (currentStore as any)?.organization_id || user?.organization_id || 'default-org'
```

**Adicionar useEffect para recarregar ao trocar (opcional, mas recomendado):**

```typescript
// Adicionar junto com os outros useEffect:
useEffect(() => {
  // Limpar dados ao trocar de organização
  selectConversation(null as any)
  clearMessages()
  clearContact()
  // Recarregar
  fetchConversations()
}, [organizationId])
```

### 3. Corrigir a Página do CRM (Deals)

Em `src/app/(dashboard)/crm/page.tsx` ou onde o CRM está:

Fazer a mesma correção - usar `organization_id` da loja selecionada.

---

## 🔍 Como Testar

1. Fazer deploy
2. Logar com usuário que tem acesso a múltiplas lojas
3. Ir para WhatsApp > Inbox
4. Ver que mostra conversas da loja atual
5. **Trocar de loja** no dropdown da sidebar
6. **Verificar**: As conversas devem mudar para a nova loja/organização
7. Ir para CRM > Deals e repetir o teste

---

## ⚠️ Outros Lugares para Verificar

Use este comando para encontrar outros lugares que podem ter o mesmo problema:

```bash
grep -rn "user?.organization_id\|user.organization_id" src/app src/components src/hooks
```

Em cada lugar, avaliar se deveria usar o `organization_id` da loja selecionada.

---

## 📝 Resumo das Mudanças

| Arquivo | Mudança |
|---------|---------|
| `/api/shopify/connect/route.ts` | Retorna `organization_id` e busca de todas as orgs |
| `/hooks/useStore.ts` | Salva `organization_id` ao carregar lojas |
| `/stores/index.ts` | Adicionar `organization_id` na interface |
| `inbox/page.tsx` | Usar `organization_id` da loja selecionada |
| `crm/page.tsx` | Usar `organization_id` da loja selecionada |
