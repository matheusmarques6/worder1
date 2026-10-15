import { describe, expect, it } from 'vitest'
import { clusterGaps, cosine, isSensitive, mergeCluster, messageText, suggestionMessages, type GapRow } from '../gap-routine'

const gap = (id: string, over: Partial<GapRow> = {}): GapRow => ({
  id, question: `pergunta ${id}`, count: 1, agent_ids: [], examples: [{ text: `pergunta ${id}` }],
  first_seen: '2026-10-10T00:00:00Z', last_seen: '2026-10-10T00:00:00Z', outcome: 'no_source',
  suggested_answer: null, cluster_key: id, ...over,
})

describe('cosine', () => {
  it('1 para iguais, 0 para ortogonais e vetor nulo', () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBe(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
})

describe('clusterGaps', () => {
  it('a mais frequente vira a cabeça e absorve as parecidas', () => {
    const gaps = [gap('a', { count: 1 }), gap('b', { count: 5 }), gap('c', { count: 2 })]
    const vectors = [[1, 0.1], [1, 0], [0, 1]]
    expect(clusterGaps(gaps, vectors)).toEqual([[1, 0], [2]])
  })
})

describe('mergeCluster', () => {
  it('soma contagens, une agentes, junta exemplos sem repetir e mantém o desfecho mais grave', () => {
    const head = gap('h', { count: 3, agent_ids: ['a1'], examples: [{ text: 'Tem frete?' }], outcome: 'answered_without_source', last_seen: '2026-10-12T00:00:00Z' })
    const other = gap('o', { count: 2, agent_ids: ['a1', 'a2'], examples: [{ text: 'tem frete?' }, { text: 'Frete grátis?' }], outcome: 'blocked', first_seen: '2026-10-01T00:00:00Z' })
    const merged = mergeCluster(head, [other])
    expect(merged.count).toBe(5)
    expect(merged.agent_ids).toEqual(['a1', 'a2'])
    expect(merged.examples!.map((e) => e.text)).toEqual(['Tem frete?', 'Frete grátis?'])
    expect(merged.outcome).toBe('blocked')
    expect(merged.first_seen).toBe('2026-10-01T00:00:00Z')
    expect(merged.last_seen).toBe('2026-10-12T00:00:00Z')
  })
})

describe('isSensitive', () => {
  it('reconhece saúde e jurídico sem acento', () => {
    expect(isSensitive(['Posso usar grávida?'])).toBe(true)
    expect(isSensitive(['vou no PROCON'])).toBe(true)
    expect(isSensitive(['Tem frete grátis?'])).toBe(false)
  })
})

describe('suggestionMessages', () => {
  it('leva a pergunta, os exemplos e o que a equipe respondeu', () => {
    const [system, user] = suggestionMessages('Tem frete?', ['tem frete grátis?'], ['Acima de 199 sim'])
    expect(system.role).toBe('system')
    expect(user.content).toContain('Pergunta: Tem frete?')
    expect(user.content).toContain('- Acima de 199 sim')
  })
})

describe('messageText', () => {
  it('lê os formatos de content do inbox', () => {
    expect(messageText({ text: 'oi' })).toBe('oi')
    expect(messageText({ text: { body: 'oi' } })).toBe('oi')
    expect(messageText('oi')).toBe('oi')
    expect(messageText({ image: {} })).toBeNull()
  })
})
