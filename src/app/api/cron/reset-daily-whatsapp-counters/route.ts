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

  const { data, error } = await supabaseAdmin.rpc('reset_daily_whatsapp_counters');

  if (error) {
    console.error('[reset-daily-counters] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const reset = (data as any[])?.[0]?.accounts_reset ?? 0;
  return NextResponse.json({ ok: true, accounts_reset: reset });
}
