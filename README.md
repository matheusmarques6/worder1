# INBOX COMPLETO - Instruções de Deploy

## O que está incluído:

### APIs:
- `/api/whatsapp/webhook` - Webhook corrigido (sem duplicados)
- `/api/whatsapp/inbox/conversations/[id]/messages` - Mensagens
- `/api/whatsapp/inbox/conversations/[id]/read` - Marcar como lido
- `/api/whatsapp/inbox/conversations/[id]/bot` - Controle do bot
- `/api/whatsapp/inbox/contacts/[id]/tags` - Tags
- `/api/whatsapp/inbox/contacts/[id]/block` - Bloquear
- `/api/whatsapp/inbox/contacts/[id]/notes` - Notas
- `/api/whatsapp/inbox/contacts/[id]/deals` - Deals
- `/api/ai-agents` - Agentes de IA

### Componentes:
- `InboxTab.tsx` - Inbox completo com polling 2s
- `BotSelector.tsx` - Seletor de agentes de IA

## PASSO 1: Execute o SQL no Supabase

```sql
-- Limpar duplicados de conversas
DELETE FROM whatsapp_conversations
WHERE id NOT IN (
  SELECT DISTINCT ON (phone_number, organization_id) id
  FROM whatsapp_conversations
  ORDER BY phone_number, organization_id, created_at DESC
);

-- Limpar duplicados de contatos
DELETE FROM whatsapp_contacts
WHERE id NOT IN (
  SELECT DISTINCT ON (phone_number, organization_id) id
  FROM whatsapp_contacts
  ORDER BY phone_number, organization_id, created_at DESC
);

-- Tabela de agentes (se quiser usar bot)
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    provider TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-4o-mini',
    api_key TEXT,
    temperature DECIMAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Colunas na conversa
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS ai_agent_id UUID;

ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS bot_stopped_at TIMESTAMPTZ;
```

## PASSO 2: Copie os arquivos

Extraia o ZIP e copie a pasta `src/` para o projeto.

## PASSO 3: Deploy

```bash
git add .
git commit -m "feat: inbox completo com tempo real"
git push
```

## PASSO 4: Teste

1. Mande mensagem do celular para o WhatsApp conectado
2. A mensagem deve aparecer no inbox em até 2 segundos
3. Clique em "Tag" para adicionar uma tag
4. Clique em "Deal" para criar um deal
5. Clique em "Bloquear" para bloquear contato

## Funcionalidades:

✅ Mensagens em tempo real (polling 2s)
✅ Notificações corretas
✅ Sem duplicação de conversas
✅ Botão Tag funcional
✅ Botão Deal funcional
✅ Botão Bloquear funcional
✅ Notas salvando
✅ Transições suaves sem loading

## Para usar Bot com IA:

1. Execute o SQL de agentes
2. Crie um agente no Supabase:
```sql
INSERT INTO ai_agents (organization_id, name, description, system_prompt, provider, model, api_key) 
VALUES (
  'SEU_ORG_ID', 
  'Atendente Maya', 
  'Assistente de atendimento',
  'Você é Maya, assistente virtual. Seja educada e responda em português.',
  'openai',
  'gpt-4o-mini',
  'sk-sua-chave-openai'
);
```
3. No chat, clique em "Bot Off" e selecione o agente
