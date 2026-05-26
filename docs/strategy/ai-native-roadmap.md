# Roadmap AI-Native — Worder

> Estratégia para transformar a Worder em plataforma AI-native de WhatsApp
> Data: Maio 2026 | Versão: 1.0

---

## 1. O Que Significa "AI-Native" para a Worder

AI-native **não** é adicionar um chatbot. É redesenhar a plataforma para que inteligência artificial seja o motor de decisão em cada ponto de contato:

| Camada | Hoje (regras manuais) | AI-Native |
|--------|----------------------|-----------|
| **Segmentação** | Filtros manuais (cidade, tag, último pedido) | Clustering automático por comportamento + propensão de compra |
| **Conteúdo** | Template fixo preenchido pelo usuário | Template gerado/otimizado por AI com variantes personalizadas |
| **Timing** | Horário fixo escolhido pelo usuário | Send-time optimization por contato (ML por histórico de abertura) |
| **Atendimento** | Fluxo de bot com regras IF/THEN | Agente AI conversacional com contexto de CRM |
| **Análise** | Dashboard de métricas históricas | Predição de churn, recomendação de ação, alertas proativos |
| **Pricing** | Plano fixo mensal | Pricing dinâmico por ROI do cliente (price-to-value) |

**Visão:** Cada organização na Worder tem um "copilot" que sugere, executa, e aprende continuamente.

---

## 2. Roadmap de Features AI

### Fase AI-1: Fundação (2–3 meses)

| Feature | Descrição | Impacto |
|---------|-----------|---------|
| **Template Optimizer** | AI sugere melhorias no texto do template antes do envio. Analisa taxa de resposta de templates similares e propõe variantes. | Aumenta taxa de resposta em 10–20% |
| **Smart Reply Suggestions** | No inbox, sugere 3 respostas contextuais baseadas no histórico do contato + conversa atual. | Reduz tempo de resposta do agente em 40% |
| **Conversation Summary** | Resume automaticamente conversas longas quando agente assume atendimento. | Elimina 5–10 min de leitura por handoff |
| **Sentiment Analysis** | Classifica sentimento (positivo/neutro/negativo/urgente) em tempo real. Escala P1 automaticamente. | Reduz tempo de detecção de crise |

### Fase AI-2: Otimização (3–4 meses)

| Feature | Descrição | Impacto |
|---------|-----------|---------|
| **Send-Time Optimization** | ML prevê o melhor horário de envio por contato baseado em histórico de leitura. | Aumenta open rate em 15–25% |
| **Audience AI** | Sugere segmentos automaticamente ("clientes que compraram X e não abriram nos últimos 30 dias"). | Reduz tempo de criação de campanha de 30min para 2min |
| **Quality Score Predictor** | Prevê se uma campanha vai degradar quality score antes do envio. Bloqueia envios arriscados. | Previne suspensão de WABA |
| **Churn Predictor** | Identifica contatos com alta probabilidade de churn 30 dias antes. Sugere campanha de retenção. | Reduz churn de clientes finais em 10–15% |

### Fase AI-3: Agentes Autônomos (4–6 meses)

| Feature | Descrição | Impacto |
|---------|-----------|---------|
| **AI Sales Agent** | Agente que conduz conversa de venda completa: qualificação → recomendação → objeção → checkout. | Converte leads sem agente humano |
| **AI Support Agent** | Resolve tickets de suporte usando knowledge base + histórico do cliente. Escala para humano quando confiança < threshold. | Resolve 60–70% dos tickets automaticamente |
| **Campaign Autopilot** | AI cria, segmenta, agenda, e envia campanhas automaticamente baseado em objetivos do negócio. | Elimina necessidade de operador de marketing |
| **Flow Generator** | Dado um objetivo ("recuperar carrinho abandonado"), AI gera o WhatsApp Flow completo com lógica e templates. | Reduz criação de flow de horas para minutos |

---

## 3. Stack Técnico

### 3.1 Modelo de LLM

| Caso de uso | Modelo recomendado | Justificativa |
|-------------|-------------------|---------------|
| Geração de texto (templates, respostas) | Claude Sonnet 4 | Melhor qualidade em português, custo-benefício |
| Análise de sentimento / classificação | Claude Haiku | Rápido, barato, suficiente para classificação |
| Agentes conversacionais | Claude Sonnet 4 | Precisa de reasoning + tool use |
| Embeddings (busca semântica) | Voyage AI ou OpenAI text-embedding-3-small | Custo baixo, boa qualidade |
| Send-time optimization | Modelo próprio (XGBoost/LightGBM) | Dados tabulares, não precisa de LLM |
| Churn prediction | Modelo próprio (logistic regression → XGBoost) | Dados tabulares internos |

