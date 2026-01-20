# 🔔 Sistema de Notificações com Menções e Lembretes

## Visão Geral

Sistema completo de notificações para o Worder com:

- **Menções (@user)** em comentários na timeline
- **Lembretes de tarefas** (vencendo em 24h, atrasadas)
- **Notificações de tarefas** (atribuídas, concluídas)
- **Notificações de deals** (atribuídos, mudança de estágio)
- **Preferências personalizáveis** por usuário
- **Realtime** via Supabase Realtime

---

## 📦 Arquivos Modificados/Criados

### Componentes
- `src/components/notifications/MentionInput.tsx` - Input com @menções
- `src/components/notifications/MentionText.tsx` - Exibe menções formatadas
- `src/components/notifications/NotificationBell.tsx` - Sino com contador
- `src/components/notifications/NotificationPanel.tsx` - Dropdown de notificações
- `src/components/notifications/NotificationSettingsPage.tsx` - Página de configurações
- `src/components/notifications/index.ts` - Exports

### Hooks
- `src/hooks/useNotifications.ts` - Hook de notificações
- `src/hooks/useInboxContact.ts` - Atualizado para suportar mentions

### APIs
- `src/app/api/notifications/route.ts` - CRUD de notificações
- `src/app/api/notifications/preferences/route.ts` - Preferências
- `src/app/api/users/search/route.ts` - Busca usuários para @menção
- `src/app/api/whatsapp/inbox/contacts/[id]/comments/route.ts` - Processamento de menções

### Types
- `src/types/notifications.ts` - Types completos

### Utils
- `src/lib/utils/mentions.ts` - Funções para processar menções

### SQL
- `sql/notifications-migration.sql` - Migração do banco

### Páginas Modificadas
- `src/components/whatsapp/inbox/tabs/TimelineTab.tsx` - Input com menções
- `src/components/whatsapp/inbox/ContactPanel.tsx` - Nova tab Timeline

---

## 🚀 Instruções de Deploy

### 1️⃣ Execute o SQL no Supabase

1. Abra o **Supabase SQL Editor**
2. Cole o conteúdo de `sql/notifications-migration.sql`
3. Execute e verifique se não há erros

### 2️⃣ Verifique as Tabelas

```sql
-- Verificar tabelas criadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('notifications', 'notification_preferences', 'contact_comments');
```

### 3️⃣ Configure o CRON (Opcional)

Para lembretes automáticos de tarefas, configure um cron job:

**Opção A: pg_cron no Supabase**
```sql
-- Verificar tarefas que vencem em 24h (a cada hora)
SELECT cron.schedule('check-tasks-due-soon', '0 * * * *', 'SELECT check_tasks_due_soon()');

-- Verificar tarefas atrasadas (todo dia às 8h)
SELECT cron.schedule('check-tasks-overdue', '0 8 * * *', 'SELECT check_tasks_overdue()');
```

**Opção B: API Route + Vercel Cron**
```js
// vercel.json
{
  "crons": [
    { "path": "/api/cron/check-tasks", "schedule": "0 * * * *" }
  ]
}
```

### 4️⃣ Teste o Sistema

1. Vá para WhatsApp Inbox
2. Selecione uma conversa
3. Clique na aba **Timeline**
4. Digite um comentário com `@` para ver o dropdown de usuários
5. Selecione um usuário e salve
6. O usuário mencionado receberá uma notificação

---

## 🎯 Funcionalidades

### MentionInput
- Digitar `@` abre dropdown de usuários
- Busca em tempo real por nome/email
- Navegação por teclado (↑↓ Enter Esc Tab)
- Formato salvo: `@[Nome](user_id)`
- Envio com Enter (Shift+Enter para nova linha)

### MentionText
- Renderiza menções como badges azuis
- Formato: `@Nome` em destaque

### Notificações
- Badge com contador de não lidas
- Realtime via Supabase
- Marcar como lida/dispensar
- Marcar todas como lidas
- Link para o contexto (contato, tarefa, deal)

### Configurações
- Ativar/desativar por tipo de notificação
- Canais: in-app, email (futuro), push (futuro)
- Horário de "não perturbe"

---

## 🔗 Triggers Automáticos

| Evento | Notificação | Destinatário |
|--------|-------------|--------------|
| Comentário com @menção | `mention` | Usuário mencionado |
| Tarefa atribuída | `task_assigned` | Responsável |
| Tarefa concluída | `task_completed` | Criador da tarefa |
| Deal atribuído | `deal_assigned` | Owner do deal |
| Deal muda de estágio | `deal_stage_changed` | Owner do deal |
| Tarefa vence em 24h* | `task_due_soon` | Responsável |
| Tarefa atrasada* | `task_overdue` | Responsável |

*Requer configuração de cron

---

## 📱 Realtime

O sistema usa Supabase Realtime para:
- Atualizar contador de não lidas instantaneamente
- Mostrar novas notificações sem refresh
- Sincronizar estado entre abas

---

## 🎨 Formato de Menção

O sistema usa o formato `@[Nome](uuid)` para menções:

- **No banco**: `@[João Silva](123e4567-e89b-...)`
- **Na UI**: Badge azul com `@João Silva`
- **Extração**: Função `extractMentionIds()` no utils

---

## 🐛 Troubleshooting

### Notificações não aparecem
1. Verifique se o SQL foi executado corretamente
2. Confirme que as preferências `in_app_enabled` estão `true`
3. Verifique os logs de erro no console

### Menções não funcionam
1. Verifique se `/api/users/search` retorna usuários
2. Confirme que o `organizationId` está sendo passado
3. Verifique se há membros na organização

### Realtime não atualiza
1. Verifique se `notifications` está no `supabase_realtime`
2. Confirme a connection do Supabase client

---

## 📝 Exemplo de Uso

```tsx
// Em qualquer componente que precise de menções
import { MentionInput, MentionText } from '@/components/notifications'
import { extractMentionIds } from '@/lib/utils/mentions'

// Para input com menções
<MentionInput
  value={comment}
  onChange={setComment}
  onSubmit={handleSubmit}
  placeholder="Digite... Use @ para mencionar"
  organizationId={orgId}
/>

// Para exibir texto com menções formatadas
<MentionText text={comment.content} className="text-sm" />

// Para extrair IDs das menções
const userIds = extractMentionIds(comment) // ['uuid1', 'uuid2']
```

---

## ✅ Checklist de Implementação

- [x] Tabelas SQL criadas
- [x] RLS policies configuradas
- [x] Triggers automáticos
- [x] API de notificações
- [x] API de preferências
- [x] API de busca de usuários
- [x] Hook useNotifications
- [x] Componente MentionInput
- [x] Componente MentionText
- [x] Componente NotificationBell (existente no layout)
- [x] TimelineTab com menções
- [x] ContactPanel com tab Timeline
- [x] Realtime habilitado
- [ ] Página de configurações de notificações (rota)
- [ ] Cron para lembretes de tarefas
- [ ] Notificações por email (futuro)
- [ ] Push notifications (futuro)

---

## 🔒 Segurança

- RLS habilitado em todas as tabelas
- Usuários só veem suas próprias notificações
- Preferências isoladas por usuário/org
- Validação de membership antes de criar notificações
