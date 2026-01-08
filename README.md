# Flow Builder - Pacote Completo

## 📦 Conteúdo do Pacote

Este pacote contém todos os componentes necessários para completar o Flow Builder:

### 1. Componentes UI

#### `src/components/flow-builder/panels/HistoryPanel.tsx`
- Painel lateral com histórico de execuções
- Visualização de detalhes de cada execução
- Status por nó executado
- Opção de reexecutar

#### `src/components/flow-builder/panels/TestModal.tsx`
- Modal para testar automações
- Seleção de contato real ou dados de exemplo
- Geração automática de dados baseados no trigger
- Visualização de resultados em tempo real

#### `src/components/flow-builder/index.tsx` (atualizado)
- Integração com TestModal e HistoryPanel
- Controle de estado para modais
- Fallback para automações não salvas

#### `src/app/(dashboard)/settings/credentials/page.tsx`
- Página completa de gerenciamento de credenciais
- Listagem, criação, edição e exclusão
- Teste de conexão integrado
- Suporte a múltiplos tipos de credenciais

### 2. APIs

#### `src/app/api/automations/[id]/execute/route.ts`
- Endpoint POST para executar automações
- Suporte a modo teste e produção
- Carrega credenciais automaticamente
- Salva resultados no banco

#### `src/app/api/automations/[id]/history/route.ts`
- GET: Lista histórico de execuções
- DELETE: Limpa histórico antigo
- Paginação e filtros

#### `src/app/api/credentials/[id]/route.ts`
- GET: Retorna credencial específica
- PUT: Atualiza credencial
- DELETE: Exclui credencial

#### `src/app/api/credentials/test/route.ts`
- POST: Testa conexão de credencial
- Suporte a WhatsApp, Email, Shopify, HTTP

### 3. Biblioteca de Automação

#### `src/lib/automation/node-executors.ts` (completo)
- Executores para todos os tipos de nós
- Triggers: order, abandon, signup, tag, deal, webhook, whatsapp
- Actions: whatsapp (Cloud + Evolution), email (Resend + SendGrid), tag, deal, notify, webhook
- Conditions: has_tag, field, deal_value, order_value
- Control: delay, delay_until, end

#### `src/lib/automation/execution-engine.ts` (atualizado)
- Motor de execução refatorado
- Suporte a branching e condições
- Tratamento de delays
- Integração com credenciais

#### `src/lib/automation/credential-encryption.ts`
- Criptografia AES-256-GCM
- Mascaramento de dados sensíveis
- HMAC para webhooks

#### `src/lib/automation/variable-engine.ts`
- Processamento de variáveis `{{path.to.value}}`
- Filtros: uppercase, currency, date, etc.
- Contexto de execução

### 4. Migrações SQL

#### `supabase/migrations/flow-builder-execution-history.sql`
- Tabela `automation_executions` completa
- Views de estatísticas
- Funções de cleanup
- Triggers para atualização automática

---

## 🔧 Instalação

### Passo 1: Copiar Arquivos

Copie todos os arquivos para seu projeto mantendo a estrutura de pastas:

```bash
# De dentro do projeto flow-builder-completo:
cp -r src/components/flow-builder/panels/* /seu-projeto/src/components/flow-builder/panels/
cp -r src/app/api/* /seu-projeto/src/app/api/
cp -r src/lib/automation/* /seu-projeto/src/lib/automation/
cp -r src/app/\(dashboard\)/settings/credentials /seu-projeto/src/app/\(dashboard\)/settings/
```

### Passo 2: Atualizar FlowBuilder index.tsx

Substitua ou mescle o arquivo `src/components/flow-builder/index.tsx` com a versão atualizada.

### Passo 3: Executar Migration SQL

Execute o arquivo `supabase/migrations/flow-builder-execution-history.sql` no SQL Editor do Supabase.

### Passo 4: Configurar Variáveis de Ambiente

Adicione ao `.env.local`:

```env
# Criptografia (OBRIGATÓRIO - 32+ caracteres)
ENCRYPTION_KEY=sua-chave-de-criptografia-muito-segura-aqui

# QStash (opcional - para delays reais)
QSTASH_URL=https://qstash.upstash.io
QSTASH_TOKEN=seu-token-qstash
```

### Passo 5: Atualizar Exports

No arquivo `src/components/flow-builder/panels/index.ts`, adicione:

```typescript
export { HistoryPanel } from './HistoryPanel';
export { TestModal } from './TestModal';
```

---

## 📋 Uso

### Testar Automação

```typescript
// No FlowBuilder, o botão "Testar" abre o TestModal automaticamente
// Ou use a API diretamente:

const response = await fetch(`/api/automations/${automationId}/test`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    organizationId: 'org-id',
    useSampleData: true,
    triggerData: { order_value: 299.90 }
  })
});
```

### Ver Histórico

```typescript
// O botão "Histórico" na Toolbar abre o HistoryPanel
// Ou acesse via API:

const response = await fetch(`/api/automations/${automationId}/history?pageSize=20`);
const { executions } = await response.json();
```

### Gerenciar Credenciais

Acesse `/settings/credentials` ou use a API:

```typescript
// Criar credencial
const response = await fetch('/api/credentials', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'WhatsApp Produção',
    type: 'whatsappBusiness',
    data: {
      phoneNumberId: '123456789',
      accessToken: 'token-aqui'
    }
  })
});
```

---

## ✅ Checklist de Verificação

Após instalação, verifique:

- [ ] HistoryPanel aparece ao clicar "Histórico" na toolbar
- [ ] TestModal abre ao clicar "Testar"
- [ ] Página /settings/credentials carrega
- [ ] Criação de credencial funciona
- [ ] Teste de credencial retorna resultado
- [ ] Execução de teste mostra resultados por nó
- [ ] Histórico lista execuções anteriores

---

## 🐛 Troubleshooting

### Erro "ENCRYPTION_KEY not found"
Configure a variável `ENCRYPTION_KEY` no `.env.local` com pelo menos 32 caracteres.

### Erro "Database not configured"
Verifique `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

### Credenciais não decriptam
A chave de criptografia não pode ser alterada após criar credenciais. Se alterou, recrie as credenciais.

### Teste não executa
Verifique se a automação tem pelo menos um trigger e uma action conectados.

---

## 📁 Estrutura de Arquivos

```
flow-builder-completo/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── automations/
│   │   │   │   └── [id]/
│   │   │   │       ├── execute/route.ts
│   │   │   │       └── history/route.ts
│   │   │   └── credentials/
│   │   │       ├── route.ts
│   │   │       ├── [id]/route.ts
│   │   │       └── test/route.ts
│   │   └── (dashboard)/
│   │       └── settings/
│   │           └── credentials/page.tsx
│   ├── components/
│   │   └── flow-builder/
│   │       ├── index.tsx
│   │       └── panels/
│   │           ├── HistoryPanel.tsx
│   │           ├── TestModal.tsx
│   │           └── index.ts
│   └── lib/
│       └── automation/
│           ├── node-executors.ts
│           ├── execution-engine.ts
│           ├── credential-encryption.ts
│           └── variable-engine.ts
└── supabase/
    └── migrations/
        └── flow-builder-execution-history.sql
```

---

## 📝 Notas

- Todos os componentes usam Tailwind CSS
- Animações via Framer Motion
- Ícones via Lucide React
- Store via Zustand (flowStore)
- API usa RLS do Supabase para segurança
