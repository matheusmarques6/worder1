// =====================================================
// CONSTRUTOR DE PROMPTS
// Monta prompts otimizados para o agente
// =====================================================

import {
  AIAgent,
  AgentPersona,
  EngineMessage,
  ContactInfo,
  RAGResult,
  RESPONSE_LENGTH_TOKENS,
} from './types'

// =====================================================
// PROMPT BUILDER CLASS
// =====================================================

export class PromptBuilder {
  private agent: AIAgent
  private persona: AgentPersona

  constructor(agent: AIAgent) {
    this.agent = agent
    this.persona = agent.persona
  }

  /**
   * Monta o prompt completo para a LLM
   */
  build(params: {
    ragContext?: string
    conversationHistory: EngineMessage[]
    currentMessage: string
    contactInfo?: ContactInfo
    actionInstructions?: string[]
  }): { systemPrompt: string; messages: EngineMessage[] } {
    const { ragContext, conversationHistory, currentMessage, contactInfo, actionInstructions } = params

    // Construir system prompt
    const systemPrompt = this.buildSystemPrompt({
      ragContext,
      contactInfo,
      actionInstructions,
    })

    // Formatar histórico de mensagens
    const messages = this.formatMessages(conversationHistory, currentMessage)

    return { systemPrompt, messages }
  }

  /**
   * Constrói o system prompt baseado na persona
   */
  buildSystemPrompt(params: {
    ragContext?: string
    contactInfo?: ContactInfo
    actionInstructions?: string[]
  }): string {
    const { ragContext, contactInfo, actionInstructions } = params
    const parts: string[] = []

    // Usar system_prompt customizado se existir
    if (this.agent.system_prompt) {
      parts.push(this.agent.system_prompt)
    } else {
      // Base da persona
      parts.push(this.buildPersonaBase())
    }

    // Adicionar role_description
    if (this.persona.role_description) {
      parts.push(`\n## Sua Função\n${this.persona.role_description}`)
    }

    // Tom de voz
    parts.push(this.buildToneInstructions())

    // Tamanho das respostas
    parts.push(this.buildLengthInstructions())

    // Idioma
    parts.push(this.buildLanguageInstructions())

    // Diretrizes
    if (this.persona.guidelines && this.persona.guidelines.length > 0) {
      parts.push(this.buildGuidelinesSection())
    }

    // Informações do contato
    if (contactInfo) {
      parts.push(this.buildContactSection(contactInfo))
    }

    // Instruções de ações
    if (actionInstructions && actionInstructions.length > 0) {
      parts.push(this.buildActionInstructions(actionInstructions))
    }

    // Contexto RAG (conhecimento)
    if (ragContext) {
      parts.push(this.buildRAGSection(ragContext))
    }

    // Regras gerais
    parts.push(this.buildGeneralRules())

    return parts.join('\n\n')
  }

  /**
   * Base da persona
   */
  private buildPersonaBase(): string {
    return `Você é um assistente virtual inteligente de atendimento ao cliente via WhatsApp.
Seu nome é ${this.agent.name}.
Você foi configurado para ajudar clientes de forma eficiente e profissional.`
  }

  /**
   * Instruções de tom de voz
   */
  private buildToneInstructions(): string {
    const toneDescriptions = {
      casual: `## Tom de Voz: Casual
Use uma linguagem descontraída e amigável. 
- Pode usar gírias leves e expressões coloquiais
- Emojis são bem-vindos 😊
- Seja como um amigo ajudando outro amigo
- Evite formalidades excessivas`,

      friendly: `## Tom de Voz: Amigável
Use uma linguagem calorosa e acolhedora.
- Seja simpático e atencioso
- Use emojis com moderação
- Demonstre interesse genuíno em ajudar
- Mantenha profissionalismo com leveza`,

      professional: `## Tom de Voz: Profissional
Use uma linguagem formal e corporativa.
- Seja cortês e objetivo
- Evite gírias e coloquialismos
- Não use emojis
- Mantenha distância profissional adequada`,
    }

    return toneDescriptions[this.persona.tone] || toneDescriptions.friendly
  }

