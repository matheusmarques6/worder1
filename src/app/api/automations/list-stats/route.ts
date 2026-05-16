import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Batch metrics for the automations table on /automations.
// Returns { [automationId]: { sent, opened, clicked, revenue } } so the
// listing page can render Sent / Open rate / Click rate / Revenue
// columns without doing an N+1 GET per row. We read email_sends
// (the canonical engagement table) directly by automation_id — it's
// indexed and avoids the heavier metadata-walk that
// /api/automations/[id]/stats has to do for per-node breakdowns.
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const storeId =
    request.nextUrl.searchParams.get('storeId') ||
    request.nextUrl.searchParams.get('store_id');

  try {
    let automationsQuery = supabase
      .from('automations')
      .select('id')
      .eq('organization_id', organizationId);
    if (storeId) automationsQuery = automationsQuery.eq('store_id', storeId);
    const { data: automations } = await automationsQuery;

    const ids: string[] = (automations || []).map((a: any) => a.id).filter(Boolean);

    const stats: Record<
      string,
      { sent: number; opened: number; clicked: number; revenue: number }
    > = {};
    for (const id of ids) {
      stats[id] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
    }

    if (ids.length === 0) {
      return NextResponse.json({ stats });
    }

    // Email sends are the dominant channel and the only table with a
    // direct automation_id column (whatsapp/sms stats live behind
    // automation_runs.metadata which we walk in the per-flow detail
    // endpoint). Chunk to stay under PostgREST limits.
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: rows } = await supabase
        .from('email_sends')
        .select('automation_id, sent_at, opened_at, clicked_at, conversion_value')
        .eq('organization_id', organizationId)
        .in('automation_id', chunk);
      for (const row of rows || []) {
        const aid = (row as any).automation_id;
        if (!aid || !stats[aid]) continue;
        if ((row as any).sent_at) stats[aid].sent++;
        if ((row as any).opened_at) stats[aid].opened++;
        if ((row as any).clicked_at) stats[aid].clicked++;
        const cv = Number((row as any).conversion_value);
        if (Number.isFinite(cv) && cv > 0) stats[aid].revenue += cv;
      }
    }

    return NextResponse.json({ stats });
  } catch (error: any) {
    return NextResponse.json({ stats: {}, error: error?.message || 'Unknown error' });
  }
}
