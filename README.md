# 🔧 CORREÇÕES CONSOLIDADAS - WORDER INBOX

## 📋 O QUE FOI CORRIGIDO

| # | Problema | Causa Real | Correção |
|---|----------|------------|----------|
| 1 | **Notes 400** | Frontend pode estar enviando `content: ""` | Validação adicionada no callback |
| 2 | **Comments 404** | Rota não existia em produção | Arquivo criado |
| 3 | **Agents 400** | AssignModal não recebia `organizationId` | Props adicionadas |
| 4 | **Notifications 400** | API só aceitava snake_case | Agora aceita camelCase também |
| 5 | **Users Search 500** | Join com tabela `users` que não existe | Corrigido para usar `profiles` |
| 6 | **Timeline "zera"** | GET não retornava `comments` | Adicionado retorno de `comments` |
| 7 | **Activities errado** | Usava tabela `whatsapp_contact_activities` | Padronizado para `contact_activities` |

---

## 🚀 COMO APLICAR

### PASSO 1: SQL no Supabase

1. Abra Supabase → SQL Editor
2. Cole o conteúdo do arquivo `sql-consolidado.sql`
3. Execute

### PASSO 2: Copiar arquivos

```bash
# Extrair o ZIP
unzip correcoes-consolidadas.zip

# Copiar para seu projeto
cp -r correcoes-consolidadas/src/* seu-projeto/src/
```

### PASSO 3: Deploy

```bash
cd seu-projeto
git add .
git commit -m "fix: correções inbox (agents, notifications, comments, timeline)"
git push
```

### PASSO 4: Verificar

1. Limpar cache: `Ctrl+Shift+R`
2. Testar cada funcionalidade

---

## 📁 ARQUIVOS INCLUÍDOS

```
correcoes-consolidadas/
├── sql-consolidado.sql                    # SQL para criar tabelas
├── README.md                              # Este arquivo
└── src/
    ├── app/api/
    │   ├── ai/process/route.ts            # NOVA rota para IA do webhook
    │   ├── notifications/route.ts         # Aceita camelCase
    │   ├── users/search/route.ts          # Usa profiles ao invés de users
    │   └── whatsapp/inbox/
    │       ├── contacts/[id]/
    │       │   ├── route.ts               # Retorna comments
    │       │   ├── activities/route.ts    # Usa contact_activities
    │       │   └── comments/route.ts      # Rota de comentários
    │       └── conversations/[id]/
    │           └── close/route.ts         # Usa contact_activities
    ├── components/whatsapp/inbox/
    │   ├── ContactPanel.tsx               # Passa props para AssignModal
    │   └── tabs/NotesTab.tsx              # Filtra blob URLs
    └── hooks/
        └── useInboxContact.ts             # Suporte a attachments
```

---

## ⚠️ VERIFICAÇÕES IMPORTANTES

### Se Notes ainda der 400:

1. Abra DevTools → Network
2. Encontre a requisição POST `/notes`
3. Veja o Request Payload
4. Se `content` vier vazio `""`, o problema é no frontend (state do textarea)

### Se Comments ainda der 404:

1. Teste no browser: `GET /api/whatsapp/inbox/contacts/<id>/comments`
2. Se 404, o deploy não foi feito corretamente
3. Verifique se o arquivo existe no projeto deployado

### Se Pipelines/Deals der 500:

Execute o SQL para criar as tabelas necessárias:
- `stores`
- `organization_members`
- `pipelines`
- `pipeline_stages`
- `deals`

---

## 🔍 DEBUG RÁPIDO

```bash
# Verificar se tabelas existem
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'whatsapp_contact_notes',
  'contact_activities', 
  'contact_comments',
  'whatsapp_agents',
  'pipelines',
  'pipeline_stages',
  'deals',
  'organization_members',
  'notifications',
  'stores'
);
```

Se alguma tabela não aparecer, execute o SQL completo.
