# 📋 PRD TÉCNICO: Sistema de Variáveis e Execução - Worder Automations

**Versão:** 1.0  
**Data:** Dezembro 2024  
**Status:** Pronto para implementação

---

## 1. ESCOPO

### 1.1 Objetivo
Transformar as automações do Worder de "caixa preta" em sistema **transparente, debugável e confiável** onde o usuário:
- Sabe quais variáveis pode usar
- Vê o que está acontecendo em tempo real
- Entende quando algo falha e como corrigir
- Pode testar e reexecutar

### 1.2 O que ESTÁ no escopo
- [x] Sistema de variáveis com catálogo tipado
- [x] Interpolação com formatters e defaults
- [x] Registro de execução por nó (input/output)
- [x] UI de seleção de variáveis
- [x] Histórico de execuções com debug visual
- [x] Execução em DAG (não linear)
- [x] Redaction de dados sensíveis
- [x] Limites de performance e retenção

### 1.3 O que NÃO está no escopo (v1)
- [ ] Execução paralela de branches (v2)
- [ ] Webhooks em tempo real para status (v2)
- [ ] AI para sugerir variáveis (v2)
- [ ] Diff visual entre execuções (v2)

---

## 2. DECISÕES DE ARQUITETURA

### 2.1 Fonte da Verdade: `automation_run_steps`

**Decisão:** `automation_run_steps` é a fonte principal. `automation_runs.execution_context` guarda apenas snapshot resumido.

```
automation_runs
├── metadata (status, timestamps, error summary)
├── final_context_summary (JSON resumido: contact_id, deal_id, key outputs)
└── context_storage_key (opcional: referência para JSON completo em storage)

automation_run_steps  ← FONTE PRINCIPAL
├── input_data (truncado em 10KB, flag has_more)
├── output_data (truncado em 10KB, flag has_more)
└── full_data_key (referência para dados completos se truncado)
```

**Motivo:** Evita duplicação, permite query por step, e escala melhor.

### 2.2 Catálogo de Variáveis: Schema-Driven

**Decisão:** Cada trigger/node define seu schema de output via Zod/JSON Schema.

```typescript
// Cada node type exporta seu schema
const triggerOrderSchema = z.object({
  order_id: z.string(),
  order_value: z.number(),
  order_status: z.enum(['paid', 'pending', 'fulfilled']),
  products: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number(),
  })),
});

// Catálogo é gerado a partir dos schemas
const catalog = generateCatalogFromSchemas(triggerType, previousNodes);
```

**Motivo:** Variáveis sempre existem, evita quebras quando node evolui.

### 2.3 Execução: DAG com Fila de Nós Prontos

**Decisão:** Engine baseada em "dependency count" ao invés de while linear.

```typescript
// Ao invés de: while (currentNodeId) { ... }
// Usar:
const readyQueue: string[] = [triggerNodeId];
const executed: Set<string> = new Set();
const dependencyCount: Map<string, number> = calculateDependencies(edges);

while (readyQueue.length > 0) {
  const nodeId = readyQueue.shift()!;
  const result = await executeNode(nodeId, context);
  executed.add(nodeId);
  
  // Decrementar dependências dos próximos nós
  for (const nextId of getNextNodes(nodeId, result)) {
    dependencyCount.set(nextId, dependencyCount.get(nextId)! - 1);
    if (dependencyCount.get(nextId) === 0) {
      readyQueue.push(nextId);
    }
  }
}
```

**Motivo:** Suporta if/else, branches, merges. Preparado para paralelo no futuro.

### 2.4 Segurança: Redaction Layer

**Decisão:** Middleware obrigatório antes de salvar qualquer input/output.

```typescript
const SENSITIVE_KEYS = [
  'authorization', 'api_key', 'apiKey', 'token', 'access_token',
  'password', 'secret', 'credential', 'private_key',
];

const PII_KEYS = ['email', 'phone', 'cpf', 'cnpj', 'card_number'];

function redactForStorage(obj: any, options: RedactOptions): any {
  // Redact sensitive keys completamente
  // Mask PII baseado em plano/permissão
}
```

**Motivo:** Compliance, segurança, evita vazamento em logs.

