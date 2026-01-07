# 🔧 Correção: Dados do Usuário (Demo User → Nome Real)

## ❌ Problema
O sistema mostrava "Demo User" em vez do nome real do usuário porque:
1. A API `get-or-create-org` não retornava `avatar_url` nem o `name` formatado
2. O layout usava fallback "Demo User" em vez de dados reais
3. O hook de login não transformava `first_name`/`last_name` em `name`

## ✅ Correções Aplicadas

### 1. `src/app/api/auth/route.ts`
- Adicionado `avatar_url` ao retorno do usuário
- Adicionado `organization_id` ao retorno
- Corrigido `name` para concatenar `first_name` + `last_name`

### 2. `src/app/(dashboard)/layout.tsx`
- Removido fallback "Demo User" → agora usa "Usuário"
- Adicionado `avatar_url` ao setUser
- Adicionado `organization_id` e `user_metadata`

### 3. `src/hooks/index.ts`
- Corrigido hook de login para transformar profile em User
- Agora concatena `first_name` + `last_name` → `name`
- Preserva `avatar_url` e `user_metadata`

### 4. `src/components/layout/Sidebar.tsx`
- Menu dropdown do usuário com foto real
- Lista de agentes online/offline
- Logout funcional

### 5. `src/app/api/agents/status/route.ts`
- Nova API para listar status dos agentes

---

## 📦 Arquivos Incluídos

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts          ← CORRIGIDO
│   │   └── agents/status/route.ts ← NOVO
│   └── (dashboard)/layout.tsx     ← CORRIGIDO
├── components/layout/Sidebar.tsx  ← CORRIGIDO  
└── hooks/index.ts                 ← CORRIGIDO
```

---

## 🚀 Instalação

### 1. SQL (se ainda não executou)
```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

### 2. Substitua os arquivos e faça deploy

```bash
git add .
git commit -m "fix: dados do usuário - nome e avatar reais"
git push
```

---

## 🎯 Resultado Esperado

Antes: `Demo User` com iniciais "DU"
Depois: `Convertfy Convertfy` com foto real do perfil

O nome agora vem de:
1. `profiles.first_name` + `profiles.last_name` (prioridade)
2. `auth.user_metadata.name` (fallback)
3. Parte do email antes do @ (último fallback)
