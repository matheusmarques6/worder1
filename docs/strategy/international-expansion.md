# Expansão Internacional — Checklist e Análise

> Worder | Análise de mercados LATAM para expansão
> Data: Maio 2026 | Versão: 1.0

---

## 1. Análise de Mercado

### 1.1 Comparação de Mercados

| Critério | 🇲🇽 México | 🇨🇴 Colômbia | 🇦🇷 Argentina |
|----------|-----------|-------------|--------------|
| **População** | 130M | 52M | 46M |
| **Penetração WhatsApp** | 95%+ | 95%+ | 93%+ |
| **E-commerce TAM (2026)** | USD 40B+ | USD 12B+ | USD 15B+ |
| **Crescimento e-commerce YoY** | 18% | 22% | 25% (em USD real) |
| **Maturidade WhatsApp Business** | Alta | Média | Média-baixa |
| **Concorrência local** | Alta (Zenvia MX, Twilio) | Média | Baixa |
| **Facilidade de entrada** | Média | Alta | Baixa (câmbio, regulação) |
| **Idioma** | Espanhol | Espanhol | Espanhol |
| **Moeda/Estabilidade** | MXN (estável) | COP (estável) | ARS (alta volatilidade) |
| **Meios de pagamento** | OXXO, SPEI, cartão | PSE, Nequi, cartão | Mercado Pago, transferência |
| **Regulação de dados** | LFPDPPP | Ley 1581 | Ley 25.326 |

### 1.2 Recomendação de Priorização

```
1º México   — Maior TAM, maturidade alta, moeda estável
2º Colômbia — Boa relação custo/oportunidade, menos competição
3º Argentina — Alto risco cambial, mas mercado sofisticado quando estabilizar
```

**Justificativa:** O México tem o maior e-commerce da LATAM fora do Brasil e a maior penetração de WhatsApp Business. Clientes mexicanos estão habituados a pagar por SaaS em USD. A Colômbia é segundo por custo de entrada baixo e mercado em crescimento rápido. A Argentina, apesar do potencial, tem instabilidade cambial que dificulta pricing e cobrança.

---

## 2. Checklist Técnico

### 2.1 Internacionalização (i18n)

- [ ] **Framework de i18n** — Implementar next-intl ou similar
  - [ ] Extrair todas as strings hardcoded para arquivos de tradução
  - [ ] Suporte a pt-BR (padrão), es-MX, es-CO, es-AR
  - [ ] Pluralização correta por idioma
  - [ ] Formatação de data/hora por locale (DD/MM vs MM/DD)
  - [ ] Estimativa: 3–4 semanas para primeira língua adicional

- [ ] **Fuso horário** — Suporte multi-timezone
  - [ ] Armazenar tudo em UTC no banco
  - [ ] Exibir no fuso do usuário (America/Mexico_City, America/Bogota, etc.)
  - [ ] Crons e scheduling respeitam fuso da organização
  - [ ] Estimativa: 1–2 semanas

- [ ] **Formatação de números e moeda**
  - [ ] R$ → $ (MXN), $ (COP), $ (ARS)
  - [ ] Separador decimal: vírgula (BR) vs ponto (MX/CO/AR)
  - [ ] Estimativa: 1 semana

### 2.2 Moeda e Pagamentos

- [ ] **Multi-currency billing**
  - [ ] Suporte a BRL, MXN, COP, USD
  - [ ] Pricing table por região (não converter 1:1)
  - [ ] Estimativa: 2–3 semanas

- [ ] **Gateways de pagamento por país**
  - [ ] México: Stripe MX, Conekta (OXXO, SPEI)
  - [ ] Colômbia: PayU, Wompi (PSE, Nequi)
  - [ ] Argentina: Mercado Pago, dLocal
  - [ ] Estimativa: 3–4 semanas por gateway

