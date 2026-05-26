import { NextRequest, NextResponse } from 'next/server';
import { checkAndAlertQualityIssues } from '@/lib/whatsapp/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (req.headers.get('x-internal-request') === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkAndAlertQualityIssues();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[quality-check] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
