import { describe, it, expect } from 'vitest'
import { sanitizeSegments, readGameBlock, pickSegment, playGame } from '../games'

const segs = [
  { id: 'a', label: '10% OFF', prize: 'base', weight: 50, color: '#F97316' },
  { id: 'b', label: '25% OFF', prize: 't-big', weight: 10, color: '#111827' },
  { id: 'c', label: 'Tente de novo', prize: 'none', weight: 40, color: '#FDBA74' },
]

describe('segmentos do jogo', () => {
  it('sanitiza rótulo, prêmio, peso e cor; roleta precisa de dois segmentos', () => {
    const out = sanitizeSegments([{ label: 'x'.repeat(80), prize: '<b>', weight: -5, color: 'red' }, { label: 'Frete', prize: 'none', weight: 3 }], 'wheel')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 's1', label: 'x'.repeat(40), prize: 'base', weight: 0 })
    expect(out[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(sanitizeSegments([{ label: 'só um', weight: 1 }], 'wheel')).toEqual([])
    expect(sanitizeSegments([{ label: 'só um', weight: 1 }], 'scratch')).toHaveLength(1)
  })

  it('todos os pesos zerados viram 1 (senão ninguém ganha nada)', () => {
    const out = sanitizeSegments([{ label: 'a', weight: 0 }, { label: 'b', weight: 0 }], 'wheel')
    expect(out.map((s) => s.weight)).toEqual([1, 1])
  })

  it('lê o primeiro bloco de jogo do design', () => {
    const g = readGameBlock({ steps: [{ blocks: [{ id: 'w1', type: 'wheel', props: { segments: segs, buttonText: 'Gira!' } }] }] })
    expect(g).toMatchObject({ type: 'wheel', blockId: 'w1', buttonText: 'Gira!' })
    expect(g!.segments).toHaveLength(3)
    expect(readGameBlock({ steps: [{ blocks: [{ type: 'text' }] }] })).toBeNull()
  })
})

describe('sorteio', () => {
  it('respeita os pesos: 0–0,5 → a, 0,5–0,6 → b, 0,6–1 → c', () => {
    const s = sanitizeSegments(segs, 'wheel')
    expect(pickSegment(s, 0)).toBe(0)
    expect(pickSegment(s, 0.49)).toBe(0)
    expect(pickSegment(s, 0.5)).toBe(1)
    expect(pickSegment(s, 0.599)).toBe(1)
    expect(pickSegment(s, 0.6)).toBe(2)
    expect(pickSegment(s, 0.999)).toBe(2)
  })

  it('playGame devolve o segmento e o prêmio', () => {
    const g = readGameBlock({ steps: [{ blocks: [{ id: 'w1', type: 'wheel', props: { segments: segs } }] }] })!
    expect(playGame(g, 0.55)).toEqual({ type: 'wheel', segment: 1, segmentId: 'b', label: '25% OFF', prize: 't-big' })
    const r = playGame(g)
    expect(r.segment).toBeGreaterThanOrEqual(0)
    expect(r.segment).toBeLessThan(3)
  })
})
