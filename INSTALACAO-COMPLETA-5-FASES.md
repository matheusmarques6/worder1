# 🚀 WORDER - INSTALAÇÃO COMPLETA (5 FASES)

**Data:** Janeiro 2026  
**Versão:** 1.0

---

## 📋 RESUMO DAS FASES

| Fase | Funcionalidade | SQL | APIs | Hooks | Páginas |
|------|---------------|-----|------|-------|---------|
| 1 | Anexos do Contato | ✅ | ✅ | ✅ | Tab no ContactPanel |
| 2 | Sistema de Tarefas | ✅ | ✅ | ✅ | `/tasks` |
| 3 | Mensagens Agendadas | ✅ | ✅ | ✅ | `/whatsapp/scheduled` |
| 4 | Fila de Atendimento | ✅ | ✅ | ✅ | `/whatsapp/queue` |
| 5 | Sistema de Tickets | ✅ | ✅ | ✅ | `/tickets` |

---

## 🗄️ ARQUIVOS SQL PARA EXECUTAR

Execute no Supabase Dashboard > SQL Editor na seguinte ordem:

```sql
-- 1. Fase 1 - Anexos
sql/fase1-contact-attachments.sql

-- 2. Fase 2 - Tarefas
sql/fase2-tasks.sql

-- 3. Fase 3 - Mensagens Agendadas
sql/fase3-scheduled-messages.sql

-- 4. Fase 4 - Fila de Atendimento
sql/fase4-queue.sql

-- 5. Fase 5 - Tickets
sql/fase5-tickets.sql
```

---

## 📁 ESTRUTURA DE ARQUIVOS CRIADOS

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── tasks/
│   │   │   └── page.tsx                    # Página de tarefas
│   │   ├── tickets/
│   │   │   └── page.tsx                    # Página de tickets
│   │   └── whatsapp/
│   │       ├── queue/
│   │       │   └── page.tsx                # Página da fila
│   │       └── scheduled/
│   │           └── page.tsx                # Página de agendamentos
│   └── api/
│       ├── agents/
│       │   └── status/
│       │       └── route.ts                # API status do agente
│       ├── contacts/
│       │   └── [id]/
│       │       └── attachments/
│       │           └── route.ts            # API anexos
│       ├── cron/
│       │   └── send-scheduled/
│       │       └── route.ts                # Cron envio de mensagens
│       ├── queue/
│       │   ├── agents/
│       │   │   └── route.ts                # API agentes da fila
│       │   ├── assign/
│       │   │   └── route.ts                # API atribuição
│       │   ├── items/
│       │   │   └── route.ts                # API itens da fila
│       │   └── settings/
│       │       └── route.ts                # API config da fila
│       ├── tasks/
│       │   ├── route.ts                    # API CRUD tarefas
│       │   ├── stats/
│       │   │   └── route.ts                # API stats tarefas
│       │   └── [id]/
│       │       ├── route.ts                # API tarefa individual
│       │       └── complete/
│       │           └── route.ts            # API completar tarefa
│       ├── tickets/
│       │   ├── route.ts                    # API CRUD tickets
│       │   ├── stats/
│       │   │   └── route.ts                # API stats tickets
│       │   └── [id]/
│       │       ├── route.ts                # API ticket individual
│       │       └── comments/
│       │           └── route.ts            # API comentários
│       └── whatsapp/
│           └── scheduled/
│               ├── route.ts                # API agendamentos
│               └── [id]/
│                   └── route.ts            # API agendamento individual
├── components/
│   ├── tasks/
│   │   ├── CreateTaskModal.tsx             # Modal criar tarefa
│   │   └── TaskCard.tsx                    # Card de tarefa
│   ├── tickets/
│   │   └── CreateTicketModal.tsx           # Modal criar ticket
│   └── whatsapp/
│       ├── inbox/
│       │   └── ContactAttachments.tsx      # Componente anexos
│       └── ScheduleMessageModal.tsx        # Modal agendamento
├── hooks/
│   ├── useAgentStatus.ts                   # Hook status agente
│   ├── useContactAttachments.ts            # Hook anexos
│   ├── useQueue.ts                         # Hook fila
│   ├── useScheduledMessages.ts             # Hook agendamentos
│   ├── useTasks.ts                         # Hook tarefas
│   └── useTickets.ts                       # Hook tickets
└── sql/
    ├── fase1-contact-attachments.sql
    ├── fase2-tasks.sql
    ├── fase3-scheduled-messages.sql
    ├── fase4-queue.sql
    └── fase5-tickets.sql
