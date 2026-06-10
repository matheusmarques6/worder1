// =============================================
// Diff de linhas + detecção de mudanças versionáveis (Bloco F1)
//
// Helpers PUROS (sem I/O) usados pelo serviço de versões e testáveis
// em unidade. `DiffLine` é estruturalmente idêntico ao DiffLine da UI
// (src/components/agents/ui/primitives.tsx) — mantido separado para a
// lib server-side não importar um módulo 'use client'.
// =============================================

export type DiffLine = { type: 'ctx' | 'add' | 'rem'; text: string }

const VERSIONABLE_FIELDS = ['system_prompt', 'persona', 'settings'] as const
export type VersionableField = (typeof VERSIONABLE_FIELDS)[number]

function splitLines(value: string): string[] {
  if (!value) return []
  return value.replace(/\r\n/g, '\n').split('\n')
}

/**
 * Diff linha-a-linha baseado em LCS (O(n·m) — suficiente para prompts).
 * Em substituições, remoções saem antes das adições.
 */
export function diffLines(prev: string, next: string): DiffLine[] {
  const a = splitLines(prev)
  const b = splitLines(next)
  if (a.length === 0 && b.length === 0) return []

  const n = a.length
  const m = b.length

  // dp[i][j] = tamanho do LCS de a[i..] vs b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'rem', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'rem', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

/** Serialização determinística (chaves ordenadas) p/ deep-compare de jsonb. */
function stableStringify(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

export function jsonEquals(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

/**
 * Quais campos versionáveis mudaram entre o estado atual e o incoming.
 * Campo `undefined` no incoming = não enviado = inalterado.
 * persona/settings (jsonb) usam deep-compare com chaves ordenadas — mesma
 * estrutura com ordem de chaves diferente NÃO conta como mudança.
 */
export function hasVersionableChanges(
  current: Partial<Record<VersionableField, unknown>>,
  incoming: Partial<Record<VersionableField, unknown>>
): VersionableField[] {
  const changed: VersionableField[] = []
  for (const field of VERSIONABLE_FIELDS) {
    if (incoming[field] === undefined) continue
    if (!jsonEquals(current[field] ?? null, incoming[field])) changed.push(field)
  }
  return changed
}
