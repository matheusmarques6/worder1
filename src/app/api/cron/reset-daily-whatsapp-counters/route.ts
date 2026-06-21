import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // [Phase 4] This RPC resets ONLY the DB column `messages_sent_today` (health/alerts
  // UI). It NEVER touched Redis, and the Redis daily accounting is now fully TTL-based:
  // unique-recipient day-keys `wa:dailyrecip:{instanceId}:{YYYY-MM-DD}` expire after 48h
  // (two-day rolling window), so they self-reset — orthogonal to this RPC. Do NOT flush
  // Redis here. ([FIX-M1]) NOTE: `reset_daily_whatsapp_counters` is defined in
  // worder-cloud-api-fixes/01-migration-cloud-api-schema.sql + docs/ALL-MIGRATIONS-CONSOLIDATED.sql
  // but NOT under supabase/migrations/ → REQUIRES-VERIFICATION it is actually applied.
  const { data, error } = await supabaseAdmin.rpc('reset_daily_whatsapp_counters');

  if (error) {
    console.error('[reset-daily-counters] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const reset = (data as any[])?.[0]?.accounts_reset ?? 0;
  return NextResponse.json({ ok: true, accounts_reset: reset });
}