### 2.5 Interpolação: Type-Aware com Escapes

**Decisão:** Interpolação retorna tipo correto + suporta escapes.

```typescript
// Formatters de tipo
'| json'        → JSON.stringify(value)
'| join:","'    → array.join(',')
'| first'       → array[0]
'| last'        → array[array.length - 1]
'| count'       → array.length

// Formatters de escape
'| url_encode'  → encodeURIComponent(value)
'| html_escape' → escapeHtml(value)
'| base64'      → btoa(value)

// Formatters de texto
'| uppercase'   → value.toUpperCase()
'| lowercase'   → value.toLowerCase()
'| capitalize'  → capitalize(value)
'| truncate:50' → value.slice(0, 50) + '...'

// Formatters de número/data
'| currency'    → formatCurrency(value)
'| date_br'     → formatDateBR(value)
'| relative'    → '3 dias atrás'

// Default
'| default:"valor"' → value || 'valor'
```

---

## 3. MODELO DE DADOS

### 3.1 Tabelas

```sql
-- =============================================
-- EXECUÇÕES DE AUTOMAÇÃO
-- =============================================
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Contexto inicial
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  trigger_type TEXT NOT NULL,
  trigger_node_id TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'running' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  
  -- Resumo (não duplica steps, apenas referências)
  nodes_total INTEGER DEFAULT 0,
  nodes_executed INTEGER DEFAULT 0,
  nodes_failed INTEGER DEFAULT 0,
  nodes_skipped INTEGER DEFAULT 0,
  
  -- Erro principal (se houver)
  error_node_id TEXT,
  error_type TEXT,  -- 'validation', 'execution', 'timeout', 'integration'
  error_message TEXT,
  error_suggestion TEXT,  -- Sugestão de correção
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Retenção
  expires_at TIMESTAMPTZ,  -- TTL baseado no plano
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices otimizados
CREATE INDEX idx_runs_automation ON automation_runs(automation_id);
CREATE INDEX idx_runs_org_status ON automation_runs(organization_id, status);
CREATE INDEX idx_runs_created ON automation_runs(created_at DESC);
CREATE INDEX idx_runs_expires ON automation_runs(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================
-- PASSOS DE EXECUÇÃO (FONTE PRINCIPAL)
-- =============================================
CREATE TABLE automation_run_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  
  -- Identificação do nó
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_label TEXT,
  
  -- Ordem e dependências
  step_order INTEGER NOT NULL,
  parent_step_id UUID REFERENCES automation_run_steps(id),  -- Para branches
  branch_path TEXT,  -- 'true', 'false', 'A', 'B', null
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'success', 'error', 'skipped', 'timeout')),
  
  -- Dados (com limite de tamanho)
  input_data JSONB DEFAULT '{}',
  input_truncated BOOLEAN DEFAULT false,
  output_data JSONB DEFAULT '{}',
  output_truncated BOOLEAN DEFAULT false,
  
  -- Config usada (após interpolação)
  config_used JSONB DEFAULT '{}',
  variables_resolved JSONB DEFAULT '{}',  -- Mapa de variáveis → valores usados
  
  -- Erro detalhado
  error_type TEXT,
  error_message TEXT,
  error_stack TEXT,
  error_context JSONB,  -- Dados extras para debug
  
  -- Performance
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_steps_run ON automation_run_steps(run_id);
CREATE INDEX idx_steps_node ON automation_run_steps(node_id);
CREATE INDEX idx_steps_status ON automation_run_steps(status);

-- =============================================
-- SCHEMAS DE NÓS (para catálogo de variáveis)
-- =============================================
CREATE TABLE node_schemas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_type TEXT UNIQUE NOT NULL,
  
  -- Schema de input esperado
  input_schema JSONB NOT NULL DEFAULT '{}',
  
  -- Schema de output produzido
  output_schema JSONB NOT NULL DEFAULT '{}',
  
  -- Metadados
  category TEXT NOT NULL,  -- 'trigger', 'action', 'logic'
  version INTEGER DEFAULT 1,
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO node_schemas (node_type, category, output_schema) VALUES
('trigger_order', 'trigger', '{
  "type": "object",
  "properties": {
    "order_id": {"type": "string", "label": "ID do Pedido"},
    "order_value": {"type": "number", "label": "Valor do Pedido", "format": "currency"},
    "order_status": {"type": "string", "label": "Status"},
    "products": {"type": "array", "label": "Produtos", "items": {"type": "object"}}
  }
}'),
('trigger_abandon', 'trigger', '{
  "type": "object",
  "properties": {
    "cart_id": {"type": "string", "label": "ID do Carrinho"},
    "cart_value": {"type": "number", "label": "Valor do Carrinho", "format": "currency"},
    "abandoned_at": {"type": "string", "label": "Abandonado em", "format": "date-time"},
    "products": {"type": "array", "label": "Produtos"}
  }
}'),
('action_create_deal', 'action', '{
  "type": "object",
  "properties": {
    "deal_id": {"type": "string", "label": "ID do Deal Criado"},
    "deal_title": {"type": "string", "label": "Título"},
    "success": {"type": "boolean", "label": "Sucesso"}
  }
}'),
('action_tag', 'action', '{
  "type": "object",
  "properties": {
    "tags_added": {"type": "array", "label": "Tags Adicionadas"},
    "tags_removed": {"type": "array", "label": "Tags Removidas"},
    "success": {"type": "boolean", "label": "Sucesso"}
  }
}'),
('logic_condition', 'logic', '{
  "type": "object",
  "properties": {
    "condition_result": {"type": "boolean", "label": "Resultado da Condição"},
    "branch": {"type": "string", "label": "Caminho Tomado"}
  }
}');
```