  /**
   * Instruções de tamanho de resposta
   */
  private buildLengthInstructions(): string {
    const length = this.persona.response_length || 'medium'
    const tokens = RESPONSE_LENGTH_TOKENS[length]

    const lengthDescriptions = {
      short: `## Tamanho das Respostas: Curtas
- Respostas de 1-2 parágrafos curtos
- Seja direto ao ponto
- Evite explicações longas
- Aproximadamente ${tokens.min}-${tokens.max} palavras`,

      medium: `## Tamanho das Respostas: Médias
- Respostas de 2-3 parágrafos
- Balanceie brevidade com clareza
- Inclua detalhes relevantes
- Aproximadamente ${tokens.min}-${tokens.max} palavras`,

      long: `## Tamanho das Respostas: Longas
- Respostas completas e detalhadas
- Pode usar 3-4 parágrafos
- Explique bem cada ponto
- Aproximadamente ${tokens.min}-${tokens.max} palavras`,
    }

    return lengthDescriptions[length] || lengthDescriptions.medium
  }

  /**
   * Instruções de idioma
   */
  private buildLanguageInstructions(): string {
    const langMap: Record<string, string> = {
      'pt-BR': 'Português Brasileiro',
      'en': 'Inglês',
      'es': 'Espanhol',
      'auto': 'mesmo idioma do cliente',
    }

    const lang = this.persona.language || 'pt-BR'
    const langName = langMap[lang] || langMap['pt-BR']

    if (lang === 'auto') {
      return `## Idioma
Responda SEMPRE no mesmo idioma que o cliente usar.
Detecte automaticamente o idioma da mensagem e responda nesse idioma.`
    }

    return `## Idioma
Responda SEMPRE em ${langName}.
Mesmo que o cliente escreva em outro idioma, responda em ${langName}.`
  }

  /**
   * Seção de diretrizes
   */
  private buildGuidelinesSection(): string {
    const guidelines = this.persona.guidelines
      .map((g, i) => `${i + 1}. ${g}`)
      .join('\n')

    return `## Diretrizes Específicas
Siga SEMPRE estas instruções:
${guidelines}`
  }

  /**
   * Seção de informações do contato
   */
  private buildContactSection(contact: ContactInfo): string {
    const parts: string[] = ['## Informações do Cliente']

    if (contact.name) parts.push(`- Nome: ${contact.name}`)
    if (contact.email) parts.push(`- Email: ${contact.email}`)
    if (contact.phone) parts.push(`- Telefone: ${contact.phone}`)

    if (contact.customFields) {
      for (const [key, value] of Object.entries(contact.customFields)) {
        if (value) parts.push(`- ${key}: ${value}`)
      }
    }

    return parts.join('\n')
  }

  /**
   * Instruções de ações ativadas
   */
  private buildActionInstructions(instructions: string[]): string {
    return `## INSTRUÇÕES ESPECIAIS (IMPORTANTE)
As seguintes instruções foram ativadas e DEVEM ser seguidas:
${instructions.map(i => `- ${i}`).join('\n')}`
  }

  /**
   * Seção de contexto RAG
   */
  private buildRAGSection(context: string): string {
    return `## Conhecimento Base
Use as informações abaixo para responder. Se a informação não estiver aqui, diga que não tem essa informação disponível.

${context}`
  }

  /**
   * Regras gerais
   */
  private buildGeneralRules(): string {
    return `## Regras Importantes
1. NUNCA invente informações. Se não souber, diga que não sabe.
2. NUNCA revele que é uma IA, a menos que seja perguntado diretamente.
3. NUNCA use markdown ou formatação especial (WhatsApp não suporta bem).
4. Use quebras de linha para separar parágrafos, não listas.
5. Se o cliente pedir algo que você não pode fazer, ofereça alternativas ou sugira falar com um atendente humano.
6. Seja sempre respeitoso e nunca discuta ou seja rude.
7. Se detectar que o cliente está irritado, seja extra atencioso e empático.`
  }

  /**
   * Formata o histórico de mensagens
   */
  formatMessages(history: EngineMessage[], currentMessage: string): EngineMessage[] {
    // Limitar histórico (últimas N mensagens)
    const maxHistory = 20
    const recentHistory = history.slice(-maxHistory)

    // Converter para formato da LLM
    const messages: EngineMessage[] = recentHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))

    // Adicionar mensagem atual
    messages.push({
      role: 'user',
      content: currentMessage,
    })

    return messages
  }
}

// =====================================================
// FUNÇÕES HELPER
// =====================================================

/**
 * Formata resultados RAG como contexto
 */
export function formatRAGAsContext(results: RAGResult[]): string {
  if (!results || results.length === 0) {
    return ''
  }

  const sections = results.map((r, i) => {
    return `[Fonte ${i + 1}: ${r.source_name}]
${r.content}`
  })

  return sections.join('\n\n---\n\n')
}

/**
 * Cria instância do PromptBuilder
 */
export function createPromptBuilder(agent: AIAgent): PromptBuilder {
  return new PromptBuilder(agent)
}
