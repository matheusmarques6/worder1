// =============================================
// Gamificação — roleta e raspadinha.
//
// O prêmio NUNCA é decidido no navegador. O bloco declara os segmentos
// (rótulo, peso, o que dá: oferta base, um nível progressivo ou nada); no
// envio o servidor sorteia pelo peso, emite o cupom daquele nível e devolve
// o índice do segmento — o runtime só anima a roleta até parar nele. Assim
// "girar de novo" ou mexer no JS não muda o prêmio, e a prova fica na
// submissão (game_prize).
// =============================================

export type GameType = 'wheel' | 'scratch'
export type PrizeChoice = 'base' | 'none' | string // string = id de um nível progressivo

export interface GameSegment {
  id: string
  label: string
  prize: PrizeChoice
  weight: number
  color: string
}

export interface GameConfig {
  type: GameType
  blockId: string
  segments: GameSegment[]
  buttonText: string
}

const DEFAULT_COLORS = ['#F97316', '#111827', '#FDBA74', '#374151', '#FB923C', '#1F2937', '#FED7AA', '#4B5563']

function prize(v: unknown): PrizeChoice {
  if (v === 'none' || v === 'base') return v
  if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)) return v
  return 'base'
}

export function sanitizeSegments(raw: unknown, type: GameType): GameSegment[] {
  const list = Array.isArray(raw) ? raw : []
  const out: GameSegment[] = []
  list.slice(0, 12).forEach((s: any, i: number) => {
    if (!s || typeof s !== 'object') return
    const id = typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.id) ? s.id : `s${i + 1}`
    out.push({
      id,
      label: String(s.label || '').slice(0, 40) || `Prêmio ${i + 1}`,
      prize: prize(s.prize),
      weight: Math.max(0, Math.min(1000, Math.round(Number(s.weight) || 0))),
      color: typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    })
  })
  // Um jogo precisa de ao menos dois segmentos e algum peso; a raspadinha
  // aceita um só (o prêmio é sempre o mesmo, só a revelação é o jogo).
  const min = type === 'wheel' ? 2 : 1
  if (out.length < min) return []
  if (out.every((s) => s.weight <= 0)) out.forEach((s) => { s.weight = 1 })
  return out
}

/** O primeiro bloco de jogo do design (em qualquer etapa antes do sucesso). */
export function readGameBlock(design: any): GameConfig | null {
  const steps = Array.isArray(design?.steps) ? design.steps : []
  for (const st of steps) {
    for (const b of Array.isArray(st?.blocks) ? st.blocks : []) {
      if (b?.type !== 'wheel' && b?.type !== 'scratch') continue
      const type: GameType = b.type
      const segments = sanitizeSegments(b.props?.segments, type)
      if (!segments.length) return null
      return { type, blockId: String(b.id || ''), segments, buttonText: String(b.props?.buttonText || (type === 'wheel' ? 'Girar' : 'Raspar')).slice(0, 40) }
    }
  }
  return null
}

/**
 * Sorteio pelo peso. `rand` em [0,1) — no servidor vem de crypto; no teste
 * é fixo. Devolve o índice do segmento.
 */
export function pickSegment(segments: GameSegment[], rand: number): number {
  const total = segments.reduce((s, x) => s + Math.max(0, x.weight), 0)
  if (!segments.length) return -1
  if (total <= 0) return 0
  const r = Math.min(0.999999, Math.max(0, rand)) * total
  let acc = 0
  for (let i = 0; i < segments.length; i++) {
    acc += Math.max(0, segments[i].weight)
    if (r < acc) return i
  }
  return segments.length - 1
}

export function secureRandom(): number {
  try {
    const { randomInt } = require('crypto') as typeof import('crypto')
    return randomInt(0, 1_000_000) / 1_000_000
  } catch {
    return Math.random()
  }
}

export interface GameResult {
  type: GameType
  segment: number
  segmentId: string
  label: string
  prize: PrizeChoice
}

export function playGame(game: GameConfig, rand = secureRandom()): GameResult {
  const i = pickSegment(game.segments, rand)
  const s = game.segments[Math.max(0, i)]
  return { type: game.type, segment: Math.max(0, i), segmentId: s.id, label: s.label, prize: s.prize }
}
