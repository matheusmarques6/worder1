"""Números da arbitragem e dos caps — PENDENTE-3 do doc-fonte.

O doc (core/agentes-por-evento.md, Pendências) deixa os números de arbitragem
e frequency caps para as rodadas 3-4 da entrevista com o Bruno. Até lá, os
defaults conservadores vivem AQUI, com nome — nunca espalhados como literais.
Mudar um número é mudar esta tabela + o doc, nunca um hardcode local.
"""

# Prioridade de evento no desempate da arbitragem (§1.4): maior vence quando
# dois toques disputam o turno. [PENDENTE-3: números a validar]
EVENT_PRIORITY: dict[str, int] = {
    "payment.pix.abandoned": 50,
    "payment.boleto.abandoned": 50,
    "checkout.abandoned": 40,
    "cart.abandoned": 30,
    "order.fulfilled": 20,
    "whatsapp.received": 10,
}

# Toques de missão por contato por dia, todas as famílias somadas.
# [PENDENTE-3: número a validar]
MISSION_TOUCH_DAILY_CAP = 2

# Idade máxima de um pedido de toque na fila antes de ser considerado vencido
# (o mundo mudou; o nó que pediu já não descreve o estado). [PENDENTE-3]
MISSION_TOUCH_MAX_AGE_HOURS = 24
