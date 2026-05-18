// Public segmentation entry-point. Callers should import from here,
// not from resolver.ts / resolver-v2.ts directly.
//
// resolveSegment(supabase, segmentId, orgId)
//   - reads customer_segments
//   - detects rule_version (1 or 2)
//   - converts v1 → v2 via the adapter if needed
//   - delegates to resolver-v2.ts
//
// previewByRule(supabase, rule, orgId, opts?)
//   - evaluates an unsaved SegmentRule (e.g. while the user types in
//     the builder) and returns count + truncation flag + sample ids
//
// countSegment / sampleSegment are convenience wrappers that compose
// resolveSegment + simple post-processing.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentRule } from './dsl';
import { validateSegmentRule, extractDependencies } from './dsl';
import { resolveSegmentV2, type ResolveResult } from './resolver-v2';
import { v1ToV2 } from './v1-adapter';

export * from './dsl';
export { FIELD_CATALOG, FIELD_INDEX, CATEGORY_LABELS, OPERATORS_BY_TYPE, OPERATOR_LABELS } from './catalog';
export type { FieldDef, FieldCategory } from './catalog';

export interface SegmentLoadResult {
  rule: SegmentRule;
  segmentId: string;
  organizationId: string;
  storeId: string | null;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────
// Load + normalize a segment to v2
// ─────────────────────────────────────────────────────────────────────

export async function loadSegmentAsV2(
  supabase: SupabaseClient,
  segmentId: string,
): Promise<SegmentLoadResult | null> {
  const { data, error } = await supabase
    .from('customer_segments')
    .select('id, organization_id, store_id, name, rules, rules_logic, rule_version')
    .eq('id', segmentId)
    .maybeSingle();
  if (error || !data) return null;

  let rule: SegmentRule;
  if ((data as any).rule_version === 2 && (data as any).rules?.version === 2) {
    rule = (data as any).rules as SegmentRule;
  } else {
    // Wrap legacy { logic, rules } shape (also handles bare arrays).
    const legacy = (data as any).rules ?? [];
    const wrapped =
      Array.isArray(legacy)
        ? { logic: (data as any).rules_logic || 'AND', rules: legacy }
        : { ...legacy, logic: legacy.logic || (data as any).rules_logic || 'AND' };
    rule = v1ToV2(wrapped);
  }

  return {
    rule,
    segmentId: (data as any).id,
    organizationId: (data as any).organization_id,
    storeId: (data as any).store_id || null,
    name: (data as any).name,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Resolve / preview
// ─────────────────────────────────────────────────────────────────────

export async function resolveSegment(
  supabase: SupabaseClient,
  segmentId: string,
  orgId: string,
  options?: { limit?: number }
): Promise<ResolveResult & { name: string }> {
  const loaded = await loadSegmentAsV2(supabase, segmentId);
  if (!loaded) {
    return { contactIds: [], truncated: false, evaluatedAt: new Date().toISOString(), durationMs: 0, name: '' };
  }
  // Belt and suspenders: never resolve a segment for the wrong org.
  if (loaded.organizationId !== orgId) {
    return { contactIds: [], truncated: false, evaluatedAt: new Date().toISOString(), durationMs: 0, name: loaded.name };
  }
  const result = await resolveSegmentV2(supabase, loaded.rule, {
    orgId,
    storeId: loaded.storeId,
    limit: options?.limit,
  });
  return { ...result, name: loaded.name };
}

export async function previewByRule(
  supabase: SupabaseClient,
  rule: SegmentRule,
  orgId: string,
  options?: { storeId?: string | null; limit?: number; sampleSize?: number }
): Promise<{
  count: number;
  truncated: boolean;
  durationMs: number;
  sampleIds: string[];
}> {
  const validated = validateSegmentRule(rule);
  if (!validated.ok) throw new Error(`invalid rule: ${validated.errors.join('; ')}`);

  // Cap the resolve so a poorly-formed rule against millions of
  // contacts can't blow up the preview endpoint.
  const cap = options?.limit ?? 5000;
  const result = await resolveSegmentV2(supabase, rule, {
    orgId,
    storeId: options?.storeId ?? null,
    limit: cap,
  });

  const sample = result.contactIds.slice(0, options?.sampleSize ?? 10);
  return {
    count: result.contactIds.length,
    truncated: result.truncated,
    durationMs: result.durationMs,
    sampleIds: sample,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Save a v2 SegmentRule onto customer_segments. Computes
 * rule_dependencies from the tree and bumps rule_version=2 so the
 * loader picks the v2 path on read.
 *
 * Use this for any UI/AI path that writes v2 rules. Legacy rule writes
 * (the /api/segments POST that still accepts v1 shapes) stay untouched.
 */
export async function saveSegmentRule(
  supabase: SupabaseClient,
  segmentId: string,
  rule: SegmentRule,
): Promise<void> {
  const validated = validateSegmentRule(rule);
  if (!validated.ok) throw new Error(`invalid rule: ${validated.errors.join('; ')}`);
  const deps = extractDependencies(rule);
  await supabase
    .from('customer_segments')
    .update({
      rules: rule,
      rule_version: 2,
      rule_dependencies: deps,
      updated_at: new Date().toISOString(),
    })
    .eq('id', segmentId);
}
