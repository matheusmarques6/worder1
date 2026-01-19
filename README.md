# 🔥 CORREÇÃO CRÍTICA: Vazamento de Dados entre Organizações

## O Problema

Quando o usuário troca de loja no dropdown da Sidebar, o WhatsApp Inbox continua 
mostrando conversas da organização **ANTERIOR** porque o `organization_id` vinha 
fixo do `user.organization_id`.

## Arquivos Incluídos

```
src/
├── app/api/shopify/stores/route.ts    ← CRIAR (nova API)
└── hooks/
    ├── useCurrentOrganization.ts      ← CRIAR (novo hook)
    └── useStore.ts                    ← SUBSTITUIR
```

---

## 🚀 Instalação

### 1. Copiar arquivos

```bash
# Copiar toda a pasta src para o projeto (vai mesclar)
cp -r src/* /caminho/do/projeto/src/
```

### 2. Editar src/stores/index.ts

Adicionar `organization_id` na interface `ShopifyStore`:

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

### 3. Corrigir src/app/(dashboard)/whatsapp/inbox/page.tsx

**Adicionar import no topo:**
```typescript
import { useCurrentOrganization } from '@/hooks/useCurrentOrganization'
```

**Substituir (linha ~38-41):**

```typescript
// ❌ ANTES:
const { user } = useAuthStore()
const organizationId = user?.organization_id || 'default-org'

// ✅ DEPOIS:
const { user } = useAuthStore()
const { organizationId: currentOrgId } = useCurrentOrganization()
const organizationId = currentOrgId || 'default-org'
```

**Atualizar useEffect (linha ~163):**

```typescript
useEffect(() => {
  console.log('🔄 Loading conversations for org:', organizationId)
  selectConversation(null as any)
  clearMessages()
  clearContact()
  fetchConversations()
}, [organizationId])
```

---

## ⚠️ IMPORTANTE: Outros Lugares para Corrigir

Execute para encontrar todos os lugares:
```bash
grep -rn "user?.organization_id\|user.organization_id" src/app src/components src/hooks
```

E substitua por:
```typescript
import { useCurrentOrganization } from '@/hooks/useCurrentOrganization'
// ...
const { organizationId } = useCurrentOrganization()
```

---

## 🔍 Como Testar

1. Logar com usuário que tem múltiplas lojas
2. Ir para WhatsApp Inbox
3. Ver conversas da loja atual
4. Trocar de loja no dropdown
5. **Verificar**: Conversas devem mudar para a nova organização
