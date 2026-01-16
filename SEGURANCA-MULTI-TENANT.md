# 🔒 SEGURANÇA: ISOLAMENTO MULTI-TENANT

**REGRA CRÍTICA: EM HIPÓTESE ALGUMA UMA CONTA PODE TER ACESSO A DADOS DE OUTRA**

---

## ⚠️ PRINCÍPIOS OBRIGATÓRIOS

### 1. TODAS as APIs DEVEM:

```typescript
// ✅ OBRIGATÓRIO - Verificar organization_id
if (!organizationId) {
  return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 });
}

// ✅ OBRIGATÓRIO - SEMPRE filtrar por organization_id
const { data } = await supabaseAdmin
  .from('tabela')
  .select('*')
  .eq('organization_id', organizationId) // ⚠️ NUNCA REMOVER
  .eq('id', resourceId);
```

### 2. NUNCA faça isso:

```typescript
// ❌ PROIBIDO - Query sem filtro de organização
const { data } = await supabaseAdmin
  .from('tasks')
  .select('*')
  .eq('id', taskId); // 🚨 VULNERABILIDADE: Permite acessar dados de outras orgs!

// ❌ PROIBIDO - Aceitar organization_id sem validar
// Um atacante pode passar organization_id de outra conta
```

### 3. SEMPRE valide recursos relacionados:

```typescript
// ✅ Se vinculando a um contato, verificar se pertence à mesma org
if (contact_id) {
  const { data: contact } = await supabaseAdmin
    .from('whatsapp_contacts')
    .select('organization_id')
    .eq('id', contact_id)
    .single();
  
  if (contact && contact.organization_id !== organization_id) {
    console.error(`[SECURITY] Blocked cross-org access`);
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
}
```

---

## 📋 CHECKLIST PARA NOVAS APIs

Antes de criar qualquer API, verifique:

- [ ] Recebe `organization_id` como parâmetro obrigatório
- [ ] Retorna erro 400 se `organization_id` não for fornecido
- [ ] TODA query SELECT filtra por `.eq('organization_id', organizationId)`
- [ ] TODA query UPDATE filtra por `.eq('organization_id', organizationId)`
- [ ] TODA query DELETE filtra por `.eq('organization_id', organizationId)`
- [ ] INSERT inclui `organization_id` no objeto
- [ ] Recursos relacionados são validados (contact_id, deal_id, etc)
- [ ] Logs de segurança em caso de tentativa de acesso cruzado

---

## 🗄️ BANCO DE DADOS

### RLS (Row Level Security) - Backup de segurança

Todas as tabelas TÊM RLS ativo, mas **NÃO CONFIE APENAS NO RLS** porque:
- `supabaseAdmin` **BYPASSA** o RLS
- APIs usam `supabaseAdmin` para operações

```sql
-- Exemplo de RLS (já aplicado em todas as tabelas)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);
```

---

## 📁 STORAGE (Arquivos)

### Isolamento de arquivos por organização:

```typescript
// ✅ CORRETO - Path inclui organization_id
const filePath = `${organizationId}/${contactId}/${fileName}`;

// ❌ ERRADO - Sem isolamento
const filePath = `${contactId}/${fileName}`;
```

---

## 🧪 TESTE DE SEGURANÇA

Antes de fazer deploy, teste:

1. **Crie 2 organizações diferentes**
2. **Crie dados em cada uma**
3. **Tente acessar dados da Org A usando organization_id da Org B**
4. **DEVE retornar 404 ou 403, NUNCA os dados**

```bash
# Exemplo de teste manual
curl -X GET "https://sua-api/api/tasks?organization_id=ORG_B_ID" \
  -H "Authorization: Bearer TOKEN_DA_ORG_A"

# Resposta esperada: 404 ou lista vazia (NUNCA dados da Org B)
```

---

## 🚨 EM CASO DE INCIDENTE

Se descobrir que dados vazaram entre organizações:

1. **PARE IMEDIATAMENTE** o deploy
2. **Identifique** a API vulnerável
3. **Corrija** adicionando filtro de organization_id
4. **Audite** os logs para identificar acessos indevidos
5. **Notifique** os usuários afetados (LGPD)

---

## ✅ APIs DAS 5 FASES - VERIFICADAS

Todas as APIs criadas foram auditadas:

| API | Exige org_id | Filtra queries |
|-----|--------------|----------------|
| `/api/tasks` | ✅ | ✅ |
| `/api/tasks/[id]` | ✅ | ✅ |
| `/api/tasks/[id]/complete` | ✅ | ✅ |
| `/api/tasks/stats` | ✅ | ✅ |
| `/api/tickets` | ✅ | ✅ |
| `/api/tickets/[id]` | ✅ | ✅ |
| `/api/tickets/[id]/comments` | ✅ | ✅ |
| `/api/tickets/stats` | ✅ | ✅ |
| `/api/queue/settings` | ✅ | ✅ |
| `/api/queue/items` | ✅ | ✅ |
| `/api/queue/agents` | ✅ | ✅ |
| `/api/queue/assign` | ✅ | ✅ |
| `/api/agents/status` | ✅ | ✅ |
| `/api/whatsapp/scheduled` | ✅ | ✅ |
| `/api/whatsapp/scheduled/[id]` | ✅ | ✅ |
| `/api/contacts/[id]/attachments` | ✅ | ✅ |

---

**Data da última auditoria:** Janeiro 2026  
**Próxima auditoria:** Antes de cada deploy major
