# RFC: Fase 6 — Bloco D: Marketing Messages API

**Status:** Proposto  
**Autor:** Worder Engineering  
**Data:** 2026-05-26

## Problema

As campanhas de marketing da Worder utilizam a API de mensagens padrao do WhatsApp Cloud API. A Meta oferece uma API dedicada para mensagens de marketing (`/messages` com `messaging_product: "whatsapp"` + `marketing` category) que melhora a taxa de entrega em ate 9% ao sinalizar corretamente a intencao da mensagem. Sem essa integracao, campanhas de alto volume sofrem com filtros anti-spam mais agressivos.

Alem disso, a API de Marketing permite opt-out granular por campanha, o que reduz reclamacoes e melhora o quality_rating da conta.

## Solucao (MVP)

### Deteccao automatica de tipo de mensagem
- Identificar templates com categoria `MARKETING` no momento do envio
- Rotear automaticamente para o endpoint de marketing quando aplicavel
- Manter fallback para API padrao em caso de erro

### Integracao com Marketing API
- Usar header `messaging_product: "whatsapp"` com flag de marketing
- Suportar `message_template` com parametros dinamicos (nome, produto, preco)
- Respeitar frequency capping da Meta (max 2 marketing/dia por destinatario)

### Metricas de entrega
- Coletar dados de `marketing_message_status` via webhook
- Dashboard de comparacao: taxa de entrega marketing API vs padrao
- Alertas quando quality_rating cai abaixo de GREEN

### Opt-out por campanha
- Endpoint para registrar opt-out recebido via botao "Parar promos"
- Tabela `marketing_opt_outs` com phone + campaign_id
- Filtrar destinatarios no momento do envio

## Fora de escopo
- Editor visual de campanhas (ja existe no modulo de campanhas)
- Integracao com Meta Ads Manager
- Segmentacao avancada de audiencia (futuro Bloco D-2)
- A/B testing de templates de marketing

## Metricas de Sucesso
- Aumento de 7-9% na taxa de entrega de mensagens de marketing
- Reducao de 30% em reclamacoes de spam
- Quality rating mantido em GREEN para 95%+ das contas
- Opt-out processado em <5 segundos

## Dependencias
- Cloud API v22.0 (suporta marketing messages)
- Templates aprovados com categoria MARKETING no Meta Business Manager
- Webhook configurado para receber `marketing_message_status`
- Fase 2 concluida (token encryption, cloud-api client)

## Riscos
- **Mudancas na API da Meta**: endpoint de marketing pode mudar sem aviso. Mitigado por versionamento e feature flag.
- **Frequency capping**: Meta pode alterar limites sem documentar. Monitorar via alertas de bounce rate.
- **Custo por mensagem**: mensagens de marketing tem custo maior que utility. Precificar corretamente no billing.

## Estimativa
- Deteccao e roteamento automatico: 2 dias
- Integracao Marketing API + webhooks: 3 dias
- Dashboard de metricas: 2 dias
- Opt-out por campanha: 2 dias
- **Total: ~9 dias uteis**
