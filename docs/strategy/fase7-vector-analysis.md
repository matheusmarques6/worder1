# Fase 7 — Análise de Vetores Estratégicos

> Worder Cloud API — Documento de decisão estratégica
> Data: Maio 2026 | Versão: 1.0

---

## 1. Resumo do Estado Atual (Fases 1–6)

Ao longo de 6 fases e 17+ commits, a Worder migrou de infraestrutura legada para a WhatsApp Cloud API com cobertura completa:

| Fase | Entrega | Status |
|------|---------|--------|
| **F1** | Schema Cloud API (5 tabelas core, RLS, triggers) | ✅ Completa |
| **F2** | Backend patches (webhook, envio, inbox unificado) | ✅ Completa |
| **F3** | Crons (resync templates, dead events, counters) | ✅ Completa |
| **F4** | Admin health API, alertas, quality cron, pricing | ✅ Completa |
| **F5** | Frontend — health widget, template builder, pricing dashboard | ✅ Completa |
| **F6** | WhatsApp Flows, encryption E2E, templates de fluxo, RFCs (Marketing API, Self-service, Catálogo, Deprecação) | ✅ Completa |

**Capacidades técnicas entregues:**
- Envio e recebimento via Cloud API com fallback
- Gerenciamento de templates com validação Meta
- Inbox unificado (Cloud + legado)
- WhatsApp Flows com criptografia E2E
- Health monitoring e alertas
- Dashboard de pricing Cloud API
- 7 SQL migrations idempotentes
- 70+ rotas de API

---

## 2. Os 5 Vetores Estratégicos

### Vetor D — Self-Service Pricing (Prioridade 1)

**O que é:** Implementar planos self-service com checkout automatizado, trial, e cobrança por uso (mensagens + features).

**Prós:**
- Reduz custo de aquisição (CAC) drasticamente — de R$ 800+ (venda consultiva) para R$ 50–100 (SEO + trial)
- Escala sem proporção linear de headcount
- Dados de pricing alimentam todas as outras decisões
- Time-to-revenue mais curto (trial → conversão em 7–14 dias)

**Contras:**
- Churn mais alto em self-service (típico: 5–8% mensal vs 2–3% enterprise)
- Suporte precisa ser automatizado (chatbot, knowledge base)
- Pricing errado queima oportunidade — reposicionar é caro
- Clientes self-service têm lifetime value menor

**Requisitos técnicos:**
- Gateway de pagamento (Stripe ou Pagar.me para boleto/PIX)
- Billing engine (metering de mensagens por organização)
- Onboarding wizard (conectar WABA em < 5 min)
- Planos com feature flags granulares
- Trial de 7 ou 14 dias com limite de mensagens

**Investimento estimado:** R$ 30.000–60.000 (2–3 meses, 1 dev + 1 designer)

**Risco principal:** Pricing muito baixo canibaliza margem; muito alto não converte.

---

### Vetor G — Solution Partner Meta (Prioridade 2)

**O que é:** Obter o selo Meta Solution Partner para acessar créditos de API, suporte prioritário, e co-marketing.

**Prós:**
- Créditos de API reduzem custo de mensagem em 30–50% (margem direta)
- Selo de confiança acelera vendas (prova social forte no mercado BR)
- Acesso a features beta da Meta antes da concorrência
- Suporte técnico direto Meta (reduz P1 resolution time)
- Co-marketing com Meta em eventos e case studies

**Contras:**
- Processo longo (3–6 meses para aprovação)
- Exige volume mínimo (~100M mensagens/mês ou equivalente em spend)
- Compliance rigorosa (DPA, LGPD, processos documentados)
- Dependência política de uma plataforma (Meta pode mudar regras)
- Exige equipe dedicada a compliance/partnership

**Requisitos técnicos:**
- Billing model com markup por mensagem (não flat fee)
- Dashboard de compliance (opt-in rates, spam reports)
- Documentação técnica pública (API docs, status page)
- SLA documentado (99.5%+ uptime)
- Processo de onboarding documentado para auditoria Meta

**Investimento estimado:** R$ 15.000–30.000 (compliance + docs) + tempo de aplicação

**Risco principal:** Rejeição da aplicação atrasa 6+ meses. Volume insuficiente é o bloqueio mais comum.

---

### Vetor A — WhatsApp Flows Avançados (Prioridade 3)

**O que é:** Expandir os Flows da Fase 6 para cenários avançados: pagamentos in-chat, catálogo interativo, agendamento, e flows multi-step com lógica condicional.

