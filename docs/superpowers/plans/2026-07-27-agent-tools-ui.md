# Agent Tools UI (Aba "Ferramentas") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o sistema de function-calling do agente de IA alcançável em produção: uma aba "Ferramentas" no editor do agente que grava `settings.tools.enabled`, com `transfer_to_human` habilitada por padrão em agentes novos.

**Architecture:** O runtime já está completo — `src/lib/ai/cloud-runner.ts:286-308` monta o `toolContext` (org/conversation/contact/store) e o passa ao engine, e `src/lib/ai/engine.ts:140-144` roda o tool-loop quando `getActiveTools` retorna algo. O único elo faltante é a escrita de `agent.settings.tools.enabled` (nenhuma UI grava esse campo hoje). A solução: um catálogo de metadados em PT (módulo puro, sem imports server-side, para poder entrar no bundle client), uma nova aba `ToolsTab` no `AIAgentEditor` que edita `settings.tools.enabled` via o `onUpdate`/`handleSave` existentes (o PUT `/api/ai/agents/[id]` já aceita `settings` inteiro na whitelist, linhas 141-152 — zero mudança de API), e `DEFAULT_SETTINGS.tools` para novos agentes.

**Tech Stack:** Next.js 14.0.4 (App Router), React 18, TypeScript 5, Supabase (tabela `ai_agents`, coluna `settings` JSONB), Vitest 1.x (env node, alias `@` → `src`), lucide-react, design system escopado dos agentes (`AgentsTheme` + classes `sec-head`/`rule-card`/`tog`/`callout`/`chip`).

## Global Constraints

- Testes: `npm run test` (vitest, `environment: node`, `setupFiles: src/tests/setup.ts` que mocka `@supabase/supabase-js`); arquivos de teste em `src/lib/ai/__tests__/*.test.ts`.
- NUNCA importar `src/lib/ai/tools/registry.ts` (ou handlers) em componente client — os handlers importam `tools/db.ts` → `supabase-admin.ts`, que lança erro se importado no browser. UI usa só o catálogo puro (Task 2).
- Prosa/copy de UI em português brasileiro; identificadores de código em inglês.
- Agentes existentes NÃO mudam de comportamento silenciosamente: `getActiveTools` retorna `[]` quando `settings.tools` está ausente (registry.ts:52-55) e `DEFAULT_SETTINGS` só é aplicado em INSERT (`POST /api/ai/agents`, spread raso em `src/app/api/ai/agents/route.ts:120-123`).
- Rota de persistência é a existente: PUT `/api/ai/agents/[id]` (usada por `AIAgentEditor.handleSave`); `settings` já está na whitelist de campos — não criar rota nova (YAGNI).
- `product_lookup` e `order_status` são store-gated no runtime (`STORE_GATED_TOOLS`, registry.ts:37-40): sem `storeId` no contexto elas são omitidas mesmo se habilitadas — a UI avisa, não bloqueia.
- Commits frequentes, um por task, mensagens no padrão do repo (`feat(...)`, `test(...)`).

---

### Task 1: Tipos + default `transfer_to_human` + teste unitário de `getActiveTools`

**Files:**
- Create: `src/lib/ai/__tests__/tools-registry.test.ts`
- Modify: `src/lib/ai/types.ts:55-61` (campo `tools` em `AgentSettings`) e `src/lib/ai/types.ts:397-403` (bloco `behavior` de `DEFAULT_SETTINGS` — adicionar `tools` logo após)

**Interfaces:**
- Consumes: `getActiveTools(agent, ctx)` e `ALL_TOOLS` de `src/lib/ai/tools/registry.ts` (já existem, não mudam); `DEFAULT_SETTINGS: AgentSettings` de `src/lib/ai/types.ts`.
- Produces: `AgentSettings.tools?: { enabled: string[] }` (campo opcional novo) e `DEFAULT_SETTINGS.tools = { enabled: ['transfer_to_human'] }` — Tasks 3 lê/escreve `settings.tools.enabled` exatamente com esse shape.

**Justificativa do default:** `transfer_to_human` é a única tool sem dependência externa (não exige Shopify nem chave adicional) e é a válvula de escape de segurança — sem ela um agente novo não tem como sair do caminho da IA. Agentes existentes não são alterados: o default só entra em novos INSERTs, e o registry devolve `[]` para `settings.tools` ausente.

- [ ] **Step 1: Escrever o teste (parte de `getActiveTools` documenta comportamento atual; parte de `DEFAULT_SETTINGS` falha até o Step 3)**

