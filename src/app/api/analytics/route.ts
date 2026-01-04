import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const period = searchParams.get('period') || '7d';
    const type = searchParams.get('type') || 'overview';

    // Get basic counts
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { count: totalDeals } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const { data: wonDeals } = await supabase
      .from('deals')
      .select('value')
      .eq('organization_id', organizationId)
      .eq('status', 'won');

    const totalRevenue = wonDeals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

    return NextResponse.json({
      metrics: {
        totalContacts: totalContacts || 0,
        totalDeals: totalDeals || 0,
        totalRevenue,
        wonDeals: wonDeals?.length || 0,
      }
    });
  } catch (error: any) {
    console.error('Analytics GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
