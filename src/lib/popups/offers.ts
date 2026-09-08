// =============================================
// Smart Offers — a oferta segue a intenção.
//
// Quem já está quase comprando (carrinho cheio, várias páginas, tráfego
// direto) não precisa do desconto inteiro; quem chegou frio precisa de um
// empurrão maior. O runtime mede a propensão (0–100), classifica em
// baixa / média / alta e escolhe o nível de recompensa que o lojista ligou
// a cada faixa. Uma fatia (controle) recebe sempre a oferta base, para a
// margem ganha ser medida e não suposta.
//
// O servidor não confia no tier que o cliente manda: só aceita o que as
// regras podem produzir, e "nenhuma oferta" só quando a regra diz isso.
// =============================================

export type OfferChoice = 'base' | 'none' | string // string = id de um nível progressivo

export interface SmartOfferConfig {
  enabled: boolean
  /** Abaixo disto a intenção é baixa. */
  lowMax: number
  /** A partir disto a intenção é alta. */
  highMin: number
  lowTier: OfferChoice
  midTier: OfferChoice
  highTier: OfferChoice
  /** Fatia que recebe sempre a oferta base (0–50). */
  controlPercent: number
}

export type Intent = 'low' | 'mid' | 'high'
export type OfferBucket = 'smart' | 'control'

function choice(v: unknown, fallback: OfferChoice): OfferChoice {
  if (v === 'none' || v === 'base') return v
  if (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)) return v
  return fallback
}

export function readSmartOffer(props: any): SmartOfferConfig {
  const raw = props?.smartOffer || {}
  const lowMax = Math.max(5, Math.min(90, Math.round(Number(raw.lowMax) || 35)))
  const highMin = Math.max(lowMax + 5, Math.min(95, Math.round(Number(raw.highMin) || 70)))
  return {
    enabled: !!raw.enabled,
    lowMax,
    highMin,
    lowTier: choice(raw.lowTier, 'base'),
    midTier: choice(raw.midTier, 'base'),
    highTier: choice(raw.highTier, 'base'),
    controlPercent: Math.max(0, Math.min(50, Math.round(Number(raw.controlPercent ?? 20) || 0))),
  }
}

export function intentOf(score: number, cfg: SmartOfferConfig): Intent {
  const s = Math.max(0, Math.min(100, Number(score) || 0))
  if (s < cfg.lowMax) return 'low'
  if (s >= cfg.highMin) return 'high'
  return 'mid'
}

export function offerFor(cfg: SmartOfferConfig, intent: Intent): OfferChoice {
  return intent === 'low' ? cfg.lowTier : intent === 'high' ? cfg.highTier : cfg.midTier
}

/** Só o que as regras produzem pode ser reivindicado. */
export function allowedChoices(cfg: SmartOfferConfig): Set<OfferChoice> {
  return new Set<OfferChoice>(['base', cfg.lowTier, cfg.midTier, cfg.highTier])
}

export interface ResolvedOffer {
  intent: Intent | null
  bucket: OfferBucket | null
  /** 'base' | 'none' | tier id */
  tier: OfferChoice | null
}

/**
 * Decisão do servidor a partir do que o cliente mandou. Controle sempre
 * ganha a base; smart só ganha o que a regra da intenção informada permite.
 * Tier desconhecido cai na base — nunca em "nenhuma".
 */
export function resolveOffer(cfg: SmartOfferConfig, claimed: { intent?: unknown; bucket?: unknown; tier?: unknown }, knownTierIds: string[]): ResolvedOffer {
  if (!cfg.enabled) return { intent: null, bucket: null, tier: null }
  const intent: Intent = claimed.intent === 'low' || claimed.intent === 'mid' || claimed.intent === 'high' ? claimed.intent : 'mid'
  const bucket: OfferBucket = claimed.bucket === 'control' ? 'control' : 'smart'
  if (bucket === 'control') return { intent, bucket, tier: 'base' }
  const expected = offerFor(cfg, intent)
  const wanted = typeof claimed.tier === 'string' ? claimed.tier : expected
  // O cliente pode pedir o que a regra dá para a intenção informada; um
  // pedido fora disso volta para o que a regra dá.
  let tier: OfferChoice = wanted === expected ? expected : expected
  if (tier !== 'base' && tier !== 'none' && !knownTierIds.includes(tier)) tier = 'base'
  return { intent, bucket, tier }
}
