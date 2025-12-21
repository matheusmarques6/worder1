# 🤖 Sistema de AI Agents - Estilo Kommo

## 📦 Conteúdo do Pacote

Este pacote contém o sistema completo de AI Agents com:
- Knowledge Base (RAG com embeddings)
- Ações Condicionais (detecção de intenção/sentimento)
- Integrações E-commerce (Shopify, WooCommerce, Nuvemshop)
- Persona Configurável (tom, idioma, diretrizes)
- Configurações Avançadas (horários, canais, pipelines)

---

## 🗂️ Estrutura do Pacote

```
ai-agents-completo/
├── sql/
│   ├── ai-agents-complete-migration.sql  # Tabelas principais
│   ├── ai-agents-functions.sql           # Funções SQL
│   └── ai-agents-stored-procedures.sql   # Stored procedures
│
├── src/
│   ├── app/
│   │   ├── api/ai/
│   │   │   ├── agents/                   # CRUD de agentes
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── sources/          # Fontes de conhecimento
│   │   │   │       ├── actions/          # Regras condicionais
│   │   │   │       ├── integrations/     # E-commerce
│   │   │   │       └── test/             # Testar agente
│   │   │   └── process/document/         # Processar documentos
│   │   │
│   │   └── (dashboard)/whatsapp/ai-agents/
│   │       └── page.tsx                  # Página principal
│   │
│   ├── components/agents/
│   │   ├── AIAgentList.tsx               # Lista de agentes
│   │   ├── AIAgentEditor.tsx             # Editor (drawer lateral)
│   │   ├── CreateAgentModal.tsx          # Modal de criação
│   │   ├── AgentPreview.tsx              # Preview de teste
│   │   ├── ModelSelector.tsx             # Seletor de modelo
│   │   └── tabs/
│   │       ├── SourcesTab.tsx            # Tab de fontes
│   │       ├── ActionsTab.tsx            # Tab de ações
│   │       ├── IntegrationsTab.tsx       # Tab de integrações
│   │       ├── PersonaTab.tsx            # Tab de persona
│   │       └── SettingsTab.tsx           # Tab de configurações
│   │
│   └── lib/ai/
│       ├── engine.ts                     # Motor principal
│       ├── rag.ts                        # Busca semântica
│       ├── intent-detector.ts            # Detecção de intenção
│       ├── sentiment-analyzer.ts         # Análise de sentimento
│       ├── actions-engine.ts             # Executor de ações
│       ├── embeddings.ts                 # Gerador de embeddings
│       ├── prompt-builder.ts             # Construtor de prompts
│       └── types.ts                      # Tipos TypeScript
```

---

## 🚀 Instalação Passo a Passo

### PASSO 1: Executar SQL no Supabase

Acesse o Supabase SQL Editor e execute na ordem:

```sql
-- 1. Primeiro, habilitar pgvector (se não estiver)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Executar ai-agents-complete-migration.sql
-- (copia todo o conteúdo do arquivo e executa)

-- 3. Executar ai-agents-functions.sql

-- 4. Executar ai-agents-stored-procedures.sql
```

### PASSO 2: Copiar Arquivos para o Projeto

```bash
# Na raiz do projeto Worder
# Copiar lib/ai (backend)
cp -r ai-agents-completo/src/lib/ai/ src/lib/

# Copiar API routes
cp -r ai-agents-completo/src/app/api/ai/* src/app/api/ai/

# Copiar componentes
cp -r ai-agents-completo/src/components/agents/* src/components/agents/

# Copiar página
mkdir -p src/app/\(dashboard\)/whatsapp/ai-agents
cp ai-agents-completo/src/app/\(dashboard\)/whatsapp/ai-agents/page.tsx src/app/\(dashboard\)/whatsapp/ai-agents/
```

### PASSO 3: Adicionar Link no Menu/Sidebar

Edite o arquivo do Sidebar para adicionar link para `/whatsapp/ai-agents`.

### PASSO 4: Reiniciar o Servidor

```bash
npm run dev
```

---

## 🔧 Configuração de API Keys

O sistema precisa de API keys para funcionar:

1. **OpenAI** - Para embeddings e respostas
2. **Anthropic** (opcional) - Claude como alternativa
3. **Google** (opcional) - Gemini
4. **Groq** (opcional) - Llama, Mixtral

Configure em Settings → API Keys.

---

## 📱 Como Usar

### 1. Criar Agente
- Vá para WhatsApp → AI Agents
- Clique em "Novo Agente"
- Configure nome, modelo e sistema prompt básico

### 2. Adicionar Fontes de Conhecimento
- Tab "Fontes"
- Adicione URLs, arquivos ou texto
- Aguarde processamento

### 3. Configurar Ações
- Tab "Ações"
- Crie regras: QUANDO X acontecer, FAZER Y
- Exemplos:
  - Quando cliente frustrado → Transferir para humano
  - Quando perguntar preço → Usar fonte "Tabela de Preços"
  - Quando quiser comprar → Pedir email

### 4. Personalizar Persona
- Tab "Persona"
- Configure tom de voz
- Adicione diretrizes

### 5. Testar
- Clique em "Preview"
- Envie mensagens de teste
- Verifique se está respondendo corretamente

---

## ⚠️ Troubleshooting

### Erro: pgvector not found
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Erro: Tabela não existe
Execute o SQL migration completo novamente.

### Erro: API key inválida
Verifique se a API key está configurada em Settings → API Keys.

### Erro: CORS
Verifique se o domínio está liberado no Supabase.

---

## 🔄 Diferenças do Sistema Antigo

| Feature | Sistema Antigo | Sistema Novo |
|---------|---------------|--------------|
| Knowledge Base | ❌ | ✅ RAG com pgvector |
| Intent Detection | ❌ | ✅ Detecta intenção |
| Sentiment Analysis | ❌ | ✅ Detecta sentimento |
| Conditional Actions | ❌ | ✅ Regras when/do |
| E-commerce | ❌ | ✅ Shopify, etc |
| Persona | Básico | ✅ Completo |
| Horários | ❌ | ✅ Agendamento |
| Preview | ❌ | ✅ Testar em tempo real |

---

## 📞 Suporte

Se tiver problemas, verifique:
1. Logs do console (F12)
2. Logs do Supabase
3. Status das API keys
