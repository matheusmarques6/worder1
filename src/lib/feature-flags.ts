/**
 * Per-tenant feature flags backed by organizations.feature_flags (jsonb).
 *
 * Cached in-process for 60s per orgId. Designed for low-cardinality lookups
 * (a few hundred orgs in memory is fine). For higher cardinality, swap the
 * Map for an LRU.
 *
 * Schema:
 *   - boolean true  → flag on
 *   - boolean false → flag off
 *   - object { rollout_percent: number } → returns true for orgId hash < cutoff
 *   - missing key → off
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

const CACHE_TTL_MS = 60_000;

type FlagsRecord = Record<string, unknown>;

interface CacheEntry {
  flags: FlagsRecord;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function hashOrgIdToPercent(orgId: string): number {
  // Stable cheap hash → integer 0..99 for percentage rollout decisions.
  let h = 0;
  for (let i = 0; i < orgId.length; i++) {
    h = (h * 31 + orgId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

async function loadFlags(orgId: string): Promise<FlagsRecord> {
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.flags;
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('feature_flags')
    .eq('id', orgId)
    .single();

  const flags: FlagsRecord =
    !error && data?.feature_flags && typeof data.feature_flags === 'object'
      ? (data.feature_flags as FlagsRecord)
      : {};

  cache.set(orgId, { flags, expiresAt: Date.now() + CACHE_TTL_MS });
  return flags;
}

export async function isFeatureEnabled(orgId: string, key: string): Promise<boolean> {
  if (!orgId || !key) return false;

  const flags = await loadFlags(orgId);
  const raw = flags[key];

  if (raw === true) return true;
  if (raw === false || raw === undefined || raw === null) return false;

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as { enabled?: boolean; rollout_percent?: number };
    if (obj.enabled === true) return true;
    if (obj.enabled === false) return false;
    if (typeof obj.rollout_percent === 'number') {
      return hashOrgIdToPercent(orgId) < Math.max(0, Math.min(100, obj.rollout_percent));
    }
  }

  return false;
}

export async function getFeatureFlags(orgId: string): Promise<FlagsRecord> {
  return loadFlags(orgId);
}

/**
 * Bust cache for a specific org (call after admin updates flags).
 */
export function invalidateFeatureFlagsCache(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
