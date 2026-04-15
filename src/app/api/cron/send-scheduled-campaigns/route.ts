// =============================================
// Cron: fire email campaigns whose scheduled_at has arrived.
// Hit this endpoint every 1-5 minutes from Vercel Cron or QStash schedule.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // dev fallback
  const got = request.headers.get('authorization') || request.headers.get('x-cron-secret');
  return got === `Bearer ${expected}` || got === expected;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  const { data: dueCampaigns, error } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, organization_id, scheduled_at, status')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);

  if (error) {
    console.error('[cron/send-scheduled] query error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueCampaigns?.length) {
    return NextResponse.json({ ok: true, fired: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const c of dueCampaigns) {
    try {
      // Flip to sending first to avoid double-fire if cron overlaps.
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'sending' })
        .eq('id', c.id)
        .eq('status', 'scheduled');

      const res = await fetch(`${baseUrl}/api/email/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal': 'true',
          'X-Cron-Origin': 'scheduled-campaigns',
        },
        body: JSON.stringify({ campaign_id: c.id, force: true }),
      });

      results.push({ id: c.id, ok: res.ok, error: res.ok ? undefined : `status ${res.status}` });

      if (!res.ok) {
        await supabaseAdmin
          .from('email_campaigns')
          .update({ status: 'failed' })
          .eq('id', c.id);
      }
    } catch (err: any) {
      results.push({ id: c.id, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, fired: results.length, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
