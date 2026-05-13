import { NextRequest, NextResponse } from 'next/server';
import { runBrowseAbandonedDetection } from '@/lib/services/browse-abandoned/detector';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends x-vercel-cron: 1 instead of Bearer auth, so the
  // legacy Bearer-only check meant Vercel could never invoke this cron
  // — browse-abandonment runs would only fire from manual curl. Mirror
  // the auth shape used by check-delayed-runs / process-runs so Vercel
  // schedule actually triggers it. Internal callers (tests, dev) still
  // get the Bearer path.
  if (req.headers.get('x-vercel-cron') === '1') return true;
  if (req.headers.get('X-Internal-Request') === 'true') return true;
  if (process.env.NODE_ENV === 'development') return true;
  const cronSecret = process.env.CRON_SECRET;
  return !!(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runBrowseAbandonedDetection();
  return NextResponse.json(result);
}
