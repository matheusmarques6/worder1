// Pure helpers for the popup editor. Extracted from page.tsx so the
// undo/redo history, the drag-and-drop type check, the steps repair and
// the atomic block-prop merge can be unit-tested in a node environment
// (see __tests__/editor-utils.test.ts).

// ── Undo/Redo history ─────────────────────────────────────────────────────────
// The history is a stack of JSON snapshots plus an index into it. All
// operations are pure: they return a NEW state (or the same reference when
// nothing changed), so React state updates stay predictable — including the
// cap-trim case, where the index is re-derived from the trimmed stack instead
// of growing unbounded (the old bug: `.slice(-30)` on the stack while the
// index kept incrementing → undo eventually read `undefined`).
export interface HistoryState {
  stack: string[]
  idx: number
}

export const HISTORY_CAP = 50

export function historySeed(json: string): HistoryState {
  return { stack: [json], idx: 0 }
}

export function historyPush(h: HistoryState, json: string, cap: number = HISTORY_CAP): HistoryState {
  // No-op commits (same snapshot) don't pollute the stack.
  if (h.idx >= 0 && h.stack[h.idx] === json) return h
  // Pushing after undo truncates the redo branch.
  let stack = [...h.stack.slice(0, h.idx + 1), json]
  if (stack.length > cap) stack = stack.slice(stack.length - cap)
  return { stack, idx: stack.length - 1 }
}

export function historyUndo(h: HistoryState): { state: HistoryState; json: string } | null {
  if (h.idx <= 0) return null
  return { state: { ...h, idx: h.idx - 1 }, json: h.stack[h.idx - 1] }
}

export function historyRedo(h: HistoryState): { state: HistoryState; json: string } | null {
  if (h.idx >= h.stack.length - 1) return null
  return { state: { ...h, idx: h.idx + 1 }, json: h.stack[h.idx + 1] }
}

export const canUndo = (h: HistoryState) => h.idx > 0
export const canRedo = (h: HistoryState) => h.idx >= 0 && h.idx < h.stack.length - 1

// ── Palette drag detection ────────────────────────────────────────────────────
// The HTML drag-and-drop spec lowercases custom dataTransfer format names, so
// setData('blockType', …) surfaces as 'blocktype' in DataTransfer.types. A
// case-sensitive `.includes('blockType')` is therefore ALWAYS false and the
// drop never gets allowed — this was the merchant-reported "não tá dando pra
// adicionar bloco" bug. Compare case-insensitively and accept both DOMStringList
// (older browsers) and frozen arrays.
export function isBlockTypeDrag(types: ArrayLike<string> | Iterable<string> | null | undefined): boolean {
  if (!types) return false
  return Array.from(types as Iterable<string>).some(
    t => typeof t === 'string' && t.toLowerCase() === 'blocktype'
  )
}

// ── Atomic block-prop merge ───────────────────────────────────────────────────
// Applying multiple prop changes MUST happen in a single onChange call.
// Two sequential `up(key, val)` calls each spread the same stale `block.props`
// from the current render, so the second call silently reverts the first
// (the corner-radius slider bug). Merge every key of the patch at once.
export function mergeBlockProps<B extends { props: Record<string, any> }>(
  block: B,
  patch: Record<string, any>
): B {
  return { ...block, props: { ...block.props, ...patch } }
}

// ── Steps repair ──────────────────────────────────────────────────────────────
// Saved designs can arrive malformed (steps: [] / missing successStep / step
// without a blocks array) — e.g. written by an older editor build or a partial
// PUT. The canvas indexes design.steps[activeStepIdx] directly, so an empty
// array crashed the whole editor. Repair on load instead of guarding every
// call site.
export interface StepLike {
  id: string
  name: string
  blocks: any[]
}

export function repairDesignSteps<T extends { steps?: any; successStep?: any }>(
  design: T,
  makeId: () => string
): T & { steps: StepLike[]; successStep: StepLike } {
  const rawSteps: any[] = Array.isArray(design.steps) ? design.steps : []
  let changed = !Array.isArray(design.steps)

  const steps: StepLike[] = rawSteps.map((s: any, i: number) => {
    if (s && typeof s === 'object' && typeof s.id === 'string' && Array.isArray(s.blocks)) return s
    changed = true
    return {
      id: (s && typeof s?.id === 'string' && s.id) || makeId(),
      name: (s && typeof s?.name === 'string' && s.name) || `Etapa ${i + 1}`,
      blocks: Array.isArray(s?.blocks) ? s.blocks : [],
    }
  })

  if (steps.length === 0) {
    changed = true
    steps.push({ id: makeId(), name: 'Etapa 1', blocks: [] })
  }

  let successStep: StepLike = design.successStep
  if (!(successStep && typeof successStep === 'object' && typeof successStep.id === 'string' && Array.isArray(successStep.blocks))) {
    changed = true
    successStep = {
      id: (successStep && typeof (successStep as any)?.id === 'string' && (successStep as any).id) || makeId(),
      name: (successStep && typeof (successStep as any)?.name === 'string' && (successStep as any).name) || 'Sucesso',
      blocks: Array.isArray((successStep as any)?.blocks) ? (successStep as any).blocks : [],
    }
  }

  return (changed ? { ...design, steps, successStep } : design) as T & { steps: StepLike[]; successStep: StepLike }
}

// ── Countdown preview ─────────────────────────────────────────────────────────
// Real remaining time for the editor preview (the runtime computes the same on
// the storefront). Empty/invalid/past endDate → all zeros, which is exactly
// what the visitor would see — the editor pairs it with a warning.
export function countdownValues(
  endDate: string | null | undefined,
  now: number = Date.now()
): [string, string, string, string] {
  const zero: [string, string, string, string] = ['00', '00', '00', '00']
  if (!endDate) return zero
  const end = new Date(endDate).getTime()
  if (!Number.isFinite(end)) return zero
  let diff = Math.max(0, Math.floor((end - now) / 1000))
  const days = Math.floor(diff / 86400)
  diff -= days * 86400
  const hours = Math.floor(diff / 3600)
  diff -= hours * 3600
  const minutes = Math.floor(diff / 60)
  const seconds = diff - minutes * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return [pad(days), pad(hours), pad(minutes), pad(seconds)]
}
