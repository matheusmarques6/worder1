# Enterprise Playbook — Worder

> Guia para venda e operação de contas enterprise
> Data: Maio 2026 | Versão: 1.0

---

## 1. Perfil do Cliente-Alvo

### 1.1 Ideal Customer Profile (ICP)

| Critério | Faixa |
|----------|-------|
| Faturamento anual | R$ 10M–500M |
| Funcionários | 50–2.000 |
| Volume WhatsApp | > 100.000 msgs/mês |
| Segmento | E-commerce, Varejo, Saúde, Educação, Serviços Financeiros |
| Maturidade digital | Já usa CRM ou ferramenta de automação |
| Dor principal | Atendimento fragmentado, sem visão unificada, custo alto de BSP |
| Geografia | Brasil (SP, RJ, MG, RS, PR como foco inicial) |

### 1.2 Sinais de Qualificação

- Usa WhatsApp Business API via BSP (Gupshup, 360Dialog, Zenvia)
- Tem equipe de atendimento/vendas > 10 pessoas
- Gasta > R$ 5.000/mês com WhatsApp messaging
- Está insatisfeito com ferramenta atual (churn risk de concorrente)
- Tem e-commerce com > 10.000 pedidos/mês
- Busca integração com Shopify/VTEX/Nuvemshop

### 1.3 Anti-patterns (Não Perseguir)

- Empresas que querem apenas chatbot simples (competir com ManyChat é race to bottom)
- Startups pre-revenue sem orçamento definido
- Empresas com restrições de dados que impedem cloud (ex: governo)
- Volume < 10.000 msgs/mês (self-service é melhor fit)

---

## 2. Processo de Vendas

### 2.1 Funil Enterprise

```
Etapa 1: Prospecção (Semana 1–2)
  ├── Outbound: LinkedIn + email personalizado
  ├── Inbound: Trial self-service que escala para demo
  └── Referral: Indicação de clientes existentes (programa de referral)

Etapa 2: Qualificação (Semana 2–3)
  ├── Call de discovery (30 min) — mapear dores, volume, stack atual
  ├── Scoring: BANT (Budget, Authority, Need, Timeline)
  └── Gate: Score ≥ 7/10 para avançar

Etapa 3: Demo Técnica (Semana 3–4)
  ├── Demo personalizada (45 min) — usar dados do prospect
  ├── POC: Configurar sandbox com dados reais do cliente (opcional)
  └── Envolver time técnico do prospect se necessário

Etapa 4: Proposta (Semana 4–5)
  ├── Proposta comercial com pricing customizado
  ├── ROI calculator — mostrar economia vs BSP atual
  └── Security questionnaire respondido

Etapa 5: Negociação (Semana 5–7)
  ├── Ajustes de pricing/SLA
  ├── Revisão jurídica (DPA, contrato)
  └── Aprovação interna do prospect

Etapa 6: Fechamento (Semana 7–8)
  ├── Assinatura de contrato
  ├── Kickoff de implementação
  └── Handoff para Customer Success
```

**Ciclo médio:** 6–8 semanas (pode ser 3–4 semanas com urgência do prospect)

### 2.2 Métricas do Funil

| Métrica | Target |
|---------|--------|
| Leads qualificados/mês | 20 |
| Taxa de conversão lead → demo | 40% |
| Taxa de conversão demo → proposta | 60% |
| Taxa de conversão proposta → fechamento | 50% |
| Ticket médio (ACV) | R$ 36.000–120.000/ano |
| Ciclo de vendas | ≤ 8 semanas |
| CAC enterprise | ≤ R$ 5.000 |

---

## 3. Gaps de Produto para Enterprise

### 3.1 Must-Have (Bloqueia venda se não tiver)

| Feature | Prioridade | Estimativa | Status |
|---------|-----------|------------|--------|
| **SSO (SAML/OIDC)** | P0 | 3–4 semanas | ❌ Não existe |
| **Audit Log** | P0 | 2–3 semanas | ❌ Não existe |
| **Multi-organização** | P0 | 4–6 semanas | 🟡 Parcial (multi-tenant existe, mas sem visão holding) |
| **SLA contratual** | P0 | 1 semana (docs) | ❌ Não formalizado |
| **Roles granulares (RBAC)** | P1 | 3–4 semanas | 🟡 Parcial (admin/member existe) |

### 3.2 Nice-to-Have (Diferencial competitivo)

| Feature | Prioridade | Estimativa | Status |
|---------|-----------|------------|--------|
| **White-label** | P2 | 6–8 semanas | ❌ Não existe |
| **API pública documentada** | P1 | 4–5 semanas | 🟡 Parcial (API existe, docs não) |
| **Webhooks outbound** | P2 | 2–3 semanas | ❌ Não existe |
| **Custom reports** | P2 | 3–4 semanas | ❌ Não existe |
| **Data export (CSV/API)** | P1 | 1–2 semanas | 🟡 Parcial |
| **Dedicated support channel** | P1 | 1 semana (processo) | ❌ Não formalizado |

### 3.3 Estimativa Total para Enterprise-Readiness

