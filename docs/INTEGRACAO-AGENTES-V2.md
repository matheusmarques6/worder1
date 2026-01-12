# 🔄 Instruções de Integração - Sistema de Agentes v2

## Opção 1: Substituir AIAgentList (Recomendado)

Para usar o novo fluxo de criação, atualize a página de agentes:

### Arquivo: `src/app/(dashboard)/whatsapp/ai-agents/page.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
// MUDANÇA: Importar versão atualizada
import AIAgentListUpdated from '@/components/agents/AIAgentListUpdated'
import { Loader2 } from 'lucide-react'

export default function AIAgentsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-900">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    )
  }

  if (!user || !user.organization_id) {
    router.push('/login')
    return null
  }

  const organizationId = user.organization_id as string

  return (
    <div className="h-full bg-zinc-900">
      {/* MUDANÇA: Usar versão atualizada */}
      <AIAgentListUpdated organizationId={organizationId} />
    </div>
  )
}
```

---

## Opção 2: Manter Ambas as Versões

Se preferir manter a versão antiga e adicionar a nova como alternativa:

```tsx
import { AIAgentList, AIAgentListUpdated } from '@/components/agents'

// No componente:
const [useNewFlow, setUseNewFlow] = useState(true)

return useNewFlow 
  ? <AIAgentListUpdated organizationId={orgId} />
  : <AIAgentList organizationId={orgId} />
```

---

## Arquivos Criados/Modificados

### Novos Arquivos:
```
src/lib/ai/templates/
├── types.ts
├── index.ts  
├── moda-feminina.ts
├── pet-shop.ts
├── fitness.ts
├── beleza.ts
├── delivery.ts
├── casa.ts
├── baby.ts
├── joias.ts
└── custom.ts

src/lib/ai/store-analyzer.ts
src/lib/shopify/api-service.ts

src/components/agents/
├── AIAgentListUpdated.tsx    # Versão com novo fluxo
└── create/
    ├── CreateAgentFlow.tsx    # Fluxo fullscreen
    ├── NicheCard.tsx          # Card de nicho
    ├── LivePreview.tsx        # Chat preview
    ├── StoreAnalyzer.tsx      # Analisador de loja
    ├── Skeletons.tsx          # Loading states
    ├── index.ts
    └── steps/
        ├── Step1Niche.tsx
        ├── Step2Personalize.tsx
        ├── Step3Knowledge.tsx
        ├── Step4Activate.tsx
        └── index.ts

src/components/ui/Toast.tsx
src/types/store-analysis.ts
src/app/api/ai/analyze-store/route.ts
supabase/migrations/store-analyses.sql
```

### Arquivos Modificados:
```
src/components/agents/index.ts  # Novos exports
```

---

## SQL Migration

Execute no Supabase antes do deploy:

```sql
-- Copie o conteúdo de supabase/migrations/store-analyses.sql
```

---

## Variáveis de Ambiente Necessárias

```env
# Já devem existir:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Para análise com IA (pelo menos um):
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

---

## Testando Localmente

1. Execute a migration SQL
2. Atualize a página de agentes
3. Clique em "Novo Agente"
4. Se tiver loja Shopify conectada, clique em "Analisar com IA"
5. Complete o fluxo de 4 passos

---

## Rollback

Se precisar voltar para versão antiga, basta:

```tsx
// Em page.tsx
import AIAgentList from '@/components/agents/AIAgentList' // Versão original
```