Criar `src/lib/ai/__tests__/tools-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALL_TOOLS, getActiveTools } from '../tools/registry'
import { DEFAULT_SETTINGS } from '../types'

describe('getActiveTools', () => {
  it('retorna [] quando settings.tools esta ausente (agentes existentes nao mudam)', () => {
    expect(getActiveTools({ settings: {} }, {})).toEqual([])
    expect(getActiveTools(null, {})).toEqual([])
    expect(getActiveTools(undefined, {})).toEqual([])
  })

  it('retorna [] para enabled vazio', () => {
    expect(getActiveTools({ settings: { tools: { enabled: [] } } }, {})).toEqual([])
  })

  it('retorna so as tools habilitadas, ignorando nomes desconhecidos', () => {
    const tools = getActiveTools(
      { settings: { tools: { enabled: ['transfer_to_human', 'not_a_tool'] } } },
      {},
    )
    expect(tools.map((t) => t.name)).toEqual(['transfer_to_human'])
  })

  it('omite product_lookup/order_status sem storeId (store-gated)', () => {
    const agent = {
      settings: { tools: { enabled: ['product_lookup', 'order_status', 'save_customer'] } },
    }
    expect(getActiveTools(agent, {}).map((t) => t.name)).toEqual(['save_customer'])
    expect(getActiveTools(agent, { storeId: 'store-1' }).map((t) => t.name)).toEqual([
      'product_lookup',
      'order_status',
      'save_customer',
    ])
  })
})

describe('DEFAULT_SETTINGS.tools', () => {
  it('habilita transfer_to_human por padrao para agentes novos', () => {
    expect(DEFAULT_SETTINGS.tools?.enabled).toEqual(['transfer_to_human'])
  })

  it('todo nome no default existe no registry', () => {
    const known = new Set(ALL_TOOLS.map((t) => t.name))
    for (const name of DEFAULT_SETTINGS.tools?.enabled ?? []) {
      expect(known.has(name)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/ai/__tests__/tools-registry.test.ts`
Expected: FAIL — os 4 testes de `getActiveTools` passam (comportamento existente); `DEFAULT_SETTINGS.tools` falha com `expected undefined to deeply equal ['transfer_to_human']` (o campo `tools` ainda não existe). Se falhar em compilação por `tools` não existir em `AgentSettings`, é o mesmo gap — seguir ao Step 3.

- [ ] **Step 3: Implementação mínima em `types.ts`**

Em `src/lib/ai/types.ts`, dentro de `interface AgentSettings` (após o bloco `behavior`, linha 60):

```ts
  behavior: {
    activate_on: 'new_message' | 'pipeline_stage' | 'manual'
    stop_on_human_reply: boolean
    cooldown_after_transfer: number
    max_messages_per_conversation: number
  }
  /**
   * Tool-calling (Fase 2b/2c). `enabled` lista os NOMES das tools ativas
   * (ver src/lib/ai/tools/registry.ts). Ausente => nenhuma tool (compat com
   * agentes criados antes desta feature).
   */
  tools?: {
    enabled: string[]
  }
```

E em `DEFAULT_SETTINGS` (após o bloco `behavior`, linha 402):

```ts
  behavior: {
    activate_on: 'new_message',
    stop_on_human_reply: true,
    cooldown_after_transfer: 300,
    max_messages_per_conversation: 0,
  },
  // transfer_to_human por padrão: é a válvula de escape sem dependência
  // externa (não exige Shopify nem chave extra). Agentes EXISTENTES não
  // mudam: DEFAULT_SETTINGS só entra em novos INSERTs (POST /api/ai/agents)
  // e getActiveTools devolve [] quando settings.tools está ausente.
  tools: { enabled: ['transfer_to_human'] },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/lib/ai/__tests__/tools-registry.test.ts`
