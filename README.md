# Perfil de Usuário Completo

## ✅ O que foi implementado

1. **Página de Perfil Funcional**
   - Editar nome e sobrenome (salva no banco)
   - Upload de foto de perfil (Supabase Storage)
   - Telefone com máscara brasileira (11) 99999-9999
   - Visualização de cargo (Admin/Gerente/Agente)
   - Email somente leitura

2. **Alteração de Senha**
   - Envio de email de recuperação via Supabase Auth

3. **APIs**
   - `GET /api/profile` - Buscar dados do perfil
   - `PUT /api/profile` - Atualizar nome, sobrenome, telefone
   - `POST /api/profile` - Enviar email de recuperação de senha
   - `POST /api/profile/avatar` - Upload de foto
   - `DELETE /api/profile/avatar` - Remover foto

---

## 📦 Arquivos Incluídos

```
src/
├── app/
│   ├── api/
│   │   └── profile/
│   │       ├── route.ts              ← API de perfil
│   │       └── avatar/
│   │           └── route.ts          ← Upload/delete de avatar
│   └── (dashboard)/
│       └── settings/
│           └── page.tsx              ← Página de configurações
├── hooks/
│   └── useProfile.ts                 ← Hook para gerenciar perfil
└── components/
    └── ui/
        └── PhoneInput.tsx            ← Input de telefone com máscara
```

---

## 🚀 Instalação

### Passo 1: Execute o SQL no Supabase

Execute o arquivo `SQL-PERFIL.sql` no SQL Editor do Supabase.

**IMPORTANTE**: Execute cada bloco separadamente!

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para o seu projeto, substituindo os arquivos existentes.

### Passo 3: Deploy

```bash
git add .
git commit -m "feat: perfil de usuário completo com upload de avatar"
git push
```

---

## ✅ Funcionalidades

| Funcionalidade | Status |
|----------------|--------|
| Editar nome/sobrenome | ✅ |
| Upload de foto | ✅ |
| Remover foto | ✅ |
| Telefone com máscara | ✅ |
| Visualizar cargo | ✅ |
| Email (somente leitura) | ✅ |
| Resetar senha por email | ✅ |
| Header atualiza automaticamente | ✅ |

---

## 🔐 Sistema de Cargos

O sistema já suporta 3 tipos de cargo:

| Cargo | Descrição |
|-------|-----------|
| **admin** | Administrador - Acesso total + criar usuários |
| **manager** | Gerente - Acesso total, não cria usuários |
| **agent** | Agente - Acesso restrito conforme permissões |

Os próximos passos serão implementar o controle de permissões na interface (esconder menus, botões, etc).
