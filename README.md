# 🚀 SYNC_FIX_COMPLETO - Deploy Instructions

## O que este ZIP contém

Todas as correções necessárias para resolver o problema de sincronização entre dispositivos.

### Arquivos incluídos:

```
src/
├── stores/
│   ├── index.ts              # ✅ Zustand SEM persist (dados de servidor)
│   └── inboxStore.ts         # ✅ Com clearAll() para logout
├── hooks/
│   ├── index.ts              # ✅ Sem organizationId nas URLs
│   └── usePipelines.ts       # ✅ Sem organizationId nas URLs
├── components/
│   ├── providers/
│   │   └── AuthProvider.tsx  # 🆕 Gerencia onAuthStateChange
│   ├── layout/
│   │   ├── Header.tsx        # ✅ Sem organizationId nas URLs
│   │   └── Sidebar.tsx       # ✅ Sem organizationId nas URLs
│   ├── notifications/
│   │   └── NotificationBell.tsx # ✅ Sem organizationId nas URLs
│   └── integrations/
│       ├── shopify/
│       │   └── ShopifyConnect.tsx # ✅ Sem organizationId nas URLs
│       └── whatsapp/
│           └── WhatsAppCloudConnect.tsx # ✅ Sem organizationId nas URLs
└── app/
    ├── layout.tsx            # ✅ Com AuthProvider wrapper
    ├── api/
    │   ├── stores/
    │   │   └── route.ts      # ✅ Com getAuthClient (era vulnerável!)
    │   └── debug/
    │       └── session/
    │           └── route.ts  # 🆕 Endpoint de debug
    └── (dashboard)/
        └── layout.tsx        # ✅ Com todas as correções da Fase 1-4 + Ajuste 1
```

## Como fazer deploy

### 1. Extrair e substituir

```bash
# Extrair o ZIP na raiz do projeto
unzip SYNC_FIX_COMPLETO.zip -d /caminho/do/seu/projeto/
```

Isso irá substituir os arquivos existentes pelas versões corrigidas.

### 2. Verificar build

```bash
npm run build
```

### 3. Deploy

Faça deploy normalmente (Vercel, etc.)

## Correções aplicadas

### Fase 1: Zustand sem persist
- `useStoreStore` - SEM persist
- `useCRMStore` - SEM persist  
- `useWhatsAppStore` - SEM persist
- `useAutomationStore` - SEM persist
- `useUIStore` - COM persist (OK, é preferência de UI)
- Todos os stores agora têm `clearAll()` chamado no logout

### Fase 4: Dashboard layout
- ❌ Removido fallback "Demo User"
- ✅ `loadStores` agora depende de `user?.organization_id`
- ✅ Verifica auth antes de fazer fetch

### Ajuste 1: organizationId removido das URLs
- Todas as chamadas fetch agora NÃO passam organizationId
- O backend obtém do JWT via `getAuthClient()`

### Bug de segurança corrigido
- API `/api/stores` estava retornando stores de TODOS os usuários
- Agora filtra pela organização do usuário autenticado

## Como testar

### 1. Debug de sessão
Acesse em ambos os dispositivos:
```
GET /api/debug/session
```

Deve retornar mesmo `userId`, `organizationId`, `storesCount`.

### 2. Teste de sincronização
1. Limpar localStorage nos browsers
2. Login no PC A
3. Criar dado no PC A  
4. Login no PC B (mesmo usuário)
5. PC B deve ver o dado criado no PC A

## Problemas?

Se algo não funcionar após o deploy:

1. Verifique se todas as APIs usam `getAuthClient()` e não `getSupabaseClient()`
2. Verifique o console do browser por erros
3. Use `/api/debug/session` para comparar entre dispositivos
