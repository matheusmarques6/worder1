# 🔧 CORREÇÃO: Mensagens que "não aparecem" + Optimistic UI

## 📋 DIAGNÓSTICO CONFIRMADO

### Problema Principal
O sistema de conversas não estava vinculando corretamente `instance_id` e `store_id`, causando:
1. **Conversas "legadas"** sem instance_id → não conseguem enviar mensagens
2. **Mistura de conversas** entre lojas/números diferentes
3. **Mensagens que "somem"** porque o POST /messages falha silenciosamente

### Causa Raiz
- **Webhook (inbound)**: Buscava conversa apenas por `org + phone`, sem `instance_id`
- **POST /messages (outbound)**: Validava `instance_id` e retornava 400, mas UI não mostrava erro

---

## ✅ CORREÇÕES APLICADAS (v2 - Seguro para Multi-Loja)

### Patch 0: Webhook com Instance Scoping
**Arquivo:** `src/app/api/whatsapp/evolution/webhook/route.ts`

**Correções:**
1. Busca conversa por `org + instance + phone` (não mais só org + phone)
2. Auto-heal para conversas legadas (atualiza instance_id + store_id)
3. **NOVO v2:** Inclui `store_id` nas mensagens salvas
4. **NOVO v2:** Dedupe por `(org, instance_id, message_id)` ao invés de só `(org, message_id)`

---

### Patch 1: Optimistic UI no sendMessage
**Arquivo:** `src/hooks/useInboxMessages.ts`

**Comportamento Novo:**
1. Ao apertar Enter → adiciona mensagem local com `status: 'pending'`
2. Se API responder OK → substitui pelo ID real + `status: 'sent'`
3. Se API falhar → mantém mensagem com `status: 'failed'` + mostra erro

---

### Patch 2: UI de Erro + Retry
**Arquivos:**
- `src/components/whatsapp/inbox/ChatPanel.tsx`
- `src/components/whatsapp/inbox/InboxContent.tsx`

**Comportamento Novo:**
- Mensagens com `status: 'pending'` → fundo cinza + "Enviando..."
- Mensagens com `status: 'failed'` → fundo vermelho + erro + botão "Tentar novamente"

---

## 🗄️ SQL DE BACKFILL (v2 - SEGURO PARA MULTI-LOJA)

**Arquivo:** `sql/backfill-conversation-instance-id.sql`

### ⚠️ ORDEM DE EXECUÇÃO RECOMENDADA:

**PASSO 1:** Diagnóstico
```sql
SELECT COUNT(*) as total_sem_instance FROM whatsapp_conversations WHERE instance_id IS NULL;
```

**PASSO 2:** Backfill baseado na última mensagem (SEGURO)
```sql
-- Este é determinístico e seguro
UPDATE whatsapp_conversations wc
SET instance_id = (
  SELECT wm.instance_id FROM whatsapp_messages wm 
  WHERE wm.conversation_id = wc.id AND wm.instance_id IS NOT NULL
  ORDER BY wm.created_at DESC LIMIT 1
)
WHERE wc.instance_id IS NULL;
```

**PASSO 3:** Backfill baseado na instância da org (v2 SEGURO)
```sql
-- ⚠️ VERSÃO SEGURA: Só vincula se store_id bate OU org tem 1 instância
UPDATE whatsapp_conversations wc
SET 
  instance_id = wi.id,
  store_id = COALESCE(wc.store_id, wi.store_id),
  updated_at = NOW()
FROM LATERAL (
  SELECT id, store_id
  FROM whatsapp_instances
  WHERE organization_id = wc.organization_id
    AND status IN ('connected', 'ACTIVE', 'open')
    AND (wc.store_id IS NULL OR store_id = wc.store_id)
  ORDER BY updated_at DESC
  LIMIT 1
) wi
WHERE wc.instance_id IS NULL
AND (
  wc.store_id IS NOT NULL 
  OR (SELECT COUNT(*) FROM whatsapp_instances WHERE organization_id = wc.organization_id AND status IN ('connected', 'ACTIVE', 'open')) = 1
);
```

**PASSO 4:** Arquivar irrecuperáveis (OPCIONAL)
```sql
-- Conversas sem instance_id que não podem ser vinculadas com segurança
UPDATE whatsapp_conversations
SET status = 'archived', updated_at = NOW()
WHERE instance_id IS NULL;
```

---

## 🚀 COMO APLICAR

### 1. Copiar arquivos corrigidos
```bash
unzip correcoes-inbox-instance-id-v2.zip -o
cp -r correcoes-inbox-instance-id/src/* src/
```

### 2. Deploy
```bash
git add .
git commit -m "fix: vinculação correta de conversas por instance_id + optimistic UI (v2 multi-loja)"
git push origin main
```

### 3. Executar SQL de Backfill (EM ORDEM!)
1. Primeiro diagnóstico
2. Depois step 2 (última mensagem)
3. Depois step 3 (instância por store_id)
4. Por último arquivar (opcional)

---

## 🧪 CHECKLIST DE VALIDAÇÃO (estilo Chatwoot)

### A) Teste Anti-Vazamento Multi-Loja
1. Mesmo cliente (mesmo phone) manda msg para Número A (Loja 1)
2. Depois manda msg para Número B (Loja 2)
✅ Esperado: duas conversas diferentes, cada uma com seu instance_id

### B) Teste de Envio
1. Enviar texto
2. Deve aparecer "Enviando..."
3. Vira "sent" ou "failed"
✅ Se falhar, o erro aparece (conversation sem instance, config evolution, store mismatch, etc.)

---

## 🔍 DEBUG

Se ainda houver problemas:

### 1. Verificar no DevTools → Network
- Procure pelo POST `/api/whatsapp/inbox/conversations/{id}/messages`
- Verifique o status e resposta JSON

### 2. Erros comuns:
- **400 "Conversa não tem instância associada"** → Execute SQL de backfill
- **400 "Instância WhatsApp não está conectada"** → Reconecte a instância
- **403 "Instância não pertence à mesma loja"** → Dados inconsistentes

### 3. Verificar instância da conversa
```sql
SELECT 
  c.id, c.phone_number, c.instance_id, c.store_id,
  i.instance_name, i.status, i.store_id as instance_store_id
FROM whatsapp_conversations c
LEFT JOIN whatsapp_instances i ON i.id = c.instance_id
WHERE c.id = 'CONVERSATION_ID_AQUI';
```
