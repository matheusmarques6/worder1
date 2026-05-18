// Segmentation DSL v2 — typed rule grammar inspired by Klaviyo / Omnisend.
//
// Two-version coexistence:
//  - v1: the existing rules JSONB shape used by /lib/segments/resolver.ts.
//        Stays supported via an adapter so we never break existing segments.
//  - v2: this schema. Strict, discriminated unions, validates at the
//        API boundary, persisted with `rule_version=2` on customer_segments.
//
// The resolver picks v1 or v2 by inspecting the stored payload. New writes
// (UI builder, AI generator, REST POST) always produce v2.

// ────────────────────────────────────────────────────────────────────────────
// FIELD TYPES — what data a rule can target
// ────────────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'enum'
  | 'string_array';

// ────────────────────────────────────────────────────────────────────────────
// OPERATORS — split by what they consume
// ────────────────────────────────────────────────────────────────────────────

export type StringOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'not_starts_with'
  | 'ends_with' | 'not_ends_with'
  | 'is_set' | 'is_not_set';

export type NumberOperator =
  | 'equals' | 'not_equals'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between'
  | 'is_set' | 'is_not_set';

// Date operators are the richest set — Klaviyo parity.
export type DateOperator =
  | 'is_set' | 'is_not_set'
  | 'before' | 'after'
  | 'between_dates'        // absolute range
  | 'in_last'              // relative: value + unit (day/week/month)
  | 'not_in_last'
  | 'in_next'
  | 'between_relative'     // e.g. 30-90 days ago (from/to in days)
  | 'is_today'
  | 'is_this_month'
  | 'month_in'             // Klaviyo "day is in the month of" — value is int[] of months 1-12 (Jan = 1)
  | 'day_of_month_in';     // value is int[] of days 1-31. Pair with month_in for date-of-month targeting.

export type BooleanOperator = 'is_true' | 'is_false';

export type EnumOperator =
  | 'equals' | 'not_equals'
  | 'in' | 'not_in';

export type StringArrayOperator =
  | 'contains_any' | 'contains_all'
  | 'not_contains_any'
  | 'is_empty' | 'is_not_empty'
  | 'size_gte' | 'size_lte';

// Frequency operators apply to EventRule (Klaviyo: "at least N", "between N and M", "zero times")
export type FrequencyOperator =
  | 'at_least' | 'at_most' | 'exactly' | 'between' | 'zero';

// ────────────────────────────────────────────────────────────────────────────
// TIME WINDOWS — used by EventRule and date ProfileRule
// ────────────────────────────────────────────────────────────────────────────

export type TimeWindow =
  | { kind: 'all_time' }
  | { kind: 'last';            value: number;  unit: 'day' | 'week' | 'month' }
  | { kind: 'not_in_last';     value: number;  unit: 'day' | 'week' | 'month' }
  | { kind: 'before';          date: string /* ISO */ }
  | { kind: 'after';           date: string /* ISO */ }
  | { kind: 'between_dates';   from: string;   to: string }
  | { kind: 'between_relative'; from: number;  to: number; unit: 'day' }
  // Omnisend-style: event occurred on a specific calendar date.
  // Matches occurrences whose YYYY-MM-DD (in occurredAt's local timezone)
  // equals `date`. Useful for "viewed page on 2026-04-13".
  | { kind: 'on_date';         date: string /* YYYY-MM-DD */ };

// ────────────────────────────────────────────────────────────────────────────
// RULE LEAVES — the actual conditions
// ────────────────────────────────────────────────────────────────────────────

export type ProfileRule = {
  type: 'profile';
  field: string;            // resolves against the field catalog
  operator: StringOperator | NumberOperator | DateOperator | BooleanOperator | EnumOperator | StringArrayOperator;
  value?: unknown;
  value2?: unknown;         // for 'between' / 'between_dates' / 'between_relative'
  unit?: 'day' | 'week' | 'month'; // for in_last / in_next
};

// EventRule: full Klaviyo-style behavioral condition.
//   "Placed Order at least 3 times in the last 90 days where total_price > 100"
export type EventRule = {
  type: 'event';
  event: string;            // 'placed_order' | 'viewed_product' | ...
  frequency: {
    op: FrequencyOperator;
    value: number;
    value2?: number;        // for 'between'
  };
  window: TimeWindow;
  property_filters?: PropertyFilter[];  // sub-filters on event.properties
};

// Sub-filter applied to an event's properties JSONB.
// e.g. placed_order WHERE properties.total_price > 100 AND properties.product_id IN [...]
export type PropertyFilter = {
  path: string;             // 'total_price' | 'product_id' | nested 'shipping_address.country'
  type: FieldType;
  operator: ProfileRule['operator'];
  value?: unknown;
  value2?: unknown;
};

