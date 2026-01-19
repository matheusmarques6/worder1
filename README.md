# 🔧 Correções Completas do Inbox WhatsApp

## Problemas Identificados e Corrigidos

### ❌ Problemas Encontrados:
1. **Botão Tag** - API retornava erro
2. **Botão Atribuir** - API `/api/users` não existia
3. **Botão Deal** - API `/api/crm/pipelines` não existia
4. **Botão Bloquear** - API usava tabela errada
5. **Toggle Bot** - Usava coluna `is_bot_active` (não existe)
6. **Assign** - Usava coluna `assigned_agent_id` (não existe)
7. **Notas** - Sem suporte a anexos

### ✅ Correções Aplicadas:

## PASSO 1: ATUALIZAR TYPES (OBRIGATÓRIO)

Edite `src/types/inbox.ts` e adicione antes do `InboxNote`:

```typescript
export interface NoteAttachment {
  type: 'image' | 'document'
  url: string
  name: string
  size?: number
}
```

E modifique o `InboxNote` para incluir:

```typescript
export interface InboxNote {
  id: string
  organization_id: string
  contact_id: string
  conversation_id?: string
  content: string
  note_type: 'general' | 'call' | 'meeting' | 'follow_up' | 'important' | 'note'
  is_pinned: boolean
  attachments?: NoteAttachment[]  // <-- ADICIONAR
  created_by: string
  created_by_name?: string
  created_at: string
  updated_at?: string
}
```

## PASSO 2: APIs CRIADAS

### `/api/users/route.ts`
- Lista usuários da organização para o modal de Atribuir
- Filtra por role (agent, admin, owner)

### `/api/crm/pipelines/route.ts`
- Lista pipelines com stages para o modal de Criar Deal
- Ordena stages por position

## 2. APIs CORRIGIDAS

### `/api/whatsapp/inbox/conversations/route.ts`
- Usa `unified_contact_id` para buscar da tabela `contacts`
- Fallback para `whatsapp_contacts` se necessário

### `/api/whatsapp/inbox/conversations/[id]/assign/route.ts`
- **ANTES**: `assigned_agent_id` (não existe)
- **DEPOIS**: `assigned_to` (coluna correta)

### `/api/whatsapp/inbox/conversations/[id]/bot/route.ts`
- **ANTES**: `is_bot_active` (não existe)
- **DEPOIS**: `ai_enabled` (coluna correta)

### `/api/whatsapp/inbox/contacts/[id]/tags/route.ts`
- Busca em `contacts` primeiro, fallback para `whatsapp_contacts`

### `/api/whatsapp/inbox/contacts/[id]/deals/route.ts`
- Busca contato em `contacts`, não só `whatsapp_contacts`
- Busca deals por `contact_id` OU `contact_phone`

### `/api/whatsapp/inbox/contacts/[id]/block/route.ts`
- Atualiza ambas as tabelas se necessário (sync)

### `/api/whatsapp/inbox/contacts/[id]/route.ts`
- Prioriza tabela `contacts` unificada

## 3. COMPONENTES MELHORADOS

### `NotesTab.tsx`
- ✅ Suporte a anexar **imagens**
- ✅ Suporte a anexar **documentos** (PDF, DOC, XLS, etc)
- ✅ Preview de anexos antes de enviar
- ✅ Visualização de anexos nas notas existentes
- ✅ Limpa estado ao mudar de contato (bug corrigido)

## Como Aplicar

### Passo 1: Copie os arquivos

```bash
# Copie TODAS as pastas para seu projeto:
src/app/api/users/
src/app/api/crm/pipelines/
src/app/api/whatsapp/inbox/conversations/
src/app/api/whatsapp/inbox/contacts/
src/components/whatsapp/inbox/tabs/NotesTab.tsx
```

### Passo 2: Verifique as importações

Todos os arquivos usam:
```typescript
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
```

### Passo 3: Deploy
```bash
git add .
git commit -m "fix: correções completas do inbox"
git push
```

## Estrutura de Arquivos

```
src/
├── app/api/
│   ├── users/
│   │   └── route.ts          ← NOVO (lista usuários)
│   ├── crm/pipelines/
│   │   └── route.ts          ← NOVO (lista pipelines)
│   └── whatsapp/inbox/
│       ├── conversations/
│       │   ├── route.ts      ← CORRIGIDO
│       │   └── [id]/
│       │       ├── assign/route.ts  ← CORRIGIDO
│       │       └── bot/route.ts     ← CORRIGIDO
│       └── contacts/[id]/
│           ├── route.ts      ← CORRIGIDO
│           ├── tags/route.ts ← CORRIGIDO
│           ├── deals/route.ts← CORRIGIDO
│           └── block/route.ts← CORRIGIDO
└── components/whatsapp/inbox/tabs/
    └── NotesTab.tsx          ← MELHORADO (anexos)
```

## Checklist de Testes

Após aplicar, teste cada funcionalidade:

- [ ] **Tag**: Clique em "Tag" → Deve abrir popup para adicionar
- [ ] **Atribuir**: Clique em "Atribuir" → Deve listar usuários da org
- [ ] **Deal**: Clique em "Deal" → Deve mostrar pipelines e stages
- [ ] **Bloquear**: Clique em "Bloquear" → Deve bloquear contato
- [ ] **Criar Deal (CRM)**: Clique em "+ Criar Novo Deal" → Deve criar
- [ ] **Notas**: Adicione nota com texto → Deve salvar
- [ ] **Notas com imagem**: Anexe imagem → Deve mostrar preview
- [ ] **Toggle Bot**: Toggle na conversa → Deve ativar/desativar IA

## Observações

### Sobre Anexos nas Notas
O componente NotesTab está preparado para anexos, mas você precisará:

1. Implementar a API de upload (`/api/upload`) se quiser upload real
2. Ou usar um serviço de storage como Supabase Storage

Por enquanto, os anexos funcionam com URLs temporárias (blob) que não persistem após refresh.

### Multi-tenant
Todas as APIs respeitam `organization_id` para isolamento de dados.

### Compatibilidade
As APIs mantêm fallback para `whatsapp_contacts` enquanto a migração para `contacts` não está completa.
