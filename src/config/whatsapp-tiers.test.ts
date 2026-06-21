// =============================================
// Phase 4 — config/whatsapp-tiers.ts (NEW single source of truth).
//
// These tests describe the Phase-4 CONTRACT for the new config module. They are
// RED until the executor creates `src/config/whatsapp-tiers.ts` per plan §A.3.
//
// Covers acceptance criteria:
//   - tierFromMessagingLimit: TIER_250→0 … TIER_UNLIMITED→4; null/unknown→0.
//   - MPS decoupled from tier (flat ~80; tier-0 conservative).
//   - MESSAGING_LIMIT_BY_TIER: tier-1 = 1000 (not 2000); single source.
//   - UNLIMITED_SENTINEL serialization (Infinity → -1 on the wire).
// =============================================
import { describe, it, expect } from 'vitest'

import {
  MESSAGING_LIMIT_BY_TIER,
  MESSAGING_LIMIT_STRING_TO_TIER,
  tierFromMessagingLimit,
  throughputMpsForTier,
  DEFAULT_THROUGHPUT_MPS,
  TIER0_THROUGHPUT_MPS,
  MAX_THROUGHPUT_MPS,
  UNLIMITED_SENTINEL,
  TIER_NAME,
  TIER_CONFIG,
} from '@/config/whatsapp-tiers'

describe('MESSAGING_LIMIT_BY_TIER — canonical Meta daily limits', () => {
  it('maps tiers to the canonical unique-recipient/24h limits', () => {
    expect(MESSAGING_LIMIT_BY_TIER[0]).toBe(250)
    expect(MESSAGING_LIMIT_BY_TIER[1]).toBe(1000) // [FIX] was 2000
    expect(MESSAGING_LIMIT_BY_TIER[2]).toBe(10000)
    expect(MESSAGING_LIMIT_BY_TIER[3]).toBe(100000)
    expect(MESSAGING_LIMIT_BY_TIER[4]).toBe(Infinity)
  })

  it('tier-1 is 1000 NOT the legacy buggy 2000', () => {
    expect(MESSAGING_LIMIT_BY_TIER[1]).not.toBe(2000)
  })
})

describe('tierFromMessagingLimit — Meta enum string is the source of truth ([FIX-C1])', () => {
  it('maps each canonical enum to its tier index', () => {
    expect(tierFromMessagingLimit('TIER_250')).toBe(0)
    expect(tierFromMessagingLimit('TIER_1K')).toBe(1)
    expect(tierFromMessagingLimit('TIER_10K')).toBe(2)
    expect(tierFromMessagingLimit('TIER_100K')).toBe(3)
    expect(tierFromMessagingLimit('UNLIMITED')).toBe(4)
  })

  it('accepts the TIER_UNLIMITED alias as 4', () => {
    expect(tierFromMessagingLimit('TIER_UNLIMITED')).toBe(4)
  })

  it('treats TIER_NOT_SET as the conservative tier 0 (250)', () => {
    expect(tierFromMessagingLimit('TIER_NOT_SET')).toBe(0)
  })

  it('null / undefined / empty / unknown → tier 0 (safe default)', () => {
    expect(tierFromMessagingLimit(null)).toBe(0)
    expect(tierFromMessagingLimit(undefined)).toBe(0)
    expect(tierFromMessagingLimit('')).toBe(0)
    expect(tierFromMessagingLimit('TIER_DISABLED')).toBe(0)
    expect(tierFromMessagingLimit('garbage')).toBe(0)
  })

  it('the string→tier map matches alerts.ts / WabaHealthWidget enum surface', () => {
    // alerts.ts:218 checks TIER_250 / TIER_1K; widget TIER_MAP uses the same set.
    for (const s of ['TIER_250', 'TIER_1K', 'TIER_10K', 'TIER_100K', 'UNLIMITED']) {
      expect(MESSAGING_LIMIT_STRING_TO_TIER[s]).toBeTypeOf('number')
    }
  })
})

describe('throughputMpsForTier — MPS decoupled from messaging tier ([FIX-M3])', () => {
  it('tier-0/unverified stays conservative (10), NOT flat 80', () => {
    expect(throughputMpsForTier(0)).toBe(TIER0_THROUGHPUT_MPS)
    expect(throughputMpsForTier(0)).toBe(10)
  })

  it('tiers >= 1 are flat at the Meta default (80), independent of daily limit', () => {
    expect(throughputMpsForTier(1)).toBe(DEFAULT_THROUGHPUT_MPS)
    expect(throughputMpsForTier(2)).toBe(DEFAULT_THROUGHPUT_MPS)
    expect(throughputMpsForTier(3)).toBe(DEFAULT_THROUGHPUT_MPS)
    expect(throughputMpsForTier(4)).toBe(DEFAULT_THROUGHPUT_MPS)
    expect(DEFAULT_THROUGHPUT_MPS).toBe(80)
  })

  it('is NOT the legacy tier ladder (10/40/60/80/500)', () => {
    // Old TIER_CONFIG had mps 40/60/80/500 for tiers 1..4. New design is flat 80.
    expect(throughputMpsForTier(1)).not.toBe(40)
    expect(throughputMpsForTier(2)).not.toBe(60)
    expect(throughputMpsForTier(4)).not.toBe(500)
  })

  it('MPS is independent of the messaging-limit numeric', () => {
    // Two different tiers with different daily limits but same MPS.
    expect(throughputMpsForTier(2)).toBe(throughputMpsForTier(3))
    expect(MESSAGING_LIMIT_BY_TIER[2]).not.toBe(MESSAGING_LIMIT_BY_TIER[3])
  })

  it('exposes a max-throughput ceiling constant (~1000)', () => {
    expect(MAX_THROUGHPUT_MPS).toBe(1000)
  })
})

describe('UNLIMITED_SENTINEL — Infinity must not reach JSON ([FIX-L2])', () => {
  it('is -1 and survives JSON round-trip (Infinity does not)', () => {
    expect(UNLIMITED_SENTINEL).toBe(-1)
    expect(JSON.parse(JSON.stringify({ x: UNLIMITED_SENTINEL })).x).toBe(-1)
    // Proof of the bug being fixed: Infinity serializes to null.
    expect(JSON.parse(JSON.stringify({ x: Infinity })).x).toBeNull()
  })
})

describe('TIER_NAME / TIER_CONFIG back-compat shape', () => {
  it('TIER_NAME covers 0..4', () => {
    for (let t = 0; t <= 4; t++) expect(TIER_NAME[t]).toBeTypeOf('string')
  })

  it('back-compat TIER_CONFIG derives daily from MESSAGING_LIMIT_BY_TIER and mps from throughput', () => {
    for (let t = 0; t <= 4; t++) {
      expect(TIER_CONFIG[t].daily).toBe(MESSAGING_LIMIT_BY_TIER[t])
      expect(TIER_CONFIG[t].mps).toBe(throughputMpsForTier(t))
      expect(TIER_CONFIG[t].name).toBe(TIER_NAME[t])
    }
  })

  it('TIER_CONFIG.daily for tier 1 is 1000 (regression guard for the dedup)', () => {
    expect(TIER_CONFIG[1].daily).toBe(1000)
  })
})
