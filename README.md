# WORDER - Sistema de Agentes com Restrição de Acesso

## 📦 Conteúdo do Pacote

Este pacote contém a implementação completa do sistema de restrição de acesso para agentes.

## 🔧 Instalação

### 1. Execute o SQL no Supabase
```sql
-- Execute o conteúdo de worder-fix-enum.sql no SQL Editor do Supabase
```

### 2. Extraia os arquivos
```bash
unzip worder-fase3-complete.zip
cp -r worder-fase3-complete/src/* src/
```

### 3. Reinicie o servidor
```bash
npm run dev
```

## 📁 Arquivos Incluídos

### Middleware
- `src/middleware.ts` - Controle de acesso por role

### Layout do Agente
- `src/app/(agent)/layout.tsx` - Layout simplificado
- `src/app/(agent)/inbox/page.tsx` - Inbox do agente
- `src/app/(agent)/profile/page.tsx` - Perfil do agente

### APIs
- `src/app/api/whatsapp/agents/route.ts` - API principal de agentes
- `src/app/api/whatsapp/agents/status/route.ts` - Atualizar status
- `src/app/api/whatsapp/agents/permissions/route.ts` - Gerenciar permissões
- `src/app/api/whatsapp/agents/reset-password/route.ts` - Resetar senha
- `src/app/api/whatsapp/conversations/route.ts` - Conversas filtradas
- `src/app/api/auth/change-password/route.ts` - Trocar senha
- `src/app/api/profile/route.ts` - Atualizar perfil

### Componentes
- `src/components/agents/CreateAgentWizard.tsx` - Wizard de criação
- `src/components/agents/EditAgentModal.tsx` - Modal de edição

### Hooks e Utils
- `src/hooks/useAgentPermissions.tsx` - Hook de permissões
- `src/lib/route-permissions.ts` - Configuração de rotas
- `src/lib/auth-utils.ts` - Utilitários de auth

### Types e Stores
- `src/types/index.ts` - Tipos atualizados (com user_metadata)
- `src/stores/index.ts` - Store atualizado (com signOut)

## ✅ Funcionalidades

### Para Agentes:
- [x] Login redireciona para /inbox
- [x] Bloqueio de acesso ao dashboard e configurações
- [x] Inbox com lista de conversas filtrada
- [x] Apenas conversas dos números permitidos
- [x] Alterar status (online/away/busy/offline)
- [x] Alterar perfil e senha

### Para Owners/Admins:
- [x] Acesso total (sem mudanças)
- [x] Criar agentes com wizard multi-step
- [x] Configurar permissões por agente
- [x] Resetar senha de agentes

## 🧪 Teste

1. Crie um agente com o wizard
2. Anote a senha temporária
3. Faça logout
4. Faça login com as credenciais do agente
5. Verifique que é redirecionado para /inbox
6. Tente acessar /dashboard (deve ser bloqueado)
