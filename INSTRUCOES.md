# Instruções de Integração - Sistema de Agentes de IA

## 1. Execute a migração SQL primeiro
Rode o arquivo `migration-ai-agents.sql` no Supabase.

## 2. Adicione OPENAI_API_KEY nas variáveis de ambiente
No Vercel ou .env:
```
OPENAI_API_KEY=sk-sua-chave-aqui
```

## 3. Modifique o InboxTab.tsx

### 3.1 Adicione o import no topo do arquivo:
```tsx
import BotSelector from '@/components/whatsapp/BotSelector'
```

### 3.2 Atualize a interface InboxConversation (linha ~67):
```tsx
interface InboxConversation {
  id: string
  organization_id: string
  contact_id: string
  phone_number: string
  status: string
  is_bot_active: boolean
  ai_agent_id?: string | null  // ADICIONE ESTA LINHA
  last_message_at?: string
  last_message_preview?: string
  unread_count: number
  can_send_template_only: boolean
  contact_name?: string
  contact_avatar?: string
  contact_tags?: string[]
}
```

### 3.3 Adicione função para atualizar bot (após handleToggleBot):
```tsx
const handleBotChange = (isActive: boolean, agent: any) => {
  setSelectedConversation(prev => prev ? {
    ...prev,
    is_bot_active: isActive,
    ai_agent_id: agent?.id || null,
  } : null)
  
  // Atualizar na lista também
  setConversations(prev => prev.map(c =>
    c.id === selectedConversation?.id
      ? { ...c, is_bot_active: isActive, ai_agent_id: agent?.id || null }
      : c
  ))
}
```

### 3.4 Substitua o botão de Bot (~linha 652):

DE:
```tsx
<button onClick={handleToggleBot} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedConversation.is_bot_active ? 'bg-primary-500/10 text-primary-400 border border-primary-500/30' : 'bg-dark-700/50 text-dark-400 hover:text-white'}`}>
  <Bot className="w-4 h-4" /><span className="hidden sm:inline">{selectedConversation.is_bot_active ? 'Bot Ativo' : 'Bot Off'}</span>
</button>
```

PARA:
```tsx
<BotSelector
  conversationId={selectedConversation.id}
  organizationId={organizationId}
  currentAgentId={selectedConversation.ai_agent_id}
  isBotActive={selectedConversation.is_bot_active}
  onBotChange={handleBotChange}
/>
```

## 4. Estrutura de arquivos a adicionar:
```
src/
├── app/api/
│   ├── ai-agents/route.ts
│   └── whatsapp/
│       ├── inbox/conversations/[id]/bot/route.ts
│       └── webhook/route.ts (atualizado)
└── components/whatsapp/
    └── BotSelector.tsx
```

## 5. Crie um agente de teste
Após deploy, execute no Supabase:
```sql
INSERT INTO ai_agents (organization_id, name, description, system_prompt) 
VALUES (
  'SEU_ORGANIZATION_ID', 
  'Atendente Maya', 
  'Assistente de atendimento ao cliente',
  'Você é Maya, assistente virtual de atendimento ao cliente. Seja educada, prestativa e responda sempre em português brasileiro. Mantenha respostas curtas e objetivas.'
);
```

## 6. Teste
1. Abra uma conversa
2. Clique no dropdown "Bot Off"
3. Selecione "Atendente Maya"
4. Mande uma mensagem de outro celular
5. A IA deve responder automaticamente
