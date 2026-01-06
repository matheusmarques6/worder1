# Correção Multi-Tenant: Agentes WhatsApp + Erro Reduce

## Problemas Corrigidos

### 1. Agentes misturados entre lojas
Os agentes do WhatsApp estavam aparecendo em todas as lojas porque só filtravam por `organization_id`.

### 2. Erro "s.reduce is not a function"
Ocorria quando arrays estavam `undefined` durante a troca de lojas.

---

## Instruções de Instalação

### Passo 1: Execute o SQL no Supabase

Execute o arquivo `MIGRACAO-AGENTES.sql` no SQL Editor do Supabase:

```sql
-- Adiciona coluna store_id nas tabelas de agentes
-- Migra dados existentes para Oak Vintage
```

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para a raiz do seu projeto, substituindo os arquivos existentes.

### Passo 3: Deploy

```bash
git add .
git commit -m "fix: separar agentes por loja + corrigir erro reduce"
git push
```

---

## Arquivos Modificados

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── crm/
│   │   │   └── page.tsx                    # Proteção reduce
│   │   └── whatsapp/
│   │       └── components/
│   │           └── AgentsTab.tsx           # Filtrar por storeId
│   └── api/
│       └── whatsapp/
│           └── agents/
│               └── route.ts                # Filtrar por storeId
├── components/
│   ├── crm/
│   │   └── index.tsx                       # Proteção reduce
│   └── agents/
│       ├── CreateAgentWizard.tsx           # Incluir store_id
│       └── AIAgentList.tsx                 # Proteção reduce
└── hooks/
    ├── useAgents.ts                        # Filtrar por storeId
    └── useAgent.ts                         # Proteção reduce

MIGRACAO-AGENTES.sql                        # SQL para adicionar store_id
```

---

## O que foi alterado

### API de Agentes (`src/app/api/whatsapp/agents/route.ts`)
- GET: Agora filtra por `storeId` quando fornecido
- POST: Salva `store_id` ao criar agente

### Hook useAgents (`src/hooks/useAgents.ts`)
- Importa `useStoreStore` para obter loja atual
- Envia `storeId` nas requisições
- Recarrega quando loja muda
- Protege contra arrays undefined

### AgentsTab (`src/app/(dashboard)/whatsapp/components/AgentsTab.tsx`)
- Obtém `storeId` do `useStoreStore`
- Passa `storeId` para API e CreateAgentWizard
- Recarrega quando loja muda

### CreateAgentWizard (`src/components/agents/CreateAgentWizard.tsx`)
- Recebe `storeId` como prop
- Inclui `store_id` ao criar agente

---

## Comportamento Esperado

Após aplicar as correções:

1. **Oak Vintage**: Mostra apenas agentes da Oak Vintage
2. **San Martin**: Mostra apenas agentes da San Martin
3. **Novos agentes**: São criados automaticamente na loja selecionada
4. **Trocar de loja**: Agentes recarregam automaticamente