export type ListMembershipRule = {
  type: 'list_membership';
  list_id: string;
  is_member: boolean;       // true = in list, false = NOT in list
  window?: TimeWindow;      // optional: "joined the list in last 30d"
};

export type SegmentMembershipRule = {
  type: 'segment_membership';
  segment_id: string;
  is_member: boolean;
};

export type ConsentRule = {
  type: 'consent';
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  status: 'can_receive' | 'cannot_receive' | 'subscribed' | 'unsubscribed' | 'pending';
};

// Geographic proximity — Phase 5. Stub now so the schema is forward-compatible.
export type LocationRule = {
  type: 'location';
  mode: 'proximity_zip';
  center_zip: string;
  country: string;
  radius_km: number;
};

// EventFunnelRule: Klaviyo "event funnel" — contact did A, THEN did B,
// THEN did NOT do C, all within a time window. The order is strict
// (sequence-based), unlike multiple EventRules glued by AND which
// only checks unordered presence.
export type EventFunnelRule = {
  type: 'event_funnel';
  steps: Array<{
    event: string;
    negate: boolean;            // true = "did NOT do this step"
    property_filters?: PropertyFilter[];
  }>;
  window: TimeWindow;             // window applies to the whole funnel
  // Optional: max gap (in days) between consecutive steps. Tighter
  // funnels (browse → cart in 24h) tend to convert better.
  max_step_gap_days?: number;
};

// AnniversaryRule: Klaviyo / Omnisend "anniversary is in the next N
// days" — recurring date-of-year checks. Built on top of any contact
// date column whose month/day matters (birthday, first_order_at, etc.)
export type AnniversaryRule = {
  type: 'anniversary';
  field: string;                  // catalog key, must be a date field
  within_next_days: number;       // 0 means "today is the anniversary"
};

export type RuleLeaf =
  | ProfileRule
  | EventRule
  | EventFunnelRule
  | AnniversaryRule
  | ListMembershipRule
  | SegmentMembershipRule
  | ConsentRule
  | LocationRule;

// ────────────────────────────────────────────────────────────────────────────
// COMPOSITION — recursive groups
// ────────────────────────────────────────────────────────────────────────────

export type RuleGroup = {
  type: 'group';
  logic: 'AND' | 'OR';
  children: Array<RuleGroup | RuleLeaf>;
};

export type SegmentRule = {
  version: 2;
  root: RuleGroup;
};

// ────────────────────────────────────────────────────────────────────────────
// DEPENDENCIES — derived from a rule, used for real-time reevaluation
// ────────────────────────────────────────────────────────────────────────────

// What a segment's rule depends on. Stored on customer_segments.rule_dependencies
// so a contact update or event insert can lookup only the affected segments
// (instead of rescanning every segment in the org).
export type RuleDependencies = {
  fields: string[];          // distinct profile fields referenced
  events: string[];          // distinct event types referenced
  lists: string[];           // referenced list_ids
  segments: string[];        // referenced segment_ids (for cycle check)
};

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION — hand-rolled, no external dep
// ────────────────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; rule: SegmentRule }
  | { ok: false; errors: string[] };

const FIELD_TYPES = new Set<FieldType>(['string','number','date','boolean','enum','string_array']);
const FREQUENCY_OPS = new Set<FrequencyOperator>(['at_least','at_most','exactly','between','zero']);
const TIME_KINDS = new Set(['all_time','last','not_in_last','before','after','between_dates','between_relative','on_date']);

