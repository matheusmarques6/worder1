import { describe, it, expect } from 'vitest'
import { sanitizeSearchTerm, likePattern, MAX_SEARCH_LENGTH } from '../search-term'

describe('termo de busca', () => {
  it('texto comum passa inteiro', () => {
    expect(sanitizeSearchTerm('ana silva')).toBe('ana silva')
    expect(sanitizeSearchTerm('  joão  ')).toBe('joão')
  })

  it('a gramática do filtro sai: vírgula, parêntese, aspas e barra', () => {
    // Este é o caso que reescrevia a consulta: fechar a lista do `or`.
    expect(sanitizeSearchTerm('abc),(x')).toBe('abc x')
    expect(sanitizeSearchTerm("o'brien")).toBe('o brien')
    expect(sanitizeSearchTerm('a\\b')).toBe('a b')
  })

  it('os curingas do LIKE saem: quem digita 100% quer o texto', () => {
    expect(sanitizeSearchTerm('100%')).toBe('100')
    expect(sanitizeSearchTerm('a_b')).toBe('a b')
    expect(sanitizeSearchTerm('*')).toBe('')
  })

  it('vazio, nulo e só-gramática viram string vazia — ou seja, não filtre', () => {
    expect(sanitizeSearchTerm('')).toBe('')
    expect(sanitizeSearchTerm(null)).toBe('')
    expect(sanitizeSearchTerm(undefined)).toBe('')
    expect(sanitizeSearchTerm('   ')).toBe('')
    expect(sanitizeSearchTerm(',,,')).toBe('')
  })

  it('tem teto de tamanho', () => {
    const longo = 'a'.repeat(500)
    expect(sanitizeSearchTerm(longo)).toHaveLength(MAX_SEARCH_LENGTH)
    expect(sanitizeSearchTerm(longo, 10)).toHaveLength(10)
  })

  it('likePattern cerca de % o que sobrou, e devolve vazio quando não sobra nada', () => {
    expect(likePattern('ana')).toBe('%ana%')
    expect(likePattern('  ')).toBe('')
    expect(likePattern('()')).toBe('')
  })

  it('número e outros tipos não quebram', () => {
    expect(sanitizeSearchTerm(42)).toBe('42')
    expect(sanitizeSearchTerm(true)).toBe('true')
  })
})
