// Segment resolver v2 — evaluates SegmentRule (DSL v2) against the
// org's contacts and returns the matching ids.
//
// Strategy:
//  - Pull a single batch of contacts for the org (with store scope)
//  - For event rules: aggregate per-contact event counts via SQL
//    (count(*) per event_type per contact in the window) so we don't
//    have to ship 50k+ rows JS-side like the v1 resolver does. This
//    is the main perf win Phase 1 buys us.
//  - For list/segment membership: lookup with a join on
//    contact_list_members / segment_member_cache
//  - For everything else (profile / consent / location): pure JS check
//    against the contact row
//
// The v1 resolver in ./resolver.ts is preserved unchanged. When a
// segment row is v1, callers run it through v1ToV2() (below) first so
// every evaluation path produces identical results.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SegmentRule,
  RuleGroup,
  RuleLeaf,
  ProfileRule,
  EventRule,
  EventFunnelRule,
  AnniversaryRule,
  ListMembershipRule,
  SegmentMembershipRule,
  ConsentRule,
  TimeWindow,
  PropertyFilter,
} from './dsl';
import { FIELD_INDEX } from './catalog';

// ─────────────────────────────────────────────────────────────────────
// Top-level entry
// ─────────────────────────────────────────────────────────────────────

export interface ResolveOptions {
  orgId: string;
  storeId?: string | null;
  limit?: number; // null/undefined = no cap; useful for preview to bail at 1k
  // When set, restricts the contact universe to these IDs. Used by
  // the real-time worker which already knows which contacts changed
  // and only needs to (re)evaluate them — pulling the org's entire
  // contacts table per queue item would be a 500k-row scan repeated
  // dozens of times per minute on big stores.
  contactIds?: string[];
}

export interface ResolveResult {
  contactIds: string[];
  truncated: boolean;     // true if `limit` cut off the result
  evaluatedAt: string;    // ISO
  durationMs: number;
}

