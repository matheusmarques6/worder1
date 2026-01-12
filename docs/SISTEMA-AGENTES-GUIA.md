# 🚀 Sistema de Criação de Agentes de IA - Guia de Integração

## 📁 Arquivos Criados

### Etapa 1: Templates Nichados
```
src/lib/ai/templates/
├── types.ts              ✅ Tipos e interfaces
├── index.ts              ✅ Exports e funções utilitárias
├── moda-feminina.ts      ✅ 👗 Moda Feminina
├── pet-shop.ts           ✅ 🐕 Pet Shop
├── fitness.ts            ✅ 🏋️ Fitness & Suplementos
├── beleza.ts             ✅ 💄 Beleza & Cosméticos
├── delivery.ts           ✅ 🍔 Food Delivery
├── casa.ts               ✅ 🏠 Casa & Decoração
├── baby.ts               ✅ 👶 Baby & Kids
├── joias.ts              ✅ 💎 Joias & Acessórios
└── custom.ts             ✅ ⚙️ Personalizado
```

### Etapa 2: UI do Fluxo de Criação
```
src/components/agents/create/
├── CreateAgentFlow.tsx   ✅ Container principal fullscreen
├── NicheCard.tsx         ✅ Card de seleção de nicho
├── LivePreview.tsx       ✅ Preview de chat simulado
├── index.ts              ✅ Exports
└── steps/
    ├── Step1Niche.tsx    ✅ Seleção de nicho
    ├── Step2Personalize.tsx ✅ Personalização
    ├── Step3Knowledge.tsx   ✅ Base de conhecimento/FAQ
    ├── Step4Activate.tsx    ✅ Ativação
    └── index.ts             ✅ Exports
```

### Etapa 3: Backend/API
```
src/lib/shopify/
└── api-service.ts        ✅ Cliente API Shopify

src/lib/ai/
└── store-analyzer.ts     ✅ Análise de loja com IA

src/app/api/ai/
└── analyze-store/
    └── route.ts          ✅ API de análise

src/types/
└── store-analysis.ts     ✅ Tipos de análise

supabase/migrations/
└── store-analyses.sql    ✅ Migração SQL
```

---

## 🔧 Como Integrar

### 1. Executar Migração SQL

Execute no Supabase SQL Editor:
```sql
-- Copiar conteúdo de supabase/migrations/store-analyses.sql
```

### 2. Usar o Novo Fluxo

```tsx
import { CreateAgentFlow } from '@/components/agents/create';

function AgentsPage() {
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  
  return (
    <>
      <button onClick={() => setShowCreateFlow(true)}>
        Criar Agente
      </button>
      
      {showCreateFlow && (
        <CreateAgentFlow
          organizationId="org-id"
          storeId="shopify-store-id" // opcional
          onClose={() => setShowCreateFlow(false)}
          onSuccess={(agentId) => {
            console.log('Agente criado:', agentId);
            setShowCreateFlow(false);
          }}
        />
      )}
    </>
  );
}
```

### 3. Usar Templates Diretamente

```tsx
import { 
  ALL_TEMPLATES,
  getTemplateById,
  generatePromptFromTemplate,
} from '@/lib/ai/templates';

// Listar todos os templates
console.log(ALL_TEMPLATES);

// Buscar por ID
const template = getTemplateById('moda-feminina');

// Gerar prompt
const result = generatePromptFromTemplate(template, {
  templateId: 'moda-feminina',
  agentName: 'Assistente',
  customFieldValues: {
    storeName: 'Minha Loja',
    storeDescription: 'Loja de moda feminina',
  },
  persona: {
    tone: 'friendly',
    responseLength: 'medium',
    replyDelay: 3,
  },
  selectedFAQ: [],
  enabledActions: [],
});

console.log(result.systemPrompt);
console.log(result.guidelines);
console.log(result.greeting);
```

### 4. Analisar Loja

```tsx
// Via API
const response = await fetch('/api/ai/analyze-store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ storeId: 'uuid-da-loja' }),
});

const { analysis } = await response.json();
console.log(analysis.detectedNiche);
console.log(analysis.suggestedTemplate);
console.log(analysis.scores);
```

---

## 📊 Fluxo do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. USUÁRIO ABRE O FLUXO                                       │
│     └─> CreateAgentFlow.tsx                                    │
│                                                                 │
│  2. STEP 1: SELEÇÃO DE NICHO                                   │
│     ├─> Mostra grid de 9 templates                             │
│     ├─> Se tem loja Shopify: botão "Analisar Loja"            │
│     │   └─> POST /api/ai/analyze-store                         │
│     │       └─> ShopifyAPIService.collectAllData()             │
│     │           └─> store-analyzer.runFullAnalysis()           │
│     │               └─> Retorna StoreAnalysis                  │
│     └─> Auto-seleciona template sugerido                       │
│                                                                 │
│  3. STEP 2: PERSONALIZAÇÃO                                     │
│     ├─> Preenche campos do template                            │
│     ├─> Se tem análise: preenche automaticamente               │
│     └─> Seleciona tom de voz e tamanho de resposta            │
│                                                                 │
│  4. STEP 3: BASE DE CONHECIMENTO                               │
│     ├─> Mostra FAQ sugerido (template ou análise)              │
│     ├─> Permite ativar/desativar perguntas                     │
│     └─> Permite adicionar perguntas personalizadas             │
│                                                                 │
│  5. STEP 4: ATIVAÇÃO                                           │
│     ├─> Resume configurações                                    │
│     ├─> Escolhe: ativar agora ou criar inativo                │
│     ├─> Seleciona canais WhatsApp                              │
│     └─> POST /api/ai/agents                                    │
│         └─> Cria agente com prompt gerado                      │
│                                                                 │
│  6. SUCESSO                                                     │
│     └─> Mostra ID do agente e links para editar               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Customização

### Adicionar Novo Template

1. Criar arquivo em `src/lib/ai/templates/`:

```typescript
// src/lib/ai/templates/meu-nicho.ts
import { NicheTemplate } from './types';

export const meuNichoTemplate: NicheTemplate = {
  id: 'meu-nicho',
  name: 'Meu Nicho',
  description: 'Descrição do nicho',
  icon: '🎯',
  color: '#3b82f6',
  category: 'ecommerce',
  subcategory: 'custom',
  tags: ['tag1', 'tag2'],
  
  persona: {
    tone: 'friendly',
    responseLength: 'medium',
    language: 'pt-BR',
    replyDelay: 3,
    vocabulary: [],
    emojis: ['😊'],
    greetings: ['Olá! Como posso ajudar?'],
    voiceDescription: 'Tom amigável e prestativo.',
  },
  
  promptTemplate: `...`,
  defaultGuidelines: [],
  suggestedFAQ: [],
  defaultActions: [],
  customFields: [],
  recommendedIntegrations: [],
};
```

2. Adicionar ao `index.ts`:

```typescript
import { meuNichoTemplate } from './meu-nicho';

export const ALL_TEMPLATES: NicheTemplate[] = [
  // ... outros
  meuNichoTemplate,
];
```

---

## ✅ Checklist de Deploy

- [ ] Executar migração SQL `store-analyses.sql`
- [ ] Verificar variáveis de ambiente:
  - `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Testar análise de loja com loja Shopify real
- [ ] Testar criação de agente
- [ ] Verificar se agente responde no WhatsApp

---

## 📝 Notas

- O sistema usa Anthropic (Claude) como IA primária e OpenAI como fallback
- A análise de loja demora 15-30 segundos
- FAQ pode ser editado manualmente após geração automática
- LivePreview é simulado (não usa IA real)
