import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { count: deliveriesCount, error: delErr } = await supabaseAdmin
    .from('webhook_deliveries')
    .delete({ count: 'exact' })
    .in('status', ['delivered', 'failed'])
    .lt('created_at', thirtyDaysAgo);

  if (delErr) console.error('[prune] webhook_deliveries delete failed:', delErr);

  const { count: emissionsCount, error: emErr } = await supabaseAdmin
    .from('browse_abandoned_emissions')
    .delete({ count: 'exact' })
    .lt('emitted_at', sevenDaysAgo);

  if (emErr) console.error('[prune] browse_abandoned_emissions delete failed:', emErr);

  return NextResponse.json({
    deliveries_pruned: deliveriesCount ?? 0,
    emissions_pruned: emissionsCount ?? 0,
  });
}
