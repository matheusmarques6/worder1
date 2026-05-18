// Real-time segment membership — Klaviyo / Omnisend parity.
//
// Strategy: ingest writes to contacts / contact_events enqueue
// dependency-matched reevaluations into segment_reeval_queue. A
// worker (drainSegmentReevalQueue below) drains the queue every
// minute and updates segment_member_cache.
//
// Why dependency tracking: the org might have 100 segments but a
// single placed_order event only invalidates the subset whose
// rule_dependencies.events contains 'placed_order'. Without this we'd
// reevaluate every segment for every event — wasteful and slow.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSegmentV2 } from './resolver-v2';
import { v1ToV2 } from './v1-adapter';
import type { SegmentRule } from './dsl';

// ─────────────────────────────────────────────────────────────────────
// Enqueue side — called from webhooks, pixel ingest, contact mutations
// ─────────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  orgId: string;
  contactId: string | null;
  // What changed. 'event:<name>' for a fired event,
  // 'field:<column>' for a contact column update,
  // 'list:add'/'list:remove' when membership of a referenced list changes.
  reason: string;
}

export async function enqueueSegmentReeval(
  supabase: SupabaseClient,
  opts: EnqueueOptions,
): Promise<{ enqueued: number }> {
  if (!opts.contactId) return { enqueued: 0 };

  // Identify which segments care about this reason.
  // rule_dependencies is JSONB shaped { fields: [], events: [], lists: [], segments: [] }
  const [kind, name] = opts.reason.split(':');
  const path = kind === 'event' ? 'events' : kind === 'field' ? 'fields' : kind === 'list' ? 'lists' : null;
  if (!path) return { enqueued: 0 };

  const { data: segments } = await supabase
    .from('customer_segments')
    .select('id')
    .eq('organization_id', opts.orgId)
    .eq('is_active', true)
    // PostgREST JSONB filter: rule_dependencies->path contains [name]
    .contains('rule_dependencies', { [path]: [name] });

  if (!segments || segments.length === 0) return { enqueued: 0 };

  const rows = segments.map((s: any) => ({
    segment_id: s.id,
    contact_id: opts.contactId,
    reason: opts.reason,
    scheduled_at: new Date().toISOString(),
  }));

  // Upsert so we don't blow up on duplicate enqueues for the same
  // (segment, contact) pair. The composite PK handles dedup, but
  // ON CONFLICT DO NOTHING is the explicit ask for it.
  await supabase
    .from('segment_reeval_queue')
    .upsert(rows, { onConflict: 'segment_id,contact_id', ignoreDuplicates: true });

  return { enqueued: rows.length };
}