function isObj(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function validateTimeWindow(w: unknown, path: string, errs: string[]): void {
  if (!isObj(w)) { errs.push(`${path}: time window must be object`); return; }
  if (typeof w.kind !== 'string' || !TIME_KINDS.has(w.kind as string)) {
    errs.push(`${path}.kind: invalid time window kind`); return;
  }
  const kind = w.kind as TimeWindow['kind'];
  if (kind === 'last' || kind === 'not_in_last') {
    if (typeof w.value !== 'number' || w.value < 0) errs.push(`${path}.value: must be positive number`);
    if (!['day','week','month'].includes(w.unit as string)) errs.push(`${path}.unit: must be day|week|month`);
  } else if (kind === 'before' || kind === 'after') {
    if (typeof w.date !== 'string') errs.push(`${path}.date: must be ISO string`);
  } else if (kind === 'between_dates') {
    if (typeof w.from !== 'string') errs.push(`${path}.from: must be ISO string`);
    if (typeof w.to !== 'string') errs.push(`${path}.to: must be ISO string`);
  } else if (kind === 'between_relative') {
    if (typeof w.from !== 'number') errs.push(`${path}.from: must be number`);
    if (typeof w.to !== 'number') errs.push(`${path}.to: must be number`);
  } else if (kind === 'on_date') {
    if (typeof w.date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(w.date)) {
      errs.push(`${path}.date: must be YYYY-MM-DD`);
    }
  }
}

function validatePropertyFilter(p: unknown, path: string, errs: string[]): void {
  if (!isObj(p)) { errs.push(`${path}: property filter must be object`); return; }
  if (typeof p.path !== 'string' || !p.path) errs.push(`${path}.path: required string`);
  // Reject a path that is only wildcards (e.g. '[]' or '[].[]'). The
  // wildcard walker would split into empty/marker segments and match
  // nothing, but accepting it silently confuses merchants. Require at
  // least one named segment between/around any wildcards.
  if (typeof p.path === 'string' && p.path && !/[A-Za-z_]/.test(p.path)) {
    errs.push(`${path}.path: must reference at least one named property (got "${p.path}")`);
  }
  if (!FIELD_TYPES.has(p.type as FieldType)) errs.push(`${path}.type: invalid field type`);
  if (typeof p.operator !== 'string') errs.push(`${path}.operator: required`);
}

function validateLeaf(leaf: unknown, path: string, errs: string[]): void {
  if (!isObj(leaf)) { errs.push(`${path}: leaf must be object`); return; }
  const type = leaf.type;
  switch (type) {
    case 'profile':
      if (typeof leaf.field !== 'string' || !leaf.field) errs.push(`${path}.field: required`);
      if (typeof leaf.operator !== 'string') errs.push(`${path}.operator: required`);
      // Range-validate the month/day-of-month pickers — they expect
      // arrays of ints in a fixed range. A merchant who pastes [42]
      // would otherwise save a rule that matches nothing.
      if (leaf.operator === 'month_in') {
        if (!Array.isArray(leaf.value) || leaf.value.length === 0) {
          errs.push(`${path}.value: month_in needs a non-empty array of months 1-12`);
        } else if (leaf.value.some((m: unknown) => typeof m !== 'number' || m < 1 || m > 12)) {
          errs.push(`${path}.value: month_in values must be integers 1-12`);
        }
      }
      if (leaf.operator === 'day_of_month_in') {
        if (!Array.isArray(leaf.value) || leaf.value.length === 0) {
          errs.push(`${path}.value: day_of_month_in needs a non-empty array of days 1-31`);
        } else if (leaf.value.some((d: unknown) => typeof d !== 'number' || d < 1 || d > 31)) {
          errs.push(`${path}.value: day_of_month_in values must be integers 1-31`);
        }
      }
      break;
    case 'event':
      if (typeof leaf.event !== 'string' || !leaf.event) errs.push(`${path}.event: required`);
      if (!isObj(leaf.frequency)) {
        errs.push(`${path}.frequency: required`);
      } else {
        if (!FREQUENCY_OPS.has(leaf.frequency.op as FrequencyOperator)) {
          errs.push(`${path}.frequency.op: invalid`);
        }
        if (typeof leaf.frequency.value !== 'number') errs.push(`${path}.frequency.value: must be number`);
        if (leaf.frequency.op === 'between' && typeof leaf.frequency.value2 !== 'number') {
          errs.push(`${path}.frequency.value2: required for 'between'`);
        }
      }
      validateTimeWindow(leaf.window, `${path}.window`, errs);
      if (Array.isArray(leaf.property_filters)) {
        leaf.property_filters.forEach((pf, i) =>
          validatePropertyFilter(pf, `${path}.property_filters[${i}]`, errs)
        );
      }
      break;
    case 'list_membership':
      if (typeof leaf.list_id !== 'string') errs.push(`${path}.list_id: required`);
      if (typeof leaf.is_member !== 'boolean') errs.push(`${path}.is_member: required boolean`);
      if (leaf.window !== undefined) validateTimeWindow(leaf.window, `${path}.window`, errs);
      break;
    case 'segment_membership':
      if (typeof leaf.segment_id !== 'string') errs.push(`${path}.segment_id: required`);
      if (typeof leaf.is_member !== 'boolean') errs.push(`${path}.is_member: required boolean`);
      break;
    case 'consent':
      if (!['email','sms','whatsapp','push'].includes(leaf.channel as string)) errs.push(`${path}.channel: invalid`);
      if (!['can_receive','cannot_receive','subscribed','unsubscribed','pending'].includes(leaf.status as string)) {
        errs.push(`${path}.status: invalid`);
      }
      break;
    case 'location':
      if (leaf.mode !== 'proximity_zip') errs.push(`${path}.mode: only proximity_zip supported`);
      if (typeof leaf.center_zip !== 'string') errs.push(`${path}.center_zip: required`);
      if (typeof leaf.country !== 'string') errs.push(`${path}.country: required`);
      if (typeof leaf.radius_km !== 'number') errs.push(`${path}.radius_km: required number`);
      break;
    case 'event_funnel':
      if (!Array.isArray(leaf.steps) || leaf.steps.length < 2) {
        errs.push(`${path}.steps: funnel needs at least 2 steps`);
      } else {
        leaf.steps.forEach((s: any, i: number) => {
          if (typeof s?.event !== 'string' || !s.event) errs.push(`${path}.steps[${i}].event: required`);
          if (typeof s?.negate !== 'boolean') errs.push(`${path}.steps[${i}].negate: required boolean`);
        });
      }
      validateTimeWindow(leaf.window, `${path}.window`, errs);
      break;
    case 'anniversary':
      if (typeof leaf.field !== 'string' || !leaf.field) errs.push(`${path}.field: required`);
      if (typeof leaf.within_next_days !== 'number') errs.push(`${path}.within_next_days: required number`);
      break;
    default:
      errs.push(`${path}.type: unknown leaf type "${String(type)}"`);
  }
}

function validateGroup(g: unknown, path: string, errs: string[], depth = 0): void {
  if (depth > 5) { errs.push(`${path}: nesting too deep (max 5)`); return; }
  if (!isObj(g)) { errs.push(`${path}: group must be object`); return; }
  if (g.type !== 'group') { errs.push(`${path}.type: must be "group"`); return; }
  if (g.logic !== 'AND' && g.logic !== 'OR') errs.push(`${path}.logic: must be AND or OR`);
  if (!Array.isArray(g.children) || g.children.length === 0) {
    errs.push(`${path}.children: must be non-empty array`);
    return;
  }
  g.children.forEach((c: any, i: number) => {
    if (isObj(c) && c.type === 'group') validateGroup(c, `${path}.children[${i}]`, errs, depth + 1);
    else validateLeaf(c, `${path}.children[${i}]`, errs);
  });
}

// Max leaf conditions allowed in a single segment. Klaviyo caps at 100;
// we match that — past ~100 the resolver's universe scan + property
// pre-fetch becomes unbounded and segments degrade for everyone in the
// org because the worker is shared. Hard cap, not a warning.
export const MAX_CONDITIONS_PER_SEGMENT = 100;

// Counts profile/event/anniversary/list_membership/etc. leaves
// (anything that isn't a group). Groups themselves don't count.
export function countConditions(rule: SegmentRule): number {
  let n = 0;
  function walk(node: RuleGroup | RuleLeaf): void {
    if ((node as RuleGroup).type === 'group') {
      (node as RuleGroup).children.forEach(walk);
      return;
    }
    // event_funnel counts as ONE condition even though it has multiple
    // steps — it's evaluated atomically and the inner steps don't
    // dispatch separate event queries.
    n += 1;
  }
  walk(rule.root);
  return n;
}

export function validateSegmentRule(input: unknown): ValidationResult {
  const errs: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['root must be object'] };
  if (input.version !== 2) errs.push('version: must be 2');
  validateGroup(input.root, 'root', errs);
  if (errs.length === 0) {
    const count = countConditions(input as unknown as SegmentRule);
    if (count > MAX_CONDITIONS_PER_SEGMENT) {
      errs.push(`too many conditions (${count}): max is ${MAX_CONDITIONS_PER_SEGMENT}`);
    }
  }
  if (errs.length) return { ok: false, errors: errs };
  return { ok: true, rule: input as unknown as SegmentRule };
}

