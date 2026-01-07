# 🔧 Correção: APIs de Perfil (Erro 401)

## ❌ Problema
As APIs de perfil estavam retornando **401 Unauthorized** porque usavam um método de autenticação diferente do padrão do projeto.

## ✅ Solução
Reescrevi as APIs para usar o mesmo padrão de autenticação do resto do projeto:
- Lê o token de `cookies().get('sb-access-token')`
- Valida com `supabaseAdmin.auth.getUser(accessToken)`

---

## 📦 Arquivos Corrigidos

```
src/app/api/profile/
├── route.ts              ← GET/PUT/POST perfil
└── avatar/
    └── route.ts          ← POST/DELETE avatar
```

**NOTA:** Os outros arquivos (settings/page.tsx, useProfile.ts, PhoneInput.tsx) já estão corretos no seu código!

---

## 🚀 Instalação

Apenas substitua a pasta `src/app/api/profile/` e faça deploy:

```bash
git add .
git commit -m "fix: profile API authentication"
git push
```

---

## ✅ O que vai funcionar agora

- ✅ Erro "Unauthorized" vai sumir
- ✅ Buscar dados do perfil
- ✅ Editar nome/sobrenome
- ✅ Upload de foto
- ✅ Remover foto
- ✅ Resetar senha por email
