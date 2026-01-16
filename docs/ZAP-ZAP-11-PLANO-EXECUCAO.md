# ZAP ZAP 11 - Plano de Execução Final

## 📋 Resumo do Diagnóstico

### Problema Principal Identificado
**As mensagens reais não estavam sendo salvas** porque o webhook não encontrava a instância corretamente.

**Causa raiz:** O webhook buscava por `instance_name` e `instance_id`, mas o Evolution API envia o `unique_id` como identificador.

### Correções Aplicadas Neste Commit
1. ✅ Webhook corrigido para buscar por `unique_id` em vez de `instance_id`
2. ✅ Logs melhorados para facilitar debug
3. ✅ Fallback mais robusto com mensagens de erro detalhadas

---

## 🚀 Plano de Execução em 3 Fases

### FASE 1: Deploy e Validação (Imediato)

#### Passo 1: Deploy do Código
```bash
git add .
git commit -m "fix: webhook busca por unique_id + logs melhorados"
git push origin main
```

#### Passo 2: Aplicar Migration de Realtime no Supabase
Execute no **Supabase SQL Editor**:

```sql
-- =============================================
-- HABILITAR REALTIME PARA WHATSAPP
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

-- VERIFICAR
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

**Resultado esperado:** Deve mostrar `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_instances`

#### Passo 3: Verificar Instância no Banco
Execute no Supabase:

```sql
SELECT id, unique_id, instance_name, status, phone_number 
FROM whatsapp_instances;
```

**Importante:** O `unique_id` deve corresponder ao nome da instância configurado na Evolution API.

#### Passo 4: Teste de Mensagem
1. Abra o Inbox do WhatsApp no Worder
2. Abra o Console do navegador (F12)
3. Envie uma mensagem para o número conectado
4. Verifique os logs no Vercel:
   - Procure por: `[Evolution Webhook] ✅ Instance found:`
   - Procure por: `[Evolution] ✅ Message saved:`

---

### FASE 2: Validação de Realtime (Após deploy)

#### Checklist de Teste

| Teste | Como verificar | Resultado esperado |
|-------|---------------|-------------------|
| Webhook recebe mensagem | Logs Vercel | `[Evolution Webhook] Event: messages.upsert` |
| Instância encontrada | Logs Vercel | `[Evolution Webhook] ✅ Instance found:` |
| Mensagem salva | Logs Vercel | `[Evolution] ✅ Message saved:` |
| Realtime conectado | Console do navegador | `[Realtime] Conversations channel status: SUBSCRIBED` |
| Mensagem aparece na UI | Tela do Inbox | Mensagem aparece sem refresh |

#### Se Algo Falhar

**Problema: "No instance found"**
```sql
-- Verificar unique_id
SELECT unique_id, instance_name FROM whatsapp_instances;

-- Se precisar corrigir:
UPDATE whatsapp_instances 
SET unique_id = 'NOME_NA_EVOLUTION_API'
WHERE id = 'SEU_INSTANCE_ID';
```

**Problema: Realtime não conecta**
```sql
-- Verificar se RLS está configurado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('whatsapp_messages', 'whatsapp_conversations');

-- Se RLS estiver ON, verificar policies
SELECT * FROM pg_policies 
WHERE tablename = 'whatsapp_messages';
```

---

### FASE 3: Otimizações Futuras (Opcional)

Estas melhorias são **nice-to-have** e podem ser implementadas depois:

#### 3.1 Índices de Performance
```sql
-- Índice para busca de mensagens por conversa
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON whatsapp_messages(conversation_id, created_at DESC);

-- Índice para busca de conversas por organização
CREATE INDEX IF NOT EXISTS idx_conversations_org_updated 
ON whatsapp_conversations(organization_id, last_message_at DESC);

-- Índice para unique_id (se não existir)
CREATE UNIQUE INDEX IF NOT EXISTS idx_instances_unique_id 
ON whatsapp_instances(unique_id);
```

#### 3.2 Indicador de Digitação
Implementação futura - não prioritário.

#### 3.3 Processamento Assíncrono (BullMQ)
**Não recomendado para mensagens individuais** no contexto Vercel.
Manter apenas para campanhas em massa.

---

## 📊 Arquitetura Final

```
┌─────────────────┐     ┌─────────────────┐
│  Evolution API  │────▶│  Vercel Webhook │
│   (WhatsApp)    │     │  /api/whatsapp/ │
└─────────────────┘     │  evolution/     │
                        │  webhook        │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    Supabase     │
                        │  ┌───────────┐  │
                        │  │ messages  │  │
                        │  │ convs     │  │
                        │  │ instances │  │
                        │  └─────┬─────┘  │
                        │        │        │
                        │  REALTIME PUB   │
                        └────────┼────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
              ▼                                     ▼
    ┌─────────────────┐               ┌─────────────────┐
    │  InboxTab.tsx   │               │  Fallback Poll  │
    │  (useInbox-     │               │  (5s interval   │
    │   Realtime)     │               │  se RT falhar)  │
    └─────────────────┘               └─────────────────┘
```

---

## ✅ Checklist Final

- [ ] Deploy do código corrigido
- [ ] Migration de Realtime aplicada
- [ ] Verificar `unique_id` corresponde à Evolution API
- [ ] Teste: mensagem enviada → aparece no Inbox sem refresh
- [ ] Indicador verde "Live" no Debug Panel

---

## 📝 Notas Importantes

1. **O plano de implementação original estava PARCIALMENTE correto**, mas:
   - BullMQ/Redis para mensagens individuais é **overkill** para Vercel
   - Kubernetes/Docker **não se aplica** a Vercel serverless
   - A sincronização automática via cron job é **desnecessária**

2. **O problema real era simples**: webhook buscava pelo campo errado

3. **Supabase Realtime já estava implementado** corretamente - só precisava da migration

4. **Fallback polling funciona** como backup quando Realtime falha

---

## Arquivos Modificados Neste Commit

1. `/src/app/api/whatsapp/evolution/webhook/route.ts` - Busca corrigida + logs
2. `/docs/ZAP-ZAP-11-PLANO-EXECUCAO.md` - Esta documentação

---

*Gerado em: 15 de janeiro de 2026*