- [ ] **Faturamento fiscal**
  - [ ] México: CFDI (factura electrónica) — obrigatório
  - [ ] Colômbia: Factura electrónica DIAN — obrigatório
  - [ ] Argentina: Factura electrónica AFIP — obrigatório
  - [ ] Integração com provedor de faturamento (ex: Facturapi MX, Siigo CO)
  - [ ] Estimativa: 4–6 semanas por país

### 2.3 Meta / WhatsApp Regional

- [ ] **Pricing Meta por região**
  - [ ] Custo por conversa varia por país (MX ~USD 0.036, CO ~USD 0.018, AR ~USD 0.024 para marketing)
  - [ ] Atualizar pricing engine para refletir custos regionais
  - [ ] Markup adequado por mercado

- [ ] **Templates regionais**
  - [ ] Templates pré-aprovados em espanhol
  - [ ] Compliance com políticas Meta por país
  - [ ] Boas práticas de messaging por cultura (tom, horários)

- [ ] **Phone number provisioning**
  - [ ] Processo de obtenção de número local por país
  - [ ] Verificação Meta Business para cada mercado
  - [ ] Estimativa: 2–4 semanas por país (burocrático)

### 2.4 Compliance e Legal

- [ ] **LGPD → Equivalentes locais**
  - [ ] México: LFPDPPP (Ley Federal de Protección de Datos Personales)
  - [ ] Colômbia: Ley 1581 de 2012 (Habeas Data)
  - [ ] Argentina: Ley 25.326 (Protección de Datos Personales)
  - [ ] Mapear diferenças: consent, data residency, breach notification
  - [ ] Estimativa: 2–3 semanas (jurídico + implementação)

- [ ] **Termos de serviço e privacidade**
  - [ ] Versões em espanhol revisadas por advogado local
  - [ ] Termos específicos por jurisdição

- [ ] **Residência de dados**
  - [ ] Verificar se Supabase tem região LATAM
  - [ ] Se não: avaliar réplica read-only ou migração parcial
  - [ ] México pode exigir dados em território nacional (setor financeiro)

---

## 3. GTM (Go-To-Market) por Mercado

### 3.1 México

**Estratégia:** Partner-led + content marketing em espanhol

**Mês 1–2: Preparação**
- Tradução da plataforma para es-MX
- Landing page localizada (worder.mx ou subdomínio)
- 10 artigos de blog em espanhol (SEO)
- Integração com Conekta (OXXO + SPEI)
- Pricing em MXN (sugestão: 30–40% abaixo do preço BR convertido)

**Mês 3–4: Soft Launch**
- 5 clientes piloto (indicação ou outbound)
- Partner com agência de e-commerce mexicana
- Webinar "WhatsApp para e-commerce en México"
- Suporte em espanhol (horário MX: 9h–18h CST)

**Mês 5–6: Scale**
- Paid ads (Google Ads MX, Meta Ads)
- Participação em evento (eCommerce Day México)
- Programa de afiliados com agências
- Target: 20 clientes pagantes

**Budget:** USD 15.000–25.000 para primeiros 6 meses

### 3.2 Colômbia

**Estratégia:** Product-led growth (self-service) + comunidade

**Mês 1–2: Preparação**
- Reutilizar tradução es-MX (ajustar regionalismos mínimos)
- Integração com PayU/Wompi (PSE + Nequi)
- Pricing em COP (competitivo — mercado sensível a preço)

**Mês 3–4: Soft Launch**
- Landing page CO
- Parceria com Nuvemshop Colômbia (já integrado)
- 5 clientes piloto via indicação

**Mês 5–6: Scale**
- Content marketing + SEO em espanhol
- Referral program agressivo
- Target: 15 clientes pagantes

**Budget:** USD 10.000–15.000 para primeiros 6 meses

### 3.3 Argentina (Horizonte 2027)

**Estratégia:** Waitlist + monitor cambial