Expected: PASS (6 testes). Rodar também `npm run test` completo para garantir que nada quebrou (o snapshot de versões e o create flow usam `DEFAULT_SETTINGS` por spread raso — chave nova não conflita).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/__tests__/tools-registry.test.ts src/lib/ai/types.ts
git commit -m "test(ai): cobrir getActiveTools e habilitar transfer_to_human por padrao em agentes novos"
```

---

### Task 2: Catálogo PT de ferramentas (metadados client-safe)

**Files:**
- Create: `src/lib/ai/tools/catalog.ts`
- Test: `src/lib/ai/__tests__/tools-catalog.test.ts`

**Interfaces:**
- Consumes: nada em runtime (módulo puro de dados). O TESTE (server-side) importa `ALL_TOOLS` de `src/lib/ai/tools/registry.ts` para garantir paridade de nomes.
- Produces: `interface ToolCatalogEntry { name: string; label: string; description: string; requiresStore: boolean }` e `export const TOOL_CATALOG: ToolCatalogEntry[]` — a Task 3 renderiza a lista a partir dele. IMPORTANTE: `catalog.ts` NÃO importa registry/handlers (seria fatal no client por causa do guard do `supabase-admin.ts`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/ai/__tests__/tools-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TOOL_CATALOG } from '../tools/catalog'
import { ALL_TOOLS } from '../tools/registry'

describe('TOOL_CATALOG', () => {
  it('cobre exatamente as tools registradas em ALL_TOOLS (paridade de nomes)', () => {
    const catalogNames = TOOL_CATALOG.map((t) => t.name).sort()
    const registryNames = ALL_TOOLS.map((t) => t.name).sort()
    expect(catalogNames).toEqual(registryNames)
  })

  it('marca as tools store-gated com requiresStore', () => {
    const byName = new Map(TOOL_CATALOG.map((t) => [t.name, t]))
    expect(byName.get('product_lookup')?.requiresStore).toBe(true)
    expect(byName.get('order_status')?.requiresStore).toBe(true)
    expect(byName.get('transfer_to_human')?.requiresStore).toBe(false)
    expect(byName.get('search_knowledge')?.requiresStore).toBe(false)
  })

  it('toda entrada tem label e descricao nao-vazios (copy PT da UI)', () => {
    for (const entry of TOOL_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/ai/__tests__/tools-catalog.test.ts`
Expected: FAIL — `Cannot find module '../tools/catalog'` (ou erro de resolução equivalente).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/ai/tools/catalog.ts`:

```ts
// =====================================================
// CATÁLOGO DE TOOLS — METADADOS PARA A UI
// =====================================================
// Módulo PURO (só dados): é importado por componentes client (ToolsTab).
// NÃO importar registry.ts/handlers aqui — eles puxam tools/db.ts ->
// supabase-admin.ts, que lança erro no browser. A paridade de nomes com
// ALL_TOOLS é garantida por teste (tools-catalog.test.ts).