### 3.2 Limites de Dados

```typescript
const DATA_LIMITS = {
  // Por step
  MAX_INPUT_SIZE: 10 * 1024,   // 10KB
  MAX_OUTPUT_SIZE: 10 * 1024,  // 10KB
  MAX_ERROR_STACK: 5 * 1024,   // 5KB
  
  // Por run
  MAX_NODES_PER_RUN: 100,
  MAX_EXECUTION_TIME: 5 * 60 * 1000,  // 5 minutos
  
  // Retenção por plano
  RETENTION: {
    free: 7,      // 7 dias
    starter: 30,  // 30 dias
    growth: 90,   // 90 dias
    enterprise: 365,  // 1 ano
  },
  
  // Paginação
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};
```

---

## 4. TIPOS E INTERFACES

```typescript
// =============================================
// CONTEXTO DE EXECUÇÃO
// =============================================
interface ExecutionContext {
  // Metadados
  execution_id: string;
  automation_id: string;
  organization_id: string;
  
  // Dados base (sempre presentes)
  contact: ContactData;
  
  // Dados opcionais
  deal?: DealData;
  
  // Trigger
  trigger: {
    type: string;
    node_id: string;
    data: Record<string, any>;
  };
  
  // Output de nós anteriores (acumulativo)
  nodes: {
    [nodeId: string]: NodeOutput;
  };
  
  // Sistema
  system: {
    current_date: string;
    current_time: string;
    automation_name: string;
    execution_id: string;
    organization_id: string;
  };
}

interface NodeOutput {
  type: string;
  label: string;
  status: 'success' | 'error' | 'skipped';
  output: Record<string, any>;
  executed_at: string;
}

// =============================================
// CATÁLOGO DE VARIÁVEIS
// =============================================
interface VariableCatalog {
  categories: VariableCategory[];
}

interface VariableCategory {
  id: string;           // 'contact', 'trigger', 'deal', 'system', 'nodes'
  label: string;        // 'Contato', 'Gatilho', etc.
  icon: string;         // Lucide icon name
  variables: Variable[];
  subcategories?: VariableCategory[];  // Para nodes anteriores
}

interface Variable {
  key: string;          // 'contact.first_name'
  label: string;        // 'Primeiro Nome'
  type: VariableType;   // 'string', 'number', 'currency', 'date', 'array', 'boolean'
  format?: string;      // 'currency', 'date-time', etc.
  example?: any;        // Valor de exemplo para preview
  description?: string; // Descrição opcional
}

type VariableType = 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'array' | 'object';

// =============================================
// INTERPOLAÇÃO
// =============================================
interface InterpolationResult {
  value: any;
  originalExpression: string;
  resolvedPath: string;
  formattersApplied: string[];
  warnings: InterpolationWarning[];
}

interface InterpolationWarning {
  type: 'empty' | 'undefined' | 'type_mismatch' | 'formatter_error';
  message: string;
  path: string;
}

// =============================================
// HISTÓRICO E DEBUG
// =============================================
interface ExecutionSummary {
  id: string;
  automation_id: string;
  automation_name: string;
  status: ExecutionStatus;
  trigger_type: string;
  contact?: {
    id: string;
    name: string;
    email: string;
  };
  nodes_executed: number;
  nodes_failed: number;
  duration_ms: number;
  error_summary?: string;
  started_at: string;
  completed_at?: string;
}

interface ExecutionDetail {
  summary: ExecutionSummary;
  steps: ExecutionStep[];
  context_snapshot: Partial<ExecutionContext>;
}

interface ExecutionStep {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  step_order: number;
  branch_path?: string;
  status: StepStatus;
  
  // Dados (pode estar truncado)
  input_data: Record<string, any>;
  input_truncated: boolean;
  output_data: Record<string, any>;
  output_truncated: boolean;
  
  // Variáveis resolvidas
  variables_resolved: Record<string, any>;
  
  // Erro
  error?: {
    type: string;
    message: string;
    suggestion?: string;
    context?: Record<string, any>;
  };
  
  // Timing
  duration_ms: number;
  started_at: string;
  completed_at?: string;
}

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'timeout';
```

