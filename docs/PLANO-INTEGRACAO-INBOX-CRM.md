# 🔗 PLANO DE INTEGRAÇÃO: Inbox WhatsApp ↔ CRM ↔ Tarefas

## 🆕 Atualização: Novas Funcionalidades Incluídas
- ✅ **Notas Fiscais**: Upload e visualização de NFe/NFCe por contato
- ✅ **Comentários Internos**: Área para anotações da equipe sobre o cliente
- ✅ **Sistema de Tarefas**: Criar, visualizar e gerenciar tarefas vinculadas ao contato

---

## 📊 Diagnóstico da Arquitetura Atual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITETURA ATUAL (FRAGMENTADA)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   📱 WHATSAPP INBOX                           💼 CRM                         │
│   ┌─────────────────┐                      ┌─────────────────┐              │
│   │ whatsapp_       │                      │    contacts     │              │
│   │ contacts        │      ❌ SEM          │    (CRM)        │              │
│   │                 │      VÍNCULO         │                 │              │
│   │ - phone_number  │                      │ - phone         │              │
│   │ - name          │                      │ - whatsapp      │              │
│   │ - tags          │                      │ - first_name    │              │
│   │ - total_orders  │                      │ - tags          │              │
│   └────────┬────────┘                      │ - total_orders  │              │
│            │                               └────────┬────────┘              │
│            ▼                                        │                        │
│   ┌─────────────────┐                               ▼                        │
│   │ whatsapp_       │                      ┌─────────────────┐              │
│   │ conversations   │                      │     deals       │              │
│   │                 │                      │                 │              │
│   │ - contact_id ───┼───❌ Não aponta      │ - contact_id ───┼──→ contacts │
│   └─────────────────┘      para CRM        │ - pipeline_id   │              │
│                                            │ - stage_id      │              │
│                                            │ - value         │              │
│                                            └─────────────────┘              │
│                                                                              │
│   🚨 PROBLEMAS:                                                              │
│   1. Dados duplicados (2 tabelas de contatos)                               │
│   2. Não dá pra ver deals no Inbox                                          │
│   3. Atividades não são compartilhadas                                      │
│   4. Tags separadas                                                         │
│   5. Métricas de Shopify só no CRM                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Arquitetura Proposta (Unificada)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITETURA PROPOSTA (UNIFICADA)                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                            ┌─────────────────────┐                               │
│                            │      contacts       │                               │
│                            │   (TABELA ÚNICA)    │                               │
│                            └──────────┬──────────┘                               │
│                                       │                                          │
│       ┌───────────────┬───────────────┼───────────────┬───────────────┐         │
│       │               │               │               │               │         │
│       ▼               ▼               ▼               ▼               ▼         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐      │
│  │ whatsapp │   │  deals   │   │ contact  │   │  tasks   │   │ contact  │      │
│  │ convers. │   │          │   │activities│   │          │   │ invoices │      │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘      │
│                                                     │                           │
│                                                     ▼                           │
│                                              ┌──────────┐                       │
│                                              │  task    │                       │
│                                              │ comments │                       │
│                                              └──────────┘                       │
│                                                                                  │
│   ✅ BENEFÍCIOS:                                                                 │
│   1. Uma única fonte de verdade para contatos                                   │
│   2. Deals visíveis no Inbox                                                    │
│   3. Timeline unificada de atividades                                           │
│   4. Tarefas integradas (Inbox ↔ CRM ↔ Tarefas)                                │
│   5. Notas fiscais centralizadas                                                │
│   6. Comentários internos da equipe                                             │
│   7. Métricas Shopify disponíveis no Inbox                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo de Integração Triangular

```
                         ┌─────────────────┐
                         │     TAREFAS     │
                         │   /dashboard/   │
                         │    tasks        │
                         └────────┬────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │  Criar tarefa de qualquer │
                    │  lugar, visualizar em     │
                    │  todos os contextos       │
                    │                           │
         ┌──────────▼──────────┐     ┌──────────▼──────────┐
         │       INBOX         │     │        CRM          │
         │                     │◄───►│                     │
         │  /whatsapp/inbox    │     │   /crm/pipelines    │
         │                     │     │                     │
         │  • Ver tarefas      │     │  • Ver tarefas      │
         │  • Criar tarefas    │     │  • Criar tarefas    │
         │  • Ver deals        │     │  • Ver conversas    │
         └─────────────────────┘     └─────────────────────┘
```

---

## 📋 PLANO DE EXECUÇÃO

### FASE 1: Migração de Dados (Backend/Database)

#### 1.1 Manter tabela `contacts` como fonte única
```sql
-- Adicionar colunas do WhatsApp na tabela contacts existente
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_name TEXT; -- pushName do WhatsApp
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_conversations INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_messages_received INT DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_messages_sent INT DEFAULT 0;
```