// ────────────────────────────────────────────────────────────────────────────
// DEPENDENCIES EXTRACTION
// ────────────────────────────────────────────────────────────────────────────

export function extractDependencies(rule: SegmentRule): RuleDependencies {
  const fields = new Set<string>();
  const events = new Set<string>();
  const lists = new Set<string>();
  const segments = new Set<string>();

  function walk(node: RuleGroup | RuleLeaf): void {
    if ((node as RuleGroup).type === 'group') {
      (node as RuleGroup).children.forEach(walk);
      return;
    }
    const leaf = node as RuleLeaf;
    switch (leaf.type) {
      case 'profile':
        fields.add(leaf.field);
        break;
      case 'event':
        events.add(leaf.event);
        break;
      case 'list_membership':
        lists.add(leaf.list_id);
        break;
      case 'segment_membership':
        segments.add(leaf.segment_id);
        break;
      case 'consent':
        fields.add(`${leaf.channel}_consent`);
        break;
      case 'event_funnel':
        for (const step of leaf.steps) events.add(step.event);
        break;
      case 'anniversary':
        fields.add(leaf.field);
        break;
    }
  }

  walk(rule.root);
  return {
    fields: [...fields],
    events: [...events],
    lists: [...lists],
    segments: [...segments],
  };
}
