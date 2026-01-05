# 🔧 Correção Multi-Tenant por Loja (store_id)

## 📋 O QUE FOI CORRIGIDO

### Problema:
Todos os dados (contatos, deals, pipelines) eram filtrados apenas por `organization_id`, fazendo com que dados de todas as lojas aparecessem misturados.

### Solução:
Agora todos os dados são filtrados por `store_id` (loja selecionada), garantindo isolamento total entre lojas.

---

## 📦 ARQUIVOS INCLUÍDOS

```
src/
├── stores/
│   └── index.ts              # ✅ Limpa dados ao trocar de loja
├── hooks/
│   ├── index.ts              # ✅ useContacts e useDeals filtram por storeId
│   └── usePipelines.ts       # ✅ createPipeline inclui store_id
├── lib/services/shopify/
│   └── contact-sync.ts       # ✅ Salva store_id ao criar contato via webhook
└── app/api/
    ├── contacts/route.ts     # ✅ API já filtrava (sem mudanças)
    └── deals/route.ts        # ✅ Pipelines e deals filtram por store_id

MIGRACAO-SQL.sql              # ⚠️ EXECUTE PRIMEIRO NO SUPABASE!
```

---

## 🚀 INSTRUÇÕES DE INSTALAÇÃO

### PASSO 1: Executar Migração SQL
**⚠️ FAÇA BACKUP ANTES!**

1. Abra o Supabase Dashboard
2. Vá em SQL Editor
3. Cole e execute o conteúdo de `MIGRACAO-SQL.sql`
4. Verifique se as colunas `store_id` foram criadas

### PASSO 2: Substituir Arquivos
Copie todos os arquivos da pasta `src/` para seu projeto, substituindo os existentes:

```bash
# Na raiz do seu projeto
cp -r src/* /seu-projeto/src/
```

### PASSO 3: Reiniciar o Servidor
```bash
npm run dev
```

### PASSO 4: Testar
1. Selecione a **Loja 1** no seletor
2. Crie um contato de teste
3. Troque para a **Loja 2**
4. Verifique que o contato da Loja 1 **NÃO aparece**
5. Crie outro contato na Loja 2
6. Volte para Loja 1 e confirme que só vê os contatos dela

---

## ⚠️ DADOS EXISTENTES

Os dados criados **antes** desta correção não têm `store_id` e continuarão aparecendo em todas as lojas.

### Opções:

**Opção A - Migrar dados para uma loja específica:**
Descomente e execute a seção 3 do arquivo `MIGRACAO-SQL.sql`

**Opção B - Deixar dados antigos globais:**
Dados sem `store_id` aparecem em todas as lojas (legado)

---

## 📊 COMPORTAMENTO ESPERADO

| Componente | Filtro | Descrição |
|------------|--------|-----------|
| Contatos | `store_id` | Cada loja vê só seus contatos |
| Deals | `store_id` | Cada loja vê só seus deals |
| Pipelines | `store_id` | Cada loja vê só suas pipelines |
| Dashboard | **TODAS** | Dashboard mostra dados agregados de todas as lojas |

---

## 🔄 O QUE ACONTECE AO TROCAR DE LOJA

1. Store Zustand detecta mudança de `currentStore`
2. Limpa todos os dados em memória (contacts, deals, pipelines)
3. Hooks recarregam dados da nova loja automaticamente
4. Interface mostra dados da nova loja

---

## ❓ TROUBLESHOOTING

### "Dados não aparecem após trocar de loja"
- Verifique se o `storeId` está sendo enviado nas requisições (Network tab)
- Confirme que a migração SQL foi executada

### "Erro ao criar pipeline: 'Selecione uma loja primeiro'"
- O usuário precisa selecionar uma loja antes de criar pipelines
- Isso é intencional para garantir isolamento

### "Dados antigos aparecem em todas as lojas"
- Dados criados antes da migração não têm `store_id`
- Execute a migração de dados (seção 3 do SQL) se necessário

---

## 📝 MUDANÇAS TÉCNICAS DETALHADAS

### stores/index.ts
- `setCurrentStore`: Agora limpa CRMStore, WhatsAppStore, AutomationStore ao trocar
- Todos os stores têm método `clearAll()`

### hooks/index.ts
- `useContacts`: Agora aceita `storeId` e usa `currentStore.id` por padrão
- `useDeals`: Agora aceita `storeIdOverride` e usa `currentStore.id` por padrão
- Ambos recarregam automaticamente quando `effectiveStoreId` muda

### hooks/usePipelines.ts
- `createPipeline`: Agora envia `store_id` no body da requisição

### app/api/deals/route.ts
- GET pipelines: Agora filtra por `store_id` se fornecido
- `createPipeline`: Agora salva `store_id` na tabela

### lib/services/shopify/contact-sync.ts
- `createNewContact`: Agora salva `store_id` do webhook
