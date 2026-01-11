# 🚀 Implementação Completa: Automação Shopify → CRM

## 📋 Resumo das Mudanças

Esta implementação adiciona um sistema completo de automação Shopify com:
1. **Importação em massa** de clientes existentes
2. **Sincronização automática** de novos clientes/pedidos
3. **Regras de automação** que movem deals entre pipelines

---

## 📁 Arquivos Criados/Modificados

### 🗄️ Database (Rodar no Supabase)

**ARQUIVO:** `supabase/migrations/20260111_shopify_sync_automation.sql`

Este arquivo cria 3 tabelas:
- `shopify_sync_config` - Configurações de sincronização por loja
- `shopify_transition_rules` - Regras de transição automática
- `shopify_automation_logs` - Log de execução de automações

⚠️ **IMPORTANTE:** Execute este SQL no Supabase SQL Editor antes de testar!

---

### 🔌 APIs Backend

| Arquivo | Descrição |
|---------|-----------|
| `src/app/api/shopify/sync-config/route.ts` | GET/POST configuração de sincronização |
| `src/app/api/shopify/transition-rules/route.ts` | CRUD de regras de transição |
| `src/app/api/shopify/automation-logs/route.ts` | GET logs de automação |

---

### 🎨 Componentes Frontend

| Arquivo | Descrição |
|---------|-----------|
| `src/components/integrations/shopify/ShopifySettingsModal.tsx` | Modal principal com 4 tabs |
| `src/components/integrations/shopify/tabs/StatusTab.tsx` | Tab de status da conexão |
| `src/components/integrations/shopify/tabs/SyncConfigTab.tsx` | Tab de configuração de sincronização |
| `src/components/integrations/shopify/tabs/AutomationRulesTab.tsx` | Tab de regras de automação |
| `src/components/integrations/shopify/tabs/ImportTab.tsx` | Tab de importação de clientes |
| `src/components/integrations/shopify/tabs/index.ts` | Export das tabs |

---

### 🔧 Serviços

| Arquivo | Descrição |
|---------|-----------|
| `src/lib/services/shopify/sync-config-integration.ts` | Integração do sync config com webhooks |
| `src/lib/services/shopify/index.ts` | Atualizado para exportar novos módulos |

---

### 📝 Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/components/integrations/shopify/index.ts` | Adicionado export do ShopifySettingsModal |
| `src/components/integrations/active/ActiveIntegrationsSection.tsx` | Usando novo ShopifySettingsModal |

---

## 🔧 Instruções de Instalação

### Passo 1: Executar Migration no Supabase

1. Abra o Supabase Dashboard
2. Vá em SQL Editor
3. Cole o conteúdo de `supabase/migrations/20260111_shopify_sync_automation.sql`
4. Execute o SQL

### Passo 2: Copiar os Arquivos

Copie todos os arquivos para o projeto:

```bash
# APIs
src/app/api/shopify/sync-config/route.ts
src/app/api/shopify/transition-rules/route.ts
src/app/api/shopify/automation-logs/route.ts

# Componentes
src/components/integrations/shopify/ShopifySettingsModal.tsx
src/components/integrations/shopify/tabs/StatusTab.tsx
src/components/integrations/shopify/tabs/SyncConfigTab.tsx
src/components/integrations/shopify/tabs/AutomationRulesTab.tsx
src/components/integrations/shopify/tabs/ImportTab.tsx
src/components/integrations/shopify/tabs/index.ts

# Serviços
src/lib/services/shopify/sync-config-integration.ts
```

### Passo 3: Atualizar Arquivos Existentes

Substitua os seguintes arquivos:
- `src/components/integrations/shopify/index.ts`
- `src/components/integrations/active/ActiveIntegrationsSection.tsx`
- `src/lib/services/shopify/index.ts`

### Passo 4: Testar

1. Reinicie o servidor de desenvolvimento
2. Vá em CRM > Integrações
3. Clique em "Configurar" no card da Shopify
4. Teste as 4 tabs do novo modal

---

## 🎯 Como Usar

### Configurar Sincronização Automática

1. Abra o modal de configuração da Shopify
2. Vá na aba "Sincronização"
3. Ative/desative:
   - **Novos Clientes** - Criar contato quando cliente se cadastrar
   - **Novos Pedidos** - Criar deal quando pedido for criado
   - **Carrinho Abandonado** - Criar deal para checkouts abandonados
4. Configure pipeline/estágio para cada tipo
5. Clique em "Salvar Configurações"

### Criar Regras de Automação

1. Vá na aba "Automações"
2. Clique em "Nova Regra"
3. Configure:
   - **Quando** - Evento que dispara (ex: Pedido Pago)
   - **SE** - Condições opcionais (pipeline/estágio atual)
   - **ENTÃO** - Ação (mover para pipeline/estágio)
4. Salve a regra

### Importar Clientes

1. Vá na aba "Importar"
2. Veja quantos clientes existem na Shopify
3. (Opcional) Filtre por tags
4. Configure tipo de contato e tags do CRM
5. Clique em "Iniciar Importação"

---

## 🔄 Fluxo de Exemplo

```
1. Cliente se cadastra na Shopify
   ↓
2. Webhook dispara → Sistema verifica sync_config
   ↓
3. sync_new_customers = true → Cria contato
   ↓
4. create_deal_for_customer = true → Cria deal em "Pipeline Leads"
   ↓
5. Uma semana depois: Cliente faz compra
   ↓
6. Webhook "orders/paid" dispara
   ↓
7. Sistema busca transition_rules
   ↓
8. Regra match: "Se deal em Pipeline Leads + pedido pago → Pipeline Vendas"
   ↓
9. Deal automaticamente move para "Pipeline Vendas"!
```

---

## 🎨 Screenshots do UI

O novo modal de configuração tem 4 tabs:

### Tab Status
- Informações da conexão
- Estatísticas (clientes, pedidos, deals)
- Verificar conexão
- URL do webhook

### Tab Sincronização
- Toggle para cada tipo de sincronização
- Seleção de pipeline/estágio
- Tags automáticas
- Templates de título

### Tab Automações
- Lista de regras ativas
- Criar/editar/deletar regras
- Toggle para ativar/desativar
- Preview da lógica da regra

### Tab Importar
- Contagem de clientes
- Filtros por tags da Shopify
- Configuração da importação
- Barra de progresso

---

## ⚠️ Notas Importantes

1. **Execute a migration SQL primeiro** - Sem as tabelas, as APIs não funcionarão

2. **Webhooks existentes continuam funcionando** - O sistema usa as novas configurações se existirem, senão usa o comportamento padrão

3. **Múltiplas lojas** - Cada loja pode ter suas próprias configurações e regras

4. **Logs** - Todas as ações são logadas em `shopify_automation_logs` para debug

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique se a migration foi executada
2. Verifique os logs do console
3. Verifique a tabela `shopify_automation_logs` no Supabase
