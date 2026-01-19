-- ============================================
-- PARTE 1: CRIAR TABELAS
-- Execute esta parte primeiro
-- ============================================

-- Dropar tabelas se existirem (cuidado: apaga dados!)
-- DROP TABLE IF EXISTS task_reminders CASCADE;
-- DROP TABLE IF EXISTS comment_mentions CASCADE;
-- DROP TABLE IF EXISTS notification_preferences CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;

-- 1. Tabela Principal de Notificações
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    type TEXT NOT NULL CHECK (type IN (
        'mention',
        'task_assigned',
        'task_due_soon',
        'task_overdue',
        'task_completed',
        'comment_reply',
        'deal_assigned',
        'deal_stage_changed',
        'whatsapp_mention',
        'reminder'
    )),
    
    title TEXT NOT NULL,
    message TEXT,
    
    reference_type TEXT,
    reference_id UUID,
    
    actor_id UUID,
    
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Preferências
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    mention_enabled BOOLEAN DEFAULT true,
    task_assigned_enabled BOOLEAN DEFAULT true,
    task_due_soon_enabled BOOLEAN DEFAULT true,
    task_overdue_enabled BOOLEAN DEFAULT true,
    task_completed_enabled BOOLEAN DEFAULT true,
    comment_reply_enabled BOOLEAN DEFAULT true,
    deal_assigned_enabled BOOLEAN DEFAULT true,
    deal_stage_changed_enabled BOOLEAN DEFAULT true,
    whatsapp_mention_enabled BOOLEAN DEFAULT true,
    reminder_enabled BOOLEAN DEFAULT true,
    
    in_app_enabled BOOLEAN DEFAULT true,
    email_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT false,
    
    dnd_enabled BOOLEAN DEFAULT false,
    dnd_start TIME DEFAULT '22:00',
    dnd_end TIME DEFAULT '08:00',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, organization_id)
);

-- 3. Tabela de Menções
CREATE TABLE IF NOT EXISTS comment_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES contact_comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(comment_id, mentioned_user_id)
);

-- 4. Tabela de Lembretes
CREATE TABLE IF NOT EXISTS task_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    remind_at TIMESTAMPTZ NOT NULL,
    reminder_type TEXT DEFAULT 'custom' CHECK (reminder_type IN ('due_soon', 'overdue', 'custom')),
    
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT 'PARTE 1 CONCLUÍDA - Tabelas criadas!' as status;
