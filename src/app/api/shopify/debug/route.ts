import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
import { assertDebugAllowed } from '@/lib/debug-guard';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const blocked = assertDebugAllowed(request);
  if (blocked) return blocked;

  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const { data: stores, error } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, is_active, last_sync_at')
      .eq('organization_id', organizationId);

    if (error) throw error;

    return NextResponse.json({
      debug: true,
      environment: process.env.NODE_ENV,
      stores: stores || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Shopify Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
