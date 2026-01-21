# 🚀 PLANO DE EXECUÇÃO - CORREÇÃO DO INBOX

## ⚠️ PROBLEMA ATUAL
Os erros mostram que:
1. **API de notas retorna 400** → Tabela `whatsapp_contact_notes` não existe
2. **API de comments retorna 404** → Código não foi deployado
3. **Tabs com scroll** → Código não foi deployado
4. **Timeline vazia** → Consequência dos itens acima

---

## 📋 PASSO 1: EXECUTAR SQL NO SUPABASE

### 1.1 Abra o Supabase SQL Editor
- Vá em: https://supabase.com/dashboard
- Selecione seu projeto
- Clique em **SQL Editor** no menu lateral
- Clique em **+ New Query**

### 1.2 Execute o SQL de Diagnóstico (OPCIONAL)
Cole e execute o arquivo `01-diagnostico.sql` para ver o que existe atualmente.

### 1.3 Execute o SQL de Criação (OBRIGATÓRIO)
Cole e execute o arquivo `02-criar-tabelas.sql`.

**Você deve ver no resultado:**
```
✅ TABELAS CRIADAS:
- whatsapp_contact_notes
- contact_activities
- contact_comments
- whatsapp_agents

✅ COLUNAS ADICIONADAS:
- ai_enabled
- is_bot_active
- assigned_to
- ai_agent_id
```

---

## 📋 PASSO 2: FAZER DEPLOY DO CÓDIGO

### 2.1 Baixe o ZIP
Faça download do arquivo `worder-inbox-fix-final.zip`

### 2.2 Extraia na pasta do projeto
```bash
cd /caminho/para/worder1-main
unzip worder-inbox-fix-final.zip -o
```

### 2.3 Commit e Push
```bash
git add .
git commit -m "fix: corrigir inbox - notas, timeline, IA, bot"
git push origin main
```

### 2.4 Aguarde o Deploy
- Vá no Vercel Dashboard
- Aguarde o build completar
- Verifique se não há erros

---

## 📋 PASSO 3: TESTAR

### 3.1 Limpe o cache do navegador
- Ctrl+Shift+R (ou Cmd+Shift+R no Mac)

### 3.2 Teste as funcionalidades

| Funcionalidade | Como Testar | Resultado Esperado |
|----------------|-------------|-------------------|
| Tabs | Olhar o painel lateral | Sem scroll horizontal |
| Notas | Digitar nota e clicar enviar | Nota aparece na lista |
| Timeline | Adicionar nota na timeline | Atividade aparece |
| IA Ativa | Clicar no botão | Deve alternar on/off |
| Bot On/Off | Clicar no botão | Deve alternar on/off |
| Atribuir | Abrir modal | Deve listar usuários |

---

## 🔧 TROUBLESHOOTING

### Se o SQL der erro:
1. Verifique se está conectado ao projeto correto
2. Execute cada parte separadamente
3. Verifique a mensagem de erro específica

### Se o deploy der erro:
1. Verifique o log do Vercel
2. Procure por erros de TypeScript
3. Me envie o erro para análise

### Se continuar não funcionando após deploy:
1. Verifique no console do navegador (F12)
2. Me envie os erros específicos
3. Verifique se o Supabase está acessível

---

## 📁 ARQUIVOS INCLUSOS

```
worder-inbox-fix-final.zip
├── sql/
│   ├── 01-diagnostico.sql      # Verificar estado atual
│   └── 02-criar-tabelas.sql    # Criar tabelas e colunas
├── src/
│   ├── components/whatsapp/inbox/
│   │   ├── ContactPanel.tsx    # Tabs corrigidas
│   │   ├── ChatPanel.tsx       # Botões IA/Bot
│   │   └── modals/AssignModal.tsx
│   └── app/api/whatsapp/inbox/
│       └── contacts/[id]/
│           ├── notes/route.ts
│           └── comments/route.ts
└── PLANO-EXECUCAO.md           # Este arquivo
```

---

## ✅ CHECKLIST FINAL

- [ ] SQL de diagnóstico executado (opcional)
- [ ] SQL de criação executado
- [ ] Tabelas criadas confirmadas
- [ ] Código extraído no projeto
- [ ] Git commit feito
- [ ] Git push feito
- [ ] Deploy no Vercel concluído
- [ ] Cache do navegador limpo
- [ ] Funcionalidades testadas