```

---

## ⚙️ CONFIGURAÇÕES NECESSÁRIAS

### 1. Supabase Storage (Fase 1)

Criar bucket para anexos:
- **Nome:** `contact-files`
- **Public:** `true`
- **MIME Types:** `image/*, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.*`

### 2. Variáveis de Ambiente

```env
# Para o cron de mensagens agendadas
CRON_SECRET=seu_secret_seguro_aqui
```

### 3. Vercel Cron (vercel.json)

O arquivo já foi atualizado com o cron de mensagens agendadas:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled",
      "schedule": "* * * * *"
    }
    // ... outros crons existentes
  ]
}
```

---

## 🔗 LINKS DO MENU (Sidebar)

Adicione ao seu sidebar/menu:

```typescript
// Tarefas
{
  href: '/tasks',
  icon: CheckSquare,
  label: 'Tarefas',
}

// Tickets
{
  href: '/tickets',
  icon: Ticket,
  label: 'Tickets',
}

// WhatsApp > Agendados
{
  href: '/whatsapp/scheduled',
  icon: Clock,
  label: 'Agendados',
  parent: 'whatsapp',
}

// WhatsApp > Fila
{
  href: '/whatsapp/queue',
  icon: Users,
  label: 'Fila',
  parent: 'whatsapp',
}
```

---

## 🧩 INTEGRAÇÕES RECOMENDADAS

### 1. Integrar Tarefas ao CRM

No componente de Deals/Negócios, adicione botão para criar tarefa:

```typescript
import { useTasks } from '@/hooks/useTasks'

// No componente:
const { createTask } = useTasks({...})

<button onClick={() => createTask({
  title: `Follow-up: ${deal.title}`,
  type: 'followup',
  due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  deal_id: deal.id,
  contact_id: deal.contact_id,
})}>
  Criar Follow-up
</button>
```

### 2. Integrar Agendamento no Chat

No componente de chat, adicione botão de agendar:

```typescript
import { ScheduleMessageModal } from '@/components/whatsapp/ScheduleMessageModal'

// Ao lado do botão enviar:
<button onClick={() => setShowScheduleModal(true)}>
  <Clock className="w-5 h-5" />
</button>
```

### 3. Integrar Tickets ao Inbox

Criar ticket a partir de conversa:

```typescript
import { useTickets } from '@/hooks/useTickets'

const { createTicket } = useTickets({...})

<button onClick={() => createTicket({
  title: `Solicitação de ${contact.name}`,
  contact_id: contact.id,
  contact_name: contact.name,
  contact_phone: contact.phone_number,
  conversation_id: conversation.id,
})}>
  Criar Ticket
</button>
```

### 4. Webhook para Fila Automática

No webhook de novas mensagens, adicionar à fila:

```typescript
// Em api/webhooks/evolution/route.ts

if (event === 'messages.upsert' && isNew) {
  // Adicionar à fila se não tem agente atribuído
  if (!conversation.assigned_agent_id) {
    await fetch('/api/queue/items', {
      method: 'POST',
      body: JSON.stringify({
        organization_id,
        conversation_id: conversation.id,
        contact_name: contact.name,
        contact_phone: contact.phone_number,
        last_message_preview: message.content,
      }),
    })
  }
}
```

---

## 🧪 COMO TESTAR

### Fase 1 - Anexos
1. Abrir conversa > Painel do contato > Tab "Anexos"
2. Upload de arquivo
3. Verificar listagem, download e exclusão

### Fase 2 - Tarefas
1. Acessar `/tasks`
2. Criar tarefa com tipos diferentes
3. Completar e excluir tarefas

### Fase 3 - Agendamentos
1. Acessar `/whatsapp/scheduled`
2. Criar agendamento para daqui 5 minutos
3. Aguardar envio automático

### Fase 4 - Fila
1. Acessar `/whatsapp/queue`
2. Ficar online como agente
3. Adicionar conversa à fila
4. Distribuir automaticamente

### Fase 5 - Tickets
1. Acessar `/tickets`
2. Criar ticket com diferentes categorias
3. Mudar status, adicionar comentários
4. Resolver ticket

---

## 🔧 SOLUÇÃO DE PROBLEMAS

### Erro: "Table not found"
- Execute todos os SQLs no Supabase na ordem correta

### Anexos não aparecem
- Verifique se o bucket `contact-files` existe
- Verifique RLS policies

### Mensagens não enviam
- Verifique se instância WhatsApp está conectada
- Verifique logs do cron `/api/cron/send-scheduled`

### Fila não distribui
- Verifique se há agentes online
- Verifique configurações em `queue_settings`

---

## 📊 TABELAS CRIADAS

| Fase | Tabelas |
|------|---------|
| 1 | `contact_attachments` |
| 2 | `tasks` |
| 3 | `scheduled_messages` |
| 4 | `queue_settings`, `agent_status`, `queue_items` |
| 5 | `tickets`, `ticket_comments`, `ticket_history` |

---

## ✅ CHECKLIST DE DEPLOY

- [ ] Executar SQLs no Supabase (produção)
- [ ] Criar bucket `contact-files`
- [ ] Configurar `CRON_SECRET` no Vercel
- [ ] Testar todas as funcionalidades em staging
- [ ] Deploy para produção
- [ ] Verificar cron jobs no Vercel

---

**Pronto! Todas as 5 fases implementadas.** 🎉

Se precisar de ajuda com alguma integração específica ou customização, é só pedir!