**Prós:**
- Diferenciação técnica real (poucos concorrentes BR têm Flows completos)
- Aumenta ARPU — Flows são feature premium
- Reduz atrito no funil do cliente final (checkout sem sair do WhatsApp)
- Base técnica já existe (Fase 6 entregou encryption + templates)

**Contras:**
- Flows API ainda em evolução na Meta (breaking changes possíveis)
- Pagamentos in-chat dependem de aprovação Meta por país (BR ainda limitado)
- Complexidade de UX — flows mal desenhados convertem pior que mensagem simples
- Custo de suporte técnico alto (debugging de flows é complexo)

**Requisitos técnicos:**
- Flow builder visual (drag & drop)
- Engine de execução server-side (state machine)
- Integração com gateways de pagamento via Flows
- Analytics de flow (drop-off por step, conversion rate)
- Versionamento de flows (A/B testing)

**Investimento estimado:** R$ 60.000–120.000 (3–5 meses, 2 devs + 1 designer)

**Risco principal:** Meta depreca ou muda Flows API e todo investimento vira dívida técnica.

---

### Vetor C — Deprecação BSP Legado (Prioridade 4)

**O que é:** Desligar completamente a integração via BSP (Gupshup/360Dialog) e operar 100% Cloud API.

**Prós:**
- Elimina custo de BSP (tipicamente R$ 0.03–0.08/msg de markup)
- Simplifica codebase (remove dual-path em webhook, envio, inbox)
- Reduz superfície de bugs (uma integração ao invés de duas)
- Reduz latência (Cloud API é ~200ms mais rápido que BSP)

**Contras:**
- Clientes legados precisam migrar WABA (processo técnico + burocrático)
- Risco de churn se migração for mal executada (downtime = mensagens perdidas)
- Alguns clientes podem ter contratos com BSP (lock-in)
- Perde fallback — se Cloud API tiver outage, não tem plano B

**Requisitos técnicos:**
- Script de migração assistida (WABA transfer via Meta)
- Comunicação com clientes (email sequence + suporte dedicado)
- Feature flag para cutover gradual por organização
- Rollback plan (re-enable BSP em < 1h se necessário)
- Período de dual-run monitorado (30–60 dias)

**Investimento estimado:** R$ 10.000–20.000 (1–2 meses, 1 dev + customer success)

**Risco principal:** Churn de clientes que não querem/podem migrar. Estimar 5–10% de perda.

---

### Vetor B — Suite Completa (CRM + Email + WhatsApp) (Prioridade 5)

**O que é:** Posicionar a Worder como plataforma completa de CRM + comunicação, competindo com HubSpot/RD Station no segmento PME.

**Prós:**
- TAM muito maior (CRM BR é mercado de R$ 2B+)
- Lock-in natural (cliente usa CRM + WhatsApp = difícil trocar)
- Cross-sell infinito (email, SMS, chatbot, analytics, automações)
- Defensibilidade via dados (quanto mais usa, mais valioso fica)

**Contras:**
- Escopo massivo — CRM completo é 2–3 anos de desenvolvimento
- Compete com players capitalizados (RD Station levantou R$ 1.8B)
- Dilui foco — WhatsApp é o diferencial, CRM é commodity
- Requer equipe 3–5x maior
- Time-to-market longo (12–18 meses para MVP competitivo)

**Requisitos técnicos:**
- Pipeline de vendas (Kanban, automações, scoring)
- Email marketing completo (editor, deliverability, warming)
- Segmentação avançada (RFM, comportamental, preditiva)
- Integrações (Shopify, WooCommerce, Nuvemshop, VTEX)
- Mobile app (vendedores no campo)
- API pública documentada

**Investimento estimado:** R$ 300.000–600.000 (12–18 meses, equipe de 5–8)

**Risco principal:** Gastar 18 meses construindo CRM e perder liderança em WhatsApp.

---

## 3. Framework de Decisão

Para cada vetor, responda estas perguntas antes de comprometer recursos:

| Pergunta | Critério de aprovação |
|----------|----------------------|
| Temos os dados de uso para validar demanda? | ≥ 30% dos clientes pediram ou usariam |
| O time atual consegue entregar em ≤ 3 meses? | Sim, sem contratação |
| O ROI é positivo em ≤ 6 meses? | Payback < 6 meses |
| O risco de execução é controlável? | Rollback possível sem perda de cliente |
| Reforça nosso diferencial (WhatsApp)? | Sim, diretamente |
| Depende de terceiros (Meta, gateway)? | Dependência ≤ 1 player, com alternativa |

