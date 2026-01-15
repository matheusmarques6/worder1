# ZAP ZAP 09 - Correções de Realtime

## Resumo das Alterações

### 1. Hook `useInboxRealtime` (V2) 
**Arquivo:** `/src/hooks/useInboxRealtime.ts`

**Melhorias implementadas:**
- ✅ Canais únicos com timestamp para evitar conflitos ao remontar
- ✅ Status detalhado de cada canal (conversations, messages, instances)
- ✅ Detecção de erros com `hasError`
- ✅ Logging melhorado com emojis para fácil debug
- ✅ Tratamento de eventos `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`

**Retorno do hook:**
```typescript
{
  isConnected: boolean,      // Ao menos um canal conectado
  isFullyConnected: boolean, // Todos os canais necessários conectados
  hasError: boolean,         // Algum canal com erro
  status: {
    conversations: 'disconnected' | 'connecting' | 'connected' | 'error',
    messages: 'disconnected' | 'connecting' | 'connected' | 'error',
    instances: 'disconnected' | 'connecting' | 'connected' | 'error'
  },
  lastEvent: string | null   // Timestamp do último evento recebido
}
```

### 2. Fallback Polling no `InboxTab`
**Arquivo:** `/src/app/(dashboard)/whatsapp/components/InboxTab.tsx`

- ✅ Polling automático de 5s quando Realtime está desconectado ou com erro
- ✅ Indicador visual do status de conexão (Live/Polling/Erro)
- ✅ Para polling automaticamente quando Realtime reconecta

### 3. Indicador Visual de Status

O indicador mostra:
- 🟢 **Verde (Live)** - Realtime funcionando
- 🟡 **Amarelo (Polling)** - Usando fallback polling
- 🔴 **Vermelho (Erro)** - Erro na conexão realtime

---

## Como Testar

### Passo 1: Aplicar Migration no Supabase

Execute no **SQL Editor** do Supabase:

```sql
-- =============================================
-- IMPORTANTE: Aplicar no Supabase SQL Editor
-- =============================================

-- Enable realtime for whatsapp_conversations
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_conversations already in publication';
END $$;

-- Enable realtime for whatsapp_messages
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_messages already in publication';
END $$;

-- Enable realtime for whatsapp_instances
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'whatsapp_instances already in publication';
END $$;

-- Verificar se funcionou
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

### Passo 2: Deploy e Teste

1. Faça deploy das alterações
2. Abra o Inbox no WhatsApp
3. Verifique o indicador ao lado de "Conversas":
   - Se mostrar **🟢 Live** = Realtime funcionando
   - Se mostrar **🟡 Polling** = Usando fallback
4. Abra o **Console do navegador (F12)** e procure por logs `[Realtime]`

### Passo 3: Teste de Mensagens

1. Envie uma mensagem para seu número WhatsApp conectado
2. Verifique se a mensagem aparece automaticamente
3. Nos logs, procure por: `[Realtime] ✅ New message:`

### Passo 4: Teste de Conexão

1. Desconecte e reconecte o WhatsApp
2. O status deve atualizar automaticamente
3. Nos logs, procure por: `[Realtime] ✅ Instance update:`

---

## Troubleshooting

### Realtime não conecta

1. **Verifique a migration** - A tabela precisa estar na publication:
   ```sql
   SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
   ```

2. **Verifique o Supabase Dashboard:**
   - Vá em Database → Replication
   - Certifique-se que as tabelas estão habilitadas

3. **Verifique os logs:**
   - Procure por `[Realtime] ❌` para erros
   - Verifique se o status muda para `SUBSCRIBED`

### Mensagens não chegam em tempo real

1. **Verifique o webhook:**
   - GET em `/api/whatsapp/webhook` deve retornar status OK
   - Verifique logs do Vercel para erros no webhook

2. **Verifique a instância:**
   - O `unique_id` da instância deve corresponder ao nome na Evolution API
   - Execute: `SELECT unique_id, status FROM whatsapp_instances;`

3. **Verifique o conversation_id:**
   - A mensagem deve ter o `conversation_id` correto para ser recebida
   - O filtro do realtime usa `conversation_id=eq.{id}`

### Fallback polling não funciona

1. Verifique se `realtimeConnected` está `false`
2. Verifique se não há erros no `fetchConversations`
3. Os logs devem mostrar: `[Polling] Fetching conversations silently...`

---

## Logs Esperados (Debug)

### Conexão OK:
```
[Realtime] 🔌 Subscribing to conversations: inbox-conv-xxx-123456
[Realtime] Conversations channel status: SUBSCRIBED
[Realtime] 🔌 Subscribing to instances: inbox-inst-xxx-123456
[Realtime] Instances channel status: SUBSCRIBED
```

### Nova Mensagem:
```
[Realtime] ✅ New message: { id: '...', content: '...', direction: 'inbound' }
```

### Atualização de Instância:
```
[Realtime] ✅ Instance update: UPDATE { status: 'connected', phone_number: '...' }
```

### Fallback Polling Ativo:
```
[Polling] Starting fallback polling (realtime not connected)
[Polling] Fetching conversations silently...
```

---

## Arquivos Modificados

1. `/src/hooks/useInboxRealtime.ts` - Hook V2 com melhorias
2. `/src/app/(dashboard)/whatsapp/components/InboxTab.tsx` - Fallback polling + indicador visual
3. `/supabase/migrations/20260114_enable_inbox_realtime.sql` - Migration (se ainda não aplicada)

---

## Próximos Passos (se necessário)

Se o Realtime continuar não funcionando após estas correções:

1. **Verificar RLS Policies** - Certifique que as policies permitem SELECT
2. **Verificar Supabase Plan** - Realtime tem limites no plano gratuito
3. **Implementar WebSocket direto** - Alternativa se Supabase Realtime falhar