#### 1.2 Migrar dados de whatsapp_contacts → contacts
```sql
-- Migrar contatos do WhatsApp que não existem no CRM
INSERT INTO contacts (
  organization_id, phone, whatsapp, first_name, 
  profile_picture_url, profile_name, source, tags,
  is_blocked, first_message_at, last_message_at,
  total_conversations, total_messages_received, total_messages_sent
)
SELECT 
  wc.organization_id,
  wc.phone_number,
  wc.phone_number,
  COALESCE(wc.name, wc.profile_name, wc.phone_number),
  wc.profile_picture_url,
  wc.profile_name,
  'whatsapp',
  wc.tags,
  wc.is_blocked,
  wc.first_message_at,
  wc.last_message_at,
  wc.total_conversations,
  wc.total_messages_received,
  wc.total_messages_sent
FROM whatsapp_contacts wc
WHERE NOT EXISTS (
  SELECT 1 FROM contacts c 
  WHERE c.organization_id = wc.organization_id 
  AND (c.phone = wc.phone_number OR c.whatsapp = wc.phone_number)
);
```

#### 1.3 Atualizar whatsapp_conversations para apontar para contacts
```sql
-- Vincular conversas à tabela contacts (não mais whatsapp_contacts)
UPDATE whatsapp_conversations wconv
SET contact_id = c.id
FROM contacts c
WHERE wconv.organization_id = c.organization_id
AND (wconv.phone_number = c.phone OR wconv.phone_number = c.whatsapp)
AND wconv.contact_id IS NULL;
```

#### 1.4 Tabela de Atividades Unificada
```sql
CREATE TABLE IF NOT EXISTS contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Contexto
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  
  -- Tipo de atividade
  activity_type VARCHAR(50) NOT NULL,
  -- Tipos: 'whatsapp_message_received', 'whatsapp_message_sent', 
  -- 'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
  -- 'order_placed', 'cart_abandoned', 'note_added', 'tag_added',
  -- 'contact_blocked', 'agent_assigned', 'bot_interaction',
  -- 'task_created', 'task_completed', 'task_comment_added',
  -- 'invoice_uploaded', 'comment_added'
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Quem fez
  created_by UUID REFERENCES profiles(id),
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_contact ON contact_activities(contact_id);
CREATE INDEX idx_activities_type ON contact_activities(activity_type);
CREATE INDEX idx_activities_created ON contact_activities(created_at DESC);
```

#### 1.5 Tabela de Tarefas (Sistema Integrado)
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Vínculos (pode ter múltiplos ou nenhum)
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  
  -- Dados da tarefa
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
  status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  
  -- Datas
  due_date TIMESTAMPTZ,
  due_time TIME, -- Horário específico (opcional)
  reminder_at TIMESTAMPTZ, -- Quando enviar lembrete
  completed_at TIMESTAMPTZ,
  
  -- Responsável
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to_name VARCHAR(255),
  
  -- Categorização
  task_type VARCHAR(50) DEFAULT 'general', 
  -- Tipos: 'general', 'follow_up', 'call', 'meeting', 'email', 'whatsapp', 'document'
  tags TEXT[] DEFAULT '{}',
  
  -- Recorrência (opcional)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule JSONB, -- { frequency: 'daily'|'weekly'|'monthly', interval: 1, end_date: null }
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL, -- Para tarefas recorrentes
  
  -- Metadados
  metadata JSONB DEFAULT '{}',
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_contact ON tasks(contact_id);
CREATE INDEX idx_tasks_deal ON tasks(deal_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority);
```

#### 1.6 Tabela de Comentários de Tarefas
```sql
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  
  content TEXT NOT NULL,
  
  -- Anexos
  attachments JSONB DEFAULT '[]', -- [{ name, url, type, size }]
  
  created_by UUID REFERENCES profiles(id),
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);
```

#### 1.7 Tabela de Comentários Internos sobre Contatos
```sql
CREATE TABLE IF NOT EXISTS contact_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  content TEXT NOT NULL,
  
  -- Pode ser vinculado a uma conversa específica
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  
  -- Visibilidade
  is_pinned BOOLEAN DEFAULT false,
  is_internal BOOLEAN DEFAULT true, -- Sempre interno, nunca visível para o cliente
  
  -- Menções (para notificar outros membros)
  mentions UUID[] DEFAULT '{}', -- IDs de profiles mencionados
  
  created_by UUID REFERENCES profiles(id),
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_comments_contact ON contact_comments(contact_id);
CREATE INDEX idx_contact_comments_pinned ON contact_comments(is_pinned) WHERE is_pinned = true;
```

#### 1.8 Tabela de Notas Fiscais
```sql
CREATE TABLE IF NOT EXISTS contact_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Dados da NF
  invoice_number VARCHAR(50), -- Número da nota
  invoice_type VARCHAR(20) DEFAULT 'nfe', -- nfe, nfce, nfse, receipt, other
  invoice_key VARCHAR(50), -- Chave de acesso (44 dígitos para NFe)
  
  -- Valores
  total_value DECIMAL(12,2),
  tax_value DECIMAL(12,2),
  
  -- Datas
  issue_date DATE,
  due_date DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- active, cancelled, pending
  
  -- Arquivo
  file_url TEXT, -- URL do PDF/XML no storage
  file_name VARCHAR(255),
  file_type VARCHAR(50), -- pdf, xml
  file_size INTEGER,
  
  -- Vínculo com pedido (se houver)
  order_id VARCHAR(100), -- ID do pedido Shopify ou interno
  order_number VARCHAR(50),
  
  -- Metadados
  metadata JSONB DEFAULT '{}', -- Dados extras: CNPJ emissor, série, etc.
  
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_contact ON contact_invoices(contact_id);
CREATE INDEX idx_invoices_number ON contact_invoices(invoice_number);
CREATE INDEX idx_invoices_date ON contact_invoices(issue_date DESC);
```

---

### FASE 2: Backend - APIs

#### 2.1 Estrutura de APIs

```
/api/whatsapp/inbox/contacts/[id]
├── GET    → Buscar contato + deals + tarefas + atividades + orders + notas fiscais
├── PATCH  → Atualizar contato
│
├── /tags
│   ├── POST   → Adicionar tag
│   └── DELETE → Remover tag
│
├── /comments
│   ├── GET    → Listar comentários
│   ├── POST   → Adicionar comentário (com menções)
│   └── /[id]
│       ├── PATCH  → Editar/fixar comentário
│       └── DELETE → Remover comentário
│
├── /tasks
│   ├── GET    → Listar tarefas do contato
│   ├── POST   → Criar tarefa vinculada
│   └── /[id]
│       ├── PATCH  → Atualizar tarefa (status, dados)
│       ├── DELETE → Remover tarefa
│       └── /comments
│           ├── GET  → Listar comentários da tarefa
│           └── POST → Adicionar comentário
│
├── /deals
│   ├── GET    → Listar deals do contato
│   └── POST   → Criar deal
│
├── /invoices
│   ├── GET    → Listar notas fiscais
│   ├── POST   → Upload de nota fiscal
│   └── /[id]
│       ├── GET    → Detalhes da NF
│       ├── PATCH  → Atualizar dados da NF
│       └── DELETE → Remover NF
│
├── /activities
│   └── GET    → Timeline unificada (com filtros)
│
└── /block
    └── POST   → Bloquear/desbloquear