---

## 5. COMPONENTES FRONTEND

### 5.1 VariablePicker

```tsx
interface VariablePickerProps {
  // Contexto para gerar catálogo
  triggerType: string;
  previousNodes: Array<{
    id: string;
    type: string;
    label: string;
  }>;
  
  // Callback
  onSelect: (variable: string) => void;
  onClose: () => void;
  
  // Posição (para dropdown)
  anchorEl?: HTMLElement;
  
  // Preview
  sampleContext?: Partial<ExecutionContext>;
}

// Comportamento:
// 1. Gera catálogo baseado em triggerType + schemas dos previousNodes
// 2. Agrupa por categoria com expand/collapse
// 3. Busca fuzzy por label ou key
// 4. Mostra preview do valor se sampleContext disponível
// 5. Clique insere {{variable.path}}
// 6. Hover mostra tipo + descrição + exemplo
```

### 5.2 ExpressionInput

```tsx
interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  
  // Contexto para variáveis
  triggerType: string;
  previousNodes: Node[];
  
  // Preview
  sampleContext?: Partial<ExecutionContext>;
  showPreview?: boolean;
  
  // Validação
  validateVariables?: boolean;
}

// Comportamento:
// 1. Campo de texto normal
// 2. Botão { } no canto abre VariablePicker
// 3. Digitar {{ abre autocomplete inline
// 4. Variáveis {{...}} ficam destacadas (syntax highlight)
// 5. Preview abaixo mostra resultado interpolado
// 6. Se variável inválida: warning inline
// 7. Se variável vazia: warning "⚠️ Campo vazio"
```

### 5.3 ExecutionHistory

```tsx
interface ExecutionHistoryProps {
  automationId: string;
  
  // Filtros
  statusFilter?: ExecutionStatus[];
  dateRange?: { from: Date; to: Date };
  
  // Paginação
  page?: number;
  pageSize?: number;
  
  // Callbacks
  onSelectExecution: (executionId: string) => void;
}

// Colunas:
// - Status (ícone colorido)
// - Data/Hora
// - Contato (nome + email)
// - Nós executados (X de Y)
// - Duração
// - Erro (resumo se houver)
// - Ações (ver detalhes, reexecutar)
```

### 5.4 ExecutionDetail

```tsx
interface ExecutionDetailProps {
  executionId: string;
  
  // Callbacks
  onRerun: () => void;
  onClose: () => void;
}

// Seções:
// 1. Header: Status, duração, timestamps
// 2. Timeline: Lista de steps com status
// 3. Step expandido: Input/Output lado a lado
// 4. Erro: Mensagem + sugestão + dados do contexto
// 5. Ações: Reexecutar, Copiar erro, Ir para config
```

---