- **Mínimo viável:** SSO + Audit Log + SLA = 6–8 semanas, 1 dev senior
- **Competitivo:** + RBAC + API docs + White-label = 16–22 semanas adicionais
- **Investimento:** R$ 50.000–100.000 para MVP enterprise, R$ 200.000+ para completo

---

## 4. Modelo de Pricing Enterprise

### 4.1 Estrutura

```
Plano Enterprise = Base mensal + Volume de mensagens + Add-ons

Base mensal:        R$ 1.500–5.000/mês (depende do porte)
  ├── Inclui: Inbox ilimitado, CRM, automações, analytics
  ├── Inclui: [X] seats (agentes) — adicional R$ 99/seat
  └── Inclui: SLA 99.5%, suporte prioritário

Volume de mensagens:
  ├── Primeiras 50.000: incluídas no base
  ├── 50.001–200.000: R$ 0.04/msg
  ├── 200.001–500.000: R$ 0.03/msg
  └── > 500.000: R$ 0.025/msg (negociável)

Add-ons:
  ├── WhatsApp Flows:    R$ 500/mês
  ├── AI Agents:         R$ 800/mês + R$ 0.02/interação
  ├── White-label:       R$ 2.000/mês
  ├── Dedicated support: R$ 1.000/mês
  └── Custom integration: sob consulta
```

### 4.2 Descontos

| Condição | Desconto |
|----------|----------|
| Contrato anual (pré-pago) | 15% |
| Contrato bianual | 25% |
| Volume > 500K msgs/mês | Negociação individual |
| Case study público | 10% adicional |
| Indicação que converte | 1 mês grátis |

### 4.3 Comparação Competitiva

| | Worder Enterprise | Zenvia | Take Blip | Twilio |
|---|---|---|---|---|
| Base mensal | R$ 1.500–5.000 | R$ 2.000–8.000 | R$ 3.000–15.000 | Pay-as-you-go |
| Custo/msg | R$ 0.025–0.04 | R$ 0.03–0.06 | R$ 0.04–0.08 | R$ 0.05–0.10 |
| CRM incluído | ✅ | ❌ (add-on) | ❌ | ❌ |
| Flows | ✅ | 🟡 | ✅ | ❌ |
| White-label | 🟡 (add-on) | ✅ | ✅ | ❌ |

---

## 5. Template de SLA

### 5.1 Disponibilidade

| Nível | Uptime | Crédito |
|-------|--------|---------|
| Standard | 99.0% | 5% do mensal por 0.1% abaixo |
| Premium | 99.5% | 10% do mensal por 0.1% abaixo |
| Enterprise | 99.9% | 15% do mensal por 0.01% abaixo |

**Janela de manutenção:** Domingos 02h–06h BRT (não conta como downtime)

### 5.2 Tempo de Resposta

| Severidade | Descrição | SLA Resposta | SLA Resolução |
|------------|-----------|-------------|---------------|
| **P1 — Crítico** | Plataforma fora do ar, mensagens não entregam | 30 min | 4h |
| **P2 — Alto** | Feature principal degradada | 2h | 8h |
| **P3 — Médio** | Feature secundária com bug | 4h | 24h |
| **P4 — Baixo** | Cosmético, melhoria | 24h | 5 dias úteis |

### 5.3 Escalation Path

```
P1: Suporte → Tech Lead (15 min) → CTO (30 min) → CEO (1h)
P2: Suporte → Tech Lead (2h) → CTO (4h)
P3: Suporte → Dev assignee (24h)
P4: Backlog priorizado em sprint
```

### 5.4 Exclusões do SLA

- Force majeure (desastres naturais, ações governamentais)
- Indisponibilidade da Meta/WhatsApp API (fora do nosso controle)
- Ações do cliente que causam degradação (ex: envio de spam)
- Manutenção programada dentro da janela acordada

---

## 6. Métricas de Sucesso Enterprise

### 6.1 Métricas de Onboarding (primeiros 30 dias)

| Métrica | Target |
|---------|--------|
| Tempo até primeira mensagem enviada | ≤ 3 dias |
| % de agentes ativos na plataforma | ≥ 80% |
| Templates aprovados na Meta | ≥ 5 |
| Integrações ativas | ≥ 1 (e-commerce ou CRM) |
| NPS do onboarding | ≥ 8 |

### 6.2 Métricas de Saúde (ongoing)

| Métrica | Target | Alerta |
|---------|--------|--------|
| Login semanal por seat | ≥ 3x | < 1x por 2 semanas |
| Mensagens enviadas / quota | ≥ 40% | < 20% (não usando) |
| Taxa de entrega | ≥ 95% | < 90% |
| CSAT do suporte | ≥ 4.5/5 | < 4.0 |
| Expansão de seats (QoQ) | +10% | Flat por 2 quarters |

### 6.3 Métricas Financeiras

| Métrica | Target |
|---------|--------|
| Net Revenue Retention (NRR) | ≥ 110% |
| Gross churn enterprise | ≤ 2%/mês |
| ACV growth YoY | ≥ 30% |
| Payback period (CAC) | ≤ 6 meses |
| LTV:CAC ratio | ≥ 5:1 |

---

*Documento gerado como parte da Fase 7 — Expansão Estratégica da Worder.*
