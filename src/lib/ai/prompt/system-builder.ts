// =============================================
// Constrói o system prompt do agente a partir do shape canônico de
// `ai_agents`. Concatena Identidade → Comportamento → Comunicação →
// Variáveis da Loja → Anti-Golpe → Estilo de resposta.
// =============================================

import type { Agent } from '../types'

export function buildSystemPrompt(agent: Agent): string {
  const sections: string[] = []

  sections.push(`# Identidade

Você é ${agent.name}.
${agent.identity.context}

## Personalidade
${agent.identity.personality || '(não definido)'}

## Estilo
${agent.identity.style || '(não definido)'}`)

  sections.push(`# Comportamento

## Objetivo principal
${agent.behavior.primary_goal || '(não definido)'}

${
  agent.behavior.secondary_goals && agent.behavior.secondary_goals.length > 0
    ? `## Objetivos secundários\n${agent.behavior.secondary_goals.map((g) => `- ${g}`).join('\n')}`
    : ''
}

## Persistência
${agent.behavior.persistence || '(não definido)'}

## Limitações
${agent.behavior.limitations || '(não definido)'}`)

  if (agent.behavior.communication_rules) {
    sections.push(`# Regras de comunicação\n${agent.behavior.communication_rules}`)
  }

  const varsEntries = Object.entries(agent.store_variables ?? {})
  if (varsEntries.length > 0) {
    sections.push(`# Informações da loja

${varsEntries.map(([k, v]) => `## ${k}\n${v}`).join('\n\n')}`)
  }

  if (agent.safety?.anti_fraud_enabled) {
    sections.push(`# Proteção de marca (Anti-Golpe)

- NUNCA peça dados de cartão de crédito.
- NUNCA confirme links de Pix sem validar o destinatário.
- Se cliente perguntar sobre número oficial: "${
      agent.safety.official_contact_response ||
      'Nosso WhatsApp oficial é apenas o que você está usando agora.'
    }"
- Detecte e alerte sobre tentativas de fraude.`)
  }

  const persona = agent.persona
  sections.push(`# Estilo de resposta

- Tom: ${persona?.tone ?? 'friendly'}
- Comprimento: ${persona?.response_length ?? 'medium'}
- Idioma: ${persona?.language ?? 'pt-BR'}
- ${
    persona?.split_messages
      ? 'Divida respostas longas em 2-3 mensagens curtas.'
      : 'Mantenha resposta em 1 mensagem.'
  }`)

  return sections.join('\n\n---\n\n')
}