## 6. RISCOS E MITIGAÇÕES

| Risco | Impacto | Probabilidade | Mitigação |
|-------|---------|---------------|-----------|
| Logs explodem storage | Alto | Alta | Truncate + TTL + compactação |
| Vazamento de dados sensíveis | Crítico | Média | Redaction obrigatório |
| Loop infinito em execução | Alto | Baixa | Max nodes (100) + timeout (5min) |
| Variable inválida quebra execução | Médio | Alta | Fallback para empty string + warning |
| Performance em histórico | Médio | Média | Índices + paginação + cache |
| Schema desatualizado | Baixo | Média | Versionamento + fallback graceful |

---

## 7. CHECKLIST DE IMPLEMENTAÇÃO

### FASE 1: Backend Foundation (Sprint 1) 🔴

**Banco de Dados:**
- [ ] Criar tabela `automation_runs`
- [ ] Criar tabela `automation_run_steps`
- [ ] Criar tabela `node_schemas`
- [ ] Popular schemas dos nodes existentes
- [ ] Criar índices
- [ ] Criar job de cleanup (TTL)

**Engine de Execução:**
- [ ] Refatorar `processAutomationRun` para DAG
- [ ] Implementar `calculateDependencies(edges)`
- [ ] Implementar `getNextNodes(nodeId, result)`
- [ ] Criar registro de run no início
- [ ] Criar registro de step para cada nó
- [ ] Salvar input/output com truncate
- [ ] Implementar timeout global

**Interpolação:**
- [ ] Implementar `interpolateVariables(config, context)`
- [ ] Implementar `resolvePath(context, path)`
- [ ] Implementar formatters básicos (uppercase, lowercase, currency, date)
- [ ] Implementar `default` formatter
- [ ] Implementar escapes (url_encode, html_escape)
- [ ] Retornar warnings para variáveis vazias/inválidas

**Segurança:**
- [ ] Implementar `redactSensitiveFields(obj)`
- [ ] Configurar lista de keys sensíveis
- [ ] Implementar masking de PII

### FASE 2: API Endpoints (Sprint 1) 🔴

- [ ] `GET /api/automations/:id/runs` - Listar execuções
- [ ] `GET /api/automations/:id/runs/:runId` - Detalhe de execução
- [ ] `GET /api/automations/:id/runs/:runId/steps` - Steps de execução
- [ ] `POST /api/automations/:id/test` - Testar com sample data
- [ ] `POST /api/automations/:id/runs/:runId/rerun` - Reexecutar
- [ ] `GET /api/automations/variables/catalog` - Catálogo de variáveis

### FASE 3: Frontend - Variable System (Sprint 2) 🟡

