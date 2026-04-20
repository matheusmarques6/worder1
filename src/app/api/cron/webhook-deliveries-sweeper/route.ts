import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enqueueWebhookDelivery } from '@/lib/queue';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Libera leases in_flight expirados (worker morreu antes de completar)
  await supabaseAdmin
    .from('webhook_deliveries')
    .update({ status: 'pending', in_flight_until: null })
    .eq('status', 'in_flight')
    .lt('in_flight_until', now);

  // Busca entregas presas: pending/retrying sem tentativa ou sem atividade há >5min
  const { data: stuck } = await supabaseAdmin
    .from('webhook_deliveries')
    .select('id')
    .in('status', ['pending', 'retrying'])
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${fiveMinAgo}`)
    .limit(500);

  let reenqueued = 0;
  for (const row of (stuck as Array<{ id: string }>) ?? []) {
    try {
      await enqueueWebhookDelivery(row.id);
      reenqueued++;
    } catch (err) {
      console.warn(`[sweeper] re-enqueue failed for ${row.id}:`, err);
    }
  }

  return NextResponse.json({ reenqueued, scanned: stuck?.length ?? 0 });
}
