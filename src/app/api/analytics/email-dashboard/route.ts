import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import {
  getEmailDashboardMetrics,
  getEmailsOverTime,
  getTopEmailCampaigns,
  getEmailConversionMetrics,
} from '@/lib/analytics/email-metrics';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30');
  // A tela de análise de e-mail já mandava a loja; esta rota jogava
  // fora e somava todas — quem via os números da Dr. Groot via os da
  // Medicube junto, sem nada indicando a mistura.
  const storeId =
    request.nextUrl.searchParams.get('storeId') ||
    request.nextUrl.searchParams.get('store_id') ||
    null;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        metrics: null,
        timeline: [],
        campaigns: [],
        conversions: { totalRevenue: 0, totalConversions: 0, revenuePerRecipient: 0, campaigns: [] },
      });
    }

    const [metrics, timeline, campaigns, conversions] = await Promise.all([
      getEmailDashboardMetrics(supabase, organizationId, days, storeId),
      getEmailsOverTime(supabase, organizationId, days, storeId),
      getTopEmailCampaigns(supabase, organizationId, 5, storeId),
      getEmailConversionMetrics(supabase, organizationId, days, storeId),
    ]);

    return NextResponse.json({ metrics, timeline, campaigns, conversions });
  } catch (e: any) {
    return NextResponse.json({
      metrics: null,
      timeline: [],
      campaigns: [],
      conversions: { totalRevenue: 0, totalConversions: 0, revenuePerRecipient: 0, campaigns: [] },
      error: e.message,
    });
  }
}
