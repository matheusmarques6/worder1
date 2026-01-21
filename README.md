# 🚀 PLANO DE CORREÇÃO WORDER

**Data:** 21 de Janeiro de 2026

---

## 📋 RESUMO DOS PROBLEMAS E SOLUÇÕES

| # | Problema | Causa | Solução | Arquivo |
|---|----------|-------|---------|---------|
| 1 | Mensagens não aparecem | Race condition + conversas duplicadas | SQL + Webhook corrigido | `PLANO-EXECUCAO-SQL.sql` + `webhook-route-fixed.ts` |
| 2 | Timeline 404 | Deploy desatualizado | Verificar deploy | - |
| 3 | Notas sem anexos | Feature incompleta | Fase 2 | - |
| 4 | Notifications 400 | Falta user_id | API corrigida | `notifications-route-fixed.ts` |
| 5 | CRM 500 | store_id obrigatório | APIs corrigidas | `pipelines-route-fixed.ts` + `deals-route-fixed.ts` |
| 6 | Bot toggle | Sem orquestrador | Fase 2 | - |

---

## 🔧 ORDEM DE EXECUÇÃO

### FASE 1: BANCO DE DADOS (5-10 min)

Execute o arquivo `PLANO-EXECUCAO-SQL.sql` no Supabase SQL Editor **na ordem**:

```
1. FASE 0: Backup (IMPORTANTE!)
2. FASE 1: Limpar conversas duplicadas
3. FASE 2: Sincronizar phone_number
4. FASE 3: Adicionar constraint unique
5. FASE 4: Criar função upsert
6. FASE 5: Índices de performance
7. FASE 6: Trigger de sincronização
8. FASE 7: Verificação final
```

### FASE 2: CÓDIGO (substituir arquivos)

**2.1 Webhook Evolution API**
```
Origem:  webhook-route-fixed.ts
Destino: src/app/api/whatsapp/evolution/webhook/route.ts
```

**2.2 Notifications API**
```
Origem:  notifications-route-fixed.ts
Destino: src/app/api/notifications/route.ts
```

**2.3 CRM Pipelines API**
```
Origem:  pipelines-route-fixed.ts
Destino: src/app/api/crm/pipelines/route.ts
```

**2.4 Deals API**
```
Origem:  deals-route-fixed.ts
Destino: src/app/api/deals/route.ts
```

### FASE 3: DEPLOY

```bash
git add .
git commit -m "fix: corrigir race conditions, CRM 500, notifications 400"
git push
```

Verificar na Vercel se o deploy foi bem sucedido.

### FASE 4: TESTES

1. **Testar mensagens:**
   - Enviar mensagem para o WhatsApp
   - Verificar se aparece no chat
   - Verificar se não cria conversa duplicada

2. **Testar CRM:**
   - Acessar /crm/deals
   - Criar pipeline
   - Criar deal

3. **Testar notifications:**
   - Verificar console do navegador
   - Não deve mais dar 400

---

## 📁 ARQUIVOS INCLUÍDOS

```
/home/claude/worder-fix/
├── PLANO-EXECUCAO-SQL.sql      # Migrations e correções do banco
├── webhook-route-fixed.ts       # Webhook com upsert (evita duplicatas)
├── notifications-route-fixed.ts # API corrigida (resolve user do token)
├── pipelines-route-fixed.ts     # API corrigida (store_id opcional)
├── deals-route-fixed.ts         # API corrigida (store_id opcional)
└── README.md                    # Este arquivo
```

---

## ⚠️ PONTOS DE ATENÇÃO

### 1. Backup
Antes de rodar o SQL, os backups são criados automaticamente:
- `_backup_whatsapp_conversations_20260121`
- `_backup_whatsapp_messages_20260121`

Se algo der errado, restaure com:
```sql
DROP TABLE whatsapp_conversations;
CREATE TABLE whatsapp_conversations AS SELECT * FROM _backup_whatsapp_conversations_20260121;
```

### 2. Constraint Unique
Após a FASE 3 do SQL, novas conversas duplicadas são **impossíveis**. O webhook agora usa UPSERT.

### 3. Realtime
Não é necessário mudar nada no Supabase Realtime. As tabelas já estão habilitadas.

### 4. RLS
As correções usam `supabaseAdmin` onde necessário. RLS continua funcionando para o cliente.

---

## 🔍 COMO VERIFICAR SE FUNCIONOU

### Verificar duplicatas (deve retornar 0 linhas)
```sql
SELECT store_id, instance_id, contact_phone, COUNT(*) 
FROM whatsapp_conversations
WHERE store_id IS NOT NULL
GROUP BY store_id, instance_id, contact_phone
HAVING COUNT(*) > 1;
```

### Verificar phone_number sincronizado (deve retornar 0)
```sql
SELECT COUNT(*) as dessincronizados
FROM whatsapp_conversations
WHERE contact_phone IS NOT NULL
AND (phone_number IS NULL OR phone_number != contact_phone);
```

### Verificar índice criado
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'whatsapp_conversations' 
AND indexname LIKE '%unique%';
```

---

## 📞 PRÓXIMOS PASSOS (FASE 2)

Após confirmar que a Fase 1 está funcionando:

1. **Sistema de filas com QStash** - Para retry automático da IA
2. **Pipeline de attachments** - Para notas com anexos
3. **ContactChannel** - Abstração multi-canal (WhatsApp/Email/Instagram)

---

## ✅ CHECKLIST

- [ ] Backup criado
- [ ] Duplicatas limpas
- [ ] phone_number sincronizado
- [ ] Constraint unique adicionada
- [ ] Função upsert criada
- [ ] Webhook atualizado
- [ ] Notifications API atualizada
- [ ] Pipelines API atualizada
- [ ] Deals API atualizada
- [ ] Deploy feito
- [ ] Testes passaram
