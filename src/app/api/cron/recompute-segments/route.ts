/**
 * CRON: Recompute Segment Counts
 * Atualiza `member_count` + `last_count_at` de todos os segmentos dinâmicos.
 *
 * Roda a cada 15 minutos (configurar em vercel.json).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSegment } from '@/lib/segments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
      .limit(500);

    if (error) {
      console.error('[RecomputeSegments] fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: { id: string; count: number; ok: boolean }[] = [];

    for (const seg of segments || []) {
      try {
        // Dispatcher path: handles both v1 (via adapter) and v2 rules
        // uniformly. Drops the wrong-resolver hazard that earlier had
        // v1 evaluator misreading v2 JSONB.
        const result = await resolveSegment(supabase, seg.id, seg.organization_id);

        await supabase
          .from('customer_segments')
          .update({
            contact_count: result.contactIds.length,
            last_count_at: new Date().toISOString(),
            last_evaluated_at: new Date().toISOString(),
            evaluation_status: 'idle',
            evaluation_error: null,
          })
          .eq('id', seg.id);

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
