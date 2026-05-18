// /api/workers/segment-reeval — drain pending segment_reeval_queue rows.
//
// Triggered by Vercel cron every minute. Bounded by deadlineMs (50s
// on a 60s function ceiling) so it always finishes inside one tick.
// Auth: CRON_SECRET matches the pattern used by other workers.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { drainSegmentReevalQueue } from '@/lib/segments/realtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel cron uses x-vercel-cron-signature; manual triggers send
  // Authorization: Bearer <CRON_SECRET>. Accept either.
  const cronSig = req.headers.get('x-vercel-cron-signature');
  const auth = req.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!cronSig && auth !== expectedAuth && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const result = await drainSegmentReevalQueue(supabaseAdmin, 50_000);
  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  // POST allows internal callers (webhooks) to nudge the worker
  // immediately after enqueueing instead of waiting for the next
  // cron tick. Same auth.
  return GET(req);
}
