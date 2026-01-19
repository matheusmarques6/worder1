# Sistema de Notificações - Worder

## Estrutura

```
src/
├── app/api/
│   ├── notifications/
│   │   ├── route.ts
│   │   └── preferences/route.ts
│   └── users/search/route.ts
├── components/notifications/
│   ├── index.ts
│   ├── NotificationBell.tsx
│   ├── NotificationPanel.tsx
│   ├── MentionInput.tsx
│   └── NotificationSettingsPage.tsx
├── hooks/useNotifications.ts
└── types/notifications.ts

sql/
└── 001-notifications.sql
```

## Instalação

1. Execute `sql/001-notifications.sql` no Supabase
2. Copie os arquivos para as pastas correspondentes
3. Adicione `<NotificationBell organizationId={orgId} />` no Header
4. Use `<MentionInput />` para campos de comentário
