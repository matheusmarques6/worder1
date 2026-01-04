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

  const storeId = searchParams.get('storeId');

  try {
    if (storeId) {
      const { data, error } = await supabase
        .from('shopify_stores')
        .select('*')
        .eq('id', storeId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      return NextResponse.json({ store: data });
    }

    const { data, error } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ stores: data || [] });
  } catch (error: any) {
    console.error('Shopify Store GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
