# 🔗 INTEGRAÇÃO FRONTEND ↔ BACKEND - AI Agents

## 📋 Resumo das Correções Realizadas

### ✅ CORREÇÕES APLICADAS

#### 1. Tipos Compartilhados
**Arquivo:** `/src/types/ai-agents.ts`

Criado arquivo centralizado com todos os tipos usados por frontend e backend:
- `AIAgent`, `AgentPersona`, `AgentSettings`
- `AgentSource`, `AgentAction`, `AgentIntegration`
- `ActionConditions`, `ActionCondition`, `ActionDo`
- Presets de UI (TONE_OPTIONS, PROVIDER_OPTIONS, etc.)

#### 2. Suporte a Groq
**Arquivo:** `/src/lib/whatsapp/ai-providers.ts`

- Adicionado `'groq'` ao tipo `AIProvider`
- Adicionada função `callGroq()` para API do Groq
- Adicionado `'google'` como alias para `'gemini'`
- Atualizado switch case para incluir novos providers
- Adicionados modelos Groq à lista `AI_MODELS`

#### 3. Hooks Customizados
**Arquivo:** `/src/hooks/useAgent.ts`

Criados hooks para reduzir duplicação:

```typescript
// Hook para gerenciar um agente específico
const {
  agent,
  sources,
  actions,
  integrations,
  loading,
  error,
  hasChanges,
  saving,
  // Actions
  fetchAgent,
  updateAgent,
  saveAgent,
  deleteAgent,
  toggleActive,
  addSource,
  deleteSource,
  addAction,
  updateAction,
  deleteAction,
  testAgent,
} = useAgent(agentId, organizationId)

// Hook para lista de agentes
const {
  agents,
  loading,
  error,
  stats,
  createAgent,
  deleteAgent,
  toggleAgent,
} = useAgentsList(organizationId)
```

---

## 📊 MAPEAMENTO DE APIs

### Frontend → Backend

| Componente | Endpoint | Método | Status |
|------------|----------|--------|--------|
| AIAgentList | `/api/ai/agents` | GET | ✅ |
| AIAgentList | `/api/ai/agents` | POST | ✅ |
| AIAgentEditor | `/api/ai/agents/:id` | GET | ✅ |
| AIAgentEditor | `/api/ai/agents/:id` | PUT | ✅ |
| AIAgentEditor | `/api/ai/agents/:id` | PATCH | ✅ |
| AIAgentEditor | `/api/ai/agents/:id` | DELETE | ✅ |
| SourcesTab | `/api/ai/agents/:id/sources` | GET | ✅ |
| SourcesTab | `/api/ai/agents/:id/sources` | POST | ✅ |
| SourcesTab | `/api/ai/agents/:id/sources/upload` | POST | ✅ |
| SourcesTab | `/api/ai/agents/:id/sources/:sourceId` | DELETE | ✅ |
| SourcesTab | `/api/ai/agents/:id/sources/:sourceId/reprocess` | POST | ✅ |
| ActionsTab | `/api/ai/agents/:id/actions` | GET | ✅ |
| ActionsTab | `/api/ai/agents/:id/actions` | POST | ✅ |
| ActionsTab | `/api/ai/agents/:id/actions/:actionId` | PUT | ✅ |
| ActionsTab | `/api/ai/agents/:id/actions/:actionId` | DELETE | ✅ |
| IntegrationsTab | `/api/ai/agents/:id/integrations` | GET | ✅ |
| IntegrationsTab | `/api/ai/agents/:id/integrations` | POST | ✅ |
| IntegrationsTab | `/api/ai/agents/:id/integrations/:id/sync` | POST | ✅ |
| AgentPreview | `/api/ai/agents/:id/test` | POST | ✅ |

### APIs Dependentes

| Frontend | Endpoint | Usado Para |
|----------|----------|------------|
| SettingsTab | `/api/whatsapp/numbers` | Lista de números WhatsApp |
| SettingsTab | `/api/deals?type=pipelines` | Lista de pipelines/stages |

---

## 🏗️ ESTRUTURA FINAL

```
src/
├── types/
│   ├── index.ts                    # Re-exports ai-agents
│   └── ai-agents.ts                # ✅ NOVO - Tipos compartilhados
│
├── hooks/
│   ├── index.ts                    # ✅ ATUALIZADO - Export useAgent
│   └── useAgent.ts                 # ✅ NOVO - Hooks de agente
│
├── lib/
│   ├── ai/                         # Backend engine (já existia)
│   │   ├── types.ts               # Tipos do backend
│   │   ├── engine.ts              # Motor principal
│   │   └── ...
│   │
│   └── whatsapp/
│       └── ai-providers.ts         # ✅ ATUALIZADO - Suporte Groq
│
├── components/agents/
│   ├── AIAgentList.tsx            # Lista de agentes
│   ├── AIAgentEditor.tsx          # Editor de agente
│   ├── AgentPreview.tsx           # Preview/teste
│   ├── CreateAgentModal.tsx       # Modal de criação
│   ├── ModelSelector.tsx          # Seletor de modelo
│   └── tabs/
│       ├── SourcesTab.tsx         # Gerenciar fontes
│       ├── ActionsTab.tsx         # Gerenciar ações
│       ├── IntegrationsTab.tsx    # Gerenciar integrações
│       ├── PersonaTab.tsx         # Configurar persona
│       └── SettingsTab.tsx        # Configurações gerais
│
└── app/api/ai/                     # APIs REST (já existia)
    ├── agents/
    │   └── [id]/
    │       ├── sources/
    │       ├── actions/
    │       ├── integrations/
    │       └── test/
    └── process/document/
```

