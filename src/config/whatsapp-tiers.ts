// =============================================
// WHATSAPP TIERS — SINGLE SOURCE OF TRUTH
// Tier numerics + tier source-of-truth map (Phase 4).
//
// Two independent Meta systems are modeled here:
//  1) Messaging limit  = UNIQUE business-initiated recipients per rolling 24h.
//     Derived from Meta's enum STRING `messaging_limit` (API: messaging_limit_tier),
//     NOT the never-written numeric `messaging_tier` column. [FIX-C1]
//  2) Throughput (MPS) = per-phone-number, NOT a function of the messaging tier. [FIX-M3]
// https://developers.facebook.com/docs/whatsapp/messaging-limits
// =============================================

/** Messaging limit = UNIQUE business-initiated recipients per rolling 24h. */
export const MESSAGING_LIMIT_BY_TIER: Record<number, number> = {
  0: 250, // TIER_250 / unverified default
  1: 1000, // TIER_1K   ([FIX] was 2000)
  2: 10000, // TIER_10K
  3: 100000, // TIER_100K
  4: Infinity, // UNLIMITED
}

export const TIER_NAME: Record<number, string> = {
  0: 'Não verificado',
  1: 'Tier 1K',
  2: 'Tier 10K',
  3: 'Tier 100K',
  4: 'Unlimited',
}

// [FIX-C1] Meta's REAL source: enum string `messaging_limit` / API `messaging_limit_tier`.
// Mirrors the existing WabaHealthWidget TIER_MAP indices.
export const MESSAGING_LIMIT_STRING_TO_TIER: Record<string, number> = {
  TIER_NOT_SET: 0,
  TIER_250: 0,
  TIER_1K: 1,
  TIER_10K: 2,
  TIER_100K: 3,
  UNLIMITED: 4,
  TIER_UNLIMITED: 4,
}

/** Deterministic, safe-by-default derivation. Unknown/missing → tier 0 (most conservative). */
export function tierFromMessagingLimit(s: string | null | undefined): number {
  if (!s) return 0
  return MESSAGING_LIMIT_STRING_TO_TIER[s] ?? 0
}

// [FIX-M3] Throughput is per-phone-number, NOT tier-derived. Tier-0/unverified stays low
// until a per-instance throughput_mps override exists (avoids 429 storms before backoff).
export const DEFAULT_THROUGHPUT_MPS = 80
export const TIER0_THROUGHPUT_MPS = 10
export const MAX_THROUGHPUT_MPS = 1000

export function throughputMpsForTier(tier: number): number {
  return tier === 0 ? TIER0_THROUGHPUT_MPS : DEFAULT_THROUGHPUT_MPS
}

// [FIX-L2] Infinity JSON-serializes to null. Wire sentinel for "unlimited".
export const UNLIMITED_SENTINEL = -1

export type TierLevel = keyof typeof MESSAGING_LIMIT_BY_TIER

// Back-compat TIER_CONFIG-shaped export (mps now per-tier via throughputMpsForTier,
// NOT the old hand-coded tier ladder). daily uses the corrected unique-recipient limits.
export const TIER_CONFIG: Record<number, { mps: number; daily: number; name: string }> =
  Object.fromEntries(
    Object.keys(MESSAGING_LIMIT_BY_TIER).map((k): [number, { mps: number; daily: number; name: string }] => {
      const t = Number(k)
      return [t, { mps: throughputMpsForTier(t), daily: MESSAGING_LIMIT_BY_TIER[t], name: TIER_NAME[t] }]
    })
  ) as Record<number, { mps: number; daily: number; name: string }>