/api/tasks
├── GET    → Listar todas as tarefas (com filtros)
├── POST   → Criar tarefa (pode ou não ter contact_id)
└── /[id]
    ├── GET    → Detalhes da tarefa
    ├── PATCH  → Atualizar tarefa
    ├── DELETE → Remover tarefa
    └── /comments
        ├── GET  → Listar comentários
        └── POST → Adicionar comentário

/api/invoices
├── GET    → Listar todas as notas fiscais (com filtros)
└── /upload
    └── POST → Upload com parsing automático de XML
```

#### 2.2 API Principal: GET /api/whatsapp/inbox/contacts/[id]

```typescript
// Retorna dados completos do contato para o painel lateral
interface ContactPanelResponse {
  contact: {
    id: string
    phone: string
    whatsapp: string
    name: string
    email?: string
    company?: string
    profile_picture_url?: string
    tags: string[]
    source: string
    
    // Métricas WhatsApp
    total_conversations: number
    total_messages_received: number
    total_messages_sent: number
    first_message_at?: string
    last_message_at?: string
    
    // Métricas Shopify
    total_orders: number
    total_spent: number
    average_order_value: number
    last_order_at?: string
    
    // Status
    is_blocked: boolean
    created_at: string
  }
  
  // CRM - Deals
  deals: {
    active: DealSummary | null
    history: DealSummary[]
    stats: {
      total_won: number
      total_lost: number
      total_value_won: number
      win_rate: number
    }
  }
  
  // Tarefas
  tasks: {
    pending: TaskSummary[]
    completed_count: number
    overdue_count: number
  }
  
  // Shopify
  orders: {
    items: OrderSummary[]
    abandoned_cart?: CartSummary
    stats: {
      total_orders: number
      total_spent: number
      average_ticket: number
    }
  }
  
  // Notas Fiscais
  invoices: {
    items: InvoiceSummary[]
    stats: {
      total_count: number
      total_value: number
    }
  }
  
  // Comentários fixados
  pinned_comments: CommentSummary[]
  
  // Timeline (últimos 20 itens)
  activities: ActivityItem[]
}

interface TaskSummary {
  id: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'in_progress' | 'completed'
  due_date?: string
  due_time?: string
  assigned_to_name?: string
  comments_count: number
  deal_id?: string
  deal_title?: string
}

interface InvoiceSummary {
  id: string
  invoice_number: string
  invoice_type: 'nfe' | 'nfce' | 'nfse' | 'receipt'
  total_value: number
  issue_date: string
  order_number?: string
  file_url: string
}

interface CommentSummary {
  id: string
  content: string
  is_pinned: boolean
  created_by_name: string
  created_at: string
}
```

#### 2.3 API de Tarefas: POST /api/tasks

```typescript
interface CreateTaskRequest {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  task_type?: 'general' | 'follow_up' | 'call' | 'meeting' | 'email' | 'whatsapp' | 'document'
  
  // Vínculos opcionais
  contact_id?: string
  deal_id?: string
  conversation_id?: string
  
  // Agendamento
  due_date?: string
  due_time?: string
  reminder_at?: string
  
  // Responsável
  assigned_to?: string
  
  // Recorrência
  is_recurring?: boolean
  recurrence_rule?: {
    frequency: 'daily' | 'weekly' | 'monthly'
    interval: number
    end_date?: string
  }
  
  tags?: string[]
}

// Response inclui a tarefa criada + atividade registrada
interface CreateTaskResponse {
  task: Task
  activity: Activity // Atividade criada na timeline do contato
}
```

#### 2.4 API de Notas Fiscais: POST /api/whatsapp/inbox/contacts/[id]/invoices

```typescript
interface UploadInvoiceRequest {
  file: File // PDF ou XML
  invoice_number?: string // Auto-detectado se XML
  invoice_type?: 'nfe' | 'nfce' | 'nfse' | 'receipt'
  total_value?: number // Auto-detectado se XML
  issue_date?: string // Auto-detectado se XML
  order_id?: string // Vínculo com pedido
}

