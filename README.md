# CRM Bugfixes v97 → v98

## Bugs Corrigidos

| Bug | Problema | Solução |
|-----|----------|---------|
| **#4** 🔴 | Automações de uma loja aparecendo em outra | Adicionado filtro `store_id` na API + modais |
| **#3** | Sai da pipeline selecionada ao atualizar | Refatorado para `activePipelineId` + `useMemo` |
| **#1** | Nova coluna não aparece após criar | `useMemo` sincroniza automaticamente |
| **#2** | Demora na mudança de cor do pipeline | Removido `setTimeout` e chamadas extras |
| **#5** | Deal card ocupando muito espaço | Novo layout compacto (3 linhas) |

---

## Arquivos Modificados

```
src/app/api/automations/rules/route.ts          # Bug 4: Filtro store_id
src/components/crm/automations/AutomationsPanel.tsx   # Bug 4: Filtro store_id
src/components/crm/automations/CreateDealRuleModal.tsx # Bug 4: store_id no payload
src/components/crm/automations/MoveStageRuleModal.tsx  # Bug 4: store_id no payload
src/app/(dashboard)/crm/page.tsx                # Bugs 1,2,3,5
```

---

## Instruções de Instalação

### 1. Substituir Arquivos

Copie os arquivos deste ZIP para o projeto, mantendo a estrutura de pastas:

```bash
cp -r src/* /seu-projeto/src/
cp -r supabase/* /seu-projeto/supabase/
```

### 2. Executar Migração SQL (OBRIGATÓRIO)

Execute no Supabase SQL Editor **ANTES** de fazer deploy:

```sql
-- Arquivo: supabase/migrations/20260114_add_store_id_to_automation_rules.sql

ALTER TABLE automation_rules 
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_automation_rules_store 
ON automation_rules(store_id);

-- Vincular regras existentes à loja do pipeline
UPDATE automation_rules ar
SET store_id = p.store_id
FROM pipelines p
WHERE ar.pipeline_id = p.id
  AND ar.store_id IS NULL
  AND p.store_id IS NOT NULL;
```

### 3. Deploy

```bash
npm run build
# ou
vercel --prod
```

---

## Novo Layout do Deal Card

**Antes (5 linhas):**
```
Título                    ⋮
👤 Contato
R$ 1.500    ████░ 60%
🏷️ tag1 tag2
🕐 15/01/2025
```

**Depois (3 linhas):**
```
Título              R$ 1.500
👤 Contato
🏷️ tag1 tag2     🕐 15/01
```

---

## Checklist de Testes

- [ ] Criar nova pipeline e verificar se colunas aparecem
- [ ] Mudar cor de pipeline e verificar se atualiza imediatamente  
- [ ] Criar automação na Loja A, verificar se NÃO aparece na Loja B
- [ ] Verificar layout compacto dos deal cards
- [ ] Testar drag & drop de deals entre colunas
