import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

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
    // Scope by store when provided so these base metrics line up with the
    // other store-scoped cards on the analytics page instead of summing the
    // whole organization.
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');

    // Get basic counts
    let contactsQuery = supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (storeId) contactsQuery = contactsQuery.eq('store_id', storeId);
    const { count: totalContacts } = await contactsQuery;

    let dealsQuery = supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    if (storeId) dealsQuery = dealsQuery.eq('store_id', storeId);
    const { count: totalDeals } = await dealsQuery;

    let wonDealsQuery = supabase
      .from('deals')
      .select('value')
      .eq('organization_id', organizationId)
      .eq('status', 'won');
    if (storeId) wonDealsQuery = wonDealsQuery.eq('store_id', storeId);
    const { data: wonDeals } = await wonDealsQuery;

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
