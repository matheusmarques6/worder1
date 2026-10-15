import { describe, expect, it } from 'vitest'
import { TOPICS, parseTopic, topicMessages } from '../topics'

describe('parseTopic', () => {
  it('aceita a opção exata, com ponto ou maiúsculas, e cai em "outro" no resto', () => {
    expect(parseTopic('troca e devolução')).toBe('troca e devolução')
    expect(parseTopic('Pagamento.')).toBe('pagamento')
    expect(parseTopic('algo inventado')).toBe('outro')
    expect(parseTopic(null)).toBe('outro')
  })
})

describe('topicMessages', () => {
  it('lista as opções e limita o texto', () => {
    const [system, user] = topicMessages(Array.from({ length: 50 }, (_, i) => `linha ${i}`))
    for (const topic of TOPICS) expect(system.content).toContain(topic)
    expect(user.content.split('\n')).toHaveLength(12)
  })
})
