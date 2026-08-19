/**
 * CRON: Recompute Segment Counts
 * Atualiza `member_count` + `last_count_at` de todos os segmentos dinâmicos.
 *
 * Roda a cada 15 minutos (configurar em vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSegment, loadSegmentAsV2 } from '@/lib/segments';
import { extractDependencies } from '@/lib/segments/dsl';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Stop picking up new segments after this much wall-clock so the run
// returns a partial result instead of Vercel killing it at maxDuration
// (504 in the logs). The stalest-first order below already makes the
// next run continue exactly where this one stopped.
const TIME_BUDGET_MS = 50_000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function isAuthorizedCron(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: segments, error } = await supabase
      .from('customer_segments')
      .select('id, organization_id, rules, rules_logic, rfm_segments, segment_type')
      .in('segment_type', ['dynamic', 'rfm'])
      // Drain the stalest (and never-counted) segments first so the bounded
      // batch rotates across ALL segments run-over-run. Without an explicit
      // order the DB returns an arbitrary (effectively head-of-table) 500 set
      // every run, permanently starving the tail's member_count/last_count_at.
      .order('last_count_at', { ascending: true, nullsFirst: true })
      .limit(500);

    if (error) {
      console.error('[RecomputeSegments] fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: { id: string; count: number; ok: boolean }[] = [];
    let truncated = false;

    for (const seg of segments || []) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }
      try {
        // Dispatcher path: handles both v1 (via adapter) and v2 rules
        // uniformly. Drops the wrong-resolver hazard that earlier had
        // v1 evaluator misreading v2 JSONB.
        const result = await resolveSegment(supabase, seg.id, seg.organization_id);

        // Backfill rule_dependencies for v1 legacy rows. Without this
        // the real-time worker's dependency filter never matches them,
        // and webhooks/pixel events don't re-enqueue these segments.
        // We compute via the v2 adapter so the dependency set reflects
        // the same evaluation surface the resolver actually walks.
        const loaded = await loadSegmentAsV2(supabase, seg.id);
        const updates: Record<string, any> = {
          contact_count: result.contactIds.length,
          last_count_at: new Date().toISOString(),
          last_evaluated_at: new Date().toISOString(),
          evaluation_status: 'idle',
          evaluation_error: null,
        };
        if (loaded) {
          updates.rule_dependencies = extractDependencies(loaded.rule);
        }
        await supabase.from('customer_segments').update(updates).eq('id', seg.id);

        results.push({ id: seg.id, count: result.contactIds.length, ok: true });
      } catch (err: any) {
        console.error(`[RecomputeSegments] segment ${seg.id} error:`, err?.message);
        await supabase
          .from('customer_segments')
          .update({
            evaluation_status: 'error',
            evaluation_error: String(err?.message || err),
          })
          .eq('id', seg.id);
        results.push({ id: seg.id, count: 0, ok: false });
      }
    }

    return NextResponse.json({
      success: true,
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      truncated,
      durationMs: Date.now() - start,
    });
  } catch (error: any) {
    console.error('[RecomputeSegments] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