// Se for XML, fazer parsing automático dos dados
async function parseNFeXML(xml: string): Promise<Partial<Invoice>> {
  // Extrair: número, série, chave, valores, data emissão, etc.
}
```

#### 2.3 Webhook: Criar atividades automaticamente

```typescript
// No webhook de mensagens
async function handleMessage(instance, body) {
  // ... processar mensagem ...
  
  // Criar atividade na timeline
  await supabase.from('contact_activities').insert({
    organization_id: instance.organization_id,
    contact_id: contactId,
    conversation_id: conversation.id,
    activity_type: 'whatsapp_message_received',
    title: 'Mensagem recebida',
    description: content?.substring(0, 100),
    metadata: { message_type: messageType }
  })
}
```

#### 2.4 Trigger: Atividades automáticas para deals

```sql
-- Trigger para criar atividade quando deal muda de stage
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO contact_activities (
      organization_id, contact_id, deal_id, activity_type,
      title, metadata
    )
    SELECT 
      NEW.organization_id,
      NEW.contact_id,
      NEW.id,
      'deal_stage_changed',
      'Deal movido para ' || ps.name,
      jsonb_build_object('old_stage_id', OLD.stage_id, 'new_stage_id', NEW.stage_id)
    FROM pipeline_stages ps WHERE ps.id = NEW.stage_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_deal_stage_change
