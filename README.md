# 🔧 Correção FINAL: Dados do Usuário

## 🔍 PROBLEMA ENCONTRADO

A função `handleGetOrCreateOrg` na API `/api/auth` estava chamando:

```typescript
// ❌ ERRADO - sem token, sempre falha
const { data: { user: authUser } } = await supabase.auth.getUser();
```

Como o Supabase é criado com `SERVICE_ROLE_KEY` (admin), ele **não tem sessão de usuário**. 
O `getUser()` sem token **sempre falha**, fazendo cair no fallback "Demo User".

---

## ✅ SOLUÇÃO APLICADA

Agora a função recebe o `request` e lê o token do cookie:

```typescript
// ✅ CORRETO - lê token do cookie
async function handleGetOrCreateOrg(supabase: SupabaseClient, request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  
  if (accessToken) {
    const { data: { user: authUser } } = await supabase.auth.getUser(accessToken);
    // Agora funciona! Retorna dados reais do usuário
  }
}
```

---

## 📦 Arquivos Corrigidos

| Arquivo | O que foi corrigido |
|---------|---------------------|
| `src/app/api/auth/route.ts` | `handleGetOrCreateOrg` agora lê token do cookie |
| `src/app/(dashboard)/layout.tsx` | Remove fallback "Demo User", usa dados reais |
| `src/hooks/index.ts` | Transform `first_name`+`last_name` → `name` no login |
| `src/components/layout/Sidebar.tsx` | Menu dropdown com foto real |
| `src/app/api/agents/status/route.ts` | API para status dos agentes |

---

## 🚀 Instalação

### 1. Substitua os arquivos
Extraia o ZIP e substitua os arquivos no seu projeto.

### 2. Deploy
```bash
git add .
git commit -m "fix: corrige autenticação para mostrar dados reais do usuário"
git push
```

### 3. (Se ainda não fez) SQL para agentes
```sql
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

---

## 🎯 Resultado Esperado

**Antes:** "Demo User" com iniciais "DU"
**Depois:** "Convertfy Convertfy" com foto real do perfil

---

## 🧪 Como Testar

1. Faça login na aplicação
2. Verifique se o nome correto aparece no header
3. Clique no avatar para abrir o menu dropdown
4. Verifique se a foto do perfil aparece (se configurada)
