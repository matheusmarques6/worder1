import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { getEmailDashboardMetrics, getEmailsOverTime, getTopEmailCampaigns } from '@/lib/analytics/email-metrics';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30');

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ metrics: null, timeline: [], campaigns: [] });

    const [metrics, timeline, campaigns] = await Promise.all([
      getEmailDashboardMetrics(supabase, organizationId, days),
      getEmailsOverTime(supabase, organizationId, days),
      getTopEmailCampaigns(supabase, organizationId),
    ]);

    return NextResponse.json({ metrics, timeline, campaigns });
  } catch (e: any) {
    return NextResponse.json({ metrics: null, timeline: [], campaigns: [], error: e.message });
  }
}