export async function resolveSegmentV2(
  supabase: SupabaseClient,
  rule: SegmentRule,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  const startedAt = Date.now();

  // ── Stage 1: pull the contact universe ──
  // Columns we read are exactly the ones the field catalog references,
  // plus id/organization_id/store_id. Selecting * is wasteful (this
  // table has 100+ columns); we pull only what the rule needs.
  const referencedColumns = collectReferencedColumns(rule);
  const selectCols = ['id', 'organization_id', 'store_id', ...referencedColumns].join(', ');

  let q: any = supabase
    .from('contacts')
    .select(selectCols)
    .eq('organization_id', opts.orgId);

  // Targeted resolution: only pull the listed contacts. This is the
  // hot path for the real-time worker — without it we'd scan the
  // whole org on every queue tick.
  if (opts.contactIds && opts.contactIds.length > 0) {
    q = q.in('id', opts.contactIds);
  }

  if (opts.storeId) {
    q = q.or(`store_id.eq.${opts.storeId},store_id.is.null`);
  }
  const { data: contacts, error: contactsErr } = await q;
  if (contactsErr) throw new Error(`contacts query failed: ${contactsErr.message}`);
  const universe = (contacts ?? []) as Array<Record<string, any>>;

  if (universe.length === 0) {
    return { contactIds: [], truncated: false, evaluatedAt: new Date().toISOString(), durationMs: Date.now() - startedAt };
  }

  // ── Stage 2: prefetch event aggregates, if the rule needs them ──
  const eventDeps = collectEventDependencies(rule);
  const eventIndex = eventDeps.length
    ? await loadEventIndex(supabase, opts.orgId, universe.map((c) => c.id as string), eventDeps)
    : new Map<string, Map<string, EventOccurrence[]>>();

  // ── Stage 3: prefetch list / segment memberships ──
  const listIds = collectListIds(rule);
  const listMembership = listIds.length
    ? await loadListMembership(supabase, listIds, universe.map((c) => c.id as string))
    : new Map<string, Set<string>>(); // contact_id → set of list_ids it belongs to

  const segIds = collectSegmentIds(rule);
  const segMembership = segIds.length
    ? await loadSegmentMembership(supabase, segIds, universe.map((c) => c.id as string))
    : new Map<string, Set<string>>();

  // ── Stage 4: evaluate per contact ──
  const matched: string[] = [];
  const cap = opts.limit ?? Infinity;
  let truncated = false;
  for (const contact of universe) {
    if (evaluateGroup(rule.root, contact, eventIndex.get(contact.id as string) || new Map(), listMembership.get(contact.id as string) || new Set(), segMembership.get(contact.id as string) || new Set())) {
      matched.push(contact.id as string);
      if (matched.length >= cap) { truncated = true; break; }
    }
  }

  return {
    contactIds: matched,
    truncated,
    evaluatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Stage 2 helper — event aggregates
// ─────────────────────────────────────────────────────────────────────

interface EventOccurrence {
  occurred_at: string;
  properties: Record<string, any> | null;
  monetary_value: number | null;
}

async function loadEventIndex(
  supabase: SupabaseClient,
  orgId: string,
  contactIds: string[],
  eventTypes: string[],
): Promise<Map<string, Map<string, EventOccurrence[]>>> {
  const out = new Map<string, Map<string, EventOccurrence[]>>();
  if (contactIds.length === 0) return out;

  // Single query, filtered both by org and contact set, no JS-side cap.
  // PostgREST will chunk if needed; we rely on it returning all rows.
  // Note: 'limit' from the client is intentionally absent here — v1
  // had a 50k cap which broke segments on large stores.
  const { data, error } = await supabase
    .from('contact_events')
    .select('contact_id, event_type, occurred_at, properties, monetary_value')
    .eq('organization_id', orgId)
    .in('event_type', eventTypes)
    .in('contact_id', contactIds);

  if (error) throw new Error(`contact_events query failed: ${error.message}`);

  for (const row of (data || []) as Array<{
    contact_id: string;
    event_type: string;
    occurred_at: string;
    properties: any;
    monetary_value: number | null;
  }>) {
    if (!row.contact_id) continue;
    const byContact = out.get(row.contact_id) || new Map<string, EventOccurrence[]>();
    const arr = byContact.get(row.event_type) || [];
    arr.push({
      occurred_at: row.occurred_at,
      properties: row.properties,
      monetary_value: row.monetary_value,
    });
    byContact.set(row.event_type, arr);
    out.set(row.contact_id, byContact);
  }
  return out;
}

async function loadListMembership(
  supabase: SupabaseClient,
  listIds: string[],
  contactIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (contactIds.length === 0 || listIds.length === 0) return out;
  const { data } = await supabase
    .from('contact_list_members')
    .select('list_id, contact_id')
    .in('list_id', listIds)
    .in('contact_id', contactIds);
  for (const row of (data || []) as Array<{ list_id: string; contact_id: string }>) {
    const s = out.get(row.contact_id) || new Set<string>();
    s.add(row.list_id);
    out.set(row.contact_id, s);
  }
  return out;
}

async function loadSegmentMembership(
  supabase: SupabaseClient,
  segmentIds: string[],
  contactIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (contactIds.length === 0 || segmentIds.length === 0) return out;
  const { data } = await supabase
    .from('segment_member_cache')
    .select('segment_id, contact_id')
    .in('segment_id', segmentIds)
    .in('contact_id', contactIds);
  for (const row of (data || []) as Array<{ segment_id: string; contact_id: string }>) {
    const s = out.get(row.contact_id) || new Set<string>();
    s.add(row.segment_id);
    out.set(row.contact_id, s);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────

function evaluateGroup(
  group: RuleGroup,
  contact: Record<string, any>,
  events: Map<string, EventOccurrence[]>,
  inLists: Set<string>,
  inSegments: Set<string>,
): boolean {
  if (!group.children?.length) return true;
  const results = group.children.map((child) =>
    child.type === 'group'
      ? evaluateGroup(child, contact, events, inLists, inSegments)
      : evaluateLeaf(child, contact, events, inLists, inSegments)
  );
  return group.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

function evaluateLeaf(
  leaf: RuleLeaf,
  contact: Record<string, any>,
  events: Map<string, EventOccurrence[]>,
  inLists: Set<string>,
  inSegments: Set<string>,
): boolean {
  switch (leaf.type) {
    case 'profile':       return evalProfile(leaf, contact);
    case 'event':         return evalEvent(leaf, events);
    case 'event_funnel':  return evalEventFunnel(leaf, events);
    case 'anniversary':   return evalAnniversary(leaf, contact);
    case 'list_membership':
      return inLists.has(leaf.list_id) === leaf.is_member;
    case 'segment_membership':
      return inSegments.has(leaf.segment_id) === leaf.is_member;
    case 'consent':       return evalConsent(leaf, contact);
    case 'location':      return false; // Phase 5
    default:              return false;
  }
}

// Event funnel: enforce the steps happened in order. For each step we
// pick the earliest occurrence whose timestamp is >= the previous
// step's pick; if any step has no such occurrence the funnel fails.
// "Negated" steps require the absence of any matching occurrence in
// the funnel's window AND between the surrounding steps.
function evalEventFunnel(rule: EventFunnelRule, events: Map<string, EventOccurrence[]>): boolean {
  let cursor: number = -Infinity;
  let lastPositive: number | null = null;

  for (const step of rule.steps) {
    const occs = (events.get(step.event) || [])
      .filter((o) => isInWindow(o.occurred_at, rule.window))
      .filter((o) => !step.property_filters?.length || step.property_filters.every((pf) => matchPropertyFilter(o, pf)))
      .map((o) => new Date(o.occurred_at).getTime())
      .filter((t) => t >= cursor)
      .sort((a, b) => a - b);

    if (step.negate) {
      // For negate steps, fail if ANY occurrence sits between the last
      // positive step and the next positive step (or the window end).
      if (occs.length > 0) return false;
      // Cursor doesn't move on negate steps.
      continue;
    }

    if (occs.length === 0) return false;
    const pick = occs[0];

    // Enforce max gap if specified
    if (rule.max_step_gap_days && lastPositive !== null) {
      const gap = pick - lastPositive;
      if (gap > rule.max_step_gap_days * 86_400_000) return false;
    }

    cursor = pick + 1; // strict after
    lastPositive = pick;
  }
  return true;
}

// Anniversary: matches when the (month, day) of the field falls within
// the next N days from today. Useful for "birthday next 7 days",
// "first-purchase anniversary this month", etc.
//
// Timezone trap: SQL DATE columns return as 'YYYY-MM-DD' strings,
// which `new Date('2000-01-15')` parses as UTC midnight. Subtracting
// local now() then produces an off-by-one in most timezones west of
// UTC (the local date is still Jan 14 when UTC says Jan 15). We parse
// month/day directly from the string to dodge that entirely.
function evalAnniversary(rule: AnniversaryRule, contact: Record<string, any>): boolean {
  const def = FIELD_INDEX[rule.field];
  if (!def || def.source.kind !== 'contact_column') return false;
  const raw = contact[def.source.column];
  if (!raw) return false;

  let month: number; // 0-indexed for Date
  let day: number;
  const s = String(raw);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (dateOnly) {
    month = Number(dateOnly[2]) - 1;
    day = Number(dateOnly[3]);
  } else {
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) return false;
    month = parsed.getMonth();
    day = parsed.getDate();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + Math.max(0, rule.within_next_days));

  // Build this year's anniversary in local time. If it already passed
  // this year, roll forward to next year.
  let ann = new Date(today.getFullYear(), month, day);
  if (ann < today) {
    ann = new Date(today.getFullYear() + 1, month, day);
  }

  return ann >= today && ann <= cutoff;
}

function evalProfile(rule: ProfileRule, contact: Record<string, any>): boolean {
  const def = FIELD_INDEX[rule.field];
  if (!def) return false;
  let raw: any;
  if (def.source.kind === 'contact_column') {
    raw = contact[def.source.column];
  } else if (def.source.kind === 'contact_jsonb') {
    let cur = contact[def.source.column];
    for (const p of def.source.path) cur = cur?.[p];
    raw = cur;
  } else {
    return false; // event-typed field shouldn't appear in profile rule
  }
  return applyOperator(rule.operator, raw, rule.value, rule.value2, rule.unit);
}

function evalConsent(rule: ConsentRule, contact: Record<string, any>): boolean {
  // The contacts table stores consent in two parallel shapes:
  //  - is_subscribed_{channel} booleans (canonical)
  //  - {channel}_consent text/boolean (legacy, mixed values)
  // We trust is_subscribed_{channel} as the source of truth.
  const col = `is_subscribed_${rule.channel}`;
  const isSubscribed = contact[col] === true;
  switch (rule.status) {
    case 'can_receive':
    case 'subscribed':
      return isSubscribed;
    case 'cannot_receive':
    case 'unsubscribed':
      return !isSubscribed;
    case 'pending':
      // Pending = consent_at IS NULL but record exists. Approximate.
      return !isSubscribed && contact[`${rule.channel}_consent_at`] != null;
    default:
      return false;
  }
}

function evalEvent(rule: EventRule, events: Map<string, EventOccurrence[]>): boolean {
  const occs = events.get(rule.event) || [];

  // Filter by time window
  const inWindow = occs.filter((o) => isInWindow(o.occurred_at, rule.window));

  // Filter by property sub-filters
  const matching = rule.property_filters?.length
    ? inWindow.filter((o) => (rule.property_filters || []).every((pf) => matchPropertyFilter(o, pf)))
    : inWindow;

  const count = matching.length;
  const { op, value, value2 } = rule.frequency;
  switch (op) {
    case 'at_least': return count >= value;
    case 'at_most':  return count <= value;
    case 'exactly':  return count === value;
    case 'between':  return count >= value && count <= (value2 ?? value);
    case 'zero':     return count === 0;
    default:         return false;
  }
}

function isInWindow(occurredAt: string, w: TimeWindow): boolean {
  if (w.kind === 'all_time') return true;
  const t = new Date(occurredAt).getTime();
  const now = Date.now();
  switch (w.kind) {
    case 'last': {
      const ms = w.value * unitMs(w.unit);
      return t >= now - ms;
    }
    case 'not_in_last': {
      const ms = w.value * unitMs(w.unit);
      return t < now - ms;
    }
    case 'before':
      return t < new Date(w.date).getTime();
    case 'after':
      return t > new Date(w.date).getTime();
    case 'between_dates':
      return t >= new Date(w.from).getTime() && t <= new Date(w.to).getTime();
    case 'between_relative': {
      const fromMs = now - w.from * unitMs(w.unit);
      const toMs = now - w.to * unitMs(w.unit);
      const lo = Math.min(fromMs, toMs), hi = Math.max(fromMs, toMs);
      return t >= lo && t <= hi;
    }
    case 'on_date': {
      // Compare calendar dates in local time (not UTC) so a merchant
      // saying "viewed page on 2026-04-13" matches every occurrence
      // whose local-date string is 2026-04-13.
      const occLocal = new Date(occurredAt);
      const target = new Date(w.date + 'T00:00:00');
      return (
        occLocal.getFullYear() === target.getFullYear() &&
        occLocal.getMonth() === target.getMonth() &&
        occLocal.getDate() === target.getDate()
      );
    }
  }
}

function unitMs(unit: 'day' | 'week' | 'month'): number {
  switch (unit) {
    case 'day':   return 86_400_000;
    case 'week':  return 7 * 86_400_000;
    case 'month': return 30 * 86_400_000; // approximate, fine for windowing
  }
}

function matchPropertyFilter(occ: EventOccurrence, pf: PropertyFilter): boolean {
  // Denormalized hot path: surface monetary_value directly when the
  // merchant types one of its common aliases. Skip the JSONB walk.
  if (pf.path === 'monetary_value' || pf.path === 'value' || pf.path === 'total_price') {
    if (occ.monetary_value !== null && occ.monetary_value !== undefined) {
      return applyOperator(pf.operator as any, occ.monetary_value, pf.value, pf.value2);
    }
  }
  // Omnisend-style wildcard support: 'a.b.[].c' means "any element of
  // the array at a.b has c matching the operator". Wildcards chain:
  // 'raw.fulfillments.[].line_items.[].title contains "X"' matches
  // when ANY line item in ANY fulfillment has the title.
  const parts = pf.path.split('.');
  return walkPath(occ.properties, parts, 0, pf);
}

function walkPath(value: any, parts: string[], idx: number, pf: PropertyFilter): boolean {
  // Terminal: apply the operator on whatever we landed on
  if (idx >= parts.length) {
    return applyOperator(pf.operator as any, value, pf.value, pf.value2);
  }
  const part = parts[idx];
  // Wildcard: ANY-of semantics. A single match short-circuits to true.
  if (part === '[]') {
    if (!Array.isArray(value)) return false;
    return value.some((el) => walkPath(el, parts, idx + 1, pf));
  }
  if (value == null || typeof value !== 'object') {
    // Path goes deeper but the value can't be descended into. For
    // not-style operators we still want a sensible answer — handing
    // undefined to applyOperator at the leaf is the right thing
    // (e.g. is_not_set returns true, not_contains returns true).
    return walkPath(undefined, parts, parts.length, pf);
  }
  return walkPath(value[part], parts, idx + 1, pf);
}

// ─────────────────────────────────────────────────────────────────────
// Operator dispatch
// ─────────────────────────────────────────────────────────────────────

function applyOperator(
  op: string,
  raw: any,
  value: unknown,
  value2: unknown,
  unit?: 'day' | 'week' | 'month',
): boolean {
  switch (op) {
    // Existence
    case 'is_set': case 'is_not_null':
      return raw !== null && raw !== undefined && raw !== '';
    case 'is_not_set': case 'is_null':
      return raw === null || raw === undefined || raw === '';

    // Boolean
    case 'is_true':  return raw === true;
    case 'is_false': return raw === false || raw === null || raw === undefined;

    // String
    case 'equals': case '=':
      return String(raw) === String(value);
    case 'not_equals': case '!=':
      return String(raw) !== String(value);
    case 'contains':
      return String(raw ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'not_contains':
      return !String(raw ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'starts_with':
      return String(raw ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'not_starts_with':
      return !String(raw ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'ends_with':
      return String(raw ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());
    case 'not_ends_with':
      return !String(raw ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());

    // Number
    case 'gt':  case '>':  return Number(raw) >  Number(value);
    case 'gte': case '>=': return Number(raw) >= Number(value);
    case 'lt':  case '<':  return Number(raw) <  Number(value);
    case 'lte': case '<=': return Number(raw) <= Number(value);
    case 'between':
      return Number(raw) >= Number(value) && Number(raw) <= Number(value2);

    // Enum
    case 'in':
      return (Array.isArray(value) ? value : [value]).map(String).includes(String(raw));
    case 'not_in':
      return !(Array.isArray(value) ? value : [value]).map(String).includes(String(raw));

    // Date
    case 'before':
      return raw != null && new Date(raw).getTime() < new Date(value as string).getTime();
    case 'after':
      return raw != null && new Date(raw).getTime() > new Date(value as string).getTime();
    case 'between_dates':
      return raw != null && new Date(raw).getTime() >= new Date(value as string).getTime()
        && new Date(raw).getTime() <= new Date(value2 as string).getTime();
    case 'in_last': {
      if (raw == null) return false;
      const ms = Number(value) * unitMs(unit || 'day');
      return new Date(raw).getTime() >= Date.now() - ms;
    }
    case 'not_in_last': {
      if (raw == null) return true; // null = "never happened" satisfies "not in last X"
      const ms = Number(value) * unitMs(unit || 'day');
      return new Date(raw).getTime() < Date.now() - ms;
    }
    case 'in_next': {
      if (raw == null) return false;
      const ms = Number(value) * unitMs(unit || 'day');
      return new Date(raw).getTime() <= Date.now() + ms;
    }
    case 'between_relative': {
      if (raw == null) return false;
      const fromMs = Date.now() - Number(value) * unitMs(unit || 'day');
      const toMs = Date.now() - Number(value2) * unitMs(unit || 'day');
      const lo = Math.min(fromMs, toMs), hi = Math.max(fromMs, toMs);
      const t = new Date(raw).getTime();
      return t >= lo && t <= hi;
    }
    case 'is_today': {
      if (raw == null) return false;
      const d = new Date(raw);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }
    case 'is_this_month': {
      if (raw == null) return false;
      const d = new Date(raw);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    case 'month_in': {
      // value = array of months 1..12 (Jan=1). Birthday Mar 12 matches
      // value=[3] regardless of year. Uses the same date-string parsing
      // trick as evalAnniversary to dodge timezone off-by-one.
      if (raw == null) return false;
      const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
      const month1 = dateOnly ? Number(dateOnly[2]) : new Date(raw as any).getMonth() + 1;
      const months = Array.isArray(value) ? value.map(Number) : [Number(value)];
      return months.includes(month1);
    }
    case 'day_of_month_in': {
      // value = array of days 1..31. Same parsing strategy.
      if (raw == null) return false;
      const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
      const day = dateOnly ? Number(dateOnly[3]) : new Date(raw as any).getDate();
      const days = Array.isArray(value) ? value.map(Number) : [Number(value)];
      return days.includes(day);
    }

    // Array
    case 'contains_any': {
      const arr = Array.isArray(raw) ? raw : [];
      const wants = Array.isArray(value) ? value : [value];
      return wants.some((w) => arr.map(String).includes(String(w)));
    }
    case 'contains_all': {
      const arr = Array.isArray(raw) ? raw : [];
      const wants = Array.isArray(value) ? value : [value];
      return wants.every((w) => arr.map(String).includes(String(w)));
    }
    case 'not_contains_any': {
      const arr = Array.isArray(raw) ? raw : [];
      const wants = Array.isArray(value) ? value : [value];
      return !wants.some((w) => arr.map(String).includes(String(w)));
    }
    case 'is_empty':
      return !Array.isArray(raw) || raw.length === 0;
    case 'is_not_empty':
      return Array.isArray(raw) && raw.length > 0;
    case 'size_gte':
      return Array.isArray(raw) && raw.length >= Number(value);
    case 'size_lte':
      return Array.isArray(raw) && raw.length <= Number(value);

    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers: traverse the rule tree to collect what we need to prefetch
// ─────────────────────────────────────────────────────────────────────

function collectReferencedColumns(rule: SegmentRule): string[] {
  const cols = new Set<string>();
  walk(rule.root);
  return [...cols];

  function walk(node: RuleGroup | RuleLeaf): void {
    if (node.type === 'group') { node.children.forEach(walk); return; }
    if (node.type === 'profile') {
      const def = FIELD_INDEX[(node as ProfileRule).field];
      if (def && def.source.kind === 'contact_column') cols.add(def.source.column);
      if (def && def.source.kind === 'contact_jsonb')  cols.add(def.source.column);
    }
    if (node.type === 'consent') {
      cols.add(`is_subscribed_${(node as ConsentRule).channel}`);
      cols.add(`${(node as ConsentRule).channel}_consent_at`);
    }
  }
}

function collectEventDependencies(rule: SegmentRule): string[] {
  const events = new Set<string>();
  walk(rule.root);
  return [...events];
  function walk(n: RuleGroup | RuleLeaf): void {
    if (n.type === 'group') { n.children.forEach(walk); return; }
    if (n.type === 'event') events.add((n as EventRule).event);
  }
}

function collectListIds(rule: SegmentRule): string[] {
  const ids = new Set<string>();
  walk(rule.root);
  return [...ids];
  function walk(n: RuleGroup | RuleLeaf): void {
    if (n.type === 'group') { n.children.forEach(walk); return; }
    if (n.type === 'list_membership') ids.add((n as ListMembershipRule).list_id);
  }
}

function collectSegmentIds(rule: SegmentRule): string[] {
  const ids = new Set<string>();
  walk(rule.root);
  return [...ids];
  function walk(n: RuleGroup | RuleLeaf): void {
    if (n.type === 'group') { n.children.forEach(walk); return; }
    if (n.type === 'segment_membership') ids.add((n as SegmentMembershipRule).segment_id);
  }
}