export interface ToolCatalogEntry {
  /** Nome canônico da tool — deve bater com Tool.name no registry. */
  name: string
  /** Rótulo curto em PT exibido na UI. */
  label: string
  /** O que a tool faz, em PT, na linguagem do lojista. */
  description: string
  /** true = só funciona com loja Shopify conectada (store-gated no runtime). */
  requiresStore: boolean
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'transfer_to_human',
    label: 'Transferir para humano',
    description:
      'Desliga a IA na conversa e passa o atendimento para a equipe, registrando ' +
      'motivo e resumo na timeline do contato. Recomendada para todo agente.',
    requiresStore: false,
  },
  {
    name: 'search_knowledge',
    label: 'Buscar na base de conhecimento',
    description:
      'Busca sob demanda nas fontes da aba Fontes (políticas, FAQ, documentos). ' +
      'Com ela ativa, a base de conhecimento deixa de ser pré-injetada e passa a ' +
      'ser consultada só quando necessário. Requer chave OpenAI da organização ' +
      'cadastrada em API Keys (usada para embeddings).',
    requiresStore: false,
  },
  {
    name: 'save_customer',
    label: 'Salvar dados do cliente',
    description:
      'Salva ou atualiza o contato no CRM (nome, e-mail, tags e campos ' +
      'personalizados) quando o cliente informa dados na conversa.',
    requiresStore: false,
  },
  {
    name: 'save_interests',
    label: 'Registrar interesses',
    description:
      'Registra produtos e assuntos de interesse do cliente para remarketing e ' +
      'contexto em conversas futuras.',
    requiresStore: false,
  },
  {
    name: 'timeline',
    label: 'Timeline do contato',
    description:
      'Consulta o histórico do contato (pedidos, notas, interações) antes de ' +
      'responder e registra novas atividades relevantes.',
    requiresStore: false,
  },
  {
    name: 'product_lookup',
    label: 'Consultar produtos',
    description:
      'Busca produtos da loja por nome ou SKU e responde com preço, estoque e ' +
      'variantes. Requer loja Shopify conectada.',
    requiresStore: true,
  },
  {
    name: 'order_status',
    label: 'Status de pedido',
    description:
      'Consulta o status de pedidos (pagamento e envio) por número do pedido, ' +
      'e-mail ou telefone do cliente. Requer loja Shopify conectada.',
    requiresStore: true,
  },
]
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/lib/ai/__tests__/tools-catalog.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/tools/catalog.ts src/lib/ai/__tests__/tools-catalog.test.ts
git commit -m "feat(ai): catalogo PT das ferramentas do agente (metadados client-safe para a UI)"
```

---

### Task 3: Aba "Ferramentas" no editor do agente (ToolsTab + wiring)

**Files:**
- Create: `src/components/agents/tabs/ToolsTab.tsx`
- Modify: `src/components/agents/AIAgentEditor.tsx:5-26` (import do ícone `Wrench`), `:28-36` (import do ToolsTab), `:69-77` (array `tabs`), `:436-440` (badge de contagem), `:459-575` (bloco de render da aba)
- Test: verificação manual (não há infra de teste de componente React no repo — vitest roda em `environment: node`, sem jsdom/testing-library)

**Interfaces:**
- Consumes: `TOOL_CATALOG` / `ToolCatalogEntry` (Task 2); `AgentSettings.tools?: { enabled: string[] }` e `DEFAULT_SETTINGS` (Task 1); `AIAgent` de `@/lib/ai/types`; `useStoreStore` de `@/stores` (padrão já usado pelo SettingsTab, linha 70, para detectar loja Shopify: `currentStore` não-nulo = Shopify conectada); classes do design system escopado (`sec-head`, `rule-card`, `tog`, `callout`, `chip`, `hint`).
- Produces: `export default function ToolsTab({ agent, onUpdate }: { agent: AIAgent; onUpdate: (updates: Partial<AIAgent>) => void })`. A persistência é o fluxo existente: `onUpdate` → `updateAgent` (AIAgentEditor.tsx:186-190, seta `hasChanges`) → botão Salvar → `handleSave` → PUT `/api/ai/agents/[id]` (que já grava `settings` inteiro — route.ts:141-152).

- [ ] **Step 1: Criar o componente `ToolsTab`**

Criar `src/components/agents/tabs/ToolsTab.tsx`:

```tsx
'use client'

import { Wrench, Info, AlertTriangle } from 'lucide-react'
import { AIAgent, DEFAULT_SETTINGS } from '@/lib/ai/types'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'
import { useStoreStore } from '@/stores'

interface ToolsTabProps {
  agent: AIAgent
  onUpdate: (updates: Partial<AIAgent>) => void
}