---

## ⚠️ PENDÊNCIAS

### Para corrigir manualmente:

1. **Atualizar imports nos componentes:**
   ```typescript
   // ANTES (em AIAgentEditor.tsx e tabs)
   import { AIAgent, AgentSource } from '../AIAgentEditor'
   
   // DEPOIS
   import type { AIAgent, AgentSource } from '@/types/ai-agents'
   ```

2. **Remover tipos duplicados de AIAgentEditor.tsx:**
   - Linhas 35-159 contêm tipos que agora estão em `/types/ai-agents.ts`
   - Manter apenas imports e lógica do componente

3. **Usar hooks em vez de fetch direto:**
   ```typescript
   // ANTES
   const [agent, setAgent] = useState(null)
   useEffect(() => {
     fetch(`/api/ai/agents/${id}`)...
   }, [])
   
   // DEPOIS
   const { agent, loading, error } = useAgent(agentId, organizationId)
   ```

4. **Adicionar polling para status de fontes:**
   ```typescript
   // Em SourcesTab, adicionar:
   useEffect(() => {
     if (sources.some(s => s.status === 'processing')) {
       const interval = setInterval(fetchSources, 5000)
       return () => clearInterval(interval)
     }
   }, [sources])
   ```

---

## 🎯 DESIGN SYSTEM - Verificação

### ✅ Elementos Consistentes

| Elemento | Classes Usadas | Status |
|----------|----------------|--------|
| Background | `bg-dark-900`, `bg-dark-800/50` | ✅ |
| Borders | `border-dark-700`, `border-dark-700/50` | ✅ |
| Text Primary | `text-white` | ✅ |
| Text Secondary | `text-dark-300`, `text-dark-400` | ✅ |
| Text Muted | `text-dark-500` | ✅ |
| Buttons Primary | `bg-gradient-to-r from-primary-500 to-accent-500` | ✅ |
| Buttons Secondary | `bg-dark-700 hover:bg-dark-600` | ✅ |
| Cards | `bg-dark-800/50 border-dark-700/50 rounded-xl` | ✅ |
| Inputs | `bg-dark-800/50 border-dark-700 rounded-xl` | ✅ |
| Focus States | `focus:border-primary-500/50` | ✅ |
| Hover States | `hover:border-primary-500/30` | ✅ |
| Animations | Framer Motion | ✅ |
| Icons | Lucide React | ✅ |

### Cores por Contexto

| Contexto | Cor |
|----------|-----|
| Persona | Purple (`text-purple-400`, `bg-purple-500/20`) |
| Sources | Blue (`text-blue-400`, `bg-blue-500/20`) |
| Actions | Yellow (`text-yellow-400`, `bg-yellow-500/20`) |
| Integrations | Green (`text-green-400`, `bg-green-500/20`) |
| Settings | Orange (`text-orange-400`, `bg-orange-500/20`) |
| Success | Green (`text-green-400`) |
| Error | Red (`text-red-400`) |
| Warning | Yellow (`text-yellow-400`) |

---

## 📈 Próximos Passos

1. ✅ Tipos compartilhados criados
2. ✅ Suporte a Groq adicionado
3. ✅ Hooks customizados criados
4. ⏳ Atualizar imports nos componentes
5. ⏳ Adicionar polling de status
6. ⏳ Melhorar feedback de loading
7. ⏳ Adicionar validações de formulário
8. ⏳ Testes de integração

---

## 🧪 Teste de Integração

Para verificar se tudo está funcionando:

1. **Criar agente:**
   ```bash
   curl -X POST /api/ai/agents \
     -H "Content-Type: application/json" \
     -d '{"organization_id":"...", "name":"Test Agent", "provider":"openai", "model":"gpt-4o-mini"}'
   ```

2. **Adicionar fonte:**
   ```bash
   curl -X POST /api/ai/agents/{id}/sources \
     -H "Content-Type: application/json" \
     -d '{"organization_id":"...", "source_type":"text", "name":"FAQ", "text_content":"..."}'
   ```

3. **Testar agente:**
   ```bash
   curl -X POST /api/ai/agents/{id}/test \
     -H "Content-Type: application/json" \
     -d '{"organization_id":"...", "message":"Olá!"}'
   ```