// Fire-and-forget wrapper. Hot paths (webhooks, pixel) shouldn't block
// on the enqueue side.
export function scheduleSegmentReeval(
  supabase: SupabaseClient,
  opts: EnqueueOptions,
): void {
  void enqueueSegmentReeval(supabase, opts).catch((err) => {
    console.warn('[segment-realtime] enqueue failed:', err?.message);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Drain side — the worker
// ─────────────────────────────────────────────────────────────────────

export interface DrainResult {
  processed: number;
  added: number;     // memberships inserted
  removed: number;   // memberships deleted
  errors: string[];
  durationMs: number;
}

const MAX_PER_RUN = 500;       // bound a single worker invocation
const MAX_PER_SEGMENT = 50;    // and per-segment within that

export async function drainSegmentReevalQueue(
  supabase: SupabaseClient,
  deadlineMs: number = 50_000,
): Promise<DrainResult> {
  const startedAt = Date.now();
  const result: DrainResult = { processed: 0, added: 0, removed: 0, errors: [], durationMs: 0 };

  // Group queue by segment so we cache-load the segment rule once and
  // reapply it to many contacts without re-fetching.
  const { data: rows } = await supabase
    .from('segment_reeval_queue')
    .select('segment_id, contact_id, reason')
    .is('processed_at', null)
    .order('scheduled_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (!rows || rows.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const bySegment = new Map<string, string[]>();
  for (const r of rows) {
    const arr = bySegment.get(r.segment_id) || [];
    if (arr.length < MAX_PER_SEGMENT) arr.push(r.contact_id);
    bySegment.set(r.segment_id, arr);
  }

  for (const [segmentId, contactIds] of bySegment) {
    if (Date.now() - startedAt > deadlineMs) break;

    // Load + normalize the segment rule
    const { data: seg } = await supabase
      .from('customer_segments')
      .select('id, organization_id, store_id, rules, rules_logic, rule_version, is_active, uses_materialized_cache')
      .eq('id', segmentId)
      .maybeSingle();

    if (!seg || !seg.is_active) {
      await markProcessed(supabase, segmentId, contactIds);
      continue;
    }

    let rule: SegmentRule;
    if ((seg as any).rule_version === 2 && (seg as any).rules?.version === 2) {
      rule = (seg as any).rules as SegmentRule;
    } else {
      const legacy = (seg as any).rules ?? [];
      const wrapped = Array.isArray(legacy)
        ? { logic: (seg as any).rules_logic || 'AND', rules: legacy }
        : { ...legacy, logic: legacy.logic || (seg as any).rules_logic || 'AND' };
      rule = v1ToV2(wrapped);
    }

    // Mark running so concurrent worker invocations don't double-evaluate.
    await supabase
      .from('customer_segments')
      .update({ evaluation_status: 'running' })
      .eq('id', segmentId);

    let succeeded = false;
    try {
      // Targeted resolution: pass contactIds so the resolver only
      // pulls those specific rows, not the whole org. Without this
      // we were doing a 500k-row scan per queue item on big stores.
      const { contactIds: matched } = await resolveSegmentV2(supabase, rule, {
        orgId: (seg as any).organization_id,
        storeId: (seg as any).store_id || null,
        contactIds,
      });
      const matchedSet = new Set(matched);

      // Existing membership for the affected contacts (NOT the whole
      // segment — we only diff inside the working set).
      const { data: existing } = await supabase
        .from('segment_member_cache')
        .select('contact_id')
        .eq('segment_id', segmentId)
        .in('contact_id', contactIds);
      const existingSet = new Set((existing || []).map((r: any) => r.contact_id));

      const toAdd: any[] = [];
      const toRemove: string[] = [];
      for (const cid of contactIds) {
        const isMember = matchedSet.has(cid);
        const wasMember = existingSet.has(cid);
        if (isMember && !wasMember) toAdd.push({ segment_id: segmentId, contact_id: cid });
        else if (!isMember && wasMember) toRemove.push(cid);
      }

      if (toAdd.length) {
        await supabase
          .from('segment_member_cache')
          .upsert(toAdd, { onConflict: 'segment_id,contact_id', ignoreDuplicates: true });
        result.added += toAdd.length;
      }
      if (toRemove.length) {
        await supabase
          .from('segment_member_cache')
          .delete()
          .eq('segment_id', segmentId)
          .in('contact_id', toRemove);
        result.removed += toRemove.length;
      }

      // Bump the cached contact_count by net delta. Avoids a separate
      // full org-scan just to refresh the count — the recompute-segments
      // cron handles drift on a 15-min cadence.
      const netDelta = toAdd.length - toRemove.length;
      if (netDelta !== 0) {
        const newCount = Math.max(0, ((seg as any).contact_count || 0) + netDelta);
        await supabase
          .from('customer_segments')
          .update({
            evaluation_status: 'idle',
            last_evaluated_at: new Date().toISOString(),
            evaluation_error: null,
            contact_count: newCount,
          })
          .eq('id', segmentId);
      } else {
        await supabase
          .from('customer_segments')
          .update({
            evaluation_status: 'idle',
            last_evaluated_at: new Date().toISOString(),
            evaluation_error: null,
          })
          .eq('id', segmentId);
      }

      result.processed += contactIds.length;
      succeeded = true;
    } catch (err: any) {
      result.errors.push(`segment ${segmentId}: ${err?.message || 'unknown'}`);
      await supabase
        .from('customer_segments')
        .update({ evaluation_status: 'error', evaluation_error: String(err?.message || err) })
        .eq('id', segmentId);
    }

    // Only mark processed when the eval succeeded — failed rows stay
    // in the queue for the next tick to retry. The cron's safety net
    // covers permanent failures (a poison row would block the queue,
    // so we cap retries via scheduled_at age check in a follow-up).
    if (succeeded) {
      await markProcessed(supabase, segmentId, contactIds);
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

async function markProcessed(
  supabase: SupabaseClient,
  segmentId: string,
  contactIds: string[],
): Promise<void> {
  if (contactIds.length === 0) return;
  await supabase
    .from('segment_reeval_queue')
    .update({ processed_at: new Date().toISOString() })
    .eq('segment_id', segmentId)
    .in('contact_id', contactIds);
}
