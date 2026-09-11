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
  // Web Crypto existe no Node 18+ e em qualquer navegador — sem require.
  const c: any = (globalThis as any).crypto
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1)
    c.getRandomValues(a)
    return a[0] / 4294967296
  }
  return Math.random()
}

// ---------------------------------------------------------------------------
// Geometria da roleta — a mesma no editor (SVG em React) e no runtime (SVG
// em string). Os setores começam às 12h e seguem no sentido horário; o
// ponteiro fica fixo em cima e a roleta gira até o centro do setor sorteado.
// ---------------------------------------------------------------------------
// O raio dos setores para em 132 (e não em 150) porque os 18px de fora
// são o aro: ele não gira, e é o que dá volume à peça.
export const WHEEL_R = 132
export const WHEEL_C = 150
/** Raio do aro (o centro do traço) e a espessura dele. */
export const WHEEL_RIM_R = 141
export const WHEEL_RIM_W = 17

export function wheelSectorPath(i: number, n: number, r = WHEEL_R, c = WHEEL_C): string {
  const step = 360 / Math.max(2, n)
  const a0 = (i * step - 90) * Math.PI / 180
  // Dois setores = arcos de 180°: um pingo a menos evita o arco ambíguo.
  const a1 = ((i + 1) * step - 90 - (n === 2 ? 0.01 : 0)) * Math.PI / 180
  const f = (v: number) => v.toFixed(2)
  return `M${c} ${c} L${f(c + r * Math.cos(a0))} ${f(c + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f(c + r * Math.cos(a1))} ${f(c + r * Math.sin(a1))} Z`
}

export function wheelLabelPos(i: number, n: number, r = WHEEL_R, c = WHEEL_C): { x: number; y: number; angle: number } {
  const step = 360 / Math.max(2, n)
  const angle = (i + 0.5) * step - 90
  const rad = angle * Math.PI / 180
  return { x: Number((c + r * 0.63 * Math.cos(rad)).toFixed(2)), y: Number((c + r * 0.63 * Math.sin(rad)).toFixed(2)), angle: Number(angle.toFixed(2)) }
}

/**
 * O pino de cada divisão, na borda do disco. Ele gira junto com a roleta
 * — é nele que o ponteiro bate, e a batida é o que faz o giro parecer
 * mecânico em vez de desenhado.
 */
export function wheelPinPos(i: number, n: number, r = WHEEL_R, c = WHEEL_C): { x: number; y: number } {
  const rad = (i * (360 / Math.max(2, n)) - 90) * Math.PI / 180
  return { x: Number((c + (r - 4) * Math.cos(rad)).toFixed(2)), y: Number((c + (r - 4) * Math.sin(rad)).toFixed(2)) }
}

/** Rotação (graus, sentido horário) que leva o centro do setor i ao ponteiro, com cinco voltas antes. */
export function wheelTargetRotation(i: number, n: number, jitter = 0): number {
  const step = 360 / Math.max(2, n)
  return 360 * 5 - (i + 0.5) * step + Math.max(-0.25, Math.min(0.25, jitter)) * step
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
