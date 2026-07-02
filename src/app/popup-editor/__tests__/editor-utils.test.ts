import { describe, it, expect } from 'vitest'
import {
  type HistoryState,
  historySeed,
  historyPush,
  historyUndo,
  historyRedo,
  canUndo,
  canRedo,
  isBlockTypeDrag,
  mergeBlockProps,
  repairDesignSteps,
  countdownValues,
} from '../editor-utils'

// ── History ──────────────────────────────────────────────────────────────────
describe('history manager', () => {
  it('seeds with the initial design so the first undo returns to it', () => {
    const h = historySeed('"initial"')
    expect(h).toEqual({ stack: ['"initial"'], idx: 0 })
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('push advances the index and enables undo', () => {
    let h = historySeed('a')
    h = historyPush(h, 'b')
    expect(h).toEqual({ stack: ['a', 'b'], idx: 1 })
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)
  })

  it('duplicate pushes are no-ops (same reference back)', () => {
    const h1 = historyPush(historySeed('a'), 'b')
    const h2 = historyPush(h1, 'b')
    expect(h2).toBe(h1)
  })

  it('undo/redo walk the stack and never read undefined', () => {
    let h = historySeed('a')
    h = historyPush(h, 'b')
    h = historyPush(h, 'c')

    const u1 = historyUndo(h)!
    expect(u1.json).toBe('b')
    const u2 = historyUndo(u1.state)!
    expect(u2.json).toBe('a')
    expect(historyUndo(u2.state)).toBeNull() // bottom reached, no crash

    const r1 = historyRedo(u2.state)!
    expect(r1.json).toBe('b')
    const r2 = historyRedo(r1.state)!
    expect(r2.json).toBe('c')
    expect(historyRedo(r2.state)).toBeNull() // top reached, no crash
  })

  it('pushing after undo truncates the redo branch', () => {
    let h = historySeed('a')
    h = historyPush(h, 'b')
    h = historyPush(h, 'c')
    h = historyUndo(h)!.state // back at 'b'
    h = historyPush(h, 'd')
    expect(h.stack).toEqual(['a', 'b', 'd'])
    expect(h.idx).toBe(2)
    expect(canRedo(h)).toBe(false)
  })

  it('cap-trim clamps the index instead of letting it grow unbounded (old .slice(-30) bug)', () => {
    let h = historySeed('s0')
    for (let i = 1; i <= 60; i++) h = historyPush(h, `s${i}`, 30)
    expect(h.stack).toHaveLength(30)
    expect(h.idx).toBe(29) // index stays inside the trimmed stack
    expect(h.stack[h.idx]).toBe('s60')

    // After 31+ edits, undo must still return valid snapshots all the way down.
    let cur: HistoryState = h
    let steps = 0
    for (;;) {
      const res = historyUndo(cur)
      if (!res) break
      expect(res.json).toBeTypeOf('string')
      expect(res.json).not.toBe('undefined')
      cur = res.state
      steps++
    }
    expect(steps).toBe(29)
    expect(cur.stack[cur.idx]).toBe('s31')
  })
})

// ── Palette drag detection ────────────────────────────────────────────────────
describe('isBlockTypeDrag', () => {
  it('matches the spec-lowercased custom format name', () => {
    expect(isBlockTypeDrag(['blocktype'])).toBe(true)
  })

  it('matches the camelCase name too (defensive)', () => {
    expect(isBlockTypeDrag(['blockType'])).toBe(true)
  })

  it('matches when mixed with other types', () => {
    expect(isBlockTypeDrag(['text/plain', 'blocktype'])).toBe(true)
  })

  it('rejects unrelated drags (text, files) and empty/missing lists', () => {
    expect(isBlockTypeDrag(['text/plain', 'Files'])).toBe(false)
    expect(isBlockTypeDrag([])).toBe(false)
    expect(isBlockTypeDrag(null)).toBe(false)
    expect(isBlockTypeDrag(undefined)).toBe(false)
  })

  it('works with array-like DOMStringList shapes', () => {
    const listLike = { 0: 'blocktype', length: 1 } as ArrayLike<string>
    expect(isBlockTypeDrag(listLike)).toBe(true)
  })
})

// ── Atomic prop merge ─────────────────────────────────────────────────────────
describe('mergeBlockProps', () => {
  it('applies multiple keys in one update (the corner-radius fix)', () => {
    const block = { id: 'b1', type: 'email', props: { cornerRadius: 8, corners: 'medium', placeholder: 'x' } }
    const next = mergeBlockProps(block, { cornerRadius: 22, corners: 'custom' })
    expect(next.props.cornerRadius).toBe(22) // NOT clobbered back to 8
    expect(next.props.corners).toBe('custom')
    expect(next.props.placeholder).toBe('x') // untouched props preserved
  })

  it('does not mutate the original block', () => {
    const block = { id: 'b1', type: 'email', props: { a: 1 } }
    const next = mergeBlockProps(block, { a: 2 })
    expect(block.props.a).toBe(1)
    expect(next).not.toBe(block)
    expect(next.props).not.toBe(block.props)
  })
})

// ── Steps repair ──────────────────────────────────────────────────────────────
describe('repairDesignSteps', () => {
  let seq = 0
  const makeId = () => `gen-${++seq}`

  it('creates a default step when steps is empty (crashed the canvas before)', () => {
    const repaired = repairDesignSteps({ steps: [] as any[], successStep: { id: 's', name: 'Sucesso', blocks: [] } }, makeId)
    expect(repaired.steps).toHaveLength(1)
    expect(repaired.steps[0].name).toBe('Etapa 1')
    expect(repaired.steps[0].blocks).toEqual([])
  })

  it('creates steps and successStep when both are missing', () => {
    const repaired = repairDesignSteps({} as any, makeId)
    expect(repaired.steps).toHaveLength(1)
    expect(Array.isArray(repaired.successStep.blocks)).toBe(true)
    expect(repaired.successStep.name).toBe('Sucesso')
  })

  it('repairs a step whose blocks is not an array, keeping id/name', () => {
    const repaired = repairDesignSteps(
      { steps: [{ id: 'keep', name: 'Minha etapa', blocks: null }], successStep: { id: 's', name: 'Sucesso', blocks: [] } } as any,
      makeId,
    )
    expect(repaired.steps[0]).toEqual({ id: 'keep', name: 'Minha etapa', blocks: [] })
  })

  it('returns the SAME reference for a well-formed design (no spurious rerenders)', () => {
    const design = {
      steps: [{ id: 'a', name: 'Etapa 1', blocks: [{ id: 'b', type: 'text', props: {} }] }],
      successStep: { id: 's', name: 'Sucesso', blocks: [] },
      styles: { width: 700 },
    }
    expect(repairDesignSteps(design, makeId)).toBe(design)
  })
})

// ── Countdown preview values ──────────────────────────────────────────────────
describe('countdownValues', () => {
  const NOW = new Date('2026-07-02T12:00:00Z').getTime()

  it('returns zeros when endDate is empty (paired with the editor warning)', () => {
    expect(countdownValues('', NOW)).toEqual(['00', '00', '00', '00'])
    expect(countdownValues(undefined, NOW)).toEqual(['00', '00', '00', '00'])
    expect(countdownValues(null, NOW)).toEqual(['00', '00', '00', '00'])
  })

  it('returns zeros for invalid and past dates (what the visitor would see)', () => {
    expect(countdownValues('not-a-date', NOW)).toEqual(['00', '00', '00', '00'])
    expect(countdownValues('2026-07-01T12:00:00Z', NOW)).toEqual(['00', '00', '00', '00'])
  })

  it('computes real remaining time, zero-padded', () => {
    // 1 day, 1 hour, 1 minute, 1 second in the future
    const end = new Date(NOW + ((26 * 3600 + 61) * 1000)).toISOString()
    expect(countdownValues(end, NOW)).toEqual(['01', '02', '01', '01'])
  })

  it('handles a clean multi-day remainder', () => {
    const end = new Date(NOW + ((3 * 86400 + 12 * 3600 + 45 * 60 + 30) * 1000)).toISOString()
    expect(countdownValues(end, NOW)).toEqual(['03', '12', '45', '30'])
  })
})
