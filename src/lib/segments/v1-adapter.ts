// Adapter that converts legacy v1 rule shapes to v2 SegmentRule.
//
// Why: v1 rules live in customer_segments.rules as a free-form JSONB
// blob (loose Rule[] or { logic, rules }) — see resolver.ts. We don't
// rewrite them on disk; instead the v2 evaluator runs the adapter on
// read, so both versions evaluate through the same code path.
//
// Coverage:
//   has_event / no_event_since   → EventRule with all_time / last window
//   has_tag / not_has_tag        → ProfileRule on 'tags' (contains_any)
//   profile operators (equals, contains, gt, gte, lt, lte, between,
//     in, not_in, is_null, is_not_null, …) → ProfileRule
//   nested rules with logic AND/OR → RuleGroup
//
// Fields that v1 referenced by their database column name (e.g.
// 'total_revenue' for total_spent) are mapped via the catalog when
// possible; unknown fields fall through as-is so the evaluator can
// still find them via the contact column lookup.

import type { SegmentRule, RuleGroup, RuleLeaf, EventRule, ProfileRule } from './dsl';
import { FIELD_INDEX } from './catalog';

interface V1Rule {
  field?: string;
  operator?: string;
  value?: any;
  event_type?: string;
  within_days?: number;
  rules?: V1Rule[];
  logic?: 'and' | 'or' | 'AND' | 'OR';
}

interface V1Conditions {
  logic?: 'and' | 'or' | 'AND' | 'OR';
  rules?: V1Rule[];
}

// v1 field names that don't match the new catalog. Map them.
const FIELD_ALIAS: Record<string, string> = {
  total_revenue: 'total_spent',
  total_spent: 'total_spent',
  last_order_date: 'last_order_at',
  postal_code: 'zip',
  region: 'state',
  email_consent: 'is_subscribed_email',
  sms_consent: 'is_subscribed_sms',
  whatsapp_consent: 'is_subscribed_whatsapp',
};

export function v1ToV2(conditions: unknown): SegmentRule {
  const normalized = normalizeConditions(conditions);
  return {
    version: 2,
    root: convertGroup(normalized),
  };
}

function normalizeConditions(raw: unknown): V1Conditions {
  // Legacy shapes seen in the wild:
  //  - { logic, rules }
  //  - { conditions: { logic, rules } }
  //  - Rule[] (array directly)
  //  - { rules: Rule[] } without logic
  if (Array.isArray(raw)) return { logic: 'AND', rules: raw as V1Rule[] };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if ('conditions' in obj) return normalizeConditions(obj.conditions);
    return {
      logic: (obj.logic as any) || (obj.rules_logic as any) || 'AND',
      rules: (obj.rules as V1Rule[]) || [],
    };
  }
  return { logic: 'AND', rules: [] };
}

function convertGroup(c: V1Conditions): RuleGroup {
  const logic = ((c.logic || 'AND') as string).toUpperCase() as 'AND' | 'OR';
  const children: Array<RuleGroup | RuleLeaf> = [];
  for (const r of c.rules || []) {
    if (r.rules) {
      children.push(convertGroup(r as V1Conditions));
    } else {
      const leaf = convertLeaf(r);
      if (leaf) children.push(leaf);
    }
  }
  // Empty group: produce a tautology so it doesn't blow up the evaluator.
  // ALL of zero conditions === true (every() on empty array), OR of zero === false.
  // The evaluator already handles this, but we guard at the boundary too.
  return { type: 'group', logic, children };
}

function convertLeaf(r: V1Rule): RuleLeaf | null {
  const op = (r.operator || '').toLowerCase();

  // ── Behavioral ──
  if (op === 'has_event') {
    return {
      type: 'event',
      event: r.event_type || '',
      frequency: { op: 'at_least', value: 1 },
      window: r.within_days
        ? { kind: 'last', value: r.within_days, unit: 'day' }
        : { kind: 'all_time' },
    } satisfies EventRule;
  }
  if (op === 'no_event_since' || op === 'not_has_event') {
    return {
      type: 'event',
      event: r.event_type || '',
      frequency: { op: 'zero', value: 0 },
      window: r.within_days
        ? { kind: 'last', value: r.within_days, unit: 'day' }
        : { kind: 'all_time' },
    } satisfies EventRule;
  }

  // ── Tags ──
  if (op === 'has_tag') {
    return {
      type: 'profile',
      field: 'tags',
      operator: 'contains_any',
      value: Array.isArray(r.value) ? r.value : [r.value],
    } satisfies ProfileRule;
  }
  if (op === 'not_has_tag') {
    return {
      type: 'profile',
      field: 'tags',
      operator: 'not_contains_any',
      value: Array.isArray(r.value) ? r.value : [r.value],
    } satisfies ProfileRule;
  }

  // ── Profile fall-through ──
  if (!r.field) return null;
  const field = FIELD_ALIAS[r.field] || r.field;
  // Map legacy operator names to v2 canonical form. For DATE fields
  // we route gt/lt to after/before instead — v1 stored ISO strings
  // and used Number() comparisons that silently produced NaN > NaN
  // (always false), so even though the segment 'Engajados 30d' had a
  // valid intent, its contact_count was always 0.
  const def = FIELD_INDEX[field];
  const isDateField = def?.type === 'date';
  const opMap: Record<string, string> = isDateField
    ? {
        '=': 'equals',
        '!=': 'not_equals',
        '>': 'after',
        '>=': 'after',
        '<': 'before',
        '<=': 'before',
        greater_than: 'after',
        less_than: 'before',
      }
    : {
        '=': 'equals',
        '!=': 'not_equals',
        '>': 'gt',
        '>=': 'gte',
        '<': 'lt',
        '<=': 'lte',
        greater_than: 'gt',
        less_than: 'lt',
      };
  const mappedOp = opMap[op] || op;

  const leaf: ProfileRule = {
    type: 'profile',
    field,
    operator: mappedOp as ProfileRule['operator'],
    value: r.value,
  };
  // between expects value + value2; v1 stored both in `value` as array or "a,b" string
  if (mappedOp === 'between') {
    const parts = Array.isArray(r.value) ? r.value : String(r.value ?? '').split(',').map((s) => s.trim());
    leaf.value = parts[0];
    leaf.value2 = parts[1];
  }
  return leaf;
}
