/**
 * CRON: Recompute Segment Counts
 * Atualiza `member_count` + `last_count_at` de todos os segmentos dinâmicos.
 *
 * Roda a cada 15 minutos (configurar em vercel.json).
 *
 * Autenticação:
 *  - Header `x-vercel-cron` (Vercel Cron)
 *  - OU `Authorization: Bearer CRON_SECRET`
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { countSegmentByConditions } from '@/lib/segments/resolver';

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
    // Busca segmentos dinâmicos de TODAS as orgs.
    // A função countSegmentByConditions já faz filtro por organization_id.
    const { data: segments, error } = await supabase
      .from('segments')
      .select('id, organization_id, conditions, type')
      .in('type', ['dynamic', 'rfm'])
      .limit(500);

    if (error) {
      console.error('[RecomputeSegments] fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: { id: string; count: number; ok: boolean }[] = [];

    for (const seg of segments || []) {
      try {
        const count = await countSegmentByConditions(
          supabase,
          seg.conditions,
          seg.organization_id
        );

        await supabase
          .from('segments')
          .update({
            member_count: count,
            last_count_at: new Date().toISOString(),
          })
          .eq('id', seg.id);

        results.push({ id: seg.id, count, ok: true });
      } catch (err: any) {
        console.error(`[RecomputeSegments] segment ${seg.id} error:`, err?.message);
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
