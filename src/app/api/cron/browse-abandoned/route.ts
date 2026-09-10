import { NextRequest, NextResponse } from 'next/server';
import { runBrowseAbandonedDetection } from '@/lib/services/browse-abandoned/detector';
import { authorizeCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runBrowseAbandonedDetection();
  return NextResponse.json(result);
}
