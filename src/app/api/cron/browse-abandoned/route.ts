import { NextRequest, NextResponse } from 'next/server';
import { runBrowseAbandonedDetection } from '@/lib/services/browse-abandoned/detector';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runBrowseAbandonedDetection();
  return NextResponse.json(result);
}