### 3.2 Arquitetura

```
┌─────────────────────────────────────────────┐
│                  Frontend                     │
│  (Next.js — AI suggestions inline no inbox)   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│              API Layer                        │
│  /api/ai/suggest-reply                       │
│  /api/ai/optimize-template                   │
│  /api/ai/analyze-sentiment                   │
│  /api/ai/predict-send-time                   │
│  /api/ai/generate-flow                       │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│           AI Orchestration Layer              │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Prompt  │ │ Context  │ │   Tool Use   │  │
│  │ Manager │ │ Builder  │ │  (Supabase,  │  │
│  │         │ │ (CRM +   │ │  Shopify,    │  │
│  │         │ │  history) │ │  etc.)       │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│           LLM Providers                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Anthropic│  │ OpenAI   │  │  Voyage   │  │
│  │ (Claude) │  │(embeddings│  │(embeddings│  │
│  │          │  │ fallback) │  │ primary)  │  │
│  └──────────┘  └──────────┘  └───────────┘  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│          Feature Store (Supabase)             │
│  - Embedding cache (pgvector)                │
│  - Prediction cache                          │
│  - Interaction logs (feedback loop)          │
│  - Model performance metrics                 │
└─────────────────────────────────────────────┘
```

### 3.3 Dependências Técnicas

| Componente | Tecnologia | Custo estimado |
|------------|-----------|----------------|
| LLM API | Anthropic Claude | ~USD 0.003/interação (Sonnet) |
| Embeddings | Voyage AI | ~USD 0.0001/embedding |
| Vector store | pgvector (Supabase) | Incluído no plano |
| ML Models | Python (scikit-learn, XGBoost) | Self-hosted (custo de compute) |
| Feature store | Supabase tables + materialized views | Incluído no plano |
| Cron jobs | Vercel Cron ou Supabase pg_cron | Incluído |

---

## 4. Modelo de Custo

### 4.1 Custo por Interação AI

| Operação | Tokens (input + output) | Custo (USD) |
|----------|------------------------|-------------|
| Smart reply (3 sugestões) | ~1.500 tokens | $0.005 |
| Template optimization | ~2.000 tokens | $0.007 |
| Conversation summary | ~3.000 tokens | $0.010 |
| Sentiment analysis | ~500 tokens | $0.001 |
| AI agent (conversa completa, ~10 turns) | ~15.000 tokens | $0.050 |
| Flow generation | ~5.000 tokens | $0.017 |

### 4.2 Custo Mensal por Cliente (Estimativa)

| Perfil do cliente | Interações AI/mês | Custo AI/mês | % do ticket |
|-------------------|--------------------|-------------|-------------|
| PME (500 msgs/mês) | ~200 | USD 1.00 | 1–2% |
| Médio (5.000 msgs/mês) | ~2.000 | USD 10.00 | 3–5% |
| Enterprise (50.000 msgs/mês) | ~15.000 | USD 75.00 | 2–4% |
| Heavy AI user (agentes ativos) | ~50.000 | USD 250.00 | 5–8% |

### 4.3 Estratégia de Pricing AI

```
Opção A: Incluído no plano (margem absorve)
  ├── Prós: Simples, diferenciação, todos usam
  └── Contras: Margem comprime em heavy users

Opção B: Add-on mensal (R$ 99–499/mês)
  ├── Prós: Receita incremental, custo coberto
  └── Contras: Adoção menor, feature wall frustra

Opção C: Freemium + usage-based (RECOMENDADO)
  ├── Incluído: Smart replies, sentiment, summary (baixo custo)
  ├── Pago: AI agents, autopilot, flow generator (alto custo)
  ├── Pricing: R$ 0.02–0.05 por interação AI premium
  └── Cap mensal: limite por plano para previsibilidade
```

**Recomendação:** Opção C. Features de baixo custo AI ficam gratuitas (diferenciação), features caras são pay-per-use com cap.

---

## 5. Build vs Buy