- Criar landing page com waitlist
- Monitorar estabilidade do peso argentino
- Quando câmbio estabilizar: pricing em USD (padrão SaaS AR)
- Integração com Mercado Pago
- Aproveitar material de MX/CO com ajustes mínimos

**Budget:** USD 2.000 (landing page + waitlist) até decisão de go

---

## 4. Necessidades de Contratação

### 4.1 Equipe Mínima por País

| Papel | México | Colômbia | Quando |
|-------|--------|----------|--------|
| **Country Manager** | 1 (remoto ou híbrido CDMX) | 1 (remoto Bogotá/Medellín) | Mês 1 |
| **Customer Success (espanhol)** | 1 | 0 (Country Manager acumula) | Mês 3 |
| **SDR / Vendas** | 1 | 0 (inbound-only no início) | Mês 4 |
| **Dev (i18n + integrações)** | 1 (pode ser BR, remoto) | Compartilhado | Mês 1 |

### 4.2 Faixas Salariais (USD/mês, remoto)

| Papel | México | Colômbia |
|-------|--------|----------|
| Country Manager | USD 3.000–5.000 | USD 2.500–4.000 |
| Customer Success | USD 1.500–2.500 | USD 1.200–2.000 |
| SDR | USD 1.200–2.000 + comissão | USD 1.000–1.500 + comissão |
| Dev Senior | USD 4.000–6.000 (se contratado local) | USD 3.000–5.000 |

### 4.3 Alternativas a Contratação

- **Agência parceira** como canal de vendas (comissão 20–30% do ACV)
- **Freelancers** para tradução e conteúdo (USD 500–1.000/mês)
- **Contractor** para integrações regionais (USD 3.000–5.000 por projeto)

---

## 5. Estimativa de Custos

### 5.1 Primeiro Ano — México

| Item | Custo (USD) |
|------|-------------|
| i18n + adaptação técnica | 15.000 |
| Gateway de pagamento | 5.000 |
| Faturamento fiscal (CFDI) | 8.000 |
| Country Manager (12 meses) | 48.000 |
| CS (9 meses) | 18.000 |
| Marketing + eventos | 15.000 |
| Jurídico (termos, compliance) | 5.000 |
| Infraestrutura (hosting, ferramentas) | 3.000 |
| **Total México Ano 1** | **~USD 117.000** |

### 5.2 Primeiro Ano — Colômbia

| Item | Custo (USD) |
|------|-------------|
| Adaptação técnica (incremental) | 5.000 |
| Gateway de pagamento | 4.000 |
| Faturamento fiscal (DIAN) | 6.000 |
| Country Manager (12 meses) | 36.000 |
| Marketing | 8.000 |
| Jurídico | 4.000 |
| **Total Colômbia Ano 1** | **~USD 63.000** |

### 5.3 Resumo

| Cenário | Investimento Ano 1 | Break-even estimado |
|---------|--------------------|--------------------|
| Só México | USD 117.000 | Mês 10–14 |
| México + Colômbia | USD 180.000 | Mês 12–16 |
| México + Colômbia + Argentina | USD 200.000+ | Mês 14–18 |

**Nota:** Break-even assume ticket médio de USD 300/mês por cliente e 3–5 novos clientes/mês após soft launch.

---

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Baixa adoção no mercado local | Média | Alto | Validar com 5 clientes antes de investir heavy |
| Problemas com faturamento fiscal | Alta | Médio | Usar provedor especializado (Facturapi, Siigo) |
| Instabilidade cambial (AR) | Alta | Alto | Não entrar na AR até estabilizar; pricing em USD |
| Suporte em espanhol insuficiente | Média | Alto | Contratar CS nativo antes do launch |
| Regulação de dados mais restritiva | Baixa | Médio | Consultoria jurídica local antes de operar |
| Concorrente local forte | Média | Médio | Diferenciação por produto (Flows + CRM integrado) |

---

*Documento gerado como parte da Fase 7 — Expansão Estratégica da Worder.*