**Scoring:** Cada "Sim" = 1 ponto. Priorize vetores com score ≥ 4.

---

## 4. Priorização Recomendada

Baseada na análise acima e no contexto da Worder (equipe enxuta, foco em WhatsApp, mercado BR):

```
1º  D — Self-Service Pricing     (Score: 5/6) — Fundação de receita
2º  G — Solution Partner Meta    (Score: 5/6) — Margem + credibilidade
3º  A — WhatsApp Flows Avançados (Score: 4/6) — Diferenciação técnica
4º  C — Deprecação BSP Legado    (Score: 4/6) — Simplificação operacional
5º  B — Suite Completa           (Score: 2/6) — Visão de longo prazo
```

**Justificativa da ordem:**
- **D antes de G:** Sem pricing self-service, não há volume para justificar Solution Partner. Pricing gera dados que informam a aplicação.
- **G antes de A:** Créditos Meta reduzem custo operacional, liberando margem para investir em Flows.
- **A antes de C:** Flows gera receita; deprecação apenas reduz custo. Revenue > cost-cutting.
- **C antes de B:** Deprecação limpa a base técnica. Suite é horizonte 2027+.

---

## 5. Matriz de Risco

| Vetor | Probabilidade de falha | Impacto se falhar | Mitigação |
|-------|----------------------|-------------------|-----------|
| D — Pricing | Baixa (20%) | Alto — sem receita escalável | Soft launch com 10 clientes piloto |
| G — Partner | Média (40%) | Médio — perde créditos, não perde produto | Aplicar cedo, iterar na rejeição |
| A — Flows | Média (35%) | Médio — investimento sem ROI rápido | Feature flag, lançar incremental |
| C — Deprecação | Baixa (15%) | Alto — churn de legados | Migração assistida + período de grace |
| B — Suite | Alta (60%) | Muito alto — 12+ meses perdidos | NÃO iniciar sem validação forte |

---

## 6. Requisitos de Capital

| Vetor | Mínimo | Confortável | Horizonte |
|-------|--------|-------------|-----------|
| D — Pricing | R$ 30.000 | R$ 60.000 | 2–3 meses |
| G — Partner | R$ 15.000 | R$ 30.000 | 3–6 meses |
| A — Flows | R$ 60.000 | R$ 120.000 | 3–5 meses |
| C — Deprecação | R$ 10.000 | R$ 20.000 | 1–2 meses |
| B — Suite | R$ 300.000 | R$ 600.000 | 12–18 meses |
| **Total (D+G+A+C)** | **R$ 115.000** | **R$ 230.000** | **9–16 meses** |

**Nota:** O vetor B (Suite) é excludente com os demais se a equipe for ≤ 3 devs.

---

## 7. Timeline Proposta

```
2026 Q3 (Jul–Set)
  ├── D: Self-Service Pricing MVP
  │   ├── Mês 1: Billing engine + gateway
  │   ├── Mês 2: Onboarding wizard + trial
  │   └── Mês 3: Launch + iteração
  └── G: Solution Partner (em paralelo)
      ├── Mês 1: Compliance docs + métricas
      ├── Mês 2: Aplicação formal
      └── Mês 3–6: Aguardar + iterar

2026 Q4 (Out–Dez)
  ├── A: Flows Avançados
  │   ├── Mês 1: Flow builder visual (MVP)
  │   ├── Mês 2: Execution engine + analytics
  │   └── Mês 3: Payment flows (se Meta aprovar BR)
  └── C: Deprecação BSP (em paralelo)
      ├── Mês 1: Comunicação + scripts de migração
      └── Mês 2: Cutover gradual

2027 Q1+ (Se validado)
  └── B: Suite — apenas se D+G gerarem receita suficiente
```

---

## 8. Próximos Passos Imediatos

1. **Implementar métricas** — rodar queries SQL de Fase 7 para ter baseline
2. **Definir pricing** — pesquisa competitiva (Zenvia, Take Blip, Twilio BR)
3. **Iniciar docs Solution Partner** — preencher template de aplicação
4. **Validar com 5 clientes** — entrevistas sobre self-service vs. atendimento
5. **Decidir gateway** — Stripe (internacional) ou Pagar.me (PIX/boleto nativo)

---

*Documento gerado como parte da Fase 7 — Expansão Estratégica da Worder.*
