# 🔥 CORREÇÃO CRÍTICA: Vazamento de Dados entre Organizações

## O Problema

Quando o usuário troca de loja no dropdown da Sidebar, o WhatsApp Inbox continua 
mostrando conversas da organização **ANTERIOR** porque o `organization_id` vinha 
fixo do `user.organization_id`.

## Arquivos Incluídos

```
src/
├── app/api/shopify/stores/route.ts    ← CRIAR (nova API)
├── hooks/
│   ├── useCurrentOrganization.ts      ← CRIAR (novo hook)
│   └── useStore.ts                    ← SUBSTITUIR
└── stores/
    └── PATCH-ShopifyStore-interface.ts ← INSTRUÇÕES para editar index.ts
```

---

## 🚀 Instalação

### 1. Copiar arquivos novos

```bash
# Copiar toda a pasta src para o projeto
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
  organization_id: string        // ✅ ADICIONAR
  organization_name?: string     // ✅ ADICIONAR
  connectionStatus?: string
  statusMessage?: string
  healthCheckedAt?: string
  consecutiveFailures?: number
}
```

### 3. Corrigir src/app/(dashboard)/whatsapp/inbox/page.tsx

**Adicionar import:**
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
const { organizationId: currentOrgId, currentStore } = useCurrentOrganization()
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
grep -rn "user?.organization_id\|user.organization_id" src/
```

E substitua por:
```typescript
const { organizationId } = useCurrentOrganization()
```

---

## 🔍 Como Testar

1. Logar com usuário que tem múltiplas lojas
2. Ir para WhatsApp Inbox
3. Ver conversas da loja atual
4. Trocar de loja no dropdown
5. **Verificar**: Conversas devem mudar para a nova organização