| Componente | Build | Buy | Recomendação |
|------------|-------|-----|-------------|
| **LLM (text generation)** | Treinar modelo próprio | API Claude/GPT | **Buy** — custo de treino é proibitivo, qualidade das APIs é superior |
| **Embeddings** | Treinar com dados próprios | Voyage/OpenAI API | **Buy** — modelos genéricos são bons o suficiente para início |
| **Prompt engineering** | Interno | Consultor | **Build** — é diferencial competitivo, precisa de domínio do negócio |
| **Send-time optimization** | Modelo próprio (XGBoost) | Ferramenta de terceiro | **Build** — dados são proprietários, modelo simples |
| **Churn prediction** | Modelo próprio | Ferramenta de analytics | **Build** — mesma razão acima |
| **AI agent framework** | Framework próprio | LangChain/CrewAI | **Buy (framework) + Build (lógica)** — usar framework, customizar flows |
| **Vector store** | pgvector no Supabase | Pinecone/Weaviate | **Build (pgvector)** — já temos Supabase, custo zero adicional |
| **Evaluation/testing** | Framework próprio | Braintrust/Promptfoo | **Buy** — eval é complexo, ferramentas existentes são maduras |

---

## 6. Framework de Avaliação

### 6.1 Métricas por Feature AI

| Feature | Métrica primária | Target | Como medir |
|---------|-----------------|--------|------------|
| Smart Reply | Taxa de aceitação da sugestão | ≥ 30% | Clicks em sugestão / total de sugestões exibidas |
| Template Optimizer | Delta na taxa de resposta | +10% | A/B test: original vs otimizado |
| Conversation Summary | Tempo de handoff | -40% | Tempo entre atribuição e primeira resposta do agente |
| Sentiment Analysis | Precisão de classificação | ≥ 85% | Amostra manual + feedback do agente |
| Send-Time Optimization | Delta no open rate | +15% | A/B test: horário fixo vs AI |
| AI Sales Agent | Taxa de conversão | ≥ 5% | Vendas atribuídas ao agente / total de conversas |
| AI Support Agent | Resolução sem humano | ≥ 60% | Tickets resolvidos por AI / total de tickets |

### 6.2 Guardrails

| Risco | Guardrail | Implementação |
|-------|-----------|---------------|
| AI envia mensagem inadequada | Review humano obrigatório para ações irreversíveis | Flag `requires_approval` em ações de envio |
| Custo AI dispara | Budget cap por organização/mês | Hard limit no billing engine |
| Hallucination em suporte | Resposta apenas com dados confirmados do CRM | System prompt + retrieval-only mode |
| Privacidade (LGPD) | Não enviar PII para LLM desnecessariamente | Redação de dados sensíveis antes da chamada API |
| Dependência de provider | Abstração de LLM provider | Interface unificada, fallback para outro provider |
| Qualidade degrada silenciosamente | Monitoring contínuo | Dashboard de métricas AI + alertas de degradação |

### 6.3 Ciclo de Feedback

```
1. Feature AI faz predição/sugestão
2. Usuário aceita, edita, ou rejeita
3. Feedback é logado (accepted/edited/rejected + edit_diff)
4. Pipeline semanal analisa feedback
5. Prompts são ajustados (prompt versioning)
6. Métricas são recalculadas
7. Alertas se métrica cai abaixo do threshold
```

---

## 7. Timeline e Investimento

| Fase | Duração | Equipe | Custo (USD) |
|------|---------|--------|-------------|
| AI-1: Fundação | 2–3 meses | 1 dev senior + 0.5 designer | 15.000–25.000 |
| AI-2: Otimização | 3–4 meses | 1 dev senior + 1 ML engineer | 25.000–40.000 |
| AI-3: Agentes | 4–6 meses | 2 devs + 1 ML engineer | 50.000–80.000 |
| **Total** | **9–13 meses** | **Pico: 3 pessoas** | **USD 90.000–145.000** |

**Nota:** Custos de API (LLM) estimados em USD 500–2.000/mês adicionais dependendo do volume.

---

## 8. Quick Wins (Implementáveis em < 2 Semanas)

Se quiser começar a validar AI sem investimento pesado:

1. **Conversation Summary** — Chamar Claude API com contexto da conversa, exibir no inbox. ~3 dias de dev.
2. **Sentiment Badge** — Classificar última mensagem recebida como 🔴🟡🟢. ~2 dias de dev.
3. **Template Suggestions** — Botão "melhorar com AI" no template editor. ~4 dias de dev.

Esses 3 quick wins custam ~USD 200/mês em API e podem ser lançados como beta para validar interesse.

---

*Documento gerado como parte da Fase 7 — Expansão Estratégica da Worder.*
