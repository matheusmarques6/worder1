import { NextRequest, NextResponse } from 'next/server';
import { checkAndAlertQualityRating } from '@/lib/whatsapp/alerts';
import { wlog } from '@/lib/observability/whatsapp-logger';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndAlertQualityRating();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    wlog.error('whatsapp.cron.quality_check_error', { error: error?.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
