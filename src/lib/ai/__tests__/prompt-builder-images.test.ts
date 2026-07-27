import { describe, it, expect } from 'vitest'
import { PromptBuilder } from '../prompt-builder'
import { AIAgent, DEFAULT_PERSONA, DEFAULT_SETTINGS, EngineMessage } from '../types'

const agent: AIAgent = {
  id: 'a1',
  organization_id: 'o1',
  name: 'Test Agent',
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  max_tokens: 1000,
  is_active: true,
  persona: DEFAULT_PERSONA,
  settings: DEFAULT_SETTINGS,
  total_messages: 0,
  total_conversations: 0,
  total_tokens_used: 0,
  created_at: '',
  updated_at: '',
}

describe('PromptBuilder.formatMessages com imagens', () => {
  const images = [{ mimeType: 'image/jpeg', base64: 'QUJD' }]

  it('preserva images na mensagem atual e nao duplica a ultima user message', () => {
    const pb = new PromptBuilder(agent)
    const history: EngineMessage[] = [
      { role: 'assistant', content: 'Oi! Como posso ajudar?' },
      { role: 'user', content: 'olha essa foto', images },
    ]
    const msgs = pb.formatMessages(history, 'olha essa foto')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toEqual({ role: 'assistant', content: 'Oi! Como posso ajudar?', images: undefined })
    expect(msgs[1]).toEqual({ role: 'user', content: 'olha essa foto', images })
  })

  it('quando currentMessage nao esta no historico, anexa sem images', () => {
    const pb = new PromptBuilder(agent)
    const msgs = pb.formatMessages([{ role: 'assistant', content: 'oi' }], 'nova pergunta')
    expect(msgs).toHaveLength(2)
    expect(msgs[1]).toEqual({ role: 'user', content: 'nova pergunta', images: undefined })
  })

  it('preserva images de mensagens anteriores do historico', () => {
    const pb = new PromptBuilder(agent)
    const history: EngineMessage[] = [
      { role: 'user', content: 'primeira foto', images },
      { role: 'assistant', content: 'recebi!' },
      { role: 'user', content: 'e agora?' },
    ]
    const msgs = pb.formatMessages(history, 'e agora?')
    expect(msgs).toHaveLength(3)
    expect(msgs[0].images).toEqual(images)
  })
})
