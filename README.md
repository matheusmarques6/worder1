# 🔧 Correções das APIs do Inbox - SISTEMA UNIFICADO

## Problema Principal
As APIs estavam usando duas tabelas diferentes:
- `whatsapp_contacts` - tabela antiga (legada)
- `contacts` - tabela unificada (CORRETA)

## Pré-requisitos SQL (JÁ EXECUTADOS)
```sql
-- 1. Tabela whatsapp_contact_notes com colunas corretas
-- 2. Colunas contact_phone, contact_name, contact_email em deals
-- 3. FK de unified_contact_id para contacts
```

## Arquivos Corrigidos

### 1. `/api/whatsapp/inbox/conversations/route.ts` ⭐ PRINCIPAL
- **Antes**: Join com `whatsapp_contacts`
- **Depois**: Join com `contacts` via `unified_contact_id`

### 2. `/api/whatsapp/inbox/contacts/[id]/route.ts`
- **Antes**: Misturava tabelas
- **Depois**: Prioriza `contacts`, fallback para `whatsapp_contacts`

### 3. `/api/whatsapp/inbox/contacts/[id]/tags/route.ts`
- **Antes**: Usava só `contacts`
- **Depois**: Busca em `contacts` primeiro, fallback para `whatsapp_contacts`

### 4. `/api/whatsapp/inbox/contacts/[id]/deals/route.ts`
- **Antes**: Usava `whatsapp_contacts` para buscar org_id
- **Depois**: Busca em `contacts`, busca deals por `contact_id` OU `contact_phone`

### 5. `/api/whatsapp/inbox/contacts/[id]/block/route.ts`
- **Antes**: Usava só uma tabela
- **Depois**: Atualiza ambas as tabelas se necessário (sync)

### 6. `/api/whatsapp/inbox/conversations/[id]/assign/route.ts`
- **Antes**: Usava coluna `assigned_agent_id` (não existe)
- **Depois**: Usa coluna `assigned_to` (correta)

### 7. `/api/whatsapp/inbox/conversations/[id]/bot/route.ts`
- **Antes**: Usava `is_bot_active` (não existe)
- **Depois**: Usa `ai_enabled` (correta), mantém compatibilidade

## Como Aplicar

1. Copie TODOS os arquivos para as pastas correspondentes em `src/app/api/whatsapp/inbox/`
2. Faça commit e deploy
3. Teste cada funcionalidade

## Estrutura de Pastas
```
src/app/api/whatsapp/inbox/
├── conversations/
│   ├── route.ts              ← CORRIGIDO (lista conversas)
│   └── [id]/
│       ├── assign/route.ts   ← CORRIGIDO
│       └── bot/route.ts      ← CORRIGIDO
└── contacts/[id]/
    ├── route.ts              ← CORRIGIDO
    ├── tags/route.ts         ← CORRIGIDO
    ├── deals/route.ts        ← CORRIGIDO
    └── block/route.ts        ← CORRIGIDO
```

## Teste Checklist
- [ ] Listar conversas (deve carregar dados do contato unificado)
- [ ] Tags: adicionar/remover
- [ ] Deals: criar/listar
- [ ] Block: bloquear/desbloquear
- [ ] Assign: atribuir conversa a agente
- [ ] Bot: toggle IA on/off