export default function ToolsTab({ agent, onUpdate }: ToolsTabProps) {
  // Mesmo padrão do SettingsTab: currentStore presente = loja Shopify conectada.
  const { currentStore } = useStoreStore()
  const hasStore = !!currentStore

  const settings = agent.settings || DEFAULT_SETTINGS
  const enabled = settings.tools?.enabled ?? []

  const toggleTool = (name: string) => {
    const next = enabled.includes(name)
      ? enabled.filter((n) => n !== name)
      : [...enabled, name]
    onUpdate({
      settings: { ...settings, tools: { enabled: next } },
    })
  }

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Wrench />
        </div>
        <div>
          <h3 className="sec-t">Ferramentas</h3>
          <p className="sec-s">Ações que a IA pode executar durante a conversa</p>
        </div>
      </div>

      <div className="callout">
        <Info className="w-4 h-4 flex-shrink-0" />
        <p>
          Ferramentas permitem que o agente aja de verdade: consultar pedidos, buscar
          produtos, transferir para um humano. Habilite apenas o que este agente
          precisa — menos ferramentas deixam as respostas mais rápidas e previsíveis.
          As mudanças valem após clicar em <strong>Salvar</strong>.
        </p>
      </div>

      {/* Lista de tools */}
      <div className="space-y-3">
        {TOOL_CATALOG.map((tool) => {
          const isOn = enabled.includes(tool.name)
          const missingStore = tool.requiresStore && !hasStore
          return (
            <div key={tool.name} className="rule-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      {tool.label}
                    </span>
                    <code className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {tool.name}
                    </code>
                    {tool.requiresStore && <span className="chip">Requer Shopify</span>}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                    {tool.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={`Ativar ${tool.label}`}
                  onClick={() => toggleTool(tool.name)}
                  className={`tog ${isOn ? 'on' : ''}`}
                />
              </div>
              {isOn && missingStore && (
                <div className="callout red" style={{ marginTop: 10 }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <p>
                    Nenhuma loja Shopify conectada nesta organização. A ferramenta fica
                    salva, mas o agente NÃO vai usá-la até uma loja ser conectada
                    (o sistema a omite automaticamente sem loja).
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="hint">
        {enabled.length === 0
          ? 'Nenhuma ferramenta habilitada — o agente apenas conversa, sem executar ações.'
          : `${enabled.length} ferramenta(s) habilitada(s).`}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Ligar a aba no `AIAgentEditor.tsx`**

2a. Adicionar `Wrench` ao import do lucide-react (bloco de linhas 5-26), logo após `Zap`:

```ts
import {
  X,
  Bot,
  Database,
  Zap,
  Wrench,
  Plug,
  UserCircle,
  Settings,
  History,
  Tag,
  Save,
  Loader2,
  ArrowLeft,
  Power,
  PowerOff,
  Trash2,
  MessageSquare,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
```

2b. Importar o componente junto dos outros tabs (após a linha 30, `import ActionsTab ...`):

```ts
import ToolsTab from './tabs/ToolsTab'
```

2c. Adicionar a entrada no array `tabs` (linhas 69-77), entre `actions` e `integrations`:

```ts
const tabs = [
  { id: 'persona', label: 'Persona', icon: UserCircle },
  { id: 'sources', label: 'Fontes', icon: Database },
  { id: 'actions', label: 'Ações', icon: Zap },
  { id: 'tools', label: 'Ferramentas', icon: Wrench },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'versions', label: 'Versões', icon: History },
  { id: 'annotation', label: 'Anotação', icon: Tag },
] as const
```

2d. Adicionar badge de contagem (junto dos outros, linhas ~437-440 — neste ponto `agent` já é não-nulo pelo early-return da linha 297):

```ts
if (tab.id === 'tools') {
  const enabledCount = agent.settings?.tools?.enabled?.length || 0
  badge = enabledCount > 0 ? `${enabledCount}` : ''
}
```

2e. Adicionar o bloco de render dentro do `<AnimatePresence mode="wait">` (após o bloco `activeTab === 'actions'`, linha ~494):

```tsx
{activeTab === 'tools' && (
  <motion.div
    key="tools"
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    className="h-full"
  >
    <ToolsTab agent={agent} onUpdate={updateAgent} />
  </motion.div>
)}
```

- [ ] **Step 3: Checagem estática**

Run: `npx tsc --noEmit` e `npm run lint`
Expected: sem erros novos (erros pré-existentes não relacionados podem ser ignorados; nenhum erro deve citar ToolsTab/AIAgentEditor/catalog/types).

- [ ] **Step 4: Verificação manual end-to-end da persistência**

1. `npm run dev` e logar no dashboard.
2. Abrir `/whatsapp/ai-agents` → clicar num agente existente → conferir que a aba **Ferramentas** aparece entre "Ações" e "Integrações".
3. Conferir que todos os 7 toggles aparecem desligados num agente antigo (campo ausente ⇒ `[]`).
4. Ligar `transfer_to_human` e `order_status` → botão **Salvar** habilita → clicar Salvar → toast "Agente salvo com sucesso!".
5. Recarregar a página e reabrir o agente: os 2 toggles continuam ligados e o badge da aba mostra `2`.
6. Confirmar no banco (SQL editor do Supabase):
   ```sql
   select id, name, settings->'tools' as tools
   from ai_agents
   where organization_id = '<SUA_ORG>'
   order by updated_at desc limit 5;
   ```
   Expected: `{"enabled": ["transfer_to_human", "order_status"]}` no agente salvo.
7. Sem loja Shopify conectada (trocar para uma org/loja sem Shopify, ou desconectar), ligar `order_status`: o callout vermelho "Nenhuma loja Shopify conectada" aparece; com loja conectada, só o chip "Requer Shopify" aparece.
8. Criar um agente novo pelo fluxo de criação e conferir no banco: `settings->'tools'` = `{"enabled": ["transfer_to_human"]}` (default da Task 1 via `DEFAULT_SETTINGS`).

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/tabs/ToolsTab.tsx src/components/agents/AIAgentEditor.tsx
git commit -m "feat(agents): aba Ferramentas no editor do agente (toggles de tools + aviso Shopify)"
```

---

### Task 4: Verificação end-to-end do runtime (tool dispara em produção)

**Files:**
- Modify: nenhum — auditoria confirmada em código: `src/lib/ai/cloud-runner.ts:286-308` JÁ monta o `toolContext` (`organizationId`, `conversationId`, `contactId`, `phone`, `storeId: conversation.store_id || account.store_id`, `accountId`, `agentId`) e o passa em `engine.processMessage({ ..., toolContext })`; `src/lib/ai/engine.ts:140-144` resolve `getActiveTools` e `engine.ts:195-241` roda `runToolLoop` (`src/lib/ai/tools/loop.ts`, maxIterations=4). Nenhuma task de código é necessária aqui — esta task é a prova de fogo em ambiente real.
- Test: verificação manual (fluxo live WhatsApp; não há harness de integração para o cloud-runner no repo)

**Interfaces:**
- Consumes: `settings.tools.enabled` gravado pela Task 3; tabela `agent_traces` (o cloud-runner grava 1 linha por resposta, incluindo `tool_calls` quando houver — ver header de `cloud-runner.ts:19`); `whatsapp_cloud_conversations.ai_enabled` (desligado pela `transfer_to_human`).
- Produces: evidência de que o pipeline UI → banco → runtime → tool-loop está fechado.

- [ ] **Step 1: Preparar o agente de teste**

Num ambiente com WhatsApp Cloud conectado e loja Shopify vinculada (a conversa ou a conta precisam ter `store_id` — é assim que `toolContext.storeId` é montado em `cloud-runner.ts:291`): abrir a aba Ferramentas (Task 3), habilitar `transfer_to_human` + `order_status`, salvar, e garantir que o agente está **Ativo**.

- [ ] **Step 2: Disparar `order_status` de verdade**

Do WhatsApp de um cliente de teste, enviar: `qual o status do pedido #1001?` (usar um número de pedido que exista em `shopify_orders` da org).
Expected: a resposta da IA cita o status real do pedido (pagamento/envio), não uma resposta genérica.

- [ ] **Step 3: Confirmar a tool-call nos traces**

No SQL editor do Supabase:

```sql
select created_at, tool_calls
from agent_traces
where organization_id = '<SUA_ORG>'
order by created_at desc
limit 3;
```

Expected: a linha mais recente tem `tool_calls` não-vazio contendo `"name": "order_status"` com `args`/`result`. (Nos logs do servidor também aparecem as entradas do tool-loop.)

- [ ] **Step 4: Confirmar `transfer_to_human`**

Enviar do cliente de teste: `quero falar com um atendente humano`.
Expected: a IA responde confirmando a transferência e para de responder. Confirmar no banco:

```sql
select ai_enabled, ai_disabled_reason
from whatsapp_cloud_conversations
where id = '<CONVERSATION_ID>';
```

Expected: `ai_enabled = false`, `ai_disabled_reason = 'transferred_to_human'`; e em `contact_activities` existe a atividade `type='agent_assigned'` com título "Transferido para atendimento humano (IA)".

- [ ] **Step 5: Regressão de agente sem tools**

Num segundo agente com todos os toggles desligados, enviar uma mensagem qualquer.
Expected: o agente responde normalmente pelo caminho `callAI` sem tool-loop (`agent_traces.tool_calls` vazio/nulo) — comprova que agentes existentes não mudaram de comportamento.

---

## Autocheck (executado na escrita do plano)

- **Cobertura da spec:** aba Ferramentas com toggles + descrição PT + aviso de dependência Shopify (Task 3); persistência de `settings.tools.enabled: string[]` pela rota PUT existente, verificada como já-permissiva — sem ajuste de filtro necessário (Global Constraints + Task 3); runtime com `toolContext` verificado como já montado no caminho live — sem task de código, com verificação E2E (Task 4); default `transfer_to_human` para agentes novos com justificativa e sem alterar agentes existentes (Task 1); teste unitário de `getActiveTools` (Task 1) e E2E manual do `order_status` nos logs (Task 4).
- **Placeholders:** nenhum — todo step tem código real ou comando/SQL executável com resultado esperado.
- **Consistência de nomes/tipos:** `AgentSettings.tools?: { enabled: string[] }` (Task 1) é exatamente o shape lido por `registry.ts:52` e escrito por `ToolsTab.toggleTool` (Task 3); `TOOL_CATALOG`/`ToolCatalogEntry` (Task 2) são os nomes importados na Task 3; paridade catálogo↔registry garantida por teste.
