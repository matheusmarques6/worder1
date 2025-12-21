# 📦 AI Agents - Correções e Integrações

## 🗂️ Estrutura do ZIP

```
ai-agents-correcoes/
├── docs/
│   ├── ANALISE-CODIGO-AI-AGENTS.md      # Relatório completo da análise
│   └── INTEGRACAO-FRONTEND-BACKEND.md   # Documentação de integração
│
└── src/
    ├── types/
    │   ├── ai-agents.ts    # ✅ NOVO - Tipos compartilhados
    │   └── index.ts        # 🔄 ATUALIZADO - Re-export dos tipos
    │
    ├── hooks/
    │   ├── useAgent.ts     # ✅ NOVO - Hooks para gerenciar agentes
    │   └── index.ts        # 🔄 ATUALIZADO - Export do useAgent
    │
    └── lib/
        └── whatsapp/
            └── ai-providers.ts  # 🔄 ATUALIZADO - Suporte a Groq
```

## 🚀 Instruções de Instalação

### 1. Extrair o ZIP na raiz do projeto

```bash
# Na raiz do seu projeto (onde está o package.json)
unzip ai-agents-correcoes.zip -d .
```

Os arquivos serão colocados automaticamente nas pastas corretas:
- `src/types/ai-agents.ts`
- `src/types/index.ts` (será substituído)
- `src/hooks/useAgent.ts`
- `src/hooks/index.ts` (será substituído)
- `src/lib/whatsapp/ai-providers.ts` (será substituído)

### 2. Verificar se não há conflitos

Se você modificou os arquivos `index.ts`, faça merge manual:

```bash
# Para ver diferenças
diff src/types/index.ts ai-agents-correcoes/src/types/index.ts
diff src/hooks/index.ts ai-agents-correcoes/src/hooks/index.ts
```

### 3. Reiniciar o servidor de desenvolvimento

```bash
npm run dev
# ou
yarn dev
```

---

## 📝 O que foi corrigido

### ✅ Problemas Críticos Resolvidos

1. **Tipos Duplicados**
   - Criado arquivo central `src/types/ai-agents.ts`
   - Todos os tipos agora são importados de um único lugar

2. **Provider Groq Faltando**
   - Adicionado suporte completo ao Groq em `ai-providers.ts`
   - Adicionado `google` como alias para `gemini`

3. **Código Duplicado**
   - Criado `useAgent()` hook para gerenciar agente único
   - Criado `useAgentsList()` hook para lista de agentes

---

## 🔧 Próximos Passos (Opcional)

### Atualizar imports nos componentes

Após instalar, você pode atualizar os imports nos componentes:

```typescript
// ANTES (em AIAgentEditor.tsx, tabs/*.tsx)
import { AIAgent, AgentSource } from '../AIAgentEditor'

// DEPOIS
import type { 
  AIAgent, 
  AgentSource, 
  AgentAction 
} from '@/types/ai-agents'
```

### Usar os novos hooks

```typescript
// ANTES
const [agent, setAgent] = useState(null)
const [loading, setLoading] = useState(true)

useEffect(() => {
  fetch(`/api/ai/agents/${id}`)
    .then(res => res.json())
    .then(data => {
      setAgent(data.agent)
      setLoading(false)
    })
}, [id])

// DEPOIS
import { useAgent } from '@/hooks'

const { 
  agent, 
  sources,
  actions,
  loading, 
  error,
  saveAgent,
  addSource,
  testAgent 
} = useAgent(agentId, organizationId)
```

---

## 📋 Checklist Pós-Instalação

- [ ] Arquivos extraídos nas pastas corretas
- [ ] Servidor reiniciado sem erros
- [ ] Página de Agentes IA carrega normalmente
- [ ] Criar novo agente funciona
- [ ] Adicionar fonte funciona
- [ ] Testar agente funciona
- [ ] Provider Groq aparece na lista

---

## 🆘 Problemas?

Se encontrar erros de TypeScript:

```bash
# Limpar cache
rm -rf .next
rm -rf node_modules/.cache

# Reinstalar dependências
npm install

# Reiniciar
npm run dev
```

Se o erro persistir, verifique se o `tsconfig.json` tem o path `@/`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```
