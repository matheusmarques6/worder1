// =============================================
// Etapas ramificadas — o que o servidor precisa saber do caminho
//
// O runtime decide para onde ir (opção escolhida → etapa, botão → etapa)
// e manda o caminho percorrido no submit. Aqui o caminho é validado
// contra o design (só ids que existem), as tags das opções escolhidas
// são derivadas das RESPOSTAS (nunca de uma lista de tags que o cliente
// mandaria), e o tier da recompensa é escolhido pelo caminho.
// =============================================

export interface DesignStepLike { id?: string; kind?: string; name?: string; blocks?: any[] }

export const STEP_KINDS = ['welcome', 'form', 'quiz', 'lesson', 'reward', 'consent'] as const

const INPUT_TYPES = new Set(['email', 'phone', 'text-input', 'name', 'date', 'dropdown', 'radio', 'checkbox', 'textarea', 'number'])

/** A chave da resposta de um bloco de entrada, pela mesma regra do runtime. */
export function inputAnswerKey(block: { type?: string; props?: any }): string | null {
  const t = String(block?.type || '')
  const p = block?.props || {}
  if (t === 'dropdown' || t === 'radio' || t === 'checkbox') return choiceAnswerKey(block)
  if (t === 'email') return 'email'
  if (t === 'phone') return p.mapTo && p.mapTo !== 'phone' ? String(p.mapTo) : 'phone'
  if (!INPUT_TYPES.has(t)) return null
  const mapTo = typeof p.mapTo === 'string' && p.mapTo ? p.mapTo : null
  if (mapTo === 'custom') return `custom:${String(p.mapToCustom || p.label || '').trim()}`
  return mapTo || (p.label ? `custom:${String(p.label).trim()}` : null)
}

/**
 * Das etapas do caminho, só as que a pessoa de fato respondeu: toda entrada
 * obrigatória da etapa precisa ter valor. Uma etapa sem entradas
 * obrigatórias (lição, boas-vindas) conta só por estar no caminho. É o que
 * impede reivindicar o nível do quiz sem responder o quiz.
 */
export function stepsWithAnswers(
  path: string[],
  steps: Array<{ id: string; blocks?: Array<{ type?: string; props?: any }> }>,
  answers: Record<string, unknown>,
): string[] {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const has = (k: string | null) => {
    if (!k) return true
    const v = answers?.[k]
    return v != null && String(v).trim() !== ''
  }
  return path.filter((id) => {
    const st = byId.get(id)
    if (!st) return false
    const required = (st.blocks || []).filter((b) => INPUT_TYPES.has(String(b?.type || '')) && b?.props?.required === true)
    return required.every((b) => has(inputAnswerKey(b)))
  })
}
export type StepKind = (typeof STEP_KINDS)[number]

const CHOICE_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

/** A chave da resposta de um bloco de escolha — a mesma regra do runtime. */
export function choiceAnswerKey(block: any): string {
  const p = block?.props || {}
  const fallback = block?.type === 'dropdown' ? 'select' : block?.type === 'radio' ? 'radio' : 'check'
  if (p.mapTo === 'custom') return 'custom:' + (p.mapToCustom || p.label || fallback)
  return p.mapTo || p.label || fallback
}

/** Só ids de etapas que existem, na ordem, sem repetição consecutiva, teto de 30. */
export function sanitizeStepPath(raw: unknown, steps: DesignStepLike[]): string[] {
  if (!Array.isArray(raw)) return []
  const known = new Set((steps || []).map((s) => String(s?.id || '')).filter(Boolean))
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string' || v.length === 0 || v.length > 64) continue
    if (!known.has(v)) continue
    if (out[out.length - 1] === v) continue
    out.push(v)
    if (out.length >= 30) break
  }
  return out
}

function selectedValues(answers: Record<string, unknown>, key: string): string[] {
  const v = answers[key]
  if (v === undefined || v === null) return []
  return String(v).split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Tags a aplicar no contato, a partir das opções escolhidas. O design diz
 * "opção X → tags [a, b]" (props.tagsByOption); a resposta diz qual opção
 * foi escolhida. Um quiz vira segmentação sem o cliente poder inventar
 * tag nenhuma.
 */
export function tagsFromAnswers(designBlocks: any[], answers: Record<string, unknown>): string[] {
  const out = new Set<string>()
  for (const b of designBlocks || []) {
    if (!b || !CHOICE_TYPES.has(b.type)) continue
    const map = b.props?.tagsByOption
    if (!map || typeof map !== 'object') continue
    const key = choiceAnswerKey(b)
    for (const val of selectedValues(answers, key)) {
      const raw = (map as Record<string, unknown>)[val]
      const tags = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
      for (const t of tags) {
        const clean = String(t).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40)
        if (clean) out.add(clean)
      }
    }
  }
  return Array.from(out)
}

export interface RewardTier {
  id: string
  label: string
  afterStepId: string
  kind: 'percent' | 'fixed' | 'free_shipping'
  value: number
  staticCode: string | null
  codePrefix: string | null
}

/** Lê os tiers do bloco de cupom, descartando os malformados. */
export function readRewardTiers(couponProps: any): RewardTier[] {
  const raw = Array.isArray(couponProps?.tiers) ? couponProps.tiers : []
  const out: RewardTier[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const id = String(t.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
    // Sem etapa o nível não se desbloqueia pelo caminho, mas continua
    // existindo: a roleta/raspadinha e a oferta por intenção escolhem
    // níveis pelo id, e o pool de códigos dele precisa ser criado.
    const afterStepId = String(t.afterStepId || '')
    if (!id) continue
    const kind: RewardTier['kind'] =
      t.discountType === 'free_shipping' ? 'free_shipping'
        : t.discountType === 'fixed_amount' || t.discountType === 'fixed' ? 'fixed'
          : 'percent'
    out.push({
      id,
      label: String(t.label || '').slice(0, 80),
      afterStepId,
      kind,
      value: kind === 'free_shipping' ? 0 : Math.max(0, Number(t.discountValue) || 0),
      staticCode: String(t.code || '').trim().toUpperCase() || null,
      codePrefix: String(t.codePrefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || null,
    })
  }
  return out
}

/**
 * O tier que valeu: o ÚLTIMO, na ordem em que o lojista os listou, cuja
 * etapa de desbloqueio aparece no caminho. Sem tier casando, vale a base.
 */
export function effectiveRewardTier(tiers: RewardTier[], stepPath: string[]): RewardTier | null {
  const visited = new Set(stepPath)
  let chosen: RewardTier | null = null
  for (const t of tiers) if (t.afterStepId && visited.has(t.afterStepId)) chosen = t
  return chosen
}

/** Qual etapa cada opção leva (props.branches) — validada contra o design. */
export function sanitizeBranches(raw: unknown, steps: DesignStepLike[]): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const known = new Set((steps || []).map((s) => String(s?.id || '')))
  const out: Record<string, string> = {}
  for (const [opt, stepId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof stepId === 'string' && known.has(stepId)) out[opt] = stepId
  }
  return out
}
