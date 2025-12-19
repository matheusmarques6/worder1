# APIs para Botões - Tag, Deal, Bloquear, Atribuir

## O que está incluído:

1. **Block API** - `/api/whatsapp/inbox/contacts/[id]/block`
   - POST: Bloquear/desbloquear contato

2. **Deals API** - `/api/whatsapp/inbox/contacts/[id]/deals`
   - GET: Listar deals do contato
   - POST: Criar novo deal

3. **Assign API** - `/api/whatsapp/inbox/conversations/[id]/assign`
   - GET: Listar usuários disponíveis
   - POST: Atribuir conversa a um usuário

## Instalação:

### 1. Execute o SQL no Supabase (migration.sql)

### 2. Copie as pastas para seu projeto:
```
src/app/api/whatsapp/inbox/contacts/[id]/block/route.ts
src/app/api/whatsapp/inbox/contacts/[id]/deals/route.ts
src/app/api/whatsapp/inbox/conversations/[id]/assign/route.ts
```

### 3. Deploy
```bash
git add .
git commit -m "feat: apis block, deal, assign"
git push
```

## Como os botões devem chamar as APIs:

### Bloquear:
```javascript
await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/block`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ block: !contact.is_blocked })
})
```

### Criar Deal:
```javascript
await fetch(`/api/whatsapp/inbox/contacts/${contact.id}/deals`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    title: `Deal - ${contact.name}`,
    value: 0
  })
})
```

### Atribuir:
```javascript
// Listar usuários
const res = await fetch(`/api/whatsapp/inbox/conversations/${conversation.id}/assign`)
const { users } = await res.json()

// Atribuir
await fetch(`/api/whatsapp/inbox/conversations/${conversation.id}/assign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: selectedUserId })
})
```