**Componentes:**
- [ ] Criar `VariablePicker` component
- [ ] Criar `ExpressionInput` component
- [ ] Integrar em todos os campos de config dos nós
- [ ] Implementar syntax highlighting para {{...}}
- [ ] Implementar autocomplete ao digitar {{
- [ ] Implementar preview com sample context

**Catálogo:**
- [ ] Criar hook `useVariableCatalog(triggerType, previousNodes)`
- [ ] Gerar variáveis dinâmicas de nós anteriores
- [ ] Busca fuzzy por label/key
- [ ] Mostrar tipo e exemplo

### FASE 4: Frontend - Execution History (Sprint 2) 🟡

**Componentes:**
- [ ] Criar `ExecutionHistory` component
- [ ] Criar `ExecutionDetail` component
- [ ] Criar `ExecutionStep` component (expandível)
- [ ] Criar `ExecutionError` component (com sugestão)

**Features:**
- [ ] Listar execuções com filtros
- [ ] Paginação
- [ ] Expandir step para ver input/output
- [ ] Visualização de erro com sugestão
- [ ] Botão reexecutar
- [ ] Botão copiar erro

### FASE 5: Polish & Advanced (Sprint 3) 🟢

- [ ] Testar automação com contato real selecionável
- [ ] Indicador de execução em tempo real
- [ ] Métricas de sucesso/falha por automação
- [ ] Export de log de execução
- [ ] Documentação de variáveis inline

---

## 8. ESTIMATIVAS

| Fase | Esforço | Dependências |
|------|---------|--------------|
| 1. Backend Foundation | 3-4 dias | Nenhuma |
| 2. API Endpoints | 1-2 dias | Fase 1 |
| 3. Frontend Variables | 3-4 dias | Fase 2 |
| 4. Frontend History | 2-3 dias | Fase 2 |
| 5. Polish | 2-3 dias | Fases 3 e 4 |

**Total estimado:** 11-16 dias de desenvolvimento

---

## 9. DEFINIÇÃO DE PRONTO (DoD)

### Para cada fase:
- [ ] Código implementado e testado
- [ ] Sem erros de TypeScript
- [ ] Logs funcionando
- [ ] Dados sensíveis não expostos
- [ ] Performance aceitável (<2s para histórico)

### Para release:
- [ ] Todas as fases completas
- [ ] Teste end-to-end com automação real
- [ ] Documentação atualizada
- [ ] Rollback plan definido

---

## 10. MÉTRICAS DE SUCESSO

| Métrica | Baseline | Target |
|---------|----------|--------|
| Tempo para debug de erro | ??? | <30 segundos |
| % de erros com sugestão | 0% | >80% |
| Uso do variable picker | N/A | >50% das edições |
| Satisfação com debug | N/A | >4/5 |

---

## ANEXO A: Exemplos de Erro com Sugestão

```typescript
const ERROR_SUGGESTIONS: Record<string, ErrorSuggestion> = {
  'KLAVIYO_401': {
    type: 'integration',
    message: 'API key do Klaviyo inválida ou expirada',
    suggestion: 'Verifique sua API key em Configurações > Integrações > Klaviyo',
    actionUrl: '/settings/integrations/klaviyo',
    actionLabel: 'Ir para Klaviyo',
  },
  'WHATSAPP_TEMPLATE_NOT_FOUND': {
    type: 'configuration',
    message: 'Template de WhatsApp não encontrado',
    suggestion: 'Verifique se o template existe e está aprovado no Meta Business',
    actionUrl: '/settings/integrations/whatsapp',
    actionLabel: 'Ver Templates',
  },
  'CONTACT_NOT_FOUND': {
    type: 'data',
    message: 'Contato não encontrado no contexto',
    suggestion: 'Certifique-se de que o trigger está passando o contact_id corretamente',
  },
  'VARIABLE_UNDEFINED': {
    type: 'configuration',
    message: 'Variável {{path}} não existe no contexto',
    suggestion: 'Use o seletor de variáveis para ver as opções disponíveis',
  },
  'DEAL_PIPELINE_NOT_FOUND': {
    type: 'configuration',
    message: 'Pipeline selecionada não existe',
    suggestion: 'A pipeline pode ter sido excluída. Selecione outra pipeline.',
    actionUrl: '/crm/pipelines',
    actionLabel: 'Ver Pipelines',
  },
};
```

---

## ANEXO B: Sample Context para Preview

```typescript
const SAMPLE_CONTEXT: ExecutionContext = {
  execution_id: 'sample-123',
  automation_id: 'auto-456',
  organization_id: 'org-789',
  
  contact: {
    id: 'contact-abc',
    email: 'joao.silva@email.com',
    phone: '+5511999999999',
    first_name: 'João',
    last_name: 'Silva',
    full_name: 'João Silva',
    tags: ['cliente', 'vip'],
    total_orders: 5,
    total_spent: 1500.00,
    created_at: '2024-01-15T10:30:00Z',
    custom_fields: {
      empresa: 'Acme Corp',
    },
  },
  
  trigger: {
    type: 'trigger_order',
    node_id: 'node-trigger-1',
    data: {
      order_id: 'ORD-12345',
      order_value: 299.90,
      order_status: 'paid',
      products: [
        { id: 'prod-1', name: 'Camiseta', quantity: 2 },
        { id: 'prod-2', name: 'Calça', quantity: 1 },
      ],
    },
  },
  
  nodes: {},
  
  system: {
    current_date: new Date().toISOString().split('T')[0],
    current_time: new Date().toTimeString().split(' ')[0],
    automation_name: 'Boas-vindas Comprador',
    execution_id: 'sample-123',
    organization_id: 'org-789',
  },
};
```
