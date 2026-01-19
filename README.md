# Sistema de Notificações - Worder

## Estrutura

```
src/
├── app/api/
│   ├── notifications/
│   │   ├── route.ts              # CRUD notificações
│   │   └── preferences/route.ts  # Preferências
│   └── users/search/route.ts     # Busca usuários (@menções)
├── components/notifications/
│   ├── index.ts
│   ├── NotificationBell.tsx      # Sino com contador
│   ├── NotificationPanel.tsx     # Lista de notificações
│   ├── MentionInput.tsx          # Input com @menções
│   └── NotificationSettingsPage.tsx
├── hooks/useNotifications.ts
└── types/notifications.ts

sql/
├── 00-reset-tudo.sql       # Limpa tabelas existentes
├── 01-criar-tabelas.sql    # Cria as 4 tabelas
├── 02-indices-rls.sql      # Índices e RLS
└── 03-funcoes-triggers-v2.sql  # Funções e triggers
```

## Instalação

### 1. Execute o SQL no Supabase (em ordem!)

```
1. sql/00-reset-tudo.sql
2. sql/01-criar-tabelas.sql
3. sql/02-indices-rls.sql
4. sql/03-funcoes-triggers-v2.sql
```

### 2. Copie os arquivos

Copie o conteúdo de `src/` para o projeto Worder.

### 3. Adicione NotificationBell no Header

```tsx
import { NotificationBell } from '@/components/notifications'

// No header, após ter organizationId e userId:
<NotificationBell organizationId={organizationId} userId={userId} />
```

### 4. Use MentionInput nos comentários

```tsx
import { MentionInput, MentionText } from '@/components/notifications'

// Para input
<MentionInput
  value={comment}
  onChange={setComment}
  onSubmit={handleSubmit}
  organizationId={organizationId}
/>

// Para exibir
<MentionText text={comment.content} />
```

## Uso

Os componentes precisam de `organizationId` e `userId`:

```tsx
// Exemplo de uso no Header
const { user } = useAuth() // ou de onde você pega o user
const { organizationId } = useOrganization() // ou de onde você pega a org

<NotificationBell 
  organizationId={organizationId} 
  userId={user.id} 
/>
```

## Funcionalidades

- ✅ Menções @user em comentários
- ✅ Notificações automáticas (tarefas atribuídas/concluídas)
- ✅ Realtime via Supabase
- ✅ Preferências por tipo de notificação
- ✅ Modo "Não Perturbe"