AFTER UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();
```

---

### FASE 3: Frontend - Componentes

#### 3.1 Novo ContactPanel (Redesenhado com 6 Abas)

```
┌─────────────────────────────────────────┐
│          CONTACT PANEL (400px)          │
├─────────────────────────────────────────┤
│                                         │
│        [Avatar/Foto]                    │
│        João Silva                       │
│        +55 11 99999-9999                │
│        joao@email.com                   │
│        ⚫ Ativo  🏷️ VIP  🏷️ Cliente    │
│                                         │
├─────────────────────────────────────────┤
│ [Info][CRM][Tarefas][Pedidos][NFs][📝] │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA INFO ═══════               │
│                                         │
│  📧 Email: joao@email.com               │
│  📍 São Paulo, SP                       │
│  📅 Cliente desde: 15 Jan 2024          │
│  🏢 Empresa: Tech Solutions             │
│                                         │
│  ── Tags ──                             │
│  [VIP] [Lead Quente] [Recorrente] [+]   │
│                                         │
│  ── Estatísticas WhatsApp ──            │
│  ┌─────────┬─────────┬─────────┐        │
│  │   42    │   38    │    5    │        │
│  │Recebidas│Enviadas │Conversas│        │
│  └─────────┴─────────┴─────────┘        │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA CRM ═══════                │
│                                         │
│  ── Deal Ativo ──                       │
│  ┌─────────────────────────────────┐    │
│  │ 🔵 Proposta Enviada             │    │
│  │ Pipeline: Vendas                │    │
│  │ Valor: R$ 5.000,00              │    │
│  │ Previsão: 25 Jan 2025           │    │
│  │ [Ver no CRM →]                  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Histórico de Deals ──               │
│  ✅ Venda Site - R$ 2.500 (ganho)       │
│  ❌ Consultoria - R$ 1.000 (perdido)    │
│                                         │
│  [+ Criar Novo Deal]                    │
│                                         │
│  ── Stats CRM ──                        │
│  ┌─────────┬─────────┬─────────┐        │
│  │    2    │ R$7.5k  │   67%   │        │
│  │ Ganhos  │ Total   │ WinRate │        │
│  └─────────┴─────────┴─────────┘        │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA TAREFAS ═══════            │
│                                         │
│  ┌── Nova Tarefa ─────────────────┐     │
│  │ O que precisa ser feito?   [+] │     │
│  └────────────────────────────────┘     │
│                                         │
│  ── Tarefas Pendentes (3) ──            │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🔴 Ligar para confirmar pedido  │    │
│  │ 📅 Hoje, 15:00                  │    │
│  │ 👤 Maria                        │    │
│  │ [✓ Concluir] [💬 2]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🟡 Enviar proposta atualizada   │    │
│  │ 📅 Amanhã                       │    │
│  │ 👤 Você                         │    │
│  │ [✓ Concluir] [💬 0]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🟢 Follow-up pós-venda          │    │
│  │ 📅 28 Jan 2025                  │    │
│  │ 👤 João                         │    │
│  │ [✓ Concluir] [💬 1]            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Tarefas Concluídas (12) ──          │
│  [Ver todas →]                          │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA PEDIDOS ═══════            │
│                                         │
│  ── Carrinho Abandonado ──              │
│  ┌─────────────────────────────────┐    │
│  │ 🛒 3 itens • R$ 450,00          │    │
│  │ Abandonado há 2h                │    │
│  │ • Camiseta Preta (2x)           │    │
│  │ • Calça Jeans (1x)              │    │
│  │ [📱 Enviar Recuperação]         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Últimos Pedidos ──                  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ #1234 • R$ 350,00               │    │
│  │ ✅ Entregue • 10 Jan 2024       │    │
│  │ 3 itens                         │    │
│  │ [Ver detalhes] [📄 NF]          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Stats Shopify ──                    │
│  ┌─────────┬─────────┬─────────┐        │
│  │    5    │ R$1.2k  │  R$240  │        │
│  │ Pedidos │ Total   │ Ticket  │        │
│  └─────────┴─────────┴─────────┘        │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA NOTAS FISCAIS ═══════      │
│                                         │
│  ┌── Upload de NF ────────────────┐     │
│  │ [📎 Arraste PDF/XML aqui]      │     │
│  │ ou [Selecionar arquivo]        │     │
│  └────────────────────────────────┘     │
│                                         │
│  ── Notas Fiscais (8) ──                │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📄 NFe 000.123.456              │    │
│  │ R$ 350,00 • 10 Jan 2025         │    │
│  │ Pedido #1234                    │    │
│  │ [📥 PDF] [📥 XML] [🔗 SEFAZ]    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 📄 NFe 000.123.400              │    │
│  │ R$ 520,00 • 05 Jan 2025         │    │
│  │ Pedido #1198                    │    │
│  │ [📥 PDF] [📥 XML] [🔗 SEFAZ]    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Resumo ──                           │
│  ┌─────────┬─────────┐                  │
│  │    8    │ R$4.2k  │                  │
│  │ Notas   │ Total   │                  │
│  └─────────┴─────────┘                  │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ ABA COMENTÁRIOS/TIMELINE ══════│
│                                         │
│  ── Comentários Fixados ──              │
│  ┌─────────────────────────────────┐    │
│  │ 📌 Cliente VIP, sempre priorizar│    │
│  │ Por: Ana • 3 dias atrás         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌── Novo Comentário ─────────────┐     │
│  │ Escreva um comentário...       │     │
│  │ @mencionar  [📎] [Fixar] [📤]  │     │
│  └────────────────────────────────┘     │
│                                         │
│  ── Timeline ──                         │
│  [Todos ▼] [Filtrar por tipo ▼]         │
│                                         │
│  ○ Agora                                │
│  │ 💬 Comentário adicionado             │
│  │ "Verificar disponibilidade..."       │
│  │ Por: Você                            │
│  │                                      │
│  ○ 10:30                                │
│  │ 📩 Mensagem recebida                 │
│  │ "Olá, gostaria de saber..."          │
│  │                                      │
│  ○ 10:25                                │
│  │ ✅ Tarefa concluída                  │
│  │ "Enviar orçamento"                   │
│  │ Por: Maria                           │
│  │                                      │
│  ○ 10:00                                │
│  │ 💼 Deal criado                       │
│  │ Proposta Enviada - R$ 5.000          │
│  │                                      │
│  ○ Ontem                                │
│  │ 📦 Pedido realizado                  │
│  │ #1234 - R$ 350,00                    │
│  │                                      │
│  ○ 3 dias                               │
│  │ 📄 Nota fiscal enviada               │
│  │ NFe 000.123.456                      │
│  │                                      │
│  [Carregar mais...]                     │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══════ AÇÕES RÁPIDAS ═══════          │
│                                         │
│  [🏷️ Tag] [📋 Tarefa] [💰 Deal]         │
│  [📄 Upload NF] [🚫 Bloquear]           │
│                                         │
└─────────────────────────────────────────┘
```

#### 3.2 Estrutura de Componentes Atualizada

```
src/components/whatsapp/inbox/
├── ContactPanel/
│   ├── index.tsx                    # Container principal
│   ├── ContactHeader.tsx            # Avatar, nome, status, tags
│   ├── QuickActions.tsx             # Botões de ação rápida
│   │
│   ├── tabs/
│   │   ├── InfoTab.tsx              # Dados básicos + stats WhatsApp
│   │   ├── CRMTab.tsx               # Deals + criar deal + stats CRM
│   │   ├── TasksTab.tsx             # 🆕 Tarefas vinculadas
│   │   ├── OrdersTab.tsx            # Carrinho + pedidos Shopify
│   │   ├── InvoicesTab.tsx          # 🆕 Notas fiscais
│   │   └── TimelineTab.tsx          # 🆕 Comentários + atividades
│   │
│   ├── modals/
│   │   ├── CreateDealModal.tsx
│   │   ├── CreateTaskModal.tsx      # 🆕 Modal de criar tarefa
│   │   ├── TaskDetailModal.tsx      # 🆕 Detalhes + comentários
│   │   ├── UploadInvoiceModal.tsx   # 🆕 Upload de NF
│   │   ├── AssignAgentModal.tsx
│   │   └── BlockContactModal.tsx
│   │
│   └── shared/
│       ├── StatCard.tsx             # Card de estatística
│       ├── TimelineItem.tsx         # Item da timeline
│       ├── TaskCard.tsx             # 🆕 Card de tarefa
│       ├── InvoiceCard.tsx          # 🆕 Card de nota fiscal
│       └── CommentBox.tsx           # 🆕 Input de comentário
```

#### 3.3 Página de Tarefas (Nova Seção)

```
src/app/(dashboard)/tasks/
├── page.tsx                         # Lista de tarefas
├── components/
│   ├── TasksKanban.tsx              # Visualização Kanban
│   ├── TasksList.tsx                # Visualização Lista
│   ├── TasksCalendar.tsx            # Visualização Calendário
│   ├── TaskFilters.tsx              # Filtros (status, prioridade, etc)
│   └── TaskDetailDrawer.tsx         # Drawer lateral com detalhes
```

**Visualização da Página de Tarefas:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TAREFAS                                              [+ Nova Tarefa]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [📋 Lista] [📊 Kanban] [📅 Calendário]     🔍 Buscar...                    │
│                                                                             │
│  Filtros: [Todas ▼] [Todos responsáveis ▼] [Todas prioridades ▼]           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ═══ HOJE (3) ═══                                                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ☐ 🔴 Ligar para confirmar pedido                        15:00        │  │
│  │   👤 João Silva (VIP) • 💬 2 comentários                             │  │
│  │   🏷️ follow-up  👤 Maria                                            │  │
│  │   [Abrir conversa] [Ver contato]                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ☐ 🟡 Enviar proposta atualizada                         17:00        │  │
│  │   👤 Maria Santos • 💼 Deal: Consultoria                             │  │
│  │   🏷️ proposta  👤 Você                                              │  │
│  │   [Abrir conversa] [Ver deal]                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ═══ AMANHÃ (2) ═══                                                         │
│  ...                                                                        │
│                                                                             │
│  ═══ ESTA SEMANA (5) ═══                                                    │
│  ...                                                                        │
│                                                                             │
│  ═══ ATRASADAS (1) ═══                                                      │
│  ...                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.3 Fluxo de Dados (Frontend)

```typescript
// hooks/useContactPanel.ts
export function useContactPanel(contactId: string) {
  const [data, setData] = useState<ContactPanelData | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Fetch completo ao selecionar contato
  const fetchContact = async () => {
    const res = await fetch(`/api/whatsapp/inbox/contacts/${contactId}`)
    const data = await res.json()
    setData(data)
  }
  
  // Realtime para atividades novas
  useEffect(() => {
    const channel = supabase
      .channel(`contact-${contactId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contact_activities',
        filter: `contact_id=eq.${contactId}`
      }, (payload) => {
        // Adicionar nova atividade na timeline
        setData(prev => ({
          ...prev,
          activities: [payload.new, ...prev.activities]
        }))
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)
  }, [contactId])
  
  // Actions
  const addTag = async (tag: string) => { ... }
  const removeTag = async (tag: string) => { ... }
  const addNote = async (content: string) => { ... }
  const createDeal = async (params: CreateDealParams) => { ... }
  const blockContact = async (reason?: string) => { ... }
  
  return { data, loading, addTag, removeTag, addNote, createDeal, blockContact }
}
```

---

### FASE 4: Funcionalidades Específicas

#### 4.1 Criar Deal a partir do Inbox

```typescript
// Modal de criação de deal
interface CreateDealFromInboxParams {
  contact_id: string
  conversation_id: string
  title: string
  value: number
  pipeline_id: string
  stage_id?: string // Se não informado, usa primeira stage
}

// API: POST /api/whatsapp/inbox/contacts/[id]/deals
// - Cria deal no CRM
// - Registra atividade
// - Retorna deal criado
```

#### 4.2 Sistema de Tarefas Integrado

**Criar Tarefa do Inbox:**
```typescript
// Ao criar tarefa do painel lateral, já vem vinculada ao contato + conversa
interface CreateTaskFromInbox {
  contact_id: string       // Auto-preenchido
  conversation_id: string  // Auto-preenchido
  deal_id?: string         // Opcional - vincular a um deal específico
  
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  task_type: 'follow_up' | 'call' | 'meeting' | 'email' | 'whatsapp' | 'document'
  
  due_date?: string
  due_time?: string
  assigned_to?: string
}
```

**Fluxo de Tarefas:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO DE TAREFAS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CRIAÇÃO (de qualquer lugar)                                             │
│     ├── Do Inbox → Vincula contact_id + conversation_id                     │
│     ├── Do CRM (Deal) → Vincula contact_id + deal_id                        │
│     └── Da página Tarefas → Pode vincular qualquer combinação               │
│                                                                              │
│  2. VISUALIZAÇÃO (em todos os contextos)                                    │
│     ├── Página Tarefas → Todas as tarefas (filtráveis)                      │
│     ├── Inbox ContactPanel → Tarefas do contato                             │
│     ├── CRM Deal Drawer → Tarefas do deal                                   │
│     └── CRM Contact Drawer → Tarefas do contato                             │
│                                                                              │
│  3. ATUALIZAÇÃO (de qualquer lugar)                                         │
│     ├── Marcar como concluída                                               │
│     ├── Adicionar comentário                                                │
│     ├── Reatribuir                                                          │
│     └── Reagendar                                                           │
│                                                                              │
│  4. NOTIFICAÇÕES                                                            │
│     ├── Lembrete antes do prazo                                             │
│     ├── Tarefa atribuída                                                    │
│     ├── Novo comentário                                                     │
│     └── Tarefa atrasada                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Triggers de Tarefas Automáticos:**
```sql
-- Trigger: Criar tarefa de follow-up quando deal muda para stage específico
CREATE OR REPLACE FUNCTION create_follow_up_task_on_stage()
RETURNS TRIGGER AS $$
DECLARE
  stage_config JSONB;
BEGIN
  -- Buscar configuração do stage
  SELECT settings INTO stage_config
  FROM pipeline_stages WHERE id = NEW.stage_id;
  
  -- Se stage tem auto_task configurado
  IF stage_config->>'auto_create_task' = 'true' THEN
    INSERT INTO tasks (
      organization_id, contact_id, deal_id, title, 
      task_type, due_date, assigned_to
    )
    VALUES (
      NEW.organization_id,
      NEW.contact_id,
      NEW.id,
      COALESCE(stage_config->>'task_title', 'Follow-up: ' || NEW.title),
      COALESCE(stage_config->>'task_type', 'follow_up'),
      NOW() + INTERVAL '1 day' * COALESCE((stage_config->>'task_days')::int, 2),
      NEW.assigned_to
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 4.3 Sistema de Comentários Internos

**Características:**
- Comentários são SEMPRE internos (nunca visíveis para o cliente)
- Suporte a menções (@usuario) com notificação
- Possibilidade de fixar comentários importantes
- Vinculado ao contato (aparece em qualquer conversa do contato)

```typescript
interface ContactComment {
  id: string
  contact_id: string
  conversation_id?: string // Opcional - contexto onde foi criado
  content: string
  is_pinned: boolean
  mentions: string[] // IDs dos usuários mencionados
  created_by: string
  created_by_name: string
  created_at: string
}

// API: POST /api/whatsapp/inbox/contacts/[id]/comments
async function addComment(contactId: string, data: {
  content: string
  mentions?: string[]
  is_pinned?: boolean
  conversation_id?: string
}) {
  // 1. Criar comentário
  // 2. Registrar atividade na timeline
  // 3. Notificar mencionados
}
```

#### 4.4 Sistema de Notas Fiscais

**Upload e Parsing Automático:**
```typescript
// Suporte a XML NFe/NFCe com parsing automático
async function handleInvoiceUpload(file: File, contactId: string) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  
  if (extension === 'xml') {
    // Parse automático do XML
    const xmlContent = await file.text()
    const invoiceData = parseNFeXML(xmlContent)
    
    // Dados extraídos automaticamente:
    // - Número da nota
    // - Série
    // - Chave de acesso (44 dígitos)
    // - CNPJ emissor
    // - Data emissão
    // - Valor total
    // - Valor impostos
    // - Itens (produtos)
  }
  
  // Upload para storage
  const fileUrl = await uploadToStorage(file, `invoices/${contactId}/${file.name}`)
  
  // Salvar no banco
  await createInvoice({ ...invoiceData, file_url: fileUrl, contact_id: contactId })
}

// Parsing de NFe XML
function parseNFeXML(xml: string): Partial<Invoice> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  
  return {
    invoice_number: doc.querySelector('nNF')?.textContent,
    invoice_key: doc.querySelector('chNFe')?.textContent,
    total_value: parseFloat(doc.querySelector('vNF')?.textContent || '0'),
    tax_value: parseFloat(doc.querySelector('vTotTrib')?.textContent || '0'),
    issue_date: doc.querySelector('dhEmi')?.textContent?.split('T')[0],
    // ... mais campos
  }
}
```

**Integração com Pedidos:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE NOTAS FISCAIS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  UPLOAD MANUAL                         AUTOMÁTICO (Shopify)      │
│  ──────────────                        ────────────────────      │
│                                                                  │
│  1. Usuário faz upload      OU    1. Pedido é faturado           │
│     do XML/PDF                    2. Webhook recebe NF           │
│  2. Sistema faz parsing           3. Vincula ao contact_id       │
│  3. Vincula ao pedido (opt.)      4. Salva automaticamente       │
│  4. Registra atividade            5. Registra atividade          │
│                                                                  │
│                    ┌─────────────────┐                           │
│                    │ contact_invoices│                           │
│                    │                 │                           │
│                    │ - contact_id    │                           │
│                    │ - order_id      │                           │
│                    │ - file_url      │                           │
│                    └─────────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.5 Sincronização Bidirecional Completa

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SINCRONIZAÇÃO BIDIRECIONAL                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INBOX → CRM/TAREFAS                      CRM/TAREFAS → INBOX                │
│  ──────────────────                       ──────────────────                 │
│                                                                              │
│  • Criar deal                             • Atualizar stage                  │
│  • Criar tarefa                           • Ganhar/perder deal               │
│  • Concluir tarefa                        • Criar tarefa                     │
│  • Adicionar tag                          • Concluir tarefa                  │
│  • Adicionar comentário                   • Atribuir agente                  │
│  • Upload nota fiscal                     • Adicionar nota fiscal            │
│  • Bloquear contato                       • Comentar em tarefa               │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  Tudo sincronizado via:                                                      │
│  1. contact_activities (timeline unificada)                                  │
│  2. Realtime subscriptions (Supabase)                                        │
│  3. Notificações (bell icon)                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.6 Links de Navegação

```typescript
// No Inbox, ao clicar em uma tarefa:
<Link href={`/tasks?task=${task.id}`}>
  Ver na página de Tarefas →
</Link>

// No Inbox, ao clicar em deal:
<Link href={`/crm?pipeline=${deal.pipeline_id}&deal=${deal.id}`}>
  Ver no CRM →
</Link>

// Na página de Tarefas, ao clicar em contato:
<Link href={`/whatsapp/inbox?conversation=${lastConversationId}`}>
  Abrir Conversa →
</Link>

// No CRM, ao clicar no ícone de WhatsApp:
<Link href={`/whatsapp/inbox?conversation=${lastConversationId}`}>
  Abrir WhatsApp →
</Link>
```

---

## 📅 Cronograma de Implementação

| Fase | Descrição | Estimativa |
|------|-----------|------------|
| **1.1** | Migração: Adicionar colunas em `contacts` | 30min |
| **1.2** | Migração: Migrar dados de `whatsapp_contacts` | 30min |
| **1.3** | Migração: Vincular conversas | 20min |
| **1.4** | Criar tabela `contact_activities` | 20min |
| **1.5** | Criar tabela `tasks` + `task_comments` | 30min |
| **1.6** | Criar tabela `contact_comments` | 15min |
| **1.7** | Criar tabela `contact_invoices` | 15min |
| **2.1-2.4** | APIs Backend (contacts, tasks, invoices) | 4-5h |
| **3.1** | Frontend: ContactPanel (6 abas) | 5-6h |
| **3.2** | Frontend: Página de Tarefas | 3-4h |
| **4.1-4.6** | Funcionalidades específicas + integrações | 4-5h |
| **Total** | | **~18-22h** |

### Ordem Recomendada de Implementação

```
SPRINT 1 (Base - 6-8h)
├── 1.1-1.4 Migração de dados + contact_activities
├── 2.2 API GET contacts/[id] completa
└── 3.1 ContactPanel básico (Info, CRM, Timeline)

SPRINT 2 (Tarefas - 6-8h)
├── 1.5 Tabela tasks
├── 2.3 APIs de tarefas
├── 3.1 TasksTab no ContactPanel
└── 3.2 Página de Tarefas

SPRINT 3 (NFs + Comentários - 4-6h)
├── 1.6-1.7 Tabelas comments e invoices
├── 2.4 APIs de NFs e comentários
└── 3.1 InvoicesTab + melhoria TimelineTab

SPRINT 4 (Polimento - 2-4h)
├── Notificações
├── Triggers automáticos
└── Links de navegação + UX
```

---

## ⚠️ Considerações Importantes

### Decisão: Manter ou Remover `whatsapp_contacts`?

**Opção A: Deprecar `whatsapp_contacts`** (RECOMENDADO)
- ✅ Uma única fonte de verdade
- ✅ Sem duplicação de dados
- ✅ Mais fácil de manter
- ⚠️ Requer migração cuidadosa

**Opção B: Manter `whatsapp_contacts` com FK para `contacts`**
- ✅ Menos impacto na migração
- ❌ Ainda tem duas tabelas
- ❌ Complexidade de sincronização

### Backward Compatibility

1. Manter APIs antigas funcionando temporariamente
2. Criar aliases/views se necessário
3. Deprecar gradualmente

### Pontos de Atenção

1. **RLS**: Garantir que policies funcionem para ambos os contextos
2. **Performance**: Índices adequados nas tabelas novas
3. **Realtime**: Configurar channels para tasks, comments, invoices
4. **Storage**: Bucket para arquivos de NF (PDFs, XMLs)
5. **Shopify**: Garantir webhook continue atualizando `contacts`
6. **Notificações**: Sistema de notificações para menções e tarefas

---

## 🎯 Resultado Esperado

Após a implementação, o usuário poderá:

### No Inbox (ContactPanel)
1. ✅ Ver todos os **deals** de um contato
2. ✅ **Criar deals** sem sair da conversa
3. ✅ Ver e criar **tarefas** vinculadas ao contato
4. ✅ **Concluir tarefas** direto do painel
5. ✅ Ver **notas fiscais** do cliente
6. ✅ Fazer **upload de NFs** (com parsing automático de XML)
7. ✅ Adicionar **comentários internos** sobre o cliente
8. ✅ **Fixar comentários** importantes
9. ✅ **@mencionar** colegas em comentários
10. ✅ Ver **timeline unificada** (mensagens, deals, tarefas, pedidos, NFs)
11. ✅ **Navegar** do Inbox para CRM/Tarefas

### Na Página de Tarefas
1. ✅ Ver **todas as tarefas** com filtros
2. ✅ **Visualização Kanban** (por status)
3. ✅ **Visualização Calendário**
4. ✅ Ver **contato vinculado** à tarefa
5. ✅ Ver **deal vinculado** à tarefa
6. ✅ **Abrir conversa** do contato direto
7. ✅ **Comentar** em tarefas
8. ✅ Receber **notificações** de tarefas atribuídas/atrasadas

### No CRM
1. ✅ Ver **tarefas** do deal/contato
2. ✅ **Criar tarefas** do drawer do deal
3. ✅ **Abrir conversa** WhatsApp do contato
4. ✅ Ver **notas fiscais** do contato

### Realtime
1. ✅ **Atualizações em tempo real** em todos os contextos
2. ✅ **Notificações** de menções
3. ✅ **Lembretes** de tarefas

---

## 📝 Próximos Passos

Aguardo sua aprovação para começar a implementação. Posso:

1. **Começar pela Sprint 1** (base) - Resolve a integração principal
2. **Focar nas Tarefas primeiro** - Feature mais impactante
3. **Implementar tudo em sequência** - Solução completa

Qual abordagem você prefere?
