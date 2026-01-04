import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';

const DEBUG_SECRET = process.env.DEBUG_ROUTE_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function isAuthorized(request: NextRequest): boolean {
  if (!IS_PRODUCTION) return true;
  if (!DEBUG_SECRET) return false;
  const providedSecret = request.headers.get('x-debug-secret') || request.nextUrl.searchParams.get('secret');
  return providedSecret === DEBUG_SECRET;
}

export async function GET(request: NextRequest) {
  // ✅ SEGURANÇA: Bloquear em produção sem secret
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
