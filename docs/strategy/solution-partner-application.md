# Meta Solution Partner — Template de Aplicação

> Worder | Documento interno para preparação da candidatura
> Data: Maio 2026 | Status: Rascunho

---

## 1. Visão Geral da Empresa

**Nome legal:** [NOME JURÍDICO DA EMPRESA]
**CNPJ:** [XX.XXX.XXX/XXXX-XX]
**Nome comercial:** Worder
**Website:** [https://worder.app]
**Ano de fundação:** [ANO]
**Localização:** [CIDADE, ESTADO] — Brasil
**Número de funcionários:** [X] (dev: [X], CS: [X], vendas: [X])

**Descrição (2 parágrafos):**

A Worder é uma plataforma de comunicação e CRM focada em WhatsApp para e-commerces e empresas de médio porte no Brasil. Oferecemos gestão completa de mensagens, automações, campanhas de marketing, e integração com as principais plataformas de e-commerce brasileiras (Shopify, Nuvemshop, VTEX).

Nossa plataforma processa [X.XXX.XXX] mensagens por mês para [XXX] organizações ativas, com foco em conversão de vendas via WhatsApp. Recentemente completamos a migração para a WhatsApp Cloud API, incluindo suporte completo a WhatsApp Flows com criptografia E2E.

---

## 2. Capacidades Técnicas

### 2.1 Integração WhatsApp

| Capacidade | Status | Detalhes |
|------------|--------|----------|
| Cloud API Integration | ✅ Produção | Envio, recebimento, webhooks |
| Template Management | ✅ Produção | CRUD completo, sync com Meta |
| WhatsApp Flows | ✅ Produção | E2E encryption, templates interativos |
| Business Management API | ✅ Produção | WABA provisioning |
| Catalog Integration | 🟡 RFC pronto | Fase 6 RFC aprovado |
| Marketing Messages API | 🟡 RFC pronto | Fase 6 RFC aprovado |

### 2.2 Stack Técnico

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase (PostgreSQL + Auth + Realtime)
- **Infraestrutura:** Vercel (frontend), Supabase Cloud (banco + auth)
- **Segurança:** RLS multi-tenant, criptografia AES-256 para tokens, E2E para Flows
- **Monitoramento:** Health checks automatizados, quality score tracking, alertas
- **CI/CD:** GitHub Actions, testes automatizados (Vitest)

### 2.3 Funcionalidades da Plataforma

- **Inbox unificado** — WhatsApp + email em interface única
- **Automações** — Flows baseados em eventos (compra, abandono, NPS)
- **Campanhas** — Broadcast com segmentação, A/B testing, scheduling
- **CRM integrado** — Pipeline de vendas, scoring, deal tracking
- **Integrações** — Shopify, Nuvemshop, VTEX, webhooks customizados
- **Analytics** — Dashboard de métricas, deliverability, attribution
- **Multi-tenant** — Isolamento completo por organização com RLS
- **LGPD** — Opt-in management, data export, right to deletion

---

## 3. Métricas de Volume

> ⚠️ Preencher com dados reais antes da submissão

| Métrica | Valor atual | Tendência (3 meses) |
|---------|-------------|---------------------|
| Mensagens enviadas/mês | [X.XXX.XXX] | [+XX%] |
| Mensagens recebidas/mês | [X.XXX.XXX] | [+XX%] |
| Organizações ativas | [XXX] | [+XX%] |
| WABAs gerenciados | [XXX] | [+XX%] |
| Templates ativos | [X.XXX] | [+XX%] |
| Uptime (últimos 90 dias) | [XX.X%] | Estável |
| Tempo médio de resposta webhook | [XXXms] | [melhorando/estável] |
| Taxa de entrega mensagens | [XX.X%] | [+X.X%] |

**Gasto mensal estimado com Meta API:** USD [X.XXX] / mês

**Projeção 12 meses:** USD [XX.XXX] / mês (baseado em crescimento de [XX%] MoM)

---

## 4. Compliance e Suporte

### 4.1 Políticas de Compliance

- **Opt-in:** Obrigatório duplo opt-in para campanhas de marketing. Sistema automatizado de coleta e registro de consentimento.
- **Opt-out:** Processamento automático de "SAIR" / "PARAR" com remoção imediata de listas de marketing.
- **Rate limiting:** Respeitamos messaging_limit e quality_rating da Meta. Sistema de throttling automático.
- **Quality monitoring:** Dashboard de quality score por WABA com alertas automáticos quando score cai para YELLOW.
- **LGPD:** Compliance total com Lei Geral de Proteção de Dados. DPO designado, processos de exclusão e portabilidade.
- **Template review:** Processo interno de revisão antes de submissão à Meta. Bloqueio automático de templates rejeitados.

### 4.2 Capacidade de Suporte

| Canal | Disponibilidade | SLA |
|-------|-----------------|-----|
| Chat in-app | Seg–Sex 8h–20h BRT | Resposta < 15 min |
| Email | 24/7 | Resposta < 4h |
| WhatsApp | Seg–Sex 8h–20h BRT | Resposta < 10 min |
| Emergências (P1) | 24/7 | Resposta < 30 min |
| Onboarding | Agendamento | Sessão 1:1 de 45 min |

**Equipe de suporte:** [X] pessoas dedicadas, fluentes em português e inglês.

**Documentação:** Knowledge base com [XX] artigos, tutoriais em vídeo, API docs públicos.

---

## 5. Solicitação de Linha de Crédito

### 5.1 Justificativa

Solicitamos uma linha de crédito de **USD [XX.XXX] / mês** para operação da WhatsApp Cloud API, baseada em:

1. **Volume atual:** [X.XXX.XXX] mensagens/mês com crescimento de [XX%] MoM
2. **Clientes enterprise:** [X] clientes com gasto individual > USD [X.XXX]/mês
3. **Projeção de crescimento:** Lançamento de self-service pricing em Q3/2026 deve triplicar base de clientes em 6 meses
4. **Sazonalidade:** Black Friday / Natal representam 3–5x do volume normal (Nov–Dez)

### 5.2 Modelo de Billing Proposto

- **Markup por mensagem:** [X–X%] sobre custo Meta, transparente para o cliente
- **Planos mensais:** Incluem quota de mensagens + features
- **Overage:** Cobrança automática por mensagem excedente
- **Faturamento:** Mensal, pós-pago, via boleto/PIX/cartão

### 5.3 Histórico Financeiro

> ⚠️ Preencher com dados reais

- **MRR atual:** R$ [XX.XXX]
- **Crescimento MRR (últimos 6 meses):** [+XX%]
- **Churn mensal:** [X.X%]
- **Runway:** [XX] meses
- **Adimplência:** [XX%] dos clientes pagam em dia

---

## 6. Depoimentos de Clientes

> ⚠️ Coletar depoimentos reais antes da submissão

### Cliente 1 — [NOME DA EMPRESA]
**Segmento:** E-commerce de moda | **Porte:** [XX] funcionários | **Volume:** [XX.XXX] msgs/mês

> "[Depoimento do cliente sobre como a Worder impactou vendas/atendimento...]"
>
> — [Nome], [Cargo], [Empresa]

### Cliente 2 — [NOME DA EMPRESA]
**Segmento:** Serviços financeiros | **Porte:** [XX] funcionários | **Volume:** [XX.XXX] msgs/mês

> "[Depoimento sobre eficiência operacional, automação, ROI...]"
>
> — [Nome], [Cargo], [Empresa]

### Cliente 3 — [NOME DA EMPRESA]
**Segmento:** Saúde / Clínicas | **Porte:** [XX] funcionários | **Volume:** [XX.XXX] msgs/mês

> "[Depoimento sobre agendamento via WhatsApp, redução de no-show...]"
>
> — [Nome], [Cargo], [Empresa]

---

## 7. Checklist Pré-Submissão

- [ ] Todos os campos [PLACEHOLDER] preenchidos com dados reais
- [ ] Métricas de volume atualizadas (últimos 30 dias)
- [ ] Depoimentos coletados e autorizados
- [ ] Documentação técnica pública (API docs) online
- [ ] Status page configurada e operacional
- [ ] DPA (Data Processing Agreement) pronto para assinatura
- [ ] Comprovantes financeiros separados (se solicitado pela Meta)
- [ ] Pessoa de contato para follow-up definida
- [ ] Revisão jurídica dos termos de parceria

---

## 8. Contatos para a Meta

| Papel | Nome | Email | Telefone |
|-------|------|-------|----------|
| CEO / Decision Maker | [NOME] | [EMAIL] | [TELEFONE] |
| CTO / Technical Lead | [NOME] | [EMAIL] | [TELEFONE] |
| Account Manager | [NOME] | [EMAIL] | [TELEFONE] |
| Suporte / Compliance | [NOME] | [EMAIL] | [TELEFONE] |

---

*Template preparado como parte da Fase 7 — Expansão Estratégica da Worder.*
*Preencher todos os campos marcados com [PLACEHOLDER] antes da submissão formal.*
